import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { delay } from '../../lib/utils/promise-helpers.js';
import Support from './support.js';
import Transaction from '../../lib/transaction.js';
import sinon from 'sinon';

const current = Support.sequelize;

if (current.dialect.supports.transactions) {
  describe(Support.getTestDialectTeaser('Sequelize#transaction'), () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    describe('then', () => {
      it('gets triggered once a transaction has been successfully committed', async () => {
        let called = false;

        const t = await current.transaction();
        await t.commit();
        called = 1;

        expect(called).to.be.ok;
      });

      it('gets triggered once a transaction has been successfully rolled back', async () => {
        let called = false;

        const t = await current.transaction();
        await t.rollback();
        called = 1;

        expect(called).to.be.ok;
      });

      if (Support.getTestDialect() !== 'sqlite') {
        it('works for long running transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);

          const User = sequelize.define(
            'User',
            {
              name: Support.Sequelize.STRING
            },
            { timestamps: false }
          );

          await sequelize.sync({ force: true });

          const t = await sequelize.transaction();

          let query = 'select sleep(2);';

          switch (Support.getTestDialect()) {
            case 'postgres':
              query = 'select pg_sleep(2);';
              break;
            case 'sqlite':
              query = 'select sqlite3_sleep(2000);';
              break;
            case 'mssql':
              query = "WAITFOR DELAY '00:00:02';";
              break;
            default:
              break;
          }

          await sequelize.query(query, { transaction: t });
          await User.create({ name: 'foo' });
          await sequelize.query(query, { transaction: t });
          await t.commit();

          const users = await User.findAll();
          expect(users.length).to.equal(1);
          expect(users[0].name).to.equal('foo');
        });
      }
    });

    describe('complex long running example', () => {
      it('works with promise syntax', async () => {
        const sequelize = await Support.prepareTransactionTest(current);

        const Test = sequelize.define('Test', {
          id: { type: Support.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          name: { type: Support.Sequelize.STRING }
        });

        await sequelize.sync({ force: true });

        const transaction = await sequelize.transaction();
        expect(transaction).to.be.instanceOf(Transaction);

        await Test.create({ name: 'Peter' }, { transaction });
        await delay(1000);
        await transaction.commit();

        const count = await Test.count();
        expect(count).to.equal(1);
      });
    });

    describe('concurrency', () => {
      describe('having tables with uniqueness constraints', () => {
        let sequelize, Model;

        beforeEach(async () => {
          sequelize = await Support.prepareTransactionTest(current);

          Model = sequelize.define(
            'Model',
            {
              name: { type: Support.Sequelize.STRING, unique: true }
            },
            {
              timestamps: false
            }
          );

          await Model.sync({ force: true });
        });

        it('triggers the error event for the second transactions', async () => {
          const t1 = await sequelize.transaction();
          const t2 = await sequelize.transaction();

          await Model.create({ name: 'omnom' }, { transaction: t1 });

          const conflicting = (async () => {
            await expect(Model.create({ name: 'omnom' }, { transaction: t2 })).rejects.toThrow();
            return t2.rollback();
          })();

          const committing = (async () => {
            await delay(100);
            return t1.commit();
          })();

          await Promise.all([conflicting, committing]);
        });
      });
    });
  });
}
