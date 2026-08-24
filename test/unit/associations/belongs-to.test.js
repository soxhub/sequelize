import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('belongsTo'), () => {
  it('should not override custom methods with association mixin', function () {
    const methods = {
      getTask: 'get',
      setTask: 'set',
      createTask: 'create'
    };
    const User = current.define('User');
    const Task = current.define('Task');

    for (const [method, alias] of Object.entries(methods)) {
      User.prototype[method] = function () {
        const realMethod = this.constructor.associations.task[alias];
        expect(realMethod).to.be.a('function');
        return realMethod;
      };
    }

    User.belongsTo(Task, { as: 'task' });

    const user = User.build();

    for (const method of Object.keys(methods)) {
      expect(user[method]()).to.be.a('function');
    }
  });
});
