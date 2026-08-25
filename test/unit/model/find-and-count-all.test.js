import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('findAndCount', () => {
    describe('should handle promise rejection', () => {
      let unhandledSpy, unhandledListener, User, findAllStub, countStub;

      beforeAll(() => {
        unhandledSpy = sinon.stub();
        unhandledListener = () => unhandledSpy();
        process.on('unhandledRejection', unhandledListener);

        User = current.define('User', {
          username: DataTypes.STRING,
          age: DataTypes.INTEGER
        });

        findAllStub = sinon.stub(User, 'findAll').callsFake(() => {
          return Promise.reject(new Error('findAll failed'));
        });

        countStub = sinon.stub(User, 'count').callsFake(() => {
          return Promise.reject(new Error('count failed'));
        });
      });

      afterAll(() => {
        process.removeListener('unhandledRejection', unhandledListener);
        findAllStub.resetBehavior();
        countStub.resetBehavior();
      });

      it('with errors in count and findAll both', async () => {
        await expect(User.findAndCountAll({})).to.be.rejected;
        expect(unhandledSpy.callCount).to.eql(0);
      });
    });
  });
});
