import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from './support.js';
import ConnectionManager from '../../lib/dialects/postgres/base/connection-manager.js';

describe('connection manager', () => {
  describe('_connect', () => {
    let sandbox, connection, dialect, sequelize;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      connection = {};

      dialect = {
        connectionManager: {
          connect: sandbox.stub().returns(Promise.resolve(connection))
        }
      };

      sequelize = Support.createSequelizeInstance();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should resolve connection on dialect connection manager', async () => {
      const dialectConnection = {};
      dialect.connectionManager.connect.returns(Promise.resolve(dialectConnection));

      const connectionManager = new ConnectionManager(dialect, sequelize);

      const config = {};

      await expect(connectionManager._connect(config)).to.eventually.equal(dialectConnection);

      expect(
        dialect.connectionManager.connect.calledWith(config),
        'dialect.connectionManager.connect should have been called with expected arguments'
      ).to.be.true;
    });

    it('should let beforeConnect hook modify config', async () => {
      const username = Math.random().toString(),
        password = Math.random().toString();

      sequelize.beforeConnect((config) => {
        config.username = username;
        config.password = password;
        return config;
      });

      const connectionManager = new ConnectionManager(dialect, sequelize);

      await connectionManager._connect({});
      expect(
        dialect.connectionManager.connect.calledWith({
          username,
          password
        }),
        'dialect.connectionManager.connect should have been called with expected arguments'
      ).to.be.true;
    });

    it('should call afterConnect', async () => {
      const spy = sinon.spy();
      sequelize.afterConnect(spy);

      const connectionManager = new ConnectionManager(dialect, sequelize);

      await connectionManager._connect({});
      expect(spy.callCount).to.equal(1);
      expect(spy.firstCall.args[0]).to.equal(connection);
      expect(spy.firstCall.args[1]).to.eql({});
    });
  });

  describe('_checkDatabaseVersion', () => {
    let sandbox, dialect, sequelize, connectionManager;

    beforeEach(() => {
      sandbox = sinon.createSandbox();

      dialect = {
        connectionManager: {
          connect: sandbox.stub().returns(Promise.resolve({}))
        }
      };

      sequelize = Support.createSequelizeInstance();
      sequelize.options.databaseVersion = 0;

      connectionManager = new ConnectionManager(dialect, sequelize);
    });

    afterEach(() => {
      sandbox.restore();
    });

    // Regression: a transient failure while detecting the database version used to leave the
    // rejected `versionPromise` cached, permanently poisoning every future `getConnection`.
    it('retries version detection after a transient connect failure', async () => {
      const cm = connectionManager;
      const connectError = new Error('ECONNREFUSED');

      const connectStub = sandbox.stub(cm, '_connect');
      connectStub.onFirstCall().returns(Promise.reject(connectError));
      connectStub.returns(Promise.resolve({}));

      sandbox.stub(cm, '_disconnect').returns(Promise.resolve());
      sandbox.stub(sequelize, 'databaseVersion').returns(Promise.resolve('9.6.0'));

      const pooledConnection = {};
      sandbox.stub(cm.pool, 'acquire').returns(Promise.resolve(pooledConnection));

      // First acquisition fails while detecting the DB version.
      await expect(cm.getConnection()).to.be.rejectedWith(connectError);

      // The failed detection must not stay cached.
      expect(cm.versionPromise).to.equal(null);

      // The next acquisition retries the connect and succeeds.
      await expect(cm.getConnection()).to.eventually.equal(pooledConnection);

      expect(connectStub.calledTwice).to.be.true;
      expect(sequelize.options.databaseVersion).to.equal('9.6.0');
    });
  });
});
