import { delay } from '../../lib/utils/promise-helpers.js';
import * as chai from 'chai';
import Support from './support.js';
import clsHooked from 'cls-hooked';

const expect = chai.expect;

const Sequelize = Support.Sequelize;

const current = Support.sequelize;

// Run the whole suite against both namespace implementations: the one this fork ships
// (`Sequelize.createCLSNamespace`) and `cls-hooked`, which callers had to supply
// themselves before it existed and which `useCLS` still duck-types for.
const implementations = current.dialect.supports.transactions
  ? [
      ['CLSNamespace', () => Sequelize.createCLSNamespace()],
      ['cls-hooked', () => clsHooked.createNamespace('sequelize')]
    ]
  : [];

for (const [implementation, createNamespace] of implementations) {
  describe(`${Support.getTestDialectTeaser('Continuation local storage')} (${implementation})`, () => {
    let ns;

    before(() => {
      ns = createNamespace();
      Sequelize.useCLS(ns);
    });

    after(() => {
      delete Sequelize._cls;
    });

    beforeEach(async function () {
      this.sequelize = await Support.prepareTransactionTest(this.sequelize);

      this.ns = ns;

      this.User = this.sequelize.define('user', {
        name: Sequelize.STRING
      });

      await this.sequelize.sync({ force: true });
    });

    describe('context', () => {
      it('does not use continuation storage on manually managed transactions', async function () {
        await Sequelize._clsRun(async () => {
          const transaction = await this.sequelize.transaction();
          expect(this.ns.get('transaction')).to.be.undefined;
          return transaction.rollback();
        });
      });

      it('supports several concurrent transactions', async function () {
        let t1id, t2id;
        const self = this;

        await Promise.all([
          this.sequelize.transaction(() => {
            t1id = self.ns.get('transaction').id;

            return Promise.resolve();
          }),
          this.sequelize.transaction(() => {
            t2id = self.ns.get('transaction').id;

            return Promise.resolve();
          })
        ]);

        expect(t1id).to.be.ok;
        expect(t2id).to.be.ok;
        expect(t1id).not.to.equal(t2id);
      });

      it('supports nested promise chains', async function () {
        await this.sequelize.transaction(async () => {
          const tid = this.ns.get('transaction').id;

          await this.User.findAll();
          expect(this.ns.get('transaction').id).to.be.ok;
          expect(this.ns.get('transaction').id).to.equal(tid);
        });
      });

      it('does not leak variables to the outer scope', async function () {
        // This is a little tricky. We want to check the values in the outer scope, when the transaction has been successfully set up, but before it has been comitted.
        // We can't just call another function from inside that transaction, since that would transfer the context to that function - exactly what we are trying to prevent;

        let transactionSetup = false,
          transactionEnded = false;

        // Deliberately not awaited yet: the assertions below have to run while it is still open.
        const transaction = this.sequelize.transaction(async () => {
          transactionSetup = true;

          await delay(500);
          expect(this.ns.get('transaction')).to.be.ok;
          transactionEnded = true;
        });

        await new Promise((resolve) => {
          // Wait for the transaction to be setup
          const interval = setInterval(() => {
            if (transactionSetup) {
              clearInterval(interval);
              resolve();
            }
          }, 200);
        });

        expect(transactionEnded).not.to.be.ok;

        expect(this.ns.get('transaction')).not.to.be.ok;

        // Just to make sure it didn't change between our last check and the assertion
        expect(transactionEnded).not.to.be.ok;

        // Let it finish before the test ends. Otherwise its COMMIT is still in flight during a
        // later test, and that test's afterEach reports the running query against itself.
        await transaction;
      });

      it('does not leak variables to the following promise chain', async function () {
        await this.sequelize.transaction(() => {
          return Promise.resolve();
        });

        expect(this.ns.get('transaction')).not.to.be.ok;
      });

      it('does not leak variables to the following promise chain when the transaction rolls back', async function () {
        await expect(
          this.sequelize.transaction(() => {
            expect(this.ns.get('transaction')).to.be.ok;

            return Promise.reject(new Error('rollback the transaction'));
          })
        ).to.be.rejectedWith('rollback the transaction');

        expect(this.ns.get('transaction')).not.to.be.ok;
      });

      it('does not leave a rolled back transaction ambient for later queries', async function () {
        await expect(
          this.sequelize.transaction(async () => {
            await this.User.create({ name: 'discarded' });

            throw new Error('rollback the transaction');
          })
        ).to.be.rejectedWith('rollback the transaction');

        // If the context leaked, this would run on the rolled back transaction and its
        // already released connection rather than on a fresh one.
        await this.User.create({ name: 'kept' });

        await expect(this.User.findAll()).to.eventually.have.length(1);
      });

      it('does not leak outside findOrCreate', async function () {
        await this.User.findOrCreate({
          where: {
            name: 'Kafka'
          },
          logging(sql) {
            if (/default/.test(sql)) {
              throw new Error('The transaction was not properly assigned');
            }
          }
        });

        await this.User.findAll();
      });
    });

    describe('nested transactions', () => {
      it('nests a transaction with no explicit parent as a savepoint', function () {
        return this.sequelize.transaction((outer) => {
          return this.sequelize.transaction((inner) => {
            expect(inner.parent).to.equal(outer);
            expect(inner.id).to.equal(outer.id);
            expect(inner.connection).to.equal(outer.connection);
            return Promise.resolve();
          });
        });
      });

      it('nests as a savepoint when `transaction` is explicitly undefined', function () {
        return this.sequelize.transaction((outer) => {
          return this.sequelize.transaction({ transaction: undefined }, (inner) => {
            expect(inner.parent).to.equal(outer);
            return Promise.resolve();
          });
        });
      });

      it('starts an independent transaction when `transaction` is null', function () {
        return this.sequelize.transaction((outer) => {
          return this.sequelize.transaction({ transaction: null }, (inner) => {
            expect(inner.parent).not.to.be.ok;
            expect(inner.id).not.to.equal(outer.id);
            expect(inner.connection).not.to.equal(outer.connection);
            return Promise.resolve();
          });
        });
      });

      it('leaves the outer transaction usable after a constraint violation inside the savepoint', async function () {
        const Person = this.sequelize.define('person', {
          name: { type: Sequelize.STRING, unique: true }
        });

        await Person.sync({ force: true });

        await this.sequelize.transaction(async () => {
          await Person.create({ name: 'bob' });

          await expect(
            this.sequelize.transaction(() => {
              return Person.create({ name: 'bob' });
            })
          ).to.be.rejectedWith(Sequelize.UniqueConstraintError);

          // Would fail with `25P02: current transaction is aborted` on postgres if the failed
          // INSERT had run in the outer transaction rather than a savepoint.
          await expect(Person.findAll()).to.eventually.have.length(1);
        });
      });

      it('rolls back only the savepoint and leaves the outer transaction usable', async function () {
        await this.sequelize.transaction(async () => {
          await this.User.create({ name: 'bob' });

          await expect(
            this.sequelize.transaction(async () => {
              await this.User.create({ name: 'alice' });

              throw new Error('rollback the savepoint');
            })
          ).to.be.rejectedWith('rollback the savepoint');

          await expect(this.User.findAll()).to.eventually.have.length(1);
        });
      });
    });

    describe('nested transaction savepoint release', () => {
      // Releasing on commit is opt-in; without it a savepoint commit generates no query at all.
      beforeEach(function () {
        this.sequelize.options.releaseSavepointsOnCommit = true;
      });

      afterEach(function () {
        delete this.sequelize.options.releaseSavepointsOnCommit;
      });

      it('releases the savepoint when a nested transaction commits', async function () {
        const sql = [];

        await this.sequelize.transaction(async () => {
          await this.sequelize.transaction({ logging: (s) => sql.push(s) }, async () => {
            await this.User.create({ name: 'bob' });
          });
        });

        expect(sql.join('\n')).to.match(/RELEASE SAVEPOINT/);
      });

      it('leaves no savepoint to roll back to after the nested transaction commits', function () {
        return this.sequelize.transaction(async (outer) => {
          let savepointName;

          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await this.sequelize.transaction(async (inner) => {
            savepointName = inner.name;
          });

          // The savepoint is released, so rolling back to it is an error rather than a silent no-op.
          await expect(
            this.sequelize.query(
              'ROLLBACK TO SAVEPOINT ' + this.sequelize.getQueryInterface().quoteIdentifier(savepointName, true),
              { transaction: outer }
            )
          ).to.be.rejected;
        });
      });

      it('rolls a savepoint back to itself after it has opened a deeper savepoint', function () {
        // Regression: the savepoint name used to be assigned onto the PARENT transaction, so opening a
        // deeper savepoint renamed the middle one and its rollback targeted the deeper savepoint —
        // silently keeping writes the rollback was supposed to discard.
        return this.sequelize.transaction(async () => {
          await this.User.create({ name: 'outer' });

          await expect(
            this.sequelize.transaction(async () => {
              await this.User.create({ name: 'middle' });

              await this.sequelize.transaction(async () => {
                await this.User.create({ name: 'deep' });
              });

              throw new Error('rollback the middle savepoint');
            })
          ).to.be.rejectedWith('rollback the middle savepoint');

          const users = await this.User.findAll();
          expect(users.map((user) => user.name)).to.deep.equal(['outer']);
        });
      });

      it('generates no commit query for a savepoint when releasing is not enabled', async function () {
        delete this.sequelize.options.releaseSavepointsOnCommit;
        const sql = [];

        await this.sequelize.transaction(async () => {
          await this.sequelize.transaction({ logging: (s) => sql.push(s) }, async () => {
            await this.User.create({ name: 'bob' });
          });
        });

        expect(sql.join('\n')).not.to.match(/RELEASE SAVEPOINT/);
      });

      it('tolerates overlapping nested transactions when releasing is not enabled', function () {
        delete this.sequelize.options.releaseSavepointsOnCommit;

        // The whole point of the default: nothing is released early, so these cannot corrupt
        // each other's savepoints.
        return this.sequelize.transaction(async () => {
          await Promise.all([
            this.sequelize.transaction(async () => {
              await this.User.create({ name: 'a' });
            }),
            this.sequelize.transaction(async () => {
              await this.User.create({ name: 'b' });
            })
          ]);

          await expect(this.User.findAll()).to.eventually.have.length(2);
        });
      });

      it('releases one savepoint per sequential nested transaction', function () {
        const sql = [];
        const logging = (s) => sql.push(s);

        return this.sequelize.transaction(async () => {
          for (const name of ['first', 'second', 'third']) {
            await this.sequelize.transaction({ logging }, async () => {
              await this.User.create({ name });
            });
          }

          // One release per commit, so the subtransaction stack does not grow with the loop.
          expect(sql.filter((statement) => /RELEASE SAVEPOINT/.test(statement))).to.have.length(3);
          await expect(this.User.findAll()).to.eventually.have.length(3);
        });
      });
    });

    describe('nested transaction afterCommit hooks', () => {
      it('defers a savepoint hook to the root transaction instead of running it at savepoint commit', async function () {
        const fired = [];

        await this.sequelize.transaction(async () => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await this.sequelize.transaction(async (inner) => {
            inner.afterCommit(() => fired.push('inner'));
          });

          // The savepoint has committed, but its work is not durable yet.
          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['inner']);
      });

      it('does not run a hook registered in a savepoint that rolled back', async function () {
        const fired = [];

        await this.sequelize.transaction(async () => {
          await expect(
            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            this.sequelize.transaction(async (inner) => {
              inner.afterCommit(() => fired.push('inner'));
              throw new Error('rollback the savepoint');
            })
          ).to.be.rejectedWith('rollback the savepoint');
        });

        expect(fired).to.deep.equal([]);
      });

      it('hands hooks up through several levels of savepoint', async function () {
        const fired = [];

        await this.sequelize.transaction(async (outer) => {
          outer.afterCommit(() => fired.push('outer'));

          await this.sequelize.transaction(async (middle) => {
            middle.afterCommit(() => fired.push('middle'));

            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            await this.sequelize.transaction(async (deep) => {
              deep.afterCommit(() => fired.push('deep'));
            });
          });

          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['outer', 'middle', 'deep']);
      });

      it('discards hooks handed up by a savepoint when an enclosing transaction rolls back', async function () {
        const fired = [];

        await expect(
          this.sequelize.transaction(async () => {
            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            await this.sequelize.transaction(async (inner) => {
              inner.afterCommit(() => fired.push('inner'));
            });

            throw new Error('rollback the root');
          })
        ).to.be.rejectedWith('rollback the root');

        expect(fired).to.deep.equal([]);
      });

      it('defers hooks from an unmanaged savepoint to its explicitly passed parent', async function () {
        const fired = [];
        const root = await this.sequelize.transaction();
        const savepoint = await this.sequelize.transaction({ transaction: root });

        savepoint.afterCommit(() => fired.push('savepoint'));
        await savepoint.commit();
        expect(fired).to.deep.equal([]);

        await root.commit();
        expect(fired).to.deep.equal(['savepoint']);
      });

      it('drops hooks from an unmanaged savepoint that is rolled back', async function () {
        const fired = [];
        const root = await this.sequelize.transaction();
        const savepoint = await this.sequelize.transaction({ transaction: root });

        savepoint.afterCommit(() => fired.push('savepoint'));
        await savepoint.rollback();
        await root.commit();

        expect(fired).to.deep.equal([]);
      });

      it('defers hooks from an unmanaged savepoint nested via CLS', async function () {
        const fired = [];

        await this.sequelize.transaction(async () => {
          const savepoint = await this.sequelize.transaction();

          savepoint.afterCommit(() => fired.push('savepoint'));
          await savepoint.commit();

          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['savepoint']);
      });

      it('calls a deferred hook with the transaction it was registered on', async function () {
        let received, savepoint;

        await this.sequelize.transaction(async (outer) => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await this.sequelize.transaction(async (inner) => {
            savepoint = inner;
            inner.afterCommit((transaction) => {
              received = transaction;
            });
          });

          expect(savepoint).to.not.equal(outer);
        });

        expect(received).to.equal(savepoint);
      });
    });

    describe('sequelize.query integration', () => {
      it('automagically uses the transaction in all calls', async function () {
        await this.sequelize.transaction(async () => {
          await this.User.create({ name: 'bob' });

          await Promise.all([
            expect(this.User.findAll({ transaction: null })).to.eventually.have.length(0),
            expect(this.User.findAll({})).to.eventually.have.length(1)
          ]);
        });
      });
    });

    // The namespace lives on the `Sequelize` class, so a process with more than one instance shares
    // one ambient transaction between them. A transaction owns a connection from the pool of the
    // instance that opened it, so a second instance must ignore it rather than run its own queries
    // on that connection and read rows the transaction has not committed.
    describe('a second Sequelize instance', () => {
      beforeEach(function () {
        this.other = Support.createSequelizeInstance();
        this.OtherUser = this.other.define('user', { name: Sequelize.STRING });
      });

      afterEach(function () {
        return this.other.close();
      });

      it('does not run its queries in a transaction opened on the first instance', function () {
        return this.sequelize.transaction(async () => {
          await this.User.create({ name: 'bob' });

          expect(await this.User.count()).to.equal(1);
          expect(await this.OtherUser.count()).to.equal(0);
        });
      });

      it('does not take a transaction on the first instance as the parent of its own', function () {
        return this.sequelize.transaction(async (outer) => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await this.other.transaction(async (inner) => {
            expect(inner.parent).to.be.undefined;
            expect(inner.id).to.not.equal(outer.id);
          });
        });
      });
    });

    it('CLS namespace is stored in Sequelize._cls', function () {
      expect(Sequelize._cls).to.equal(this.ns);
    });

    it('promises returned by sequelize.query carry CLS context', async function () {
      await this.sequelize.transaction(async (t) => {
        await this.sequelize.query('select 1', { type: Sequelize.QueryTypes.SELECT });
        expect(this.ns.get('transaction')).to.equal(t);
      });
    });
  });
}
