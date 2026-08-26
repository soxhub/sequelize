import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('method destroy', () => {
    const User = current.define('User', {
      name: DataTypes.STRING,
      secretValue: DataTypes.INTEGER
    });

    let stubDelete;

    beforeAll(() => {
      stubDelete = sinon.stub(current.getQueryInterface(), 'bulkDelete').callsFake(() => {
        return Promise.resolve([]);
      });
    });

    beforeEach(() => {
      stubDelete.resetHistory();
    });

    afterAll(() => {
      stubDelete.restore();
    });

    it('can detect complexe objects', () => {
      const Where = function () {
        this.secretValue = '1';
      };

      return expect(User.destroy({ where: new Where() })).rejects.toThrow();
    });
  });
});
