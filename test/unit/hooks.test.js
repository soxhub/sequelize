import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import sinon from 'sinon';
import Support from './support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let Model;

  beforeEach(() => {
    Model = current.define('m');
  });

  describe('arguments', () => {
    it('hooks can modify passed arguments', async () => {
      Model.addHook('beforeCreate', (options) => {
        options.answer = 41;
      });

      const options = {};
      await Model.runHooks('beforeCreate', options);
      expect(options.answer).to.equal(41);
    });
  });

  describe('proxies', () => {
    beforeEach(() => {
      sinon.stub(current, 'query').returns(
        Promise.resolve([
          {
            _previousDataValues: {},
            dataValues: { id: 1, name: 'abc' }
          }
        ])
      );
    });

    afterEach(() => {
      current.query.restore();
    });

    describe('defined by options.hooks', () => {
      let beforeSaveHook, afterSaveHook, afterCreateHook;

      beforeEach(() => {
        beforeSaveHook = sinon.spy();
        afterSaveHook = sinon.spy();
        afterCreateHook = sinon.spy();

        Model = current.define(
          'm',
          {
            name: Support.Sequelize.STRING
          },
          {
            hooks: {
              beforeSave: beforeSaveHook,
              afterSave: afterSaveHook,
              afterCreate: afterCreateHook
            }
          }
        );
      });

      it('calls beforeSave/afterSave', async () => {
        await Model.create({});
        expect(afterCreateHook.calledOnce).to.be.true;
        expect(beforeSaveHook.calledOnce).to.be.true;
        expect(afterSaveHook.calledOnce).to.be.true;
      });
    });

    describe('defined by addHook method', () => {
      let beforeSaveHook, afterSaveHook;

      beforeEach(() => {
        beforeSaveHook = sinon.spy();
        afterSaveHook = sinon.spy();

        Model = current.define('m', {
          name: Support.Sequelize.STRING
        });

        Model.addHook('beforeSave', beforeSaveHook);
        Model.addHook('afterSave', afterSaveHook);
      });

      it('calls beforeSave/afterSave', async () => {
        await Model.create({});
        expect(beforeSaveHook.calledOnce).to.be.true;
        expect(afterSaveHook.calledOnce).to.be.true;
      });
    });

    describe('defined by hook method', () => {
      let beforeSaveHook, afterSaveHook;

      beforeEach(() => {
        beforeSaveHook = sinon.spy();
        afterSaveHook = sinon.spy();

        Model = current.define('m', {
          name: Support.Sequelize.STRING
        });

        Model.hook('beforeSave', beforeSaveHook);
        Model.hook('afterSave', afterSaveHook);
      });

      it('calls beforeSave/afterSave', async () => {
        await Model.create({});
        expect(beforeSaveHook.calledOnce).to.be.true;
        expect(afterSaveHook.calledOnce).to.be.true;
      });
    });
  });

  describe('multiple hooks', () => {
    let hook1, hook2, hook3;

    beforeEach(() => {
      hook1 = sinon.spy();
      hook2 = sinon.spy();
      hook3 = sinon.spy();
    });

    describe('runs all hooks on success', () => {
      const expectAllRan = () => {
        expect(hook1.calledOnce).to.be.true;
        expect(hook2.calledOnce).to.be.true;
        expect(hook3.calledOnce).to.be.true;
      };

      it('using addHook', async () => {
        Model.addHook('beforeCreate', hook1);
        Model.addHook('beforeCreate', hook2);
        Model.addHook('beforeCreate', hook3);

        await Model.runHooks('beforeCreate');

        expectAllRan();
      });

      it('using function', async () => {
        Model.beforeCreate(hook1);
        Model.beforeCreate(hook2);
        Model.beforeCreate(hook3);

        await Model.runHooks('beforeCreate');

        expectAllRan();
      });

      it('using define', async () => {
        await current
          .define(
            'M',
            {},
            {
              hooks: {
                beforeCreate: [hook1, hook2, hook3]
              }
            }
          )
          .runHooks('beforeCreate');

        expectAllRan();
      });

      it('using a mixture', async () => {
        const MixtureModel = current.define(
          'M',
          {},
          {
            hooks: {
              beforeCreate: hook1
            }
          }
        );
        MixtureModel.beforeCreate(hook2);
        MixtureModel.addHook('beforeCreate', hook3);

        await MixtureModel.runHooks('beforeCreate');

        expectAllRan();
      });
    });

    it('stops execution when a hook throws', async () => {
      Model.beforeCreate(() => {
        hook1();

        throw new Error('No!');
      });
      Model.beforeCreate(hook2);

      await expect(Model.runHooks('beforeCreate')).rejects.toThrow();
      expect(hook1.calledOnce).to.be.true;
      expect(hook2.called, 'hook2 should not have been called').to.be.false;
    });

    it('stops execution when a hook rejects', async () => {
      Model.beforeCreate(() => {
        hook1();

        return Promise.reject(new Error('No!'));
      });
      Model.beforeCreate(hook2);

      await expect(Model.runHooks('beforeCreate')).rejects.toThrow();
      expect(hook1.calledOnce).to.be.true;
      expect(hook2.called, 'hook2 should not have been called').to.be.false;
    });
  });

  describe('global hooks', () => {
    describe('using addHook', () => {
      it('invokes the global hook', async () => {
        const globalHook = sinon.spy();

        current.addHook('beforeUpdate', globalHook);

        await Model.runHooks('beforeUpdate');
        expect(globalHook.calledOnce).to.be.true;
      });

      it('invokes the global hook, when the model also has a hook', async () => {
        const globalHookBefore = sinon.spy(),
          globalHookAfter = sinon.spy(),
          localHook = sinon.spy();

        current.addHook('beforeUpdate', globalHookBefore);

        const LocalHookModel = current.define(
          'm',
          {},
          {
            hooks: {
              beforeUpdate: localHook
            }
          }
        );

        current.addHook('beforeUpdate', globalHookAfter);

        await LocalHookModel.runHooks('beforeUpdate');
        expect(globalHookBefore.calledOnce).to.be.true;
        expect(globalHookAfter.calledOnce).to.be.true;
        expect(localHook.calledOnce).to.be.true;

        expect(localHook.calledBefore(globalHookBefore), 'localHook should have been called before globalHookBefore').to
          .be.true;
        expect(localHook.calledBefore(globalHookAfter), 'localHook should have been called before globalHookAfter').to
          .be.true;
      });
    });

    describe('using define hooks', () => {
      let beforeCreateHook, sequelize;

      beforeEach(() => {
        beforeCreateHook = sinon.spy();
        sequelize = Support.createSequelizeInstance({
          define: {
            hooks: {
              beforeCreate: beforeCreateHook
            }
          }
        });
      });

      it('runs the global hook when no hook is passed', async () => {
        const DefineModel = sequelize.define(
          'M',
          {},
          {
            hooks: {
              beforeUpdate: () => {} // Just to make sure we can define other hooks without overwriting the global one
            }
          }
        );

        await DefineModel.runHooks('beforeCreate');
        expect(beforeCreateHook.calledOnce).to.be.true;
      });

      it('does not run the global hook when the model specifies its own hook', async () => {
        const localHook = sinon.spy(),
          DefineModel = sequelize.define(
            'M',
            {},
            {
              hooks: {
                beforeCreate: localHook
              }
            }
          );

        await DefineModel.runHooks('beforeCreate');
        expect(beforeCreateHook.called, 'beforeCreateHook should not have been called').to.be.false;
        expect(localHook.calledOnce).to.be.true;
      });
    });
  });

  describe('#removeHook', () => {
    it('should remove hook', async () => {
      const hook1 = sinon.spy(),
        hook2 = sinon.spy();

      Model.addHook('beforeCreate', 'myHook', hook1);
      Model.beforeCreate('myHook2', hook2);

      await Model.runHooks('beforeCreate');

      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;

      hook1.resetHistory();
      hook2.resetHistory();

      Model.removeHook('beforeCreate', 'myHook');
      Model.removeHook('beforeCreate', 'myHook2');

      await Model.runHooks('beforeCreate');

      expect(hook1.called, 'hook1 should not have been called').to.be.false;
      expect(hook2.called, 'hook2 should not have been called').to.be.false;
    });

    it('should not remove other hooks', async () => {
      const hook1 = sinon.spy(),
        hook2 = sinon.spy(),
        hook3 = sinon.spy(),
        hook4 = sinon.spy();

      Model.addHook('beforeCreate', hook1);
      Model.addHook('beforeCreate', 'myHook', hook2);
      Model.beforeCreate('myHook2', hook3);
      Model.beforeCreate(hook4);

      await Model.runHooks('beforeCreate');

      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;
      expect(hook3.calledOnce).to.be.true;
      expect(hook4.calledOnce).to.be.true;

      hook1.resetHistory();
      hook2.resetHistory();
      hook3.resetHistory();
      hook4.resetHistory();

      Model.removeHook('beforeCreate', 'myHook');

      await Model.runHooks('beforeCreate');

      expect(hook1.calledOnce).to.be.true;
      expect(hook2.called, 'hook2 should not have been called').to.be.false;
      expect(hook3.calledOnce).to.be.true;
      expect(hook4.calledOnce).to.be.true;
    });
  });

  describe('#addHook', () => {
    it('should add additional hook when previous exists', async () => {
      const hook1 = sinon.spy(),
        hook2 = sinon.spy();

      const HookModel = current.define(
        'Model',
        {},
        {
          hooks: { beforeCreate: hook1 }
        }
      );

      HookModel.addHook('beforeCreate', hook2);

      await HookModel.runHooks('beforeCreate');
      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;
    });
  });

  describe('aliases', () => {
    let beforeDelete, afterDelete;

    beforeEach(() => {
      beforeDelete = sinon.spy();
      afterDelete = sinon.spy();
    });

    const expectAliasesRan = () => {
      expect(beforeDelete.calledOnce).to.be.true;
      expect(afterDelete.calledOnce).to.be.true;
    };

    describe('direct method', () => {
      it('#delete', async () => {
        Model.beforeDelete(beforeDelete);
        Model.afterDelete(afterDelete);

        await Promise.all([Model.runHooks('beforeDestroy'), Model.runHooks('afterDestroy')]);

        expectAliasesRan();
      });
    });

    describe('.hook() method', () => {
      it('#delete', async () => {
        Model.hook('beforeDelete', beforeDelete);
        Model.hook('afterDelete', afterDelete);

        await Promise.all([Model.runHooks('beforeDestroy'), Model.runHooks('afterDestroy')]);

        expectAliasesRan();
      });
    });
  });

  describe('promises', () => {
    it('can return a promise', () => {
      Model.beforeBulkCreate(() => {
        return Promise.resolve();
      });

      return expect(Model.runHooks('beforeBulkCreate')).resolves.toBeUndefined();
    });

    it('can return undefined', () => {
      Model.beforeBulkCreate(() => {
        // This space intentionally left blank
      });

      return expect(Model.runHooks('beforeBulkCreate')).resolves.toBeUndefined();
    });

    it('can return an error by rejecting', () => {
      Model.beforeCreate(() => {
        return Promise.reject(new Error('Forbidden'));
      });

      return expect(Model.runHooks('beforeCreate')).rejects.toThrow('Forbidden');
    });

    it('can return an error by throwing', () => {
      Model.beforeCreate(() => {
        throw new Error('Forbidden');
      });

      return expect(Model.runHooks('beforeCreate')).rejects.toThrow('Forbidden');
    });
  });

  describe('sync hooks', () => {
    let hook1, hook2, hook3, hook4;

    beforeEach(() => {
      hook1 = sinon.spy();
      hook2 = sinon.spy();
      hook3 = sinon.spy();
      hook4 = sinon.spy();
    });

    it('runs all beforInit/afterInit hooks', () => {
      Support.Sequelize.addHook('beforeInit', 'h1', hook1);
      Support.Sequelize.addHook('beforeInit', 'h2', hook2);
      Support.Sequelize.addHook('afterInit', 'h3', hook3);
      Support.Sequelize.addHook('afterInit', 'h4', hook4);

      Support.createSequelizeInstance();

      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;
      expect(hook3.calledOnce).to.be.true;
      expect(hook4.calledOnce).to.be.true;

      // cleanup hooks on Support.Sequelize
      Support.Sequelize.removeHook('beforeInit', 'h1');
      Support.Sequelize.removeHook('beforeInit', 'h2');
      Support.Sequelize.removeHook('afterInit', 'h3');
      Support.Sequelize.removeHook('afterInit', 'h4');

      Support.createSequelizeInstance();

      // check if hooks were removed
      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;
      expect(hook3.calledOnce).to.be.true;
      expect(hook4.calledOnce).to.be.true;
    });

    it('runs all beforDefine/afterDefine hooks', () => {
      const sequelize = Support.createSequelizeInstance();
      sequelize.addHook('beforeDefine', hook1);
      sequelize.addHook('beforeDefine', hook2);
      sequelize.addHook('afterDefine', hook3);
      sequelize.addHook('afterDefine', hook4);
      sequelize.define('Test', {});
      expect(hook1.calledOnce).to.be.true;
      expect(hook2.calledOnce).to.be.true;
      expect(hook3.calledOnce).to.be.true;
      expect(hook4.calledOnce).to.be.true;
    });
  });
});
