import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';
import _ from 'lodash';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('method update', () => {
    let User, stubUpdate, updates, cloneUpdates;

    beforeAll(() => {
      User = current.define('User', {
        name: DataTypes.STRING,
        secretValue: DataTypes.INTEGER
      });
    });

    beforeEach(() => {
      stubUpdate = sinon.stub(current.getQueryInterface(), 'bulkUpdate').returns(Promise.resolve([]));
      updates = { name: 'Batman', secretValue: '7' };
      cloneUpdates = _.clone(updates);
    });

    afterEach(() => {
      stubUpdate.restore();
    });

    describe('properly clones input values', () => {
      it('with default options', async () => {
        await User.update(updates, { where: { secretValue: '1' } });
        expect(updates).to.be.deep.eql(cloneUpdates);
      });

      it('when using fields option', async () => {
        await User.update(updates, { where: { secretValue: '1' }, fields: ['name'] });
        expect(updates).to.be.deep.eql(cloneUpdates);
      });
    });

    it('can detect complexe objects', () => {
      const Where = function () {
        this.secretValue = '1';
      };

      return expect(User.update(updates, { where: new Where() })).rejects.toThrow();
    });
  });
});
