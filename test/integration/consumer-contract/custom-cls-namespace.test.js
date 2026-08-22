import * as chai from 'chai';
import Support from '../support.js';
import { CLSNamespace } from '../../../index.js';

const expect = chai.expect;

const Sequelize = Support.Sequelize;
const current = Support.sequelize;

/**
 * `auditboard-backend` does not use `Sequelize.createCLSNamespace()` directly. It subclasses
 * `CLSNamespace` to add `enter`/`exit` (`legacy-data-layer/src/cls-harness.ts`) and installs that
 * subclass with `Sequelize.useCLS()`. Its entire integration-test isolation strategy hangs off the
 * result: `app-test-runtime/src/integration/setup.ts` enters a context once per test file, opens an
 * *unmanaged* root transaction inside it, parks that transaction on the context by hand, and rolls
 * it back at the end — so every query in every test of that file runs on one transaction that is
 * never committed.
 *
 * `test/unit/cls.test.js` already covers `CLSNamespace` itself, including an `_activeContext`
 * override in isolation, and `test/integration/cls.test.js` covers the shipped namespace and
 * `cls-hooked` against real transactions. What is untested — and what breaks the consumer's whole
 * suite if it regresses — is the combination: a *subclass* with an ambient entered context, driving
 * real transactions from async stacks that are not inside any `run()`.
 *
 * Consumers:
 *   data-access-layer/legacy-data-layer/src/cls-harness.ts
 *   common/app-test-runtime/src/integration/setup.ts
 *   contexts/api/test-vitest/unit-data-layer/setup.ts
 */

/**
 * A stack-based `enter`/`exit` namespace, mirroring the consumer's `HarnessCLSNamespace`.
 * `_activeContext` is the single documented override point; everything else is inherited.
 */
class HarnessNamespace extends CLSNamespace {
  constructor(name) {
    super(name);
    this.entered = [];
  }

  _activeContext() {
    return super._activeContext() ?? this.entered.at(-1);
  }

  enter(context) {
    this.entered.push(context);
  }

  exit(context) {
    const index = this.entered.lastIndexOf(context);

    if (index === -1) {
      throw new Error("context not currently entered; can't exit");
    }

    this.entered.splice(index, 1);
  }
}

