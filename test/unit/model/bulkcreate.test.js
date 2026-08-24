import { describe, it, before, after, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('bulkCreate', () => {
    let Model, bulkInsertStub;

    before(() => {
      Model = current.define(
        'model',
        {
          accountId: {
            type: DataTypes.INTEGER(11).UNSIGNED,
            allowNull: false,
            field: 'account_id'
          }
        },
        { timestamps: false }
      );

      bulkInsertStub = sinon.stub(current.getQueryInterface(), 'bulkInsert').returns(Promise.resolve([]));
    });

    afterEach(() => {
      bulkInsertStub.resetHistory();
    });

    after(() => {
      bulkInsertStub.restore();
    });

    describe('validations', () => {
      it('should not fail for renamed fields', async () => {
        await Model.bulkCreate([{ accountId: 42 }], { validate: true });
        expect(bulkInsertStub.getCall(0).args[1]).to.deep.equal([{ account_id: 42, id: null }]);
      });
    });
  });
});
