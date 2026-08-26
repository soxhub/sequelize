import { describe, it, beforeEach, expect } from 'vitest';
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

  describe('#destroy', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        User.beforeDestroy(beforeHook);
        User.afterDestroy(afterHook);

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        await user.destroy();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        User.beforeDestroy(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        User.afterDestroy(afterHook);

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.destroy()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        User.beforeDestroy(beforeHook);
        User.afterDestroy(() => {
          afterHook();
          throw new Error('Whoops!');
        });

        const user = await User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.destroy()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });
    });
  });
});
