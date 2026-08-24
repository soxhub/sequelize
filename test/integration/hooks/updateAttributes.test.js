import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let User;

  beforeEach(() => {
    User = current.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });
    return current.sync({ force: true });
  });

  describe('#updateAttributes', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeUpdate(beforeHook);
        User.afterUpdate(afterHook);
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        const updatedUser = await user.update({ username: 'Chong' });

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledTwice).to.be.true;
        expect(afterSave.calledTwice).to.be.true;
        expect(updatedUser.username).to.equal('Chong');
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeUpdate(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        User.afterUpdate(afterHook);
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.update({ username: 'Chong' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(beforeSave.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
        expect(afterSave.calledOnce).to.be.true;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeUpdate(beforeHook);
        User.afterUpdate(() => {
          afterHook();
          throw new Error('Whoops!');
        });
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.update({ username: 'Chong' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledTwice).to.be.true;
        expect(afterSave.calledOnce).to.be.true;
      });
    });

    describe('preserves changes to instance', () => {
      it('beforeValidate', async () => {
        User.beforeValidate((user) => {
          user.mood = 'happy';
        });

        const created = await User.create({ username: 'fireninja', mood: 'invalid' });
        const user = await created.update({ username: 'hero' });

        expect(user.username).to.equal('hero');
        expect(user.mood).to.equal('happy');
      });

      it('afterValidate', async () => {
        User.afterValidate((user) => {
          user.mood = 'sad';
        });

        const created = await User.create({ username: 'fireninja', mood: 'nuetral' });
        const user = await created.update({ username: 'spider' });

        expect(user.username).to.equal('spider');
        expect(user.mood).to.equal('sad');
      });

      it('beforeSave', async () => {
        let hookCalled = 0;

        User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const created = await User.create({ username: 'fireninja', mood: 'nuetral' });
        const user = await created.update({ username: 'spider', mood: 'sad' });

        expect(user.username).to.equal('spider');
        expect(user.mood).to.equal('happy');
        expect(hookCalled).to.equal(2);
      });

      it('beforeSave with beforeUpdate', async () => {
        let hookCalled = 0;

        User.beforeUpdate((user) => {
          user.mood = 'sad';
          hookCalled++;
        });

        User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const created = await User.create({ username: 'akira' });
        const user = await created.update({ username: 'spider', mood: 'sad' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('spider');
        expect(hookCalled).to.equal(3);
      });
    });
  });
});
