import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from './support.js';
import ConnectionManager from '../../lib/dialects/postgres/base/connection-manager.js';

describe('connection manager', () => {
  describe('_connect', () => {
    beforeEach(function () {
      this.sinon = sinon.createSandbox();
      this.connection = {};

      this.dialect = {
        connectionManager: {
          connect: this.sinon.stub().returns(Promise.resolve(this.connection))
        }
      };

      this.sequelize = Support.createSequelizeInstance();
    });

    afterEach(function () {
      this.sinon.restore();
    });

    it('should resolve connection on dialect connection manager', async function () {
      const connection = {};
      this.dialect.connectionManager.connect.returns(Promise.resolve(connection));

      const connectionManager = new ConnectionManager(this.dialect, this.sequelize);

      const config = {};

      await expect(connectionManager._connect(config)).to.eventually.equal(connection);

      expect(
        this.dialect.connectionManager.connect.calledWith(config),
        'this.dialect.connectionManager.connect should have been called with expected arguments'
      ).to.be.true;
    });

    it('should let beforeConnect hook modify config', async function () {
      const username = Math.random().toString(),
        password = Math.random().toString();

      this.sequelize.beforeConnect((config) => {
        config.username = username;
        config.password = password;
        return config;
      });

      const connectionManager = new ConnectionManager(this.dialect, this.sequelize);

      await connectionManager._connect({});
      expect(
        this.dialect.connectionManager.connect.calledWith({
          username,
          password
        }),
        'this.dialect.connectionManager.connect should have been called with expected arguments'
      ).to.be.true;
    });

    it('should call afterConnect', async function () {
      const spy = sinon.spy();
      this.sequelize.afterConnect(spy);

      const connectionManager = new ConnectionManager(this.dialect, this.sequelize);

      await connectionManager._connect({});
      expect(spy.callCount).to.equal(1);
      expect(spy.firstCall.args[0]).to.equal(this.connection);
      expect(spy.firstCall.args[1]).to.eql({});
    });
  });

  describe('_checkDatabaseVersion', () => {
    beforeEach(function () {
      this.sinon = sinon.createSandbox();

      this.dialect = {
        connectionManager: {
          connect: this.sinon.stub().returns(Promise.resolve({}))
        }
      };

      this.sequelize = Support.createSequelizeInstance();
      this.sequelize.options.databaseVersion = 0;

      this.connectionManager = new ConnectionManager(this.dialect, this.sequelize);
    });

    afterEach(function () {
      this.sinon.restore();
    });

    // Regression: a transient failure while detecting the database version used to leave the
    // rejected `versionPromise` cached, permanently poisoning every future `getConnection`.
    it('retries version detection after a transient connect failure', async function () {
      const cm = this.connectionManager;
      const connectError = new Error('ECONNREFUSED');

      const connectStub = this.sinon.stub(cm, '_connect');
      connectStub.onFirstCall().returns(Promise.reject(connectError));
      connectStub.returns(Promise.resolve({}));

      this.sinon.stub(cm, '_disconnect').returns(Promise.resolve());
      this.sinon.stub(this.sequelize, 'databaseVersion').returns(Promise.resolve('9.6.0'));

      const pooledConnection = {};
      this.sinon.stub(cm.pool, 'acquire').returns(Promise.resolve(pooledConnection));

      // First acquisition fails while detecting the DB version.
      await expect(cm.getConnection()).to.be.rejectedWith(connectError);

      // The failed detection must not stay cached.
      expect(cm.versionPromise).to.equal(null);

      // The next acquisition retries the connect and succeeds.
      await expect(cm.getConnection()).to.eventually.equal(pooledConnection);

      expect(connectStub.calledTwice).to.be.true;
      expect(this.sequelize.options.databaseVersion).to.equal('9.6.0');
    });
  });
});
