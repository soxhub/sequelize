import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { metrics } from '@opentelemetry/api';
import Support from './support.js';
import { poolAttributes } from '../../lib/telemetry.js';
import { InstrumentedPool } from '../../lib/dialects/postgres/base/instrumented-pool.js';

class FakeMeter {
  constructor() {
    this.instruments = new Map();
    this.batchCallbacks = new Set();
  }

  _createInstrument(name) {
    const instrument = { name, records: [] };
    instrument.record = (value, attributes) => instrument.records.push({ value, attributes });
    instrument.add = instrument.record;
    this.instruments.set(name, instrument);

    return instrument;
  }

  createObservableUpDownCounter(name) {
    return this._createInstrument(name);
  }

  createHistogram(name) {
    return this._createInstrument(name);
  }

  createCounter(name) {
    return this._createInstrument(name);
  }

  addBatchObservableCallback(callback, instruments) {
    this.batchCallbacks.add({ callback, instruments });
  }

  removeBatchObservableCallback(callback) {
    for (const registered of this.batchCallbacks) {
      if (registered.callback === callback) {
        this.batchCallbacks.delete(registered);
      }
    }
  }

  // Stands in for a collection cycle: run every registered batch callback and return what the
  // named instrument was observed at.
  collect(name) {
    const observations = [];

    for (const { callback } of this.batchCallbacks) {
      callback({
        observe: (instrument, value, attributes) => {
          if (instrument.name === name) {
            observations.push({ value, attributes });
          }
        }
      });
    }

    return observations;
  }

  recorded(name) {
    const instrument = this.instruments.get(name);

    return instrument ? instrument.records : [];
  }
}

