import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import HasMany from '../../../lib/associations/has-many.js';
import Op from '../../../lib/operators.js';

const stub = sinon.stub;

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('hasMany'), () => {
  describe('optimizations using bulk create, destroy and update', () => {
    const User = current.define('User', { username: DataTypes.STRING }),
      Task = current.define('Task', { title: DataTypes.STRING });

    User.hasMany(Task);

    const user = User.build({
        id: 42
      }),
      task1 = Task.build({
        id: 15
      }),
      task2 = Task.build({
        id: 16
      });

    let findAllStub, updateStub;

    beforeEach(() => {
      findAllStub = stub(Task, 'findAll').returns(Promise.resolve([]));
      updateStub = stub(Task, 'update').returns(Promise.resolve([]));
    });

    afterEach(() => {
      findAllStub.restore();
      updateStub.restore();
    });

    it('uses one update statement for addition', async () => {
      await user.setTasks([task1, task2]);
      expect(findAllStub.calledOnce).to.be.true;
      expect(updateStub.calledOnce).to.be.true;
    });

    it('uses one delete from statement', async () => {
      findAllStub
        .onFirstCall()
        .returns(Promise.resolve([]))
        .onSecondCall()
        .returns(
          Promise.resolve([
            { userId: 42, taskId: 15 },
            { userId: 42, taskId: 16 }
          ])
        );

      await user.setTasks([task1, task2]);

      updateStub.resetHistory();
      await user.setTasks(null);

      expect(findAllStub.calledTwice).to.be.true;
      expect(updateStub.calledOnce).to.be.true;
    });
  });

  describe('mixin', () => {
    const User = current.define('User'),
      Task = current.define('Task');

    it('should mixin association methods', () => {
      const as = Math.random().toString(),
        association = new HasMany(User, Task, { as }),
        obj = {};

      association.mixin(obj);

      expect(obj[association.accessors.get]).to.be.an('function');
      expect(obj[association.accessors.set]).to.be.an('function');
      expect(obj[association.accessors.addMultiple]).to.be.an('function');
      expect(obj[association.accessors.add]).to.be.an('function');
      expect(obj[association.accessors.remove]).to.be.an('function');
      expect(obj[association.accessors.removeMultiple]).to.be.an('function');
      expect(obj[association.accessors.hasSingle]).to.be.an('function');
      expect(obj[association.accessors.hasAll]).to.be.an('function');
      expect(obj[association.accessors.count]).to.be.an('function');
    });

    it('should not override custom methods', () => {
      const methods = {
        getTasks: 'get',
        countTasks: 'count',
        hasTask: 'has',
        hasTasks: 'has',
        setTasks: 'set',
        addTask: 'add',
        addTasks: 'add',
        removeTask: 'remove',
        removeTasks: 'remove',
        createTask: 'create'
      };

      for (const [method, alias] of Object.entries(methods)) {
        User.prototype[method] = function () {
          const realMethod = this.constructor.associations.task[alias];
          expect(realMethod).to.be.a('function');
          return realMethod;
        };
      }

      User.hasMany(Task, { as: 'task' });

      const user = User.build();

      for (const method of Object.keys(methods)) {
        expect(user[method]()).to.be.a('function');
      }
    });
  });

  describe('get', () => {
    const User = current.define('User', {}),
      Task = current.define('Task', {}),
      idA = Math.random().toString(),
      idB = Math.random().toString(),
      idC = Math.random().toString(),
      foreignKey = 'user_id';

    it('should fetch associations for a single instance', async () => {
      const findAll = stub(Task, 'findAll').returns(Promise.resolve([Task.build({}), Task.build({})])),
        where = {};

      User.Tasks = User.hasMany(Task, { foreignKey });
      const actual = User.Tasks.get(User.build({ id: idA }));

      where[foreignKey] = idA;

      expect(findAll.calledOnce).to.be.true;
      expect(findAll.firstCall.args[0].where).to.deep.equal(where);

      try {
        const results = await actual;
        expect(results).to.be.an('array');
        expect(results.length).to.equal(2);
      } finally {
        findAll.restore();
      }
    });

    it('should fetch associations for multiple source instances', async () => {
      const findAll = stub(Task, 'findAll').returns(
        Promise.resolve([
          Task.build({
            user_id: idA
          }),
          Task.build({
            user_id: idA
          }),
          Task.build({
            user_id: idA
          }),
          Task.build({
            user_id: idB
          })
        ])
      );

      User.Tasks = User.hasMany(Task, { foreignKey });
      const actual = User.Tasks.get([User.build({ id: idA }), User.build({ id: idB }), User.build({ id: idC })]);

      expect(findAll.calledOnce).to.be.true;
      expect(findAll.firstCall.args[0].where).to.have.property(foreignKey);
      expect(findAll.firstCall.args[0].where[foreignKey]).to.have.property(Op.in);
      expect(findAll.firstCall.args[0].where[foreignKey][Op.in]).to.deep.equal([idA, idB, idC]);

      try {
        const result = await actual;
        expect(result).to.be.an('object');
        expect(Object.keys(result)).to.deep.equal([idA, idB, idC]);

        expect(result[idA].length).to.equal(3);
        expect(result[idB].length).to.equal(1);
        expect(result[idC].length).to.equal(0);
      } finally {
        findAll.restore();
      }
    });
  });
});
