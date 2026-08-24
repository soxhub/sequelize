import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

describe(Support.getTestDialectTeaser('Hooks'), () => {
  beforeEach(function () {
    this.User = this.sequelize.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });
    return this.sequelize.sync({ force: true });
  });

  describe('#updateAttributes', () => {
    describe('on success', () => {
      it('should run hooks', async function () {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        this.User.beforeUpdate(beforeHook);
        this.User.afterUpdate(afterHook);
        this.User.beforeSave(beforeSave);
        this.User.afterSave(afterSave);

        const user = await this.User.create({ username: 'Toni', mood: 'happy' });
        const updatedUser = await user.updateAttributes({ username: 'Chong' });

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledTwice).to.be.true;
        expect(afterSave.calledTwice).to.be.true;
        expect(updatedUser.username).to.equal('Chong');
      });
    });

    describe('on error', () => {
      it('should return an error from before', async function () {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        this.User.beforeUpdate(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        this.User.afterUpdate(afterHook);
        this.User.beforeSave(beforeSave);
        this.User.afterSave(afterSave);

        const user = await this.User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.updateAttributes({ username: 'Chong' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(beforeSave.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
        expect(afterSave.calledOnce).to.be.true;
      });

      it('should return an error from after', async function () {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          beforeSave = sinon.spy(),
          afterSave = sinon.spy();

        this.User.beforeUpdate(beforeHook);
        this.User.afterUpdate(() => {
          afterHook();
          throw new Error('Whoops!');
        });
        this.User.beforeSave(beforeSave);
        this.User.afterSave(afterSave);

        const user = await this.User.create({ username: 'Toni', mood: 'happy' });
        await expect(user.updateAttributes({ username: 'Chong' })).to.be.rejected;

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
        expect(beforeSave.calledTwice).to.be.true;
        expect(afterSave.calledOnce).to.be.true;
      });
    });

    describe('preserves changes to instance', () => {
      it('beforeValidate', async function () {
        this.User.beforeValidate((user) => {
          user.mood = 'happy';
        });

        const created = await this.User.create({ username: 'fireninja', mood: 'invalid' });
        const user = await created.updateAttributes({ username: 'hero' });

        expect(user.username).to.equal('hero');
        expect(user.mood).to.equal('happy');
      });

      it('afterValidate', async function () {
        this.User.afterValidate((user) => {
          user.mood = 'sad';
        });

        const created = await this.User.create({ username: 'fireninja', mood: 'nuetral' });
        const user = await created.updateAttributes({ username: 'spider' });

        expect(user.username).to.equal('spider');
        expect(user.mood).to.equal('sad');
      });

      it('beforeSave', async function () {
        let hookCalled = 0;

        this.User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const created = await this.User.create({ username: 'fireninja', mood: 'nuetral' });
        const user = await created.updateAttributes({ username: 'spider', mood: 'sad' });

        expect(user.username).to.equal('spider');
        expect(user.mood).to.equal('happy');
        expect(hookCalled).to.equal(2);
      });

      it('beforeSave with beforeUpdate', async function () {
        let hookCalled = 0;

        this.User.beforeUpdate((user) => {
          user.mood = 'sad';
          hookCalled++;
        });

        this.User.beforeSave((user) => {
          user.mood = 'happy';
          hookCalled++;
        });

        const created = await this.User.create({ username: 'akira' });
        const user = await created.updateAttributes({ username: 'spider', mood: 'sad' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('spider');
        expect(hookCalled).to.equal(3);
      });
    });
  });
});
