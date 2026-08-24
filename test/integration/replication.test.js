import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import sinon from 'sinon';

describe(Support.getTestDialectTeaser('Replication'), function () {
  let sandbox;
  let readSpy, writeSpy;

  beforeEach(async function () {
    sandbox = sinon.createSandbox();

    this.sequelize = Support.getSequelizeInstance(null, null, null, {
      replication: {
        write: Support.getConnectionOptions(),
        read: [Support.getConnectionOptions()]
      }
    });

    expect(this.sequelize.connectionManager.pool.write).to.be.ok;
    expect(this.sequelize.connectionManager.pool.read).to.be.ok;

    this.User = this.sequelize.define('User', {
      firstName: {
        type: DataTypes.STRING,
        field: 'first_name'
      }
    });

    await this.User.sync({ force: true });

    readSpy = sandbox.spy(this.sequelize.connectionManager.pool.read, 'acquire');
    writeSpy = sandbox.spy(this.sequelize.connectionManager.pool.write, 'acquire');
  });

  afterEach(() => {
    sandbox.restore();
  });

  function expectReadCalls() {
    expect(readSpy.callCount).least(1);
    expect(writeSpy.notCalled).eql(true);
  }

  function expectWriteCalls() {
    expect(writeSpy.callCount).least(1);
    expect(readSpy.notCalled).eql(true);
  }

  it('should be able to make a write', async function () {
    await this.User.create({
      firstName: Math.random().toString()
    });

    expectWriteCalls();
  });

  it('should be able to make a read', async function () {
    await this.User.findAll();
    expectReadCalls();
  });

  it('should run read-only transactions on the replica', async function () {
    await this.sequelize.transaction({ readOnly: true }, (transaction) => {
      return this.User.findAll({ transaction });
    });

    expectReadCalls();
  });

  it('should run non-read-only transactions on the primary', async function () {
    await this.sequelize.transaction((transaction) => {
      return this.User.findAll({ transaction });
    });

    expectWriteCalls();
  });
});
