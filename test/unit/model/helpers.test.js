import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('hasAlias', () => {
    let User, Task;

    beforeEach(() => {
      User = current.define('user');
      Task = current.define('task');
    });

    it('returns true if a model has an association with the specified alias', () => {
      Task.belongsTo(User, { as: 'owner' });
      expect(Task.hasAlias('owner')).to.equal(true);
    });

    it('returns false if a model does not have an association with the specified alias', () => {
      Task.belongsTo(User, { as: 'owner' });
      expect(Task.hasAlias('notOwner')).to.equal(false);
    });
  });
});
