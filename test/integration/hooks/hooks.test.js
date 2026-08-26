import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

const Sequelize = Support.Sequelize;
const dialect = Support.getTestDialect();

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let SharedUser;

  beforeEach(() => {
    SharedUser = current.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });

    // Registered only so sync() creates its table; the hooks under test run against SharedUser.
    current.define(
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

  describe('#define', () => {
    let model;

    beforeAll(() => {
      current.addHook('beforeDefine', (attributes, options) => {
        options.modelName = 'bar';
        options.name.plural = 'barrs';
        attributes.type = DataTypes.STRING;
      });

      current.addHook('afterDefine', (factory) => {
        factory.options.name.singular = 'barr';
      });

      model = current.define('foo', { name: DataTypes.STRING });
    });

    it('beforeDefine hook can change model name', () => {
      expect(model.name).to.equal('bar');
    });

    it('beforeDefine hook can alter options', () => {
      expect(model.options.name.plural).to.equal('barrs');
    });

    it('beforeDefine hook can alter attributes', () => {
      expect(model.rawAttributes.type).to.be.ok;
    });

    it('afterDefine hook can alter options', () => {
      expect(model.options.name.singular).to.equal('barr');
    });

    afterAll(() => {
      current.options.hooks = {};
      current.modelManager.removeModel(model);
    });
  });

  describe('#init', () => {
    let seq;

    beforeAll(() => {
      Sequelize.addHook('beforeInit', (config, options) => {
        config.database = 'db2';
        options.host = 'server9';
      });

      Sequelize.addHook('afterInit', (sequelize) => {
        sequelize.options.protocol = 'udp';
      });

      seq = new Sequelize('db', 'user', 'pass', { dialect });
    });

    it('beforeInit hook can alter config', () => {
      expect(seq.config.database).to.equal('db2');
    });

    it('beforeInit hook can alter options', () => {
      expect(seq.options.host).to.equal('server9');
    });

    it('afterInit hook can alter options', () => {
      expect(seq.options.protocol).to.equal('udp');
    });

    afterAll(() => {
      Sequelize.options.hooks = {};
    });
  });

  describe('passing DAO instances', () => {
    describe('beforeValidate / afterValidate', () => {
      it('should pass a DAO instance to the hook', async () => {
        let beforeHooked = false;
        let afterHooked = false;
        const User = current.define(
          'User',
          {
            username: DataTypes.STRING
          },
          {
            hooks: {
              beforeValidate(user) {
                expect(user).to.be.instanceof(User);
                beforeHooked = true;
                return Promise.resolve();
              },
              afterValidate(user) {
                expect(user).to.be.instanceof(User);
                afterHooked = true;
                return Promise.resolve();
              }
            }
          }
        );

        await User.sync({ force: true });
        await User.create({ username: 'bob' });

        expect(beforeHooked).to.be.true;
        expect(afterHooked).to.be.true;
      });
    });

    describe('beforeCreate / afterCreate', () => {
      it('should pass a DAO instance to the hook', async () => {
        let beforeHooked = false;
        let afterHooked = false;
        const User = current.define(
          'User',
          {
            username: DataTypes.STRING
          },
          {
            hooks: {
              beforeCreate(user) {
                expect(user).to.be.instanceof(User);
                beforeHooked = true;
                return Promise.resolve();
              },
              afterCreate(user) {
                expect(user).to.be.instanceof(User);
                afterHooked = true;
                return Promise.resolve();
              }
            }
          }
        );

        await User.sync({ force: true });
        await User.create({ username: 'bob' });

        expect(beforeHooked).to.be.true;
        expect(afterHooked).to.be.true;
      });
    });

    describe('beforeDestroy / afterDestroy', () => {
      it('should pass a DAO instance to the hook', async () => {
        let beforeHooked = false;
        let afterHooked = false;
        const User = current.define(
          'User',
          {
            username: DataTypes.STRING
          },
          {
            hooks: {
              beforeDestroy(user) {
                expect(user).to.be.instanceof(User);
                beforeHooked = true;
                return Promise.resolve();
              },
              afterDestroy(user) {
                expect(user).to.be.instanceof(User);
                afterHooked = true;
                return Promise.resolve();
              }
            }
          }
        );

        await User.sync({ force: true });

        const user = await User.create({ username: 'bob' });
        await user.destroy();

        expect(beforeHooked).to.be.true;
        expect(afterHooked).to.be.true;
      });
    });

    describe('beforeDelete / afterDelete', () => {
      it('should pass a DAO instance to the hook', async () => {
        let beforeHooked = false;
        let afterHooked = false;
        const User = current.define(
          'User',
          {
            username: DataTypes.STRING
          },
          {
            hooks: {
              beforeDelete(user) {
                expect(user).to.be.instanceof(User);
                beforeHooked = true;
                return Promise.resolve();
              },
              afterDelete(user) {
                expect(user).to.be.instanceof(User);
                afterHooked = true;
                return Promise.resolve();
              }
            }
          }
        );

        await User.sync({ force: true });

        const user = await User.create({ username: 'bob' });
        await user.destroy();

        expect(beforeHooked).to.be.true;
        expect(afterHooked).to.be.true;
      });
    });

    describe('beforeUpdate / afterUpdate', () => {
      it('should pass a DAO instance to the hook', async () => {
        let beforeHooked = false;
        let afterHooked = false;
        const User = current.define(
          'User',
          {
            username: DataTypes.STRING
          },
          {
            hooks: {
              beforeUpdate(user) {
                expect(user).to.be.instanceof(User);
                beforeHooked = true;
                return Promise.resolve();
              },
              afterUpdate(user) {
                expect(user).to.be.instanceof(User);
                afterHooked = true;
                return Promise.resolve();
              }
            }
          }
        );

        await User.sync({ force: true });

        const user = await User.create({ username: 'bob' });
        user.username = 'bawb';
        await user.save({ fields: ['username'] });

        expect(beforeHooked).to.be.true;
        expect(afterHooked).to.be.true;
      });
    });
  });

  describe('Model#sync', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        SharedUser.beforeSync(beforeHook);
        SharedUser.afterSync(afterHook);

        await SharedUser.sync();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });

      it('should not run hooks when "hooks = false" option passed', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        SharedUser.beforeSync(beforeHook);
        SharedUser.afterSync(afterHook);

        await SharedUser.sync({ hooks: false });

        expect(beforeHook.called, 'beforeHook should not have been called').to.be.false;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        SharedUser.beforeSync(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        SharedUser.afterSync(afterHook);

        await expect(SharedUser.sync()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        SharedUser.beforeSync(beforeHook);
        SharedUser.afterSync(() => {
          afterHook();
          throw new Error('Whoops!');
        });

        await expect(SharedUser.sync()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });
    });
  });

  describe('sequelize#sync', () => {
    describe('on success', () => {
      it('should run hooks', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          modelBeforeHook = sinon.spy(),
          modelAfterHook = sinon.spy();

        current.beforeBulkSync(beforeHook);
        SharedUser.beforeSync(modelBeforeHook);
        SharedUser.afterSync(modelAfterHook);
        current.afterBulkSync(afterHook);

        await current.sync();

        expect(beforeHook.calledOnce).to.be.true;
        expect(modelBeforeHook.calledOnce).to.be.true;
        expect(modelAfterHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });

      it('should not run hooks if "hooks = false" option passed', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy(),
          modelBeforeHook = sinon.spy(),
          modelAfterHook = sinon.spy();

        current.beforeBulkSync(beforeHook);
        SharedUser.beforeSync(modelBeforeHook);
        SharedUser.afterSync(modelAfterHook);
        current.afterBulkSync(afterHook);

        await current.sync({ hooks: false });

        expect(beforeHook.called, 'beforeHook should not have been called').to.be.false;
        expect(modelBeforeHook.called, 'modelBeforeHook should not have been called').to.be.false;
        expect(modelAfterHook.called, 'modelAfterHook should not have been called').to.be.false;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });

      afterEach(() => {
        current.options.hooks = {};
      });
    });

    describe('on error', () => {
      it('should return an error from before', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();
        current.beforeBulkSync(() => {
          beforeHook();
          throw new Error('Whoops!');
        });
        current.afterBulkSync(afterHook);

        await expect(current.sync()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.called, 'afterHook should not have been called').to.be.false;
      });

      it('should return an error from after', async () => {
        const beforeHook = sinon.spy(),
          afterHook = sinon.spy();

        current.beforeBulkSync(beforeHook);
        current.afterBulkSync(() => {
          afterHook();
          throw new Error('Whoops!');
        });

        await expect(current.sync()).rejects.toThrow();

        expect(beforeHook.calledOnce).to.be.true;
        expect(afterHook.calledOnce).to.be.true;
      });

      afterEach(() => {
        current.options.hooks = {};
      });
    });
  });

  describe('#removal', () => {
    it('should be able to remove by name', async () => {
      const sasukeHook = sinon.spy(),
        narutoHook = sinon.spy();

      SharedUser.addHook('beforeCreate', 'sasuke', sasukeHook);
      SharedUser.addHook('beforeCreate', 'naruto', narutoHook);

      await SharedUser.create({ username: 'makunouchi' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledOnce).to.be.true;
      SharedUser.removeHook('beforeCreate', 'sasuke');

      await SharedUser.create({ username: 'sendo' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledTwice).to.be.true;
    });

    it('should be able to remove by reference', async () => {
      const sasukeHook = sinon.spy(),
        narutoHook = sinon.spy();

      SharedUser.addHook('beforeCreate', sasukeHook);
      SharedUser.addHook('beforeCreate', narutoHook);

      await SharedUser.create({ username: 'makunouchi' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledOnce).to.be.true;
      SharedUser.removeHook('beforeCreate', sasukeHook);

      await SharedUser.create({ username: 'sendo' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledTwice).to.be.true;
    });

    it('should be able to remove proxies', async () => {
      const sasukeHook = sinon.spy(),
        narutoHook = sinon.spy();

      SharedUser.addHook('beforeSave', sasukeHook);
      SharedUser.addHook('beforeSave', narutoHook);

      const user = await SharedUser.create({ username: 'makunouchi' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledOnce).to.be.true;
      SharedUser.removeHook('beforeSave', sasukeHook);

      await user.update({ username: 'sendo' });

      expect(sasukeHook.calledOnce).to.be.true;
      expect(narutoHook.calledTwice).to.be.true;
    });
  });
});
