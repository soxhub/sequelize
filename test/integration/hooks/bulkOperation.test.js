import { describe, it, beforeEach } from 'mocha';
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

    this.ParanoidUser = this.sequelize.define(
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

    return this.sequelize.sync({ force: true });
  });

  describe('#bulkCreate', () => {
    describe('on success', () => {
      it('should run hooks', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.User.beforeBulkCreate(beforeBulk);

        this.User.afterBulkCreate(afterBulk);

        await this.User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', function () {
        this.User.beforeBulkCreate(() => {
          throw new Error('Whoops!');
        });

        return expect(
          this.User.bulkCreate([
            { username: 'Cheech', mood: 'sad' },
            { username: 'Chong', mood: 'sad' }
          ])
        ).to.be.rejected;
      });

      it('should return an error from after', function () {
        this.User.afterBulkCreate(() => {
          throw new Error('Whoops!');
        });

        return expect(
          this.User.bulkCreate([
            { username: 'Cheech', mood: 'sad' },
            { username: 'Chong', mood: 'sad' }
          ])
        ).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(function () {
        this.User = this.sequelize.define('User', {
          username: {
            type: DataTypes.STRING,
            defaultValue: ''
          },
          beforeHookTest: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          aNumber: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          }
        });

        return this.User.sync({ force: true });
      });

      it('should run the afterCreate/beforeCreate functions for each item created successfully', async function () {
        let beforeBulkCreate = false,
          afterBulkCreate = false;

        this.User.beforeBulkCreate(() => {
          beforeBulkCreate = true;
          return Promise.resolve();
        });

        this.User.afterBulkCreate(() => {
          afterBulkCreate = true;
          return Promise.resolve();
        });

        this.User.beforeCreate((user) => {
          user.beforeHookTest = true;
          return Promise.resolve();
        });

        this.User.afterCreate((user) => {
          user.username = 'User' + user.id;
          return Promise.resolve();
        });

        const records = await this.User.bulkCreate([{ aNumber: 5 }, { aNumber: 7 }, { aNumber: 3 }], {
          fields: ['aNumber'],
          individualHooks: true
        });

        records.forEach((record) => {
          expect(record.username).to.equal('User' + record.id);
          expect(record.beforeHookTest).to.be.true;
        });
        expect(beforeBulkCreate).to.be.true;
        expect(afterBulkCreate).to.be.true;
      });

      it('should run the afterCreate/beforeCreate functions for each item created with an error', async function () {
        let beforeBulkCreate = false,
          afterBulkCreate = false;

        this.User.beforeBulkCreate(() => {
          beforeBulkCreate = true;
          return Promise.resolve();
        });

        this.User.afterBulkCreate(() => {
          afterBulkCreate = true;
          return Promise.resolve();
        });

        this.User.beforeCreate(() => {
          return Promise.reject(new Error('You shall not pass!'));
        });

        this.User.afterCreate((user) => {
          user.username = 'User' + user.id;
          return Promise.resolve();
        });

        const err = await expect(
          this.User.bulkCreate([{ aNumber: 5 }, { aNumber: 7 }, { aNumber: 3 }], {
            fields: ['aNumber'],
            individualHooks: true
          })
        ).to.be.rejected;

        expect(err).to.be.instanceOf(Error);
        expect(beforeBulkCreate).to.be.true;
        expect(afterBulkCreate).to.be.false;
      });
    });
  });

  describe('#bulkUpdate', () => {
    describe('on success', () => {
      it('should run hooks', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.User.beforeBulkUpdate(beforeBulk);
        this.User.afterBulkUpdate(afterBulk);

        await this.User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await this.User.update({ mood: 'happy' }, { where: { mood: 'sad' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async function () {
        this.User.beforeBulkUpdate(() => {
          throw new Error('Whoops!');
        });

        await this.User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await expect(this.User.update({ mood: 'happy' }, { where: { mood: 'sad' } })).to.be.rejected;
      });

      it('should return an error from after', async function () {
        this.User.afterBulkUpdate(() => {
          throw new Error('Whoops!');
        });

        await this.User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await expect(this.User.update({ mood: 'happy' }, { where: { mood: 'sad' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(function () {
        this.User = this.sequelize.define('User', {
          username: {
            type: DataTypes.STRING,
            defaultValue: ''
          },
          beforeHookTest: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          aNumber: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          }
        });

        return this.User.sync({ force: true });
      });

      it('should run the after/before functions for each item created successfully', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.User.beforeBulkUpdate(beforeBulk);

        this.User.afterBulkUpdate(afterBulk);

        this.User.beforeUpdate((user) => {
          expect(user.changed()).to.not.be.empty;
          user.beforeHookTest = true;
        });

        this.User.afterUpdate((user) => {
          user.username = 'User' + user.id;
        });

        await this.User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);

        const [, records] = await this.User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true });

        records.forEach((record) => {
          expect(record.username).to.equal('User' + record.id);
          expect(record.beforeHookTest).to.be.true;
        });
        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });

      it('should run the after/before functions for each item created successfully changing some data before updating', async function () {
        this.User.beforeUpdate((user) => {
          expect(user.changed()).to.not.be.empty;
          if (user.get('id') === 1) {
            user.set('aNumber', user.get('aNumber') + 3);
          }
        });

        await this.User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);

        const [, records] = await this.User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true });

        records.forEach((record) => {
          expect(record.aNumber).to.equal(10 + (record.id === 1 ? 3 : 0));
        });
      });

      it('should run the after/before functions for each item created with an error', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.User.beforeBulkUpdate(beforeBulk);

        this.User.afterBulkUpdate(afterBulk);

        this.User.beforeUpdate(() => {
          throw new Error('You shall not pass!');
        });

        this.User.afterUpdate((user) => {
          user.username = 'User' + user.id;
        });

        await this.User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });

        const err = await expect(this.User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true })).to
          .be.rejected;

        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.be.equal('You shall not pass!');
        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.called, 'afterBulk should not have been called').to.be.false;
      });
    });
  });

  describe('#bulkDestroy', () => {
    describe('on success', () => {
      it('should run hooks', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.User.beforeBulkDestroy(beforeBulk);
        this.User.afterBulkDestroy(afterBulk);

        await this.User.destroy({ where: { username: 'Cheech', mood: 'sad' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', function () {
        this.User.beforeBulkDestroy(() => {
          throw new Error('Whoops!');
        });

        return expect(this.User.destroy({ where: { username: 'Cheech', mood: 'sad' } })).to.be.rejected;
      });

      it('should return an error from after', function () {
        this.User.afterBulkDestroy(() => {
          throw new Error('Whoops!');
        });

        return expect(this.User.destroy({ where: { username: 'Cheech', mood: 'sad' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(function () {
        this.User = this.sequelize.define('User', {
          username: {
            type: DataTypes.STRING,
            defaultValue: ''
          },
          beforeHookTest: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          aNumber: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          }
        });

        return this.User.sync({ force: true });
      });

      it('should run the after/before functions for each item created successfully', async function () {
        let beforeBulk = false,
          afterBulk = false,
          beforeHook = false,
          afterHook = false;

        this.User.beforeBulkDestroy(() => {
          beforeBulk = true;
          return Promise.resolve();
        });

        this.User.afterBulkDestroy(() => {
          afterBulk = true;
          return Promise.resolve();
        });

        this.User.beforeDestroy(() => {
          beforeHook = true;
          return Promise.resolve();
        });

        this.User.afterDestroy(() => {
          afterHook = true;
          return Promise.resolve();
        });

        await this.User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);
        await this.User.destroy({ where: { aNumber: 1 }, individualHooks: true });

        expect(beforeBulk).to.be.true;
        expect(afterBulk).to.be.true;
        expect(beforeHook).to.be.true;
        expect(afterHook).to.be.true;
      });

      it('should run the after/before functions for each item created with an error', async function () {
        let beforeBulk = false,
          afterBulk = false,
          beforeHook = false,
          afterHook = false;

        this.User.beforeBulkDestroy(() => {
          beforeBulk = true;
          return Promise.resolve();
        });

        this.User.afterBulkDestroy(() => {
          afterBulk = true;
          return Promise.resolve();
        });

        this.User.beforeDestroy(() => {
          beforeHook = true;
          return Promise.reject(new Error('You shall not pass!'));
        });

        this.User.afterDestroy(() => {
          afterHook = true;
          return Promise.resolve();
        });

        await this.User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });

        const err = await expect(this.User.destroy({ where: { aNumber: 1 }, individualHooks: true })).to.be.rejected;

        expect(err).to.be.instanceOf(Error);
        expect(beforeBulk).to.be.true;
        expect(beforeHook).to.be.true;
        expect(afterBulk).to.be.false;
        expect(afterHook).to.be.false;
      });
    });
  });

  describe('#bulkRestore', () => {
    beforeEach(async function () {
      await this.ParanoidUser.bulkCreate([
        { username: 'adam', mood: 'happy' },
        { username: 'joe', mood: 'sad' }
      ]);

      await this.ParanoidUser.destroy({ truncate: true });
    });

    describe('on success', () => {
      it('should run hooks', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        this.ParanoidUser.beforeBulkRestore(beforeBulk);
        this.ParanoidUser.afterBulkRestore(afterBulk);

        await this.ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', function () {
        this.ParanoidUser.beforeBulkRestore(() => {
          throw new Error('Whoops!');
        });

        return expect(this.ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } })).to.be.rejected;
      });

      it('should return an error from after', function () {
        this.ParanoidUser.afterBulkRestore(() => {
          throw new Error('Whoops!');
        });

        return expect(this.ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(function () {
        this.ParanoidUser = this.sequelize.define(
          'ParanoidUser',
          {
            aNumber: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            }
          },
          {
            paranoid: true
          }
        );

        return this.ParanoidUser.sync({ force: true });
      });

      it('should run the after/before functions for each item restored successfully', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy(),
          beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        this.ParanoidUser.beforeBulkRestore(beforeBulk);
        this.ParanoidUser.afterBulkRestore(afterBulk);
        this.ParanoidUser.beforeRestore(beforeHook);
        this.ParanoidUser.afterRestore(afterHook);

        await this.ParanoidUser.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);
        await this.ParanoidUser.destroy({ where: { aNumber: 1 } });
        await this.ParanoidUser.restore({ where: { aNumber: 1 }, individualHooks: true });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
        expect(beforeHook.calledThrice).to.be.true;
        expect(afterHook.calledThrice).to.be.true;
      });

      it('should run the after/before functions for each item restored with an error', async function () {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy(),
          beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        this.ParanoidUser.beforeBulkRestore(beforeBulk);
        this.ParanoidUser.afterBulkRestore(afterBulk);
        this.ParanoidUser.beforeRestore(() => {
          beforeHook();
          return Promise.reject(new Error('You shall not pass!'));
        });

        this.ParanoidUser.afterRestore(afterHook);

        await this.ParanoidUser.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });
        await this.ParanoidUser.destroy({ where: { aNumber: 1 } });

        const err = await expect(this.ParanoidUser.restore({ where: { aNumber: 1 }, individualHooks: true })).to.be
          .rejected;

        expect(err).to.be.instanceOf(Error);
        expect(beforeBulk.calledOnce).to.be.true;
        expect(beforeHook.calledThrice).to.be.true;
        expect(afterBulk.called, 'afterBulk should not have been called').to.be.false;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });
    });
  });
});
