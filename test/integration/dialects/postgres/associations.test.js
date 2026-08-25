import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import config from '../../../config/config.js';
import DataTypes from '../../../../lib/data-types.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe('[POSTGRES Specific] associations', () => {
  describe('many-to-many', () => {
    describe('where tables have the same prefix', () => {
      it('should create a table wp_table1wp_table2s', () => {
        const Table2 = current.define('wp_table2', { foo: DataTypes.STRING }),
          Table1 = current.define('wp_table1', { foo: DataTypes.STRING });

        Table1.belongsToMany(Table2, { through: 'wp_table1swp_table2s' });
        Table2.belongsToMany(Table1, { through: 'wp_table1swp_table2s' });

        expect(current.modelManager.getModel('wp_table1swp_table2s')).to.exist;
      });
    });

    describe('when join table name is specified', () => {
      beforeEach(() => {
        const Table2 = current.define('ms_table1', { foo: DataTypes.STRING }),
          Table1 = current.define('ms_table2', { foo: DataTypes.STRING });

        Table1.belongsToMany(Table2, { through: 'table1_to_table2' });
        Table2.belongsToMany(Table1, { through: 'table1_to_table2' });
      });

      it('should not use a combined name', () => {
        expect(current.modelManager.getModel('ms_table1sms_table2s')).not.to.exist;
      });

      it('should use the specified name', () => {
        expect(current.modelManager.getModel('table1_to_table2')).to.exist;
      });
    });
  });

  describe('HasMany', () => {
    describe('addDAO / getModel', () => {
      let User, Task, user, task;

      beforeEach(async () => {
        // prevent periods from occurring in the table name since they are used to delimit (table.column)
        User = current.define('User' + config.rand(), { name: DataTypes.STRING });
        Task = current.define('Task' + config.rand(), { name: DataTypes.STRING });

        User.belongsToMany(Task, { as: 'Tasks', through: 'usertasks' });
        Task.belongsToMany(User, { as: 'Users', through: 'usertasks' });

        const users = [],
          tasks = [];

        for (let i = 0; i < 5; ++i) {
          users[users.length] = { name: 'User' + Math.random() };
        }

        for (let x = 0; x < 5; ++x) {
          tasks[tasks.length] = { name: 'Task' + Math.random() };
        }

        await current.sync({ force: true });
        await User.bulkCreate(users);
        await Task.bulkCreate(tasks);

        const _users = await User.findAll();
        const _tasks = await Task.findAll();

        user = _users[0];
        task = _tasks[0];
      });

      it('should correctly add an association to the dao', async () => {
        const _tasks = await user.getTasks();
        expect(_tasks).to.have.length(0);

        await user.addTask(task);

        const addedTasks = await user.getTasks();
        expect(addedTasks).to.have.length(1);
      });
    });

    describe('removeDAO', () => {
      it('should correctly remove associated objects', async () => {
        const users = [],
          tasks = [];

        // prevent periods from occurring in the table name since they are used to delimit (table.column)
        const User = current.define('User' + config.rand(), { name: DataTypes.STRING });
        const Task = current.define('Task' + config.rand(), { name: DataTypes.STRING });

        User.belongsToMany(Task, { as: 'Tasks', through: 'usertasks' });
        Task.belongsToMany(User, { as: 'Users', through: 'usertasks' });

        for (let i = 0; i < 5; ++i) {
          users[users.length] = { id: i + 1, name: 'User' + Math.random() };
        }

        for (let x = 0; x < 5; ++x) {
          tasks[tasks.length] = { id: x + 1, name: 'Task' + Math.random() };
        }

        await current.sync({ force: true });
        await User.bulkCreate(users);
        await Task.bulkCreate(tasks);

        const _users = await User.findAll();
        const _tasks = await Task.findAll();

        const user = _users[0];
        const allTasks = _tasks;

        expect(await user.getTasks()).to.have.length(0);

        await user.setTasks(allTasks);
        expect(await user.getTasks()).to.have.length(allTasks.length);

        await user.removeTask(allTasks[0]);
        expect(await user.getTasks()).to.have.length(allTasks.length - 1);

        await user.removeTasks([allTasks[1], allTasks[2]]);
        expect(await user.getTasks()).to.have.length(allTasks.length - 3);
      });
    });
  });
});
