import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let User, ParanoidUser;

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

  describe('#bulkCreate', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        User.beforeBulkCreate(beforeBulk);

        User.afterBulkCreate(afterBulk);

        await User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', () => {
        User.beforeBulkCreate(() => {
          throw new Error('Whoops!');
        });

        return expect(
          User.bulkCreate([
            { username: 'Cheech', mood: 'sad' },
            { username: 'Chong', mood: 'sad' }
          ])
        ).to.be.rejected;
      });

      it('should return an error from after', () => {
        User.afterBulkCreate(() => {
          throw new Error('Whoops!');
        });

        return expect(
          User.bulkCreate([
            { username: 'Cheech', mood: 'sad' },
            { username: 'Chong', mood: 'sad' }
          ])
        ).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(async () => {
        User = current.define('User', {
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

        await User.sync({ force: true });
      });

      it('should run the afterCreate/beforeCreate functions for each item created successfully', async () => {
        let beforeBulkCreate = false,
          afterBulkCreate = false;

        User.beforeBulkCreate(() => {
          beforeBulkCreate = true;
          return Promise.resolve();
        });

        User.afterBulkCreate(() => {
          afterBulkCreate = true;
          return Promise.resolve();
        });

        User.beforeCreate((user) => {
          user.beforeHookTest = true;
          return Promise.resolve();
        });

        User.afterCreate((user) => {
          user.username = 'User' + user.id;
          return Promise.resolve();
        });

        const records = await User.bulkCreate([{ aNumber: 5 }, { aNumber: 7 }, { aNumber: 3 }], {
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

      it('should run the afterCreate/beforeCreate functions for each item created with an error', async () => {
        let beforeBulkCreate = false,
          afterBulkCreate = false;

        User.beforeBulkCreate(() => {
          beforeBulkCreate = true;
          return Promise.resolve();
        });

        User.afterBulkCreate(() => {
          afterBulkCreate = true;
          return Promise.resolve();
        });

        User.beforeCreate(() => {
          return Promise.reject(new Error('You shall not pass!'));
        });

        User.afterCreate((user) => {
          user.username = 'User' + user.id;
          return Promise.resolve();
        });

        const err = await expect(
          User.bulkCreate([{ aNumber: 5 }, { aNumber: 7 }, { aNumber: 3 }], {
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
      it('should run hooks', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        User.beforeBulkUpdate(beforeBulk);
        User.afterBulkUpdate(afterBulk);

        await User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await User.update({ mood: 'happy' }, { where: { mood: 'sad' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        User.beforeBulkUpdate(() => {
          throw new Error('Whoops!');
        });

        await User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await expect(User.update({ mood: 'happy' }, { where: { mood: 'sad' } })).to.be.rejected;
      });

      it('should return an error from after', async () => {
        User.afterBulkUpdate(() => {
          throw new Error('Whoops!');
        });

        await User.bulkCreate([
          { username: 'Cheech', mood: 'sad' },
          { username: 'Chong', mood: 'sad' }
        ]);

        await expect(User.update({ mood: 'happy' }, { where: { mood: 'sad' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(async () => {
        User = current.define('User', {
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

        await User.sync({ force: true });
      });

      it('should run the after/before functions for each item created successfully', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        User.beforeBulkUpdate(beforeBulk);

        User.afterBulkUpdate(afterBulk);

        User.beforeUpdate((user) => {
          expect(user.changed()).to.not.be.empty;
          user.beforeHookTest = true;
        });

        User.afterUpdate((user) => {
          user.username = 'User' + user.id;
        });

        await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);

        const [, records] = await User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true });

        records.forEach((record) => {
          expect(record.username).to.equal('User' + record.id);
          expect(record.beforeHookTest).to.be.true;
        });
        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });

      it('should run the after/before functions for each item created successfully changing some data before updating', async () => {
        User.beforeUpdate((user) => {
          expect(user.changed()).to.not.be.empty;
          if (user.get('id') === 1) {
            user.set('aNumber', user.get('aNumber') + 3);
          }
        });

        await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);

        const [, records] = await User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true });

        records.forEach((record) => {
          expect(record.aNumber).to.equal(10 + (record.id === 1 ? 3 : 0));
        });
      });

      it('should run the after/before functions for each item created with an error', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        User.beforeBulkUpdate(beforeBulk);

        User.afterBulkUpdate(afterBulk);

        User.beforeUpdate(() => {
          throw new Error('You shall not pass!');
        });

        User.afterUpdate((user) => {
          user.username = 'User' + user.id;
        });

        await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });

        const err = await expect(User.update({ aNumber: 10 }, { where: { aNumber: 1 }, individualHooks: true })).to.be
          .rejected;

        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.be.equal('You shall not pass!');
        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.called, 'afterBulk should not have been called').to.be.false;
      });
    });
  });

  describe('#bulkDestroy', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        User.beforeBulkDestroy(beforeBulk);
        User.afterBulkDestroy(afterBulk);

        await User.destroy({ where: { username: 'Cheech', mood: 'sad' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', () => {
        User.beforeBulkDestroy(() => {
          throw new Error('Whoops!');
        });

        return expect(User.destroy({ where: { username: 'Cheech', mood: 'sad' } })).to.be.rejected;
      });

      it('should return an error from after', () => {
        User.afterBulkDestroy(() => {
          throw new Error('Whoops!');
        });

        return expect(User.destroy({ where: { username: 'Cheech', mood: 'sad' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(async () => {
        User = current.define('User', {
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

        await User.sync({ force: true });
      });

      it('should run the after/before functions for each item created successfully', async () => {
        let beforeBulk = false,
          afterBulk = false,
          beforeHook = false,
          afterHook = false;

        User.beforeBulkDestroy(() => {
          beforeBulk = true;
          return Promise.resolve();
        });

        User.afterBulkDestroy(() => {
          afterBulk = true;
          return Promise.resolve();
        });

        User.beforeDestroy(() => {
          beforeHook = true;
          return Promise.resolve();
        });

        User.afterDestroy(() => {
          afterHook = true;
          return Promise.resolve();
        });

        await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);
        await User.destroy({ where: { aNumber: 1 }, individualHooks: true });

        expect(beforeBulk).to.be.true;
        expect(afterBulk).to.be.true;
        expect(beforeHook).to.be.true;
        expect(afterHook).to.be.true;
      });

      it('should run the after/before functions for each item created with an error', async () => {
        let beforeBulk = false,
          afterBulk = false,
          beforeHook = false,
          afterHook = false;

        User.beforeBulkDestroy(() => {
          beforeBulk = true;
          return Promise.resolve();
        });

        User.afterBulkDestroy(() => {
          afterBulk = true;
          return Promise.resolve();
        });

        User.beforeDestroy(() => {
          beforeHook = true;
          return Promise.reject(new Error('You shall not pass!'));
        });

        User.afterDestroy(() => {
          afterHook = true;
          return Promise.resolve();
        });

        await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });

        const err = await expect(User.destroy({ where: { aNumber: 1 }, individualHooks: true })).to.be.rejected;

        expect(err).to.be.instanceOf(Error);
        expect(beforeBulk).to.be.true;
        expect(beforeHook).to.be.true;
        expect(afterBulk).to.be.false;
        expect(afterHook).to.be.false;
      });
    });
  });

  describe('#bulkRestore', () => {
    beforeEach(async () => {
      await ParanoidUser.bulkCreate([
        { username: 'adam', mood: 'happy' },
        { username: 'joe', mood: 'sad' }
      ]);

      await ParanoidUser.destroy({ truncate: true });
    });

    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy();

        ParanoidUser.beforeBulkRestore(beforeBulk);
        ParanoidUser.afterBulkRestore(afterBulk);

        await ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
      });
    });

    describe('on error', () => {
      it('should return an error from before', () => {
        ParanoidUser.beforeBulkRestore(() => {
          throw new Error('Whoops!');
        });

        return expect(ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } })).to.be.rejected;
      });

      it('should return an error from after', () => {
        ParanoidUser.afterBulkRestore(() => {
          throw new Error('Whoops!');
        });

        return expect(ParanoidUser.restore({ where: { username: 'adam', mood: 'happy' } })).to.be.rejected;
      });
    });

    describe('with the {individualHooks: true} option', () => {
      beforeEach(async () => {
        ParanoidUser = current.define(
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

        await ParanoidUser.sync({ force: true });
      });

      it('should run the after/before functions for each item restored successfully', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy(),
          beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        ParanoidUser.beforeBulkRestore(beforeBulk);
        ParanoidUser.afterBulkRestore(afterBulk);
        ParanoidUser.beforeRestore(beforeHook);
        ParanoidUser.afterRestore(afterHook);

        await ParanoidUser.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);
        await ParanoidUser.destroy({ where: { aNumber: 1 } });
        await ParanoidUser.restore({ where: { aNumber: 1 }, individualHooks: true });

        expect(beforeBulk.calledOnce).to.be.true;
        expect(afterBulk.calledOnce).to.be.true;
        expect(beforeHook.calledThrice).to.be.true;
        expect(afterHook.calledThrice).to.be.true;
      });

      it('should run the after/before functions for each item restored with an error', async () => {
        const beforeBulk = sinon.spy(),
          afterBulk = sinon.spy(),
          beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        ParanoidUser.beforeBulkRestore(beforeBulk);
        ParanoidUser.afterBulkRestore(afterBulk);
        ParanoidUser.beforeRestore(() => {
          beforeHook();
          return Promise.reject(new Error('You shall not pass!'));
        });

        ParanoidUser.afterRestore(afterHook);

        await ParanoidUser.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }], { fields: ['aNumber'] });
        await ParanoidUser.destroy({ where: { aNumber: 1 } });

        const err = await expect(ParanoidUser.restore({ where: { aNumber: 1 }, individualHooks: true })).to.be.rejected;

        expect(err).to.be.instanceOf(Error);
        expect(beforeBulk.calledOnce).to.be.true;
        expect(beforeHook.calledThrice).to.be.true;
        expect(afterBulk.called, 'afterBulk should not have been called').to.be.false;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });
    });
  });
});
