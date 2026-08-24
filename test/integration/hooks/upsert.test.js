import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

if (current.dialect.supports.upserts) {
  describe(Support.getTestDialectTeaser('Hooks'), () => {
    let User;

    beforeEach(() => {
      User = current.define('User', {
        username: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true //Either Primary Key/Unique Keys should be passed to upsert
        },
        mood: {
          type: DataTypes.ENUM,
          values: ['happy', 'sad', 'neutral']
        }
      });
      return current.sync({ force: true });
    });

    describe('#upsert', () => {
      describe('on success', () => {
        it('should run hooks', async () => {
          const beforeHook = sinon.spy(),
            afterHook = sinon.spy();

          User.beforeUpsert(beforeHook);
          User.afterUpsert(afterHook);

          await User.upsert({ username: 'Toni', mood: 'happy' });
          expect(beforeHook.calledOnce).to.be.true;
          expect(afterHook.calledOnce).to.be.true;
        });
      });

      describe('on error', () => {
        it('should return an error from before', async () => {
          const beforeHook = sinon.spy(),
            afterHook = sinon.spy();

          User.beforeUpsert(() => {
            beforeHook();
            throw new Error('Whoops!');
          });
          User.afterUpsert(afterHook);

          await expect(User.upsert({ username: 'Toni', mood: 'happy' })).to.be.rejected;
          expect(beforeHook.calledOnce).to.be.true;
          expect(afterHook.called, 'afterHook should not have been called').to.be.false;
        });

        it('should return an error from after', async () => {
          const beforeHook = sinon.spy(),
            afterHook = sinon.spy();

          User.beforeUpsert(beforeHook);
          User.afterUpsert(() => {
            afterHook();
            throw new Error('Whoops!');
          });

          await expect(User.upsert({ username: 'Toni', mood: 'happy' })).to.be.rejected;
          expect(beforeHook.calledOnce).to.be.true;
          expect(afterHook.calledOnce).to.be.true;
        });
      });

      describe('preserves changes to values', () => {
        it('beforeUpsert', async () => {
          let hookCalled = 0;
          const valuesOriginal = { mood: 'sad', username: 'leafninja' };

          User.beforeUpsert((values) => {
            values.mood = 'happy';
            hookCalled++;
          });

          await User.upsert(valuesOriginal);
          expect(valuesOriginal.mood).to.equal('happy');
          expect(hookCalled).to.equal(1);
        });
      });
    });
  });
}
