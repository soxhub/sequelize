import { delay } from '../../lib/utils/promise-helpers.js';
import { expect } from 'chai';
import Support from './support.js';
import Transaction from '../../lib/transaction.js';
import sinon from 'sinon';

const current = Support.sequelize;

if (current.dialect.supports.transactions) {
  describe(Support.getTestDialectTeaser('Sequelize#transaction'), () => {
    beforeEach(function () {
      this.sinon = sinon.createSandbox();
    });

    afterEach(function () {
      this.sinon.restore();
    });

    describe('then', () => {
      it('gets triggered once a transaction has been successfully committed', async function () {
        let called = false;

        const t = await this.sequelize.transaction();
        await t.commit();
        called = 1;

        expect(called).to.be.ok;
      });

      it('gets triggered once a transaction has been successfully rolled back', async function () {
        let called = false;

        const t = await this.sequelize.transaction();
        await t.rollback();
        called = 1;

        expect(called).to.be.ok;
      });

      if (Support.getTestDialect() !== 'sqlite') {
        it('works for long running transactions', async function () {
          this.timeout(30000);

          const sequelize = await Support.prepareTransactionTest(this.sequelize);
          this.sequelize = sequelize;

          this.User = sequelize.define(
            'User',
            {
              name: Support.Sequelize.STRING
            },
            { timestamps: false }
          );

          await sequelize.sync({ force: true });

          const t = await this.sequelize.transaction();

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

          await this.sequelize.query(query, { transaction: t });
          await this.User.create({ name: 'foo' });
          await this.sequelize.query(query, { transaction: t });
          await t.commit();

          const users = await this.User.all();
          expect(users.length).to.equal(1);
          expect(users[0].name).to.equal('foo');
        });
      }
    });

    describe('complex long running example', () => {
      it('works with promise syntax', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);

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
        beforeEach(async function () {
          this.sequelize = await Support.prepareTransactionTest(this.sequelize);

          this.Model = this.sequelize.define(
            'Model',
            {
              name: { type: Support.Sequelize.STRING, unique: true }
            },
            {
              timestamps: false
            }
          );

          await this.Model.sync({ force: true });
        });

        it('triggers the error event for the second transactions', async function () {
          const t1 = await this.sequelize.transaction();
          const t2 = await this.sequelize.transaction();

          await this.Model.create({ name: 'omnom' }, { transaction: t1 });

          const conflicting = (async () => {
            const err = await expect(this.Model.create({ name: 'omnom' }, { transaction: t2 })).to.be.rejected;
            expect(err).to.be.ok;
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
