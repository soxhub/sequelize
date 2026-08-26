import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import sinon from 'sinon';

const current = Support.sequelize;

const stub = sinon.stub;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('method findOrCreate', () => {
    beforeAll(() => {
      current.constructor.useCLS(current.constructor.createCLSNamespace());
    });

    afterAll(() => {
      delete current.constructor._cls;
    });

    let User, transactionStub, clsStub;

    beforeEach(() => {
      User = current.define(
        'User',
        {},
        {
          name: 'John'
        }
      );

      transactionStub = stub(User.sequelize, 'transaction');
      transactionStub.returns(new Promise(() => {}));

      clsStub = stub(current.constructor._cls, 'get');
      clsStub.returns({ id: 123 });
    });

    afterEach(() => {
      transactionStub.restore();
      clsStub.restore();
    });

    it('should use transaction from cls if available', () => {
      const options = {
        where: {
          name: 'John'
        }
      };

      User.findOrCreate(options);

      expect(clsStub.calledOnce).to.equal(true, 'expected to ask for transaction');
    });

    it('should not use transaction from cls if provided as argument', () => {
      const options = {
        where: {
          name: 'John'
        },
        transaction: { id: 123 }
      };

      User.findOrCreate(options);

      expect(clsStub.called).to.equal(false);
    });
  });
});