describe('telemetry', () => {
  let meter;

  beforeEach(() => {
    meter = new FakeMeter();
    metrics.setGlobalMeterProvider({ getMeter: () => meter });
  });

  afterEach(() => {
    metrics.disable();
  });

  describe('poolAttributes', () => {
    it('names a pool after the server and database it connects to', () => {
      expect(poolAttributes({ host: 'db.internal', port: 5432, database: 'app' })).to.eql({
        'db.system.name': 'postgresql',
        'db.namespace': 'app',
        'server.address': 'db.internal',
        'server.port': 5432,
        'db.client.connection.pool.name': 'db.internal:5432/app'
      });
    });

    it('distinguishes the pools of a replicated connection manager', () => {
      const config = { host: 'db.internal', port: 5432, database: 'app' };

      expect(poolAttributes(config, 'read')['db.client.connection.pool.name']).to.equal('db.internal:5432/app (read)');
      expect(poolAttributes(config, 'write')['db.client.connection.pool.name']).to.equal(
        'db.internal:5432/app (write)'
      );
    });

    it('reports the application name, so pools on one database are told apart', () => {
      const config = {
        host: 'db.internal',
        port: 5432,
        database: 'app',
        dialectOptions: { application_name: 'billing' }
      };

      expect(poolAttributes(config)).to.include({
        'db.postgresql.application_name': 'billing',
        'db.client.connection.pool.name': 'db.internal:5432/app (billing)'
      });

      expect(poolAttributes(config, 'read')['db.client.connection.pool.name']).to.equal(
        'db.internal:5432/app (billing, read)'
      );
    });

    it('omits the application name when there is none', () => {
      const config = { host: 'db.internal', port: 5432, database: 'app', dialectOptions: {} };

      expect(poolAttributes(config)).to.not.have.property('db.postgresql.application_name');
    });
  });

  describe('InstrumentedPool', () => {
    const attributes = { 'db.client.connection.pool.name': 'db.internal:5432/app' };

    // A real `generic-pool` pool, so the metrics are read off the pool's own bookkeeping rather
    // than off a stand-in that could drift from it.
    const createPool = ({ create = () => Promise.resolve({}), ...options } = {}) => {
      return new InstrumentedPool(
        { create, destroy: () => Promise.resolve(), validate: () => true },
        { autostart: false, max: 3, min: 0, ...options },
        attributes
      );
    };

    it('observes the pool queue depth', async () => {
      // A create that never settles leaves every acquire sitting in the waiting-clients queue.
      const pool = createPool({ create: () => new Promise(() => {}), max: 1 });

      expect(meter.collect('db.client.connection.pending_requests')).to.eql([{ value: 0, attributes }]);

      pool.acquire().catch(() => {});
      pool.acquire().catch(() => {});
      await Promise.resolve();

      expect(meter.collect('db.client.connection.pending_requests')).to.eql([{ value: 2, attributes }]);
    });

    it('observes connections in use and idle separately', async () => {
      const pool = createPool();
      const state = () =>
        meter
          .collect('db.client.connection.count')
          .map((observation) => [observation.attributes['db.client.connection.state'], observation.value]);

      const resource = await pool.acquire();

      expect(state()).to.eql([
        ['used', 1],
        ['idle', 0]
      ]);

      await pool.release(resource);

      expect(state()).to.eql([
        ['used', 0],
        ['idle', 1]
      ]);
    });

    it('observes the configured pool bounds', () => {
      createPool({ max: 20, min: 4 });

      expect(meter.collect('db.client.connection.max')).to.eql([{ value: 20, attributes }]);
      expect(meter.collect('db.client.connection.idle.max')).to.eql([{ value: 20, attributes }]);
      expect(meter.collect('db.client.connection.idle.min')).to.eql([{ value: 4, attributes }]);
    });

    it('records how long acquire waited, in seconds', async () => {
      const resource = {};
      const pool = createPool({
        create: () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(resource), 20);
          })
      });

      expect(await pool.acquire()).to.equal(resource);

      const records = meter.recorded('db.client.connection.wait_time');

      expect(records).to.have.length(1);
      expect(records[0].attributes).to.equal(attributes);
      expect(records[0].value).to.be.within(0.015, 5);
    });

    it('times the acquire that Pool#use makes on the caller behalf', async () => {
      const pool = createPool();

      await pool.use(() => Promise.resolve('done'));

      expect(meter.recorded('db.client.connection.wait_time')).to.have.length(1);
    });

    it('records how long a connection was checked out, in seconds', async () => {
      const pool = createPool();
      const resource = await pool.acquire();

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(meter.recorded('db.client.connection.use_time')).to.have.length(0);

      await pool.release(resource);

      const records = meter.recorded('db.client.connection.use_time');

      expect(records).to.have.length(1);
      expect(records[0].attributes).to.equal(attributes);
      expect(records[0].value).to.be.within(0.015, 5);
    });

    it('times the checkout that Pool#use makes on the caller behalf', async () => {
      const pool = createPool();

      await pool.use(() => Promise.resolve('done'));

      expect(meter.recorded('db.client.connection.use_time')).to.have.length(1);
    });

    it('records a checkout that ended in the connection being destroyed', async () => {
      const pool = createPool();
      const resource = await pool.acquire();

      await pool.destroy(resource);

      expect(meter.recorded('db.client.connection.use_time')).to.have.length(1);
    });

    it('records a checkout once, however many times the resource is handed back', async () => {
      const pool = createPool();
      const resource = await pool.acquire();

      await pool.release(resource);
      await expect(pool.release(resource)).rejects.toThrow('Resource not currently part of this pool');

      expect(meter.recorded('db.client.connection.use_time')).to.have.length(1);
    });

    it('times each checkout of a connection separately', async () => {
      const pool = createPool({ max: 1 });

      const first = await pool.acquire();
      await pool.release(first);

      const second = await pool.acquire();
      await pool.release(second);

      expect(second).to.equal(first); // the pool only has the one connection to hand out
      expect(meter.recorded('db.client.connection.use_time')).to.have.length(2);
    });

    it('does not record a use time for a resource it never handed out', async () => {
      const pool = createPool();

      await expect(pool.release({})).rejects.toThrow('Resource not currently part of this pool');

      expect(meter.recorded('db.client.connection.use_time')).to.have.length(0);
    });

    it('counts an acquire timeout instead of recording it as a wait', async () => {
      const pool = createPool({ max: 1, acquireTimeoutMillis: 30 });

      await pool.acquire(); // holds the pool's only resource

      await expect(pool.acquire()).rejects.toThrow('ResourceRequest timed out');

      expect(meter.recorded('db.client.connection.timeouts')).to.eql([{ value: 1, attributes }]);
      expect(meter.recorded('db.client.connection.wait_time')).to.have.length(1);
    });

    // A factory whose `create` rejects is deliberately not the case under test: `generic-pool`
    // keeps the request queued and retries rather than rejecting the acquire, which is why the
    // connection manager's factories resolve their errors as resources instead of throwing.
    it('does not count an acquire that failed for another reason as a timeout', async () => {
      const pool = createPool();

      await pool.drain();

      await expect(pool.acquire()).rejects.toThrow('pool is draining and cannot accept work');

      expect(meter.recorded('db.client.connection.timeouts')).to.have.length(0);
      expect(meter.recorded('db.client.connection.wait_time')).to.have.length(0);
    });

    it('picks up a MeterProvider registered after the pool was built', async () => {
      metrics.disable();

      const pool = createPool(); // built before the SDK is up, as an import-time Sequelize would be

      metrics.setGlobalMeterProvider({ getMeter: () => meter });

      await pool.acquire();

      expect(meter.recorded('db.client.connection.wait_time')).to.have.length(1);
      expect(meter.collect('db.client.connection.pending_requests')).to.eql([{ value: 0, attributes }]);
    });

    it('stops reporting once detached, and keeps working', async () => {
      const pool = createPool();

      pool.detachMetrics();

      expect(await pool.acquire()).to.be.an('object');

      expect(meter.collect('db.client.connection.pending_requests')).to.eql([]);
      expect(meter.recorded('db.client.connection.wait_time')).to.have.length(0);
      expect(() => pool.detachMetrics()).to.not.throw();
    });

    it('does nothing when @opentelemetry/api is not installed', async () => {
      vi.doMock('node:module', async (importOriginal) => {
        const actual = await importOriginal();

        return {
          ...actual,
          createRequire: (from) => {
            const original = actual.createRequire(from);

            return (id) => {
              if (id === '@opentelemetry/api') {
                throw Object.assign(new Error(`Cannot find module '${id}'`), { code: 'MODULE_NOT_FOUND' });
              }

              return original(id);
            };
          }
        };
      });
      vi.resetModules();

      try {
        const { InstrumentedPool: UninstrumentedPool } =
          await import('../../lib/dialects/postgres/base/instrumented-pool.js');
        const resource = {};
        const pool = new UninstrumentedPool(
          { create: () => Promise.resolve(resource), destroy: () => Promise.resolve(), validate: () => true },
          { autostart: false, max: 1 },
          attributes
        );

        expect(await pool.acquire()).to.equal(resource);
        expect(meter.instruments).to.be.empty;
        expect(meter.batchCallbacks).to.be.empty;
        expect(() => pool.detachMetrics()).to.not.throw();
      } finally {
        vi.doUnmock('node:module');
        vi.resetModules();
      }
    });
  });

  describe('connection manager pools', () => {
    const poolNames = () =>
      meter
        .collect('db.client.connection.pending_requests')
        .map((observation) => observation.attributes['db.client.connection.pool.name']);

    it('instruments the pool', () => {
      const sequelize = Support.createSequelizeInstance({
        host: 'db.internal',
        port: 5432,
        dialectOptions: { application_name: 'billing' }
      });

      expect(poolNames()).to.eql([`db.internal:5432/${sequelize.config.database} (billing)`]);

      sequelize.connectionManager.close();
      expect(poolNames()).to.eql([]);
    });

    // The replicas carry only a host; everything else, `application_name` included, is inherited
    // from the top-level config, so both pools stay attributable to the application that owns them.
    it('instruments the read and write pools of a replicated connection manager', () => {
      const sequelize = Support.createSequelizeInstance({
        dialectOptions: { application_name: 'billing' },
        replication: {
          write: { host: 'primary.internal' },
          read: [{ host: 'replica0.internal' }, { host: 'replica1.internal' }]
        }
      });

      expect(poolNames()).to.have.members([
        `replica0.internal:${sequelize.config.port}/${sequelize.config.database} (billing, read)`,
        `primary.internal:${sequelize.config.port}/${sequelize.config.database} (billing, write)`
      ]);

      sequelize.connectionManager.close();
      expect(poolNames()).to.eql([]);
    });
  });
});
