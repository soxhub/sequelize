import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'chai';
import Support from './support.js';
import sinon from 'sinon';

const dialect = Support.getTestDialect();

const Sequelize = Support.Sequelize;

describe(Support.getTestDialectTeaser('Pooling'), () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should reject when unable to acquire connection in given time', () => {
    const testInstance = new Sequelize('localhost', 'ffd', 'dfdf', {
      dialect,
      databaseVersion: '1.2.3',
      pool: {
        acquire: 1000 //milliseconds
      }
    });

    sandbox.stub(testInstance.connectionManager, '_connect').returns(new Sequelize.Promise(() => {}));

    return expect(testInstance.authenticate()).to.eventually.be.rejectedWith('ResourceRequest timed out');
  });

  it('should not result in unhandled promise rejection when unable to acquire connection', async () => {
    const testInstance = new Sequelize('localhost', 'ffd', 'dfdf', {
      dialect,
      databaseVersion: '1.2.3',
      pool: {
        acquire: 1000,
        max: 1
      }
    });

    sandbox.stub(testInstance.connectionManager, '_connect').returns(new Sequelize.Promise(() => {}));

    const acquireTwice = async () => {
      await testInstance.transaction();
      return testInstance.transaction();
    };

    await expect(acquireTwice()).to.eventually.be.rejectedWith('ResourceRequest timed out');
  });
});
