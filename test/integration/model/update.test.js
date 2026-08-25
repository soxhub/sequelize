import { describe, it, beforeEach } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import { expect } from 'chai';
import _ from 'lodash';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('update', () => {
    let Account;

    beforeEach(async () => {
      Account = current.define('Account', {
        ownerId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: 'owner_id'
        },
        name: {
          type: DataTypes.STRING
        }
      });
      await Account.sync({ force: true });
    });

    it('should only update the passed fields', async () => {
      const account = await Account.create({ ownerId: 2 });

      await Account.update(
        {
          name: Math.random().toString()
        },
        {
          where: {
            id: account.get('id')
          }
        }
      );
    });

    if (_.get(current.dialect.supports, 'returnValues.returning')) {
      it('should return the updated record', async () => {
        const account = await Account.create({ ownerId: 2 });

        const [, accounts] = await Account.update(
          { name: 'FooBar' },
          {
            where: {
              id: account.get('id')
            },
            returning: true
          }
        );

        const firstAcc = accounts[0];
        expect(firstAcc.ownerId).to.be.equal(2);
        expect(firstAcc.name).to.be.equal('FooBar');
      });

      it('should return only the requested attributes', async () => {
        const account = await Account.create({ ownerId: 2 });

        const [, accounts] = await Account.update(
          { name: 'FooBar' },
          {
            where: {
              id: account.get('id')
            },
            returning: ['name']
          }
        );

        const firstAcc = accounts[0];
        expect(firstAcc.name).to.be.equal('FooBar');
        expect(firstAcc.ownerId).to.be.equal(undefined);
      });

      it('should accept attribute names whose column differs', async () => {
        const account = await Account.create({ ownerId: 2 });

        const [, accounts] = await Account.update(
          { name: 'FooBar' },
          {
            where: {
              id: account.get('id')
            },
            // `ownerId` is stored as `owner_id`, so the name has to be mapped to the column
            returning: ['ownerId']
          }
        );

        const firstAcc = accounts[0];
        expect(firstAcc.ownerId).to.be.equal(2);
        expect(firstAcc.name).to.be.equal(undefined);
      });

      it('should return plain objects with raw', async () => {
        const account = await Account.create({ ownerId: 2 });

        const [, accounts] = await Account.update(
          { name: 'FooBar' },
          {
            where: {
              id: account.get('id')
            },
            returning: ['ownerId'],
            raw: true
          }
        );

        const firstAcc = accounts[0];
        expect(firstAcc).to.not.be.an.instanceOf(Account);
        expect(Object.keys(firstAcc)).to.deep.equal(['ownerId']);
        expect(firstAcc.ownerId).to.be.equal(2);
      });
    }

    if (current.dialect.supports['LIMIT ON UPDATE']) {
      it('should only update one row', async () => {
        await Account.create({
          ownerId: 2,
          name: 'Account Name 1'
        });

        await Account.create({
          ownerId: 2,
          name: 'Account Name 2'
        });

        await Account.create({
          ownerId: 2,
          name: 'Account Name 3'
        });

        const options = {
          where: {
            ownerId: 2
          },
          limit: 1
        };

        const account = await Account.update({ name: 'New Name' }, options);
        expect(account[0]).to.equal(1);
      });
    }
  });
});
