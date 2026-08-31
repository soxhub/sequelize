import { createRequire } from 'node:module';
import packageJson from '../package.json' with { type: 'json' };

const require = createRequire(import.meta.url);

const METER_NAME = 'sequelize';

/**
 * `@opentelemetry/api` is an optional peer dependency: it is loaded if the consumer has it and
 * everything here degrades to a no-op if they don't. It has to be the consumer's copy rather than
 * one of our own, because the API talks to the SDK through a global registered under a
 * version-specific key — a second copy on a different major would never see their `MeterProvider`.
 *
 * `require` rather than `import` so the failure is catchable at load time instead of forcing every
 * caller through a dynamic import; the package ships CommonJS.
 */
let api = null;

try {
  api = require('@opentelemetry/api');
} catch {
  api = null;
}

/**
 * Instruments cached against the meter provider they came from.
 *
 * The metrics API has no proxy meter: instruments created before an SDK registers a
 * `MeterProvider` are bound to the no-op one forever. Sequelize is commonly constructed at import
 * time, which can easily be before the SDK is up, so the provider identity is part of the cache
 * key and the instruments are rebuilt once the real provider shows up.
 *
 * @type {Object|null}
 */
let cachedInstruments = null;

function getInstruments() {
  if (!api) {
    return null;
  }

  const provider = api.metrics.getMeterProvider();

  if (!cachedInstruments || cachedInstruments.provider !== provider) {
    const meter = api.metrics.getMeter(METER_NAME, packageJson.version);

    cachedInstruments = {
      provider,
      meter,
      pendingRequests: meter.createObservableUpDownCounter('db.client.connection.pending_requests', {
        description: 'The number of current pending requests for an open connection',
        unit: '{request}'
      }),
      connectionCount: meter.createObservableUpDownCounter('db.client.connection.count', {
        description: 'The number of connections that are currently in the state described by the state attribute',
        unit: '{connection}'
      }),
      maxConnections: meter.createObservableUpDownCounter('db.client.connection.max', {
        description: 'The maximum number of open connections allowed',
        unit: '{connection}'
      }),
      maxIdleConnections: meter.createObservableUpDownCounter('db.client.connection.idle.max', {
        description: 'The maximum number of idle open connections allowed',
        unit: '{connection}'
      }),
      minIdleConnections: meter.createObservableUpDownCounter('db.client.connection.idle.min', {
        description: 'The minimum number of idle open connections allowed',
        unit: '{connection}'
      }),
      waitTime: meter.createHistogram('db.client.connection.wait_time', {
        description: 'The time it took to obtain an open connection from the pool',
        unit: 's'
      }),
      useTime: meter.createHistogram('db.client.connection.use_time', {
        description: 'The time between borrowing a connection and returning it to the pool',
        unit: 's'
      }),
      timeouts: meter.createCounter('db.client.connection.timeouts', {
        description: 'The number of connection timeouts that have occurred trying to obtain a connection from the pool',
        unit: '{timeout}'
      })
    };
  }

  return cachedInstruments;
}

/**
 * What the metrics collapse to when there is nothing to report them to, so a caller never has to
 * check whether telemetry is available.
 */
const NOOP_POOL_METRICS = {
  recordWaitTime() {},
  recordUseTime() {},
  recordTimeout() {},
  detach() {}
};

/**
 * Start reporting OpenTelemetry metrics for a `generic-pool` pool.
 *
 * Emits the `db.client.connection.*` metrics from the OpenTelemetry database semantic conventions
 * that a `generic-pool` pool can answer for:
 *
 * - `db.client.connection.pending_requests` — queue depth, from the pool's waiting-clients queue.
 * - `db.client.connection.count` — open connections, split into `used` and `idle` by the
 *   `db.client.connection.state` attribute.
 * - `db.client.connection.max`, `.idle.max`, `.idle.min` — the configured pool bounds, so a
 *   dashboard can plot depth and usage against capacity without hardcoding the limits. The pool
 *   has no separate idle cap, so the idle bounds are its overall `max`/`min`.
 * The gauges are observed here; the synchronous instruments are left to the caller to record,
 * because only the pool knows when an acquire finished, how it ended, and when the connection it
 * handed out came back:
 *
 * - `db.client.connection.wait_time` — seconds spent waiting on `acquire`, recorded for
 *   acquisitions that completed. A wait that ends in a timeout is counted below instead, so the
 *   histogram describes real waits rather than piling up at the configured timeout.
 * - `db.client.connection.use_time` — seconds a connection was checked out, from the acquire that
 *   handed it over to the release or destroy that ended the loan.
 * - `db.client.connection.timeouts` — acquires that gave up waiting for a free connection.
 *
 * All of them are no-ops unless the consumer has `@opentelemetry/api` installed and an SDK has
 * registered a `MeterProvider`.
 *
 * @param {Object} pool A pool created by `generic-pool`
 * @param {Object} attributes Attributes to report the pool's measurements under
 * @return {{recordWaitTime: Function, recordUseTime: Function, recordTimeout: Function,
 *   detach: Function}} The pool's metrics; `detach` stops reporting and should be called when the
 *   pool is closed
 */
