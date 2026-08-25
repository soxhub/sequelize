import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

const Sequelize = Support.Sequelize;

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

  describe('#create', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeCreate(beforeHook);
        User.afterCreate(afterHook);
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        await User.create({ username: 'Toni', mood: 'happy' });

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledOnce).to.be.true;
        expect(afterSave.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterHook = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeCreate(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        User.afterCreate(afterHook);
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        await expect(User.create({ username: 'Toni', mood: 'happy' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
        expect(beforeSave.called, 'beforeSave should not have been called').to.be.false;
        expect(afterSave.called, 'afterSave should not have been called').to.be.false;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterHook = sinon.spy(),
          afterSave = sinon.spy();

        User.beforeCreate(beforeHook);
        User.afterCreate(() => {
          afterHook();
          throw new Error('Whoops!');
        });
        User.beforeSave(beforeSave);
        User.afterSave(afterSave);

        await expect(User.create({ username: 'Toni', mood: 'happy' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledOnce).to.be.true;
        expect(afterSave.called, 'afterSave should not have been called').to.be.false;
      });
    });

    it('should not trigger hooks on parent when using N:M association setters', async () => {
      const A = current.define('A', {
        name: Sequelize.STRING
      });
      const B = current.define('B', {
        name: Sequelize.STRING
      });

      let hookCalled = 0;

      A.addHook('afterCreate', () => {
        hookCalled++;
        return Promise.resolve();
      });

      B.belongsToMany(A, { through: 'a_b' });
      A.belongsToMany(B, { through: 'a_b' });

      await current.sync({ force: true });

      const [a, b] = await Promise.all([A.create({ name: 'a' }), B.create({ name: 'b' })]);
      await a.addB(b);

      expect(hookCalled).to.equal(1);
    });

    describe('preserves changes to instance', () => {
      it('beforeValidate', async () => {
        let hookCalled = 0;

        User.beforeValidate((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const user = await User.create({ mood: 'sad', username: 'leafninja' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('leafninja');
        expect(hookCalled).to.equal(1);
      });

      it('afterValidate', async () => {
        let hookCalled = 0;

        User.afterValidate((user) => {
          user.mood = 'neutral';
          hookCalled++;
        });

        const user = await User.create({ mood: 'sad', username: 'fireninja' });

        expect(user.mood).to.equal('neutral');
        expect(user.username).to.equal('fireninja');
        expect(hookCalled).to.equal(1);
      });

      it('beforeCreate', async () => {
        let hookCalled = 0;

        User.beforeCreate((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const user = await User.create({ username: 'akira' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('akira');
        expect(hookCalled).to.equal(1);
      });

      it('beforeSave', async () => {
        let hookCalled = 0;

        User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const user = await User.create({ username: 'akira' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('akira');
        expect(hookCalled).to.equal(1);
      });

      it('beforeSave with beforeCreate', async () => {
        let hookCalled = 0;

        User.beforeCreate((user) => {
          user.mood = 'sad';
          hookCalled++;
        });

        User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const user = await User.create({ username: 'akira' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('akira');
        expect(hookCalled).to.equal(2);
      });
    });
  });
});
