import { expect } from 'chai';
import Support from './support.js';
import sinon from 'sinon';

const dialect = Support.getTestDialect();

const Sequelize = Support.Sequelize;

describe(Support.getTestDialectTeaser('Pooling'), function () {
  beforeEach(function () {
    this.sinon = sinon.createSandbox();
  });

  afterEach(function () {
    this.sinon.restore();
  });

  it('should reject when unable to acquire connection in given time', function () {
    this.testInstance = new Sequelize('localhost', 'ffd', 'dfdf', {
      dialect,
      databaseVersion: '1.2.3',
      pool: {
        acquire: 1000 //milliseconds
      }
    });

    this.sinon.stub(this.testInstance.connectionManager, '_connect').returns(new Sequelize.Promise(() => {}));

    return expect(this.testInstance.authenticate()).to.eventually.be.rejectedWith('ResourceRequest timed out');
  });

  it('should not result in unhandled promise rejection when unable to acquire connection', async function () {
    this.testInstance = new Sequelize('localhost', 'ffd', 'dfdf', {
      dialect,
      databaseVersion: '1.2.3',
      pool: {
        acquire: 1000,
        max: 1
      }
    });

    this.sinon.stub(this.testInstance.connectionManager, '_connect').returns(new Sequelize.Promise(() => {}));

    const acquireTwice = async () => {
      await this.testInstance.transaction();
      return this.testInstance.transaction();
    };

    await expect(acquireTwice()).to.eventually.be.rejectedWith('ResourceRequest timed out');
  });
});