describe(Support.getTestDialectTeaser('Consumer contract'), () => {
  describe('CLSNamespace subclassed by the consumer', () => {
    describe('as a named export', () => {
      it('is exported from the package root', () => {
        expect(CLSNamespace).to.be.a('function');
      });

      it('is the same class hung off Sequelize', () => {
        // The consumer imports the named export; `index.d.ts` declares it as a static too.
        expect(CLSNamespace).to.equal(Sequelize.CLSNamespace);
      });

      it('is what createCLSNamespace() builds, so a subclass shares its behaviour', () => {
        expect(Sequelize.createCLSNamespace()).to.be.instanceOf(CLSNamespace);
        expect(new HarnessNamespace()).to.be.instanceOf(CLSNamespace);
      });

      it('is accepted by useCLS()', () => {
        const previous = Sequelize._cls;

        try {
          Sequelize.useCLS(new HarnessNamespace());
          expect(Sequelize._cls).to.be.instanceOf(HarnessNamespace);
        } finally {
          if (previous) {
            Sequelize._cls = previous;
          } else {
            delete Sequelize._cls;
          }
        }
      });
    });

    describe('_activeContext as the single override point', () => {
      // If any inherited method reached for `this._als.getStore()` directly instead of calling
      // `_activeContext()`, the subclass's entered fallback would be bypassed on that one path —
      // and the consumer would see an ambient transaction that works for reads but not writes, or
      // vice versa. Each assertion here is a path that must route through the override.
      let ns;
      let context;

      beforeEach(() => {
        ns = new HarnessNamespace();
        context = ns.createContext();
        ns.enter(context);
      });

      afterEach(() => {
        ns.exit(context);
      });

      it('routes set() to the entered context', () => {
        ns.set('transaction', 'entered');

        expect(context.values.get('transaction')).to.equal('entered');
      });

      it('routes get() to the entered context', () => {
        ns.set('transaction', 'entered');

        expect(ns.get('transaction')).to.equal('entered');
      });

      it('routes active to the entered context', () => {
        expect(ns.active).to.equal(context);
      });

      it('routes createContext() parentage to the entered context', () => {
        expect(ns.createContext().parent).to.equal(context);
      });

      it('routes run() parentage to the entered context', () => {
        ns.set('transaction', 'entered');

        let seen;
        ns.run(() => {
          seen = ns.get('transaction');
        });

        expect(seen).to.equal('entered');
      });

      it('routes bind() parentage to the entered context', () => {
        ns.set('transaction', 'entered');

        let seen;
        ns.bind(() => {
          seen = ns.get('transaction');
        })();

        expect(seen).to.equal('entered');
      });

      it('lets a run() shadow the entered context without leaking back', () => {
        ns.set('transaction', 'entered');

        ns.run(() => ns.set('transaction', 'inner'));

        expect(ns.get('transaction')).to.equal('entered');
      });

      it('keeps a nested enter() innermost and restores the outer one on exit', () => {
        const inner = ns.createContext();

        ns.set('transaction', 'outer');
        ns.enter(inner);
        ns.set('transaction', 'inner');

        expect(ns.get('transaction')).to.equal('inner');

        ns.exit(inner);

        expect(ns.get('transaction')).to.equal('outer');
      });
    });

    if (current.dialect.supports.transactions) {
      describe('driving real transactions from an entered context', () => {
        let ns;

        before(() => {
          ns = new HarnessNamespace();
          Sequelize.useCLS(ns);
        });

        after(() => {
          delete Sequelize._cls;
        });

        beforeEach(async function () {
          this.ns = ns;
          this.User = this.sequelize.define('CnUser', { name: Sequelize.STRING });
          await this.sequelize.sync({ force: true });

          // The consumer's per-file setup, verbatim in shape: enter a context, open an unmanaged
          // transaction inside it, then park the transaction on the context by hand.
          this.context = ns.createContext();
          ns.enter(this.context);
          this.rootTransaction = await this.sequelize.transaction({ autocommit: false });
          ns.set('transaction', this.rootTransaction);
        });

        afterEach(async function () {
          if (!this.rootTransaction.finished) {
            await this.rootTransaction.rollback();
          }
          ns.exit(this.context);
        });

        it('does not park an unmanaged transaction on the context by itself', function () {
          // Why the consumer's `set()` call is load-bearing rather than belt-and-braces: only the
          // managed (callback) form of `sequelize.transaction()` writes to CLS.
          expect(this.rootTransaction.options.autocommit).to.equal(false);

          // The setup hook's explicit `set()` is what put it there — dropping the value shows the
          // transaction itself left nothing behind.
          this.context.values.delete('transaction');
          expect(this.ns.get('transaction')).to.be.undefined;
        });

        it('is visible to a read from an async stack that never entered a run()', async function () {
          // Nothing here is inside `ns.run()`. The consumer's test bodies are ordinary async
          // functions invoked by a test runner, several ticks removed from the setup hook.
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });

          expect(this.ns.get('transaction')).to.equal(this.rootTransaction);
        });

        it('is picked up automatically by a model write outside any run()', async function () {
          await this.User.create({ name: 'ambient' });

          // Same connection: the row is there for the ambient transaction...
          expect(await this.User.count()).to.equal(1);

          // ...and absent for anything that opts out of CLS onto its own connection.
          expect(await this.User.count({ transaction: null })).to.equal(0);
        });

        it('is picked up automatically by a raw query outside any run()', async function () {
          await this.User.create({ name: 'ambient' });

          const rows = await this.sequelize.query('SELECT name FROM "CnUsers"', {
            type: this.sequelize.QueryTypes.SELECT
          });

          expect(rows.map((row) => row.name)).to.deep.equal(['ambient']);
        });

        it('becomes the parent of a managed transaction, which nests as a savepoint', async function () {
          const statements = [];

          await this.sequelize.transaction({ logging: (sql) => statements.push(sql) }, async (t) => {
            expect(t.parent).to.equal(this.rootTransaction);
            await this.User.create({ name: 'nested' });
          });

          expect(statements.join('\n')).to.match(/SAVEPOINT/i);
          expect(await this.User.count()).to.equal(1);
          expect(await this.User.count({ transaction: null })).to.equal(0);
        });

        it('is shadowed by an in-flight savepoint for work scheduled inside it', async function () {
          // Context propagates through timers, so fire-and-forget work started inside a savepoint
          // stays on that savepoint and rolls back with it. This is the desirable direction — the
          // alternative would leak such writes into the root, where a savepoint rollback could not
          // reach them.
          let scheduledInside;

          await this.sequelize.transaction(async (savepoint) => {
            scheduledInside = await new Promise((resolve) => {
              setTimeout(() => resolve(this.ns.get('transaction')), 0);
            });

            expect(scheduledInside).to.equal(savepoint);
          });

          expect(scheduledInside).to.not.equal(this.rootTransaction);
        });

        it('stays ambient for a stack that originated outside the savepoint', async function () {
          // The complement, and the one the entered context exists for: a callback scheduled
          // before the savepoint opened has no `AsyncLocalStorage` store of its own, so it falls
          // back to the entered context and sees the root even while a savepoint is in flight.
          let resolveDetached;
          const detached = new Promise((resolve) => {
            resolveDetached = resolve;
          });

          setTimeout(() => resolveDetached(this.ns.get('transaction')), 0);

          await this.sequelize.transaction(async (savepoint) => {
            expect(this.ns.get('transaction')).to.equal(savepoint);
            await this.User.create({ name: 'nested' });
          });

          expect(await detached).to.equal(this.rootTransaction);
        });

        it('is reachable by walking parent from a savepoint', async function () {
          // `legacy-data-layer/src/sequelize.ts` `getRootTransaction()` walks `.parent` up from
          // whatever is ambient to find the root, and uses it to key cache invalidation. The chain
          // has to terminate at the entered root rather than at a detached transaction.
          let root;

          await this.sequelize.transaction(async () => {
            await this.sequelize.transaction(async () => {
              await this.User.create({ name: 'deep' });

              let transaction = this.ns.get('transaction');

              while (transaction.parent) {
                transaction = transaction.parent;
              }

              root = transaction;
            });
          });

          expect(root).to.equal(this.rootTransaction);
          expect(this.rootTransaction.parent).to.not.exist;
        });

        it('survives a savepoint rollback, leaving the root transaction usable', async function () {
          await expect(
            this.sequelize.transaction(async () => {
              await this.User.create({ name: 'doomed' });
              throw new Error('nope');
            })
          ).to.be.rejectedWith('nope');

          // The root transaction is still ambient and still usable — this is what lets the
          // consumer run a test that expects a rollback without poisoning the rest of the file.
          expect(this.ns.get('transaction')).to.equal(this.rootTransaction);
          await this.User.create({ name: 'after' });

          expect(await this.User.count()).to.equal(1);
        });

        it('discards every write when the root transaction rolls back', async function () {
          await this.User.create({ name: 'ambient' });

          await this.rootTransaction.rollback();

          expect(await this.User.count({ transaction: null })).to.equal(0);
        });

        it('clears itself from the entered context on rollback', async function () {
          // `Transaction#_clearCls` writes through the same `_activeContext()` fallback. If it
          // missed, the consumer's next test file would inherit a finished transaction and every
          // query in it would fail.
          await this.rootTransaction.rollback();

          expect(this.ns.get('transaction')).to.equal(null);
        });

        it('stops being ambient once the context is exited', async function () {
          await this.rootTransaction.rollback();
          this.ns.exit(this.context);

          expect(this.ns.get('transaction')).to.be.undefined;
          expect(this.ns.active).to.equal(null);

          // Re-entered so the afterEach hook's exit stays balanced.
          this.ns.enter(this.context);
        });
      });
    }
  });
});
