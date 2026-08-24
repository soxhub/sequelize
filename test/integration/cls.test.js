import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { delay } from '../../lib/utils/promise-helpers.js';
import { expect } from 'chai';
import Support from './support.js';
import clsHooked from 'cls-hooked';

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
    let ns, sequelize, User;

    before(() => {
      ns = createNamespace();
      Sequelize.useCLS(ns);
    });

    after(() => {
      delete Sequelize._cls;
    });

    beforeEach(async () => {
      sequelize = await Support.prepareTransactionTest(current);

      User = sequelize.define('user', {
        name: Sequelize.STRING
      });

      await sequelize.sync({ force: true });
    });

    describe('context', () => {
      it('does not use continuation storage on manually managed transactions', async () => {
        await Sequelize._clsRun(async () => {
          const transaction = await sequelize.transaction();
          expect(ns.get('transaction')).to.be.undefined;
          return transaction.rollback();
        });
      });

      it('supports several concurrent transactions', async () => {
        let t1id, t2id;
        await Promise.all([
          sequelize.transaction(() => {
            t1id = ns.get('transaction').id;

            return Promise.resolve();
          }),
          sequelize.transaction(() => {
            t2id = ns.get('transaction').id;

            return Promise.resolve();
          })
        ]);

        expect(t1id).to.be.ok;
        expect(t2id).to.be.ok;
        expect(t1id).not.to.equal(t2id);
      });

      it('supports nested promise chains', async () => {
        await sequelize.transaction(async () => {
          const tid = ns.get('transaction').id;

          await User.findAll();
          expect(ns.get('transaction').id).to.be.ok;
          expect(ns.get('transaction').id).to.equal(tid);
        });
      });

      it('does not leak variables to the outer scope', async () => {
        // This is a little tricky. We want to check the values in the outer scope, when the transaction has been successfully set up, but before it has been comitted.
        // We can't just call another function from inside that transaction, since that would transfer the context to that function - exactly what we are trying to prevent;

        let transactionSetup = false,
          transactionEnded = false;

        // Deliberately not awaited yet: the assertions below have to run while it is still open.
        const transaction = sequelize.transaction(async () => {
          transactionSetup = true;

          await delay(500);
          expect(ns.get('transaction')).to.be.ok;
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

        expect(ns.get('transaction')).not.to.be.ok;

        // Just to make sure it didn't change between our last check and the assertion
        expect(transactionEnded).not.to.be.ok;

        // Let it finish before the test ends. Otherwise its COMMIT is still in flight during a
        // later test, and that test's afterEach reports the running query against itself.
        await transaction;
      });

      it('does not leak variables to the following promise chain', async () => {
        await sequelize.transaction(() => {
          return Promise.resolve();
        });

        expect(ns.get('transaction')).not.to.be.ok;
      });

      it('does not leak variables to the following promise chain when the transaction rolls back', async () => {
        await expect(
          sequelize.transaction(() => {
            expect(ns.get('transaction')).to.be.ok;

            return Promise.reject(new Error('rollback the transaction'));
          })
        ).to.be.rejectedWith('rollback the transaction');

        expect(ns.get('transaction')).not.to.be.ok;
      });

      it('does not leave a rolled back transaction ambient for later queries', async () => {
        await expect(
          sequelize.transaction(async () => {
            await User.create({ name: 'discarded' });

            throw new Error('rollback the transaction');
          })
        ).to.be.rejectedWith('rollback the transaction');

        // If the context leaked, this would run on the rolled back transaction and its
        // already released connection rather than on a fresh one.
        await User.create({ name: 'kept' });

        await expect(User.findAll()).to.eventually.have.length(1);
      });

      it('does not leak outside findOrCreate', async () => {
        await User.findOrCreate({
          where: {
            name: 'Kafka'
          },
          logging(sql) {
            if (/default/.test(sql)) {
              throw new Error('The transaction was not properly assigned');
            }
          }
        });

        await User.findAll();
      });
    });

    describe('nested transactions', () => {
      it('nests a transaction with no explicit parent as a savepoint', () => {
        return sequelize.transaction((outer) => {
          return sequelize.transaction((inner) => {
            expect(inner.parent).to.equal(outer);
            expect(inner.id).to.equal(outer.id);
            expect(inner.connection).to.equal(outer.connection);
            return Promise.resolve();
          });
        });
      });

      it('nests as a savepoint when `transaction` is explicitly undefined', () => {
        return sequelize.transaction((outer) => {
          return sequelize.transaction({ transaction: undefined }, (inner) => {
            expect(inner.parent).to.equal(outer);
            return Promise.resolve();
          });
        });
      });

      it('starts an independent transaction when `transaction` is null', () => {
        return sequelize.transaction((outer) => {
          return sequelize.transaction({ transaction: null }, (inner) => {
            expect(inner.parent).not.to.be.ok;
            expect(inner.id).not.to.equal(outer.id);
            expect(inner.connection).not.to.equal(outer.connection);
            return Promise.resolve();
          });
        });
      });

      it('leaves the outer transaction usable after a constraint violation inside the savepoint', async () => {
        const Person = sequelize.define('person', {
          name: { type: Sequelize.STRING, unique: true }
        });

        await Person.sync({ force: true });

        await sequelize.transaction(async () => {
          await Person.create({ name: 'bob' });

          await expect(
            sequelize.transaction(() => {
              return Person.create({ name: 'bob' });
            })
          ).to.be.rejectedWith(Sequelize.UniqueConstraintError);

          // Would fail with `25P02: current transaction is aborted` on postgres if the failed
          // INSERT had run in the outer transaction rather than a savepoint.
          await expect(Person.findAll()).to.eventually.have.length(1);
        });
      });

      it('rolls back only the savepoint and leaves the outer transaction usable', async () => {
        await sequelize.transaction(async () => {
          await User.create({ name: 'bob' });

          await expect(
            sequelize.transaction(async () => {
              await User.create({ name: 'alice' });

              throw new Error('rollback the savepoint');
            })
          ).to.be.rejectedWith('rollback the savepoint');

          await expect(User.findAll()).to.eventually.have.length(1);
        });
      });
    });

    describe('nested transaction savepoint release', () => {
      // Releasing on commit is opt-in; without it a savepoint commit generates no query at all.
      beforeEach(() => {
        sequelize.options.releaseSavepointsOnCommit = true;
      });

      afterEach(() => {
        delete sequelize.options.releaseSavepointsOnCommit;
      });

      it('releases the savepoint when a nested transaction commits', async () => {
        const sql = [];

        await sequelize.transaction(async () => {
          await sequelize.transaction({ logging: (s) => sql.push(s) }, async () => {
            await User.create({ name: 'bob' });
          });
        });

        expect(sql.join('\n')).to.match(/RELEASE SAVEPOINT/);
      });

      it('leaves no savepoint to roll back to after the nested transaction commits', () => {
        return sequelize.transaction(async (outer) => {
          let savepointName;

          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await sequelize.transaction(async (inner) => {
            savepointName = inner.name;
          });

          // The savepoint is released, so rolling back to it is an error rather than a silent no-op.
          await expect(
            sequelize.query(
              'ROLLBACK TO SAVEPOINT ' + sequelize.getQueryInterface().quoteIdentifier(savepointName, true),
              { transaction: outer }
            )
          ).to.be.rejected;
        });
      });

      it('rolls a savepoint back to itself after it has opened a deeper savepoint', () => {
        // Regression: the savepoint name used to be assigned onto the PARENT transaction, so opening a
        // deeper savepoint renamed the middle one and its rollback targeted the deeper savepoint —
        // silently keeping writes the rollback was supposed to discard.
        return sequelize.transaction(async () => {
          await User.create({ name: 'outer' });

          await expect(
            sequelize.transaction(async () => {
              await User.create({ name: 'middle' });

              await sequelize.transaction(async () => {
                await User.create({ name: 'deep' });
              });

              throw new Error('rollback the middle savepoint');
            })
          ).to.be.rejectedWith('rollback the middle savepoint');

          const users = await User.findAll();
          expect(users.map((user) => user.name)).to.deep.equal(['outer']);
        });
      });

      it('generates no commit query for a savepoint when releasing is not enabled', async () => {
        delete sequelize.options.releaseSavepointsOnCommit;
        const sql = [];

        await sequelize.transaction(async () => {
          await sequelize.transaction({ logging: (s) => sql.push(s) }, async () => {
            await User.create({ name: 'bob' });
          });
        });

        expect(sql.join('\n')).not.to.match(/RELEASE SAVEPOINT/);
      });

      it('tolerates overlapping nested transactions when releasing is not enabled', () => {
        delete sequelize.options.releaseSavepointsOnCommit;

        // The whole point of the default: nothing is released early, so these cannot corrupt
        // each other's savepoints.
        return sequelize.transaction(async () => {
          await Promise.all([
            sequelize.transaction(async () => {
              await User.create({ name: 'a' });
            }),
            sequelize.transaction(async () => {
              await User.create({ name: 'b' });
            })
          ]);

          await expect(User.findAll()).to.eventually.have.length(2);
        });
      });

      it('releases one savepoint per sequential nested transaction', () => {
        const sql = [];
        const logging = (s) => sql.push(s);

        return sequelize.transaction(async () => {
          for (const name of ['first', 'second', 'third']) {
            // oxlint-disable-next-line no-loop-func -- `sequelize` and `User` are per-test fixtures; each iteration is awaited before the next
            await sequelize.transaction({ logging }, async () => {
              await User.create({ name });
            });
          }

          // One release per commit, so the subtransaction stack does not grow with the loop.
          expect(sql.filter((statement) => /RELEASE SAVEPOINT/.test(statement))).to.have.length(3);
          await expect(User.findAll()).to.eventually.have.length(3);
        });
      });
    });

    describe('nested transaction afterCommit hooks', () => {
      it('defers a savepoint hook to the root transaction instead of running it at savepoint commit', async () => {
        const fired = [];

        await sequelize.transaction(async () => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await sequelize.transaction(async (inner) => {
            inner.afterCommit(() => fired.push('inner'));
          });

          // The savepoint has committed, but its work is not durable yet.
          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['inner']);
      });

      it('does not run a hook registered in a savepoint that rolled back', async () => {
        const fired = [];

        await sequelize.transaction(async () => {
          await expect(
            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            sequelize.transaction(async (inner) => {
              inner.afterCommit(() => fired.push('inner'));
              throw new Error('rollback the savepoint');
            })
          ).to.be.rejectedWith('rollback the savepoint');
        });

        expect(fired).to.deep.equal([]);
      });

      it('hands hooks up through several levels of savepoint', async () => {
        const fired = [];

        await sequelize.transaction(async (outer) => {
          outer.afterCommit(() => fired.push('outer'));

          await sequelize.transaction(async (middle) => {
            middle.afterCommit(() => fired.push('middle'));

            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            await sequelize.transaction(async (deep) => {
              deep.afterCommit(() => fired.push('deep'));
            });
          });

          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['outer', 'middle', 'deep']);
      });

      it('discards hooks handed up by a savepoint when an enclosing transaction rolls back', async () => {
        const fired = [];

        await expect(
          sequelize.transaction(async () => {
            // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
            await sequelize.transaction(async (inner) => {
              inner.afterCommit(() => fired.push('inner'));
            });

            throw new Error('rollback the root');
          })
        ).to.be.rejectedWith('rollback the root');

        expect(fired).to.deep.equal([]);
      });

      it('defers hooks from an unmanaged savepoint to its explicitly passed parent', async () => {
        const fired = [];
        const root = await sequelize.transaction();
        const savepoint = await sequelize.transaction({ transaction: root });

        savepoint.afterCommit(() => fired.push('savepoint'));
        await savepoint.commit();
        expect(fired).to.deep.equal([]);

        await root.commit();
        expect(fired).to.deep.equal(['savepoint']);
      });

      it('drops hooks from an unmanaged savepoint that is rolled back', async () => {
        const fired = [];
        const root = await sequelize.transaction();
        const savepoint = await sequelize.transaction({ transaction: root });

        savepoint.afterCommit(() => fired.push('savepoint'));
        await savepoint.rollback();
        await root.commit();

        expect(fired).to.deep.equal([]);
      });

      it('defers hooks from an unmanaged savepoint nested via CLS', async () => {
        const fired = [];

        await sequelize.transaction(async () => {
          const savepoint = await sequelize.transaction();

          savepoint.afterCommit(() => fired.push('savepoint'));
          await savepoint.commit();

          expect(fired).to.deep.equal([]);
        });

        expect(fired).to.deep.equal(['savepoint']);
      });

      it('calls a deferred hook with the transaction it was registered on', async () => {
        let received, savepoint;

        await sequelize.transaction(async (outer) => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await sequelize.transaction(async (inner) => {
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
      it('automagically uses the transaction in all calls', async () => {
        await sequelize.transaction(async () => {
          await User.create({ name: 'bob' });

          await Promise.all([
            expect(User.findAll({ transaction: null })).to.eventually.have.length(0),
            expect(User.findAll({})).to.eventually.have.length(1)
          ]);
        });
      });
    });

    // The namespace lives on the `Sequelize` class, so a process with more than one instance shares
    // one ambient transaction between them. A transaction owns a connection from the pool of the
    // instance that opened it, so a second instance must ignore it rather than run its own queries
    // on that connection and read rows the transaction has not committed.
    describe('a second Sequelize instance', () => {
      let other, OtherUser;

      beforeEach(() => {
        other = Support.createSequelizeInstance();
        OtherUser = other.define('user', { name: Sequelize.STRING });
      });

      afterEach(() => {
        return other.close();
      });

      it('does not run its queries in a transaction opened on the first instance', () => {
        return sequelize.transaction(async () => {
          await User.create({ name: 'bob' });

          expect(await User.count()).to.equal(1);
          expect(await OtherUser.count()).to.equal(0);
        });
      });

      it('does not take a transaction on the first instance as the parent of its own', () => {
        return sequelize.transaction(async (outer) => {
          // oxlint-disable-next-line require-await -- async on purpose: the shape under test is an async transaction callback
          await other.transaction(async (inner) => {
            expect(inner.parent).to.be.undefined;
            expect(inner.id).to.not.equal(outer.id);
          });
        });
      });
    });

    it('CLS namespace is stored in Sequelize._cls', () => {
      expect(Sequelize._cls).to.equal(ns);
    });

    it('promises returned by sequelize.query carry CLS context', async () => {
      await sequelize.transaction(async (t) => {
        await sequelize.query('select 1', { type: Sequelize.QueryTypes.SELECT });
        expect(ns.get('transaction')).to.equal(t);
      });
    });
  });
}
