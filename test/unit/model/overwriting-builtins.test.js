import { describe, it } from 'vitest';
import { expect } from 'chai';
import Support from '../../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('not breaking built-ins', () => {
    it('it should not break instance.set by defining a model set attribute', () => {
      const User = current.define('OverWrittenKeys', {
        set: DataTypes.STRING
      });

      const user = User.build({ set: 'A' });
      expect(user.get('set')).to.equal('A');
      user.set('set', 'B');
      expect(user.get('set')).to.equal('B');
    });
  });
});
