import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { delay } from '../../lib/utils/promise-helpers.js';
import Support from './support.js';
import QueryTypes from '../../lib/query-types.js';
import Transaction from '../../lib/transaction.js';
import sinon from 'sinon';

const current = Support.sequelize;

// afterCommit rejects synchronously, so wrap the whole attempt to turn that into
// a rejection, and always clean up so an open transaction can't leak into the
// next test.
async function expectInvalidAfterCommitHook(sequelize, hook) {
  const transaction = await sequelize.transaction();

  try {
    await expect(
      (async () => {
        transaction.afterCommit(hook);
        await transaction.commit();
      })()
    ).rejects.toThrow('"fn" must be a function');
  } finally {
    if (!transaction.finished) {
      await transaction.rollback();
    }
  }
}

if (current.dialect.supports.transactions) {
  describe(Support.getTestDialectTeaser('Transaction'), () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    describe('constructor', () => {
      it('stores options', () => {
        const transaction = new Transaction(current);
        expect(transaction.options).to.be.an.instanceOf(Object);
      });

      it('generates an identifier', () => {
        const transaction = new Transaction(current);
        expect(transaction.id).to.exist;
      });

      it('should call dialect specific generateTransactionId method', () => {
        const transaction = new Transaction(current);
        expect(transaction.id).to.exist;
      });
    });

    describe('commit', () => {
      it('is a commit method available', () => {
        expect(Transaction).to.respondTo('commit');
      });
    });

    describe('rollback', () => {
      it('is a rollback method available', () => {
        expect(Transaction).to.respondTo('rollback');
      });
    });

    describe('autoCallback', () => {
      it('supports automatically committing', () => {
        return current.transaction(() => {
          return Promise.resolve();
        });
      });

      it('supports automatically rolling back with a thrown error', async () => {
        let t;

        await expect(
          current.transaction((transaction) => {
            t = transaction;
            throw new Error('Yolo');
          })
        ).rejects.toThrow();

        expect(t.finished).to.be.equal('rollback');
      });

      it('supports automatically rolling back with a rejection', async () => {
        let t;

        await expect(
          current.transaction((transaction) => {
            t = transaction;
            return Promise.reject(new Error('Swag'));
          })
        ).rejects.toThrow();

        expect(t.finished).to.be.equal('rollback');
      });

      it('supports running hooks when a transaction is commited', async () => {
        const hook = sinon.spy();
        let transaction;

        await current.transaction((t) => {
          transaction = t;
          transaction.afterCommit(hook);
          return current.query('SELECT 1+1', { transaction, type: QueryTypes.SELECT });
        });

        expect(hook.calledOnce).to.be.true;
        expect(hook.calledWith(transaction), 'hook should have been called with expected arguments').to.be.true;
      });

      it('does not run hooks when a transaction is rolled back', async () => {
        const hook = sinon.spy();

        await expect(
          current.transaction((transaction) => {
            transaction.afterCommit(hook);
            return Promise.reject(new Error('Rollback'));
          })
        ).rejects.toThrow();

        expect(hook.called, 'hook should not have been called').to.be.false;
      });

      //Promise rejection test is specifc to postgres

      it('do not rollback if already committed', async () => {
        const SumSumSum = current.define('transaction', {
          value: {
            type: Support.Sequelize.DECIMAL(10, 3),
            field: 'value'
          }
        });
        const transTest = (val) =>
          current.transaction({ isolationLevel: 'SERIALIZABLE' }, async (t) => {
            await SumSumSum.sum('value', { transaction: t });
            return await SumSumSum.create({ value: -val }, { transaction: t });
          });

        // Attention: this test is a bit racy. If you find a nicer way to test this: go ahead
        await SumSumSum.sync({ force: true });

        await expect(Promise.all([transTest(80), transTest(80), transTest(80)])).rejects.toThrow(
          'could not serialize access due to read/write dependencies among transactions'
        );

        await delay(100);

        if (current.test.$runningQueries !== 0) {
          await delay(200);
        }

        if (current.test.$runningQueries !== 0) {
          await delay(500);
        }
      });
    });

    it('does not allow queries after commit', async () => {
      const t = await current.transaction();

      await current.query('SELECT 1+1', { transaction: t, raw: true });
      await t.commit();

      const err = await Support.expectRejection(current.query('SELECT 1+1', { transaction: t, raw: true }));

      expect(err.message).to.match(
        /commit has been called on this transaction\([^)]+\), you can no longer use it\. \(The rejected query is attached as the 'sql' property of this error\)/
      );
      expect(err.sql).to.equal('SELECT 1+1');
    });

    it('does not allow queries immediatly after commit call', async () => {
      const t = await current.transaction();

      await current.query('SELECT 1+1', { transaction: t, raw: true });

      // The commit and the query must be issued together so the query lands
      // while the commit is still in flight.
      const [, err] = await Promise.all([
        t.commit(),
        Support.expectRejection(current.query('SELECT 1+1', { transaction: t, raw: true }))
      ]);

      expect(err.message).to.match(
        /commit has been called on this transaction\([^)]+\), you can no longer use it\. \(The rejected query is attached as the 'sql' property of this error\)/
      );
      expect(err.sql).to.equal('SELECT 1+1');
    });

    it('does not allow queries after rollback', async () => {
      const t = await current.transaction();

      await current.query('SELECT 1+1', { transaction: t, raw: true });
      await t.rollback();

      await expect(current.query('SELECT 1+1', { transaction: t, raw: true })).rejects.toThrow();
    });

    it('should not rollback if connection was not acquired', async () => {
      sandbox.stub(current.connectionManager, '_connect').returns(new Promise(() => {}));

      const transaction = new Transaction(current);

      await expect(transaction.rollback()).rejects.toThrow(
        'Transaction cannot be rolled back because it never started'
      );
    });

    it('does not allow queries immediatly after rollback call', async () => {
      const t = await current.transaction();

      // The rollback and the query must be issued together so the query lands
      // while the rollback is still in flight.
      const [, err] = await Promise.all([
        t.rollback(),
        Support.expectRejection(current.query('SELECT 1+1', { transaction: t, raw: true }))
      ]);

      expect(err.message).to.match(
        /rollback has been called on this transaction\([^)]+\), you can no longer use it\. \(The rejected query is attached as the 'sql' property of this error\)/
      );
      expect(err.sql).to.equal('SELECT 1+1');
    });

    it('does not allow commits after commit', async () => {
      const t = await current.transaction();

      await t.commit();

      await expect(t.commit()).rejects.toThrow(
        'Transaction cannot be committed because it has been finished with state: commit'
      );
    });

    it('should run hooks if a non-auto callback transaction is committed', async () => {
      const hook = sinon.spy();
      const transaction = await current.transaction();

      try {
        transaction.afterCommit(hook);
        await transaction.commit();

        expect(hook.calledOnce).to.be.true;
        expect(hook.calledWith(transaction), 'hook should have been called with expected arguments').to.be.true;
      } finally {
        // Cleanup this transaction so other tests don't
        // fail due to an open transaction
        if (!transaction.finished) {
          await transaction.rollback();
        }
      }
    });

    it('should not run hooks if a non-auto callback transaction is rolled back', async () => {
      const hook = sinon.spy();
      const t = await current.transaction();

      t.afterCommit(hook);
      await t.rollback();

      expect(hook.called, 'hook should not have been called').to.be.false;
    });

    it('should throw an error if null is passed to afterCommit', async () => {
      await expectInvalidAfterCommitHook(current, null);
    });

    it('should throw an error if undefined is passed to afterCommit', async () => {
      await expectInvalidAfterCommitHook(current, undefined);
    });

    it('should throw an error if an object is passed to afterCommit', async () => {
      await expectInvalidAfterCommitHook(current, {});
    });

    it('does not allow commits after rollback', async () => {
      const t = await current.transaction();

      await t.rollback();

      await expect(t.commit()).rejects.toThrow(
        'Transaction cannot be committed because it has been finished with state: rollback'
      );
    });

    it('does not allow rollbacks after commit', async () => {
      const t = await current.transaction();

      await t.commit();

      await expect(t.rollback()).rejects.toThrow(
        'Transaction cannot be rolled back because it has been finished with state: commit'
      );
    });

    it('does not allow rollbacks after rollback', async () => {
      const t = await current.transaction();

      await t.rollback();

      await expect(t.rollback()).rejects.toThrow(
        'Transaction cannot be rolled back because it has been finished with state: rollback'
      );
    });

    it('works even if a transaction: null option is passed', async () => {
      sandbox.spy(current, 'query');

      const t = await current.transaction({
        transaction: null
      });

      await t.commit();

      expect(current.query.callCount).to.be.greaterThan(0);

      for (let i = 0; i < current.query.callCount; i++) {
        expect(current.query.getCall(i).args[1].transaction).to.equal(t);
      }
    });

    it('works even if a transaction: undefined option is passed', async () => {
      sandbox.spy(current, 'query');

      const t = await current.transaction({
        transaction: undefined
      });

      await t.commit();

      expect(current.query.callCount).to.be.greaterThan(0);

      for (let i = 0; i < current.query.callCount; i++) {
        expect(current.query.getCall(i).args[1].transaction).to.equal(t);
      }
    });

    if (current.dialect.supports.transactionOptions.type) {
      describe('transaction types', () => {
        it('should support default transaction type DEFERRED', async () => {
          const t = await current.transaction({});

          await t.rollback();

          expect(t.options.type).to.equal('DEFERRED');
        });

        Object.keys(Transaction.TYPES).forEach((key) => {
          it('should allow specification of ' + key + ' type', async () => {
            const t = await current.transaction({
              type: key
            });

            await t.rollback();

            expect(t.options.type).to.equal(Transaction.TYPES[key]);
          });
        });
      });
    }

    if (current.dialect.supports.lock) {
      describe('row locking', () => {
        it('supports for update', async () => {
          const User = current.define('user', {
              username: Support.Sequelize.STRING,
              awesome: Support.Sequelize.BOOLEAN
            }),
            t1Spy = sinon.spy(),
            t2Spy = sinon.spy();

          await current.sync({ force: true });
          await User.create({ username: 'jan' });

          const t1 = await current.transaction();
          const t1Jan = await User.findOne({
            where: {
              username: 'jan'
            },
            lock: t1.LOCK.UPDATE,
            transaction: t1
          });
          const t2 = await current.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
          });

          // Both arms must run concurrently: t2's locking find is expected to
          // block until t1 commits.
          await Promise.all([
            (async () => {
              await User.findOne({
                where: {
                  username: 'jan'
                },
                lock: t2.LOCK.UPDATE,
                transaction: t2
              });
              t2Spy();
              await t2.commit();
              expect(t2Spy.calledAfter(t1Spy), 't2Spy should have been called after t1Spy').to.be.true; // Find should not succeed before t1 has comitted
            })(),

            (async () => {
              await t1Jan.update(
                {
                  awesome: true
                },
                {
                  transaction: t1
                }
              );
              t1Spy();
              await delay(2000);
              await t1.commit();
            })()
          ]);
        });

        it('fail locking with outer joins', async () => {
          const User = current.define('User', { username: Support.Sequelize.STRING }),
            Task = current.define('Task', {
              title: Support.Sequelize.STRING,
              active: Support.Sequelize.BOOLEAN
            });

          User.belongsToMany(Task, { through: 'UserTasks' });
          Task.belongsToMany(User, { through: 'UserTasks' });

          await current.sync({ force: true });

          const [john, task1] = await Promise.all([
            User.create({ username: 'John' }),
            Task.create({ title: 'Get rich', active: false })
          ]);

          await john.setTasks([task1]);

          await current.transaction(async (t1) => {
            const find = User.findOne({
              where: {
                username: 'John'
              },
              include: [Task],
              lock: t1.LOCK.UPDATE,
              transaction: t1
            });

            if (current.dialect.supports.lockOuterJoinFailure) {
              return await expect(find).rejects.toThrow(
                'FOR UPDATE cannot be applied to the nullable side of an outer join'
              );
            }

            return await find;
          });
        });

        if (current.dialect.supports.lockOf) {
          it('supports for update of table', async () => {
            const User = current.define('User', { username: Support.Sequelize.STRING }, { tableName: 'Person' }),
              Task = current.define('Task', {
                title: Support.Sequelize.STRING,
                active: Support.Sequelize.BOOLEAN
              });

            User.belongsToMany(Task, { through: 'UserTasks' });
            Task.belongsToMany(User, { through: 'UserTasks' });

            await current.sync({ force: true });

            const [john, task1] = await Promise.all([
              User.create({ username: 'John' }),
              Task.create({ title: 'Get rich', active: false }),
              Task.create({ title: 'Die trying', active: false })
            ]);

            await john.setTasks([task1]);

            await current.transaction(async (t1) => {
              const t1John = await User.findOne({
                where: {
                  username: 'John'
                },
                include: [Task],
                lock: {
                  level: t1.LOCK.UPDATE,
                  of: User
                },
                transaction: t1
              });

              // should not be blocked by the lock of the other transaction
              await current.transaction((t2) => {
                return Task.update(
                  {
                    active: true
                  },
                  {
                    where: {
                      active: false
                    },
                    transaction: t2
                  }
                );
              });

              return await t1John.save({
                transaction: t1
              });
            });
          });
        }

        if (current.dialect.supports.lockKey) {
          it('supports for key share', async () => {
            const User = current.define('user', {
                username: Support.Sequelize.STRING,
                awesome: Support.Sequelize.BOOLEAN
              }),
              t1Spy = sinon.spy(),
              t2Spy = sinon.spy();

            await current.sync({ force: true });
            await User.create({ username: 'jan' });

            const t1 = await current.transaction();
            const t1Jan = await User.findOne({
              where: {
                username: 'jan'
              },
              lock: t1.LOCK.NO_KEY_UPDATE,
              transaction: t1
            });
            const t2 = await current.transaction();

            // Both arms must run concurrently: the KEY SHARE lock is expected to
            // be granted while t1 still holds NO KEY UPDATE.
            await Promise.all([
              (async () => {
                await User.findOne({
                  where: {
                    username: 'jan'
                  },
                  lock: t2.LOCK.KEY_SHARE,
                  transaction: t2
                });
                t2Spy();
                await t2.commit();
              })(),

              (async () => {
                await t1Jan.update(
                  {
                    awesome: true
                  },
                  {
                    transaction: t1
                  }
                );
                await delay(2000);
                t1Spy();
                expect(t1Spy.calledAfter(t2Spy), 't1Spy should have been called after t2Spy').to.be.true;
                await t1.commit();
              })()
            ]);
          });
        }

        it('supports for share', async () => {
          const User = current.define('user', {
              username: Support.Sequelize.STRING,
              awesome: Support.Sequelize.BOOLEAN
            }),
            t1Spy = sinon.spy(),
            t2FindSpy = sinon.spy(),
            t2UpdateSpy = sinon.spy();

          await current.sync({ force: true });
          await User.create({ username: 'jan' });

          const t1 = await current.transaction();
          const t1Jan = await User.findOne({
            where: {
              username: 'jan'
            },
            lock: t1.LOCK.SHARE,
            transaction: t1
          });
          const t2 = await current.transaction({
            isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
          });

          // Both arms must run concurrently: t2's find is expected to return
          // while t1 holds the share lock, but its update must wait for t1.
          await Promise.all([
            (async () => {
              const t2Jan = await User.findOne({
                where: {
                  username: 'jan'
                },
                transaction: t2
              });
              t2FindSpy();
              await t2Jan.update(
                {
                  awesome: false
                },
                {
                  transaction: t2
                }
              );
              t2UpdateSpy();
              await t2.commit();

              expect(t2FindSpy.calledBefore(t1Spy), 't2FindSpy should have been called before t1Spy').to.be.true; // The find call should have returned
              expect(t2UpdateSpy.calledAfter(t1Spy), 't2UpdateSpy should have been called after t1Spy').to.be.true; // But the update call should not happen before the first transaction has committed
            })(),

            (async () => {
              await t1Jan.update(
                {
                  awesome: true
                },
                {
                  transaction: t1
                }
              );
              await delay(2000);
              t1Spy();
              await t1.commit();
            })()
          ]);
        });
      });
    }
  });
}
