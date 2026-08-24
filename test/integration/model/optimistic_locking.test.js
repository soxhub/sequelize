import { describe, it, beforeEach } from 'mocha';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import { expect } from 'chai';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('optimistic locking', () => {
    let Account;
    beforeEach(() => {
      Account = current.define(
        'Account',
        {
          number: {
            type: DataTypes.INTEGER
          }
        },
        {
          version: true
        }
      );
      return Account.sync({ force: true });
    });

    it('should increment the version on save', async () => {
      const account = await Account.create({ number: 1 });

      account.number += 1;
      expect(account.version).to.eq(0);

      const saved = await account.save();
      expect(saved.version).to.eq(1);
    });

    it('should increment the version on update', async () => {
      const account = await Account.create({ number: 1 });
      expect(account.version).to.eq(0);

      const updated = await account.update({ number: 2 });
      expect(updated.version).to.eq(1);
      updated.number += 1;

      const saved = await updated.save();
      expect(saved.number).to.eq(3);
      expect(saved.version).to.eq(2);
    });

    it('prevents stale instances from being saved', async () => {
      const staleSave = async () => {
        const accountA = await Account.create({ number: 1 });
        const accountB = await Account.findByPk(accountA.id);

        accountA.number += 1;
        await accountA.save();

        accountB.number += 1;
        return accountB.save();
      };

      await expect(staleSave()).to.eventually.be.rejectedWith(Support.Sequelize.OptimisticLockError);
    });

    it('increment() also increments the version', async () => {
      const account = await Account.create({ number: 1 });
      expect(account.version).to.eq(0);

      const incremented = await account.increment('number', { by: 1 });
      const reloaded = await incremented.reload();
      expect(reloaded.version).to.eq(1);
    });

    it('decrement() also increments the version', async () => {
      const account = await Account.create({ number: 1 });
      expect(account.version).to.eq(0);

      const decremented = await account.decrement('number', { by: 1 });
      const reloaded = await decremented.reload();
      expect(reloaded.version).to.eq(1);
    });
  });
});
