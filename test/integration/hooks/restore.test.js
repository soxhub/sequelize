import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let ParanoidUser;

  beforeEach(() => {
    // Registered only so sync() creates its table; the restore hooks run against ParanoidUser.
    current.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });

    ParanoidUser = current.define(
      'ParanoidUser',
      {
        username: DataTypes.STRING,
        mood: {
          type: DataTypes.ENUM,
          values: ['happy', 'sad', 'neutral']
        }
      },
      {
        paranoid: true
      }
    );

    return current.sync({ force: true });
  });

  describe('#restore', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        ParanoidUser.beforeRestore(beforeHook);
        ParanoidUser.afterRestore(afterHook);

        const user = await ParanoidUser.create({ username: 'Toni', mood: 'happy' });
        await user.destroy();
        await user.restore();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        ParanoidUser.beforeRestore(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        ParanoidUser.afterRestore(afterHook);

        const user = await ParanoidUser.create({ username: 'Toni', mood: 'happy' });
        await user.destroy();
        await expect(user.restore()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        ParanoidUser.beforeRestore(beforeHook);
        ParanoidUser.afterRestore(() => {
          afterHook();
          throw new Error('Whoops!');
        });

        const user = await ParanoidUser.create({ username: 'Toni', mood: 'happy' });
        await user.destroy();
        await expect(user.restore()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });
    });
  });
});
