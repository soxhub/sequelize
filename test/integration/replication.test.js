import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import sinon from 'sinon';

describe(Support.getTestDialectTeaser('Replication'), () => {
  let sandbox;
  let readSpy, writeSpy;
  let sequelize, User;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    sequelize = Support.getSequelizeInstance(null, null, null, {
      replication: {
        write: Support.getConnectionOptions(),
        read: [Support.getConnectionOptions()]
      }
    });

    expect(sequelize.connectionManager.pool.write).to.be.ok;
    expect(sequelize.connectionManager.pool.read).to.be.ok;

    User = sequelize.define('User', {
      firstName: {
        type: DataTypes.STRING,
        field: 'first_name'
      }
    });

    await User.sync({ force: true });

    readSpy = sandbox.spy(sequelize.connectionManager.pool.read, 'acquire');
    writeSpy = sandbox.spy(sequelize.connectionManager.pool.write, 'acquire');
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

  it('should be able to make a write', async () => {
    await User.create({
      firstName: Math.random().toString()
    });

    expectWriteCalls();
  });

  it('should be able to make a read', async () => {
    await User.findAll();
    expectReadCalls();
  });

  it('should run read-only transactions on the replica', async () => {
    await sequelize.transaction({ readOnly: true }, (transaction) => {
      return User.findAll({ transaction });
    });

    expectReadCalls();
  });

  it('should run non-read-only transactions on the primary', async () => {
    await sequelize.transaction((transaction) => {
      return User.findAll({ transaction });
    });

    expectWriteCalls();
  });
});
