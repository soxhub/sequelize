import { describe, it, beforeAll, afterAll, afterEach, expect } from 'vitest';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import * as Utils from '../../../lib/utils.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('bulkCreate', () => {
    let Model, bulkInsertStub;

    beforeAll(() => {
      // capture warning from pg
      const warnStub = sinon.stub(Utils.getLogger(), 'warn');

      try {
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
      } finally {
        warnStub.restore();
      }

      bulkInsertStub = sinon.stub(current.getQueryInterface(), 'bulkInsert').returns(Promise.resolve([]));
    });

    afterEach(() => {
      bulkInsertStub.resetHistory();
    });

    afterAll(() => {
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