export function createPoolMetrics(pool, attributes) {
  if (!api) {
    return NOOP_POOL_METRICS;
  }

  const usedAttributes = { ...attributes, 'db.client.connection.state': 'used' };
  const idleAttributes = { ...attributes, 'db.client.connection.state': 'idle' };

  /**
   * The instruments this pool is currently reporting to, and the registration tying its observable
   * callback to their meter.
   */
  let bound = null;

  // One batch callback for every gauge, so a collection cycle reads the pool's counters once and
  // sees a single consistent snapshot of them. It reads the instruments through `bound` rather
  // than closing over them, so that it survives being moved to another meter.
  const observe = (result) => {
    const { pendingRequests, connectionCount, maxConnections, maxIdleConnections, minIdleConnections } =
      bound.instruments;

    result.observe(pendingRequests, pool.pending, attributes);
    result.observe(connectionCount, pool.borrowed, usedAttributes);
    result.observe(connectionCount, pool.available, idleAttributes);
    result.observe(maxConnections, pool.max, attributes);
    result.observe(maxIdleConnections, pool.max, attributes);
    result.observe(minIdleConnections, pool.min, attributes);
  };

  /**
   * The instruments to report to, re-resolved on every use.
   *
   * An SDK can register its `MeterProvider` after the pool was built — a Sequelize constructed at
   * import time routinely beats the SDK to it — and the instruments handed out before that belong
   * to the no-op provider. Resolving once at construction would make that pool silent for the life
   * of the process; resolving each time, it moves itself onto the real meter as soon as one exists.
   * The cost is an identity check against the global provider.
   */
  const instruments = () => {
    const current = getInstruments();

    if (bound?.instruments !== current) {
      if (bound) {
        bound.meter.removeBatchObservableCallback(observe, bound.observed);
      }

      const observed = [
        current.pendingRequests,
        current.connectionCount,
        current.maxConnections,
        current.maxIdleConnections,
        current.minIdleConnections
      ];

      bound = { instruments: current, meter: current.meter, observed };
      current.meter.addBatchObservableCallback(observe, observed);
    }

    return current;
  };

  instruments();

  // `detach` empties the object it belongs to rather than only unregistering the callback, so that
  // a detached pool goes quiet on every instrument at once and detaching twice is harmless.
  const metrics = {
    recordWaitTime: (seconds) => instruments().waitTime.record(seconds, attributes),
    recordUseTime: (seconds) => instruments().useTime.record(seconds, attributes),
    recordTimeout: () => instruments().timeouts.add(1, attributes),
    detach: () => {
      bound.meter.removeBatchObservableCallback(observe, bound.observed);
      Object.assign(metrics, NOOP_POOL_METRICS);
    }
  };

  return metrics;
}

/**
 * Attributes identifying a pool in its metrics.
 *
 * `db.client.connection.pool.name` has to be unique within the process; the semantic conventions
 * suggest deriving it from the server and database when the pool has no name of its own, which is
 * the case here. Server and database alone are not enough: two Sequelize instances in one process
 * routinely point at the same database, and a replicated connection manager keeps two pools of its
 * own. The Postgres `application_name` is what distinguishes the former — it is already how these
 * connections are told apart in `pg_stat_activity` — and `role` the latter.
 *
 * @param {Object} config Connection config the pool connects with
 * @param {String} [role] `read` or `write`, for a replicated connection manager
 * @return {Object} OpenTelemetry attributes
 */
export function poolAttributes(config, role) {
  const applicationName = config.dialectOptions && config.dialectOptions.application_name;
  const qualifiers = [applicationName, role].filter(Boolean);
  const name = `${config.host}:${config.port}/${config.database}`;

  const attributes = {
    'db.system.name': 'postgresql',
    'db.namespace': config.database,
    'server.address': config.host,
    'server.port': config.port,
    'db.client.connection.pool.name': qualifiers.length > 0 ? `${name} (${qualifiers.join(', ')})` : name
  };

  if (applicationName) {
    // No semantic convention covers this one, so it goes under the Postgres-specific namespace
    // rather than squatting on a name the conventions may later define differently.
    attributes['db.postgresql.application_name'] = applicationName;
  }

  return attributes;
}
