import { expect } from 'chai';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('findAndCount', () => {
    describe('should handle promise rejection', () => {
      before(function () {
        this.stub = sinon.stub();
        this.unhandledListener = () => this.stub();
        process.on('unhandledRejection', this.unhandledListener);

        this.User = current.define('User', {
          username: DataTypes.STRING,
          age: DataTypes.INTEGER
        });

        this.findAll = sinon.stub(this.User, 'findAll').callsFake(() => {
          return Promise.reject(new Error('findAll failed'));
        });

        this.count = sinon.stub(this.User, 'count').callsFake(() => {
          return Promise.reject(new Error('count failed'));
        });
      });

      after(function () {
        process.removeListener('unhandledRejection', this.unhandledListener);
        this.findAll.resetBehavior();
        this.count.resetBehavior();
      });

      it('with errors in count and findAll both', async function () {
        await expect(this.User.findAndCount({})).to.be.rejected;
        expect(this.stub.callCount).to.eql(0);
      });
    });
  });
});
