import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

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

  describe('#validate', () => {
    describe('#create', () => {
      it('should return the user', async function () {
        this.User.beforeValidate((user) => {
          user.username = 'Bob';
          user.mood = 'happy';
        });

        this.User.afterValidate((user) => {
          user.username = 'Toni';
        });

        const user = await this.User.create({ mood: 'ecstatic' });

        expect(user.mood).to.equal('happy');
        expect(user.username).to.equal('Toni');
      });
    });

    describe('#3534, hooks modifications', () => {
      it('fields modified in hooks are saved', async function () {
        this.User.afterValidate((user) => {
          //if username is defined and has more than 5 char
          user.username = user.username ? (user.username.length < 5 ? null : user.username) : null;
          user.username = user.username || 'Samorost 3';
        });

        this.User.beforeValidate((user) => {
          user.mood = user.mood || 'neutral';
        });

        const user = await this.User.create({ username: 'T', mood: 'neutral' });
        expect(user.mood).to.equal('neutral');
        expect(user.username).to.equal('Samorost 3');

        // change attributes
        user.mood = 'sad';
        user.username = 'Samorost Good One';

        const saved = await user.save();
        expect(saved.mood).to.equal('sad');
        expect(saved.username).to.equal('Samorost Good One');

        // change attributes, expect to be replaced by hooks
        saved.username = 'One';

        const resaved = await saved.save();
        // attributes were replaced by hooks ?
        expect(resaved.mood).to.equal('sad');
        expect(resaved.username).to.equal('Samorost 3');

        const fetched = await this.User.findById(resaved.id);
        expect(fetched.mood).to.equal('sad');
        expect(fetched.username).to.equal('Samorost 3');

        fetched.mood = null;
        fetched.username = 'New Game is Needed';

        const fetchedSaved = await fetched.save();
        expect(fetchedSaved.mood).to.equal('neutral');
        expect(fetchedSaved.username).to.equal('New Game is Needed');

        const refetched = await this.User.findById(fetchedSaved.id);
        expect(refetched.mood).to.equal('neutral');
        expect(refetched.username).to.equal('New Game is Needed');

        // expect to be replaced by hooks
        refetched.username = 'New';
        refetched.mood = 'happy';

        const refetchedSaved = await refetched.save();
        expect(refetchedSaved.mood).to.equal('happy');
        expect(refetchedSaved.username).to.equal('Samorost 3');
      });
    });

    describe('on error', () => {
      it('should emit an error from after hook', function () {
        this.User.afterValidate((user) => {
          user.mood = 'ecstatic';
          throw new Error('Whoops! Changed user.mood!');
        });

        return expect(this.User.create({ username: 'Toni', mood: 'happy' })).to.be.rejectedWith(
          'Whoops! Changed user.mood!'
        );
      });

      it('should call validationFailed hook', async function () {
        const validationFailedHook = sinon.spy();

        this.User.validationFailed(validationFailedHook);

        await expect(this.User.create({ mood: 'happy' })).to.be.rejected;
        expect(validationFailedHook.calledOnce).to.be.true;
      });

      it('should not replace the validation error in validationFailed hook by default', async function () {
        const validationFailedHook = sinon.stub();

        this.User.validationFailed(validationFailedHook);

        const err = await expect(this.User.create({ mood: 'happy' })).to.be.rejected;
        expect(err.name).to.equal('SequelizeValidationError');
      });

      it('should replace the validation error if validationFailed hook creates a new error', async function () {
        const validationFailedHook = sinon.stub().throws(new Error('Whoops!'));

        this.User.validationFailed(validationFailedHook);

        const err = await expect(this.User.create({ mood: 'happy' })).to.be.rejected;
        expect(err.message).to.equal('Whoops!');
      });
    });
  });
});
