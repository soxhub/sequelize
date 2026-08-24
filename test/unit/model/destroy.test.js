import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
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

    before(() => {
      stubDelete = sinon.stub(current.getQueryInterface(), 'bulkDelete').callsFake(() => {
        return Promise.resolve([]);
      });
    });

    beforeEach(() => {
      stubDelete.resetHistory();
    });

    after(() => {
      stubDelete.restore();
    });

    it('can detect complexe objects', () => {
      const Where = function () {
        this.secretValue = '1';
      };

      return expect(User.destroy({ where: new Where() })).to.be.rejected;
    });
  });
});
