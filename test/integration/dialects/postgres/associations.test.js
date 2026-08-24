import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import config from '../../../config/config.js';
import DataTypes from '../../../../lib/data-types.js';

describe('[POSTGRES Specific] associations', () => {
  describe('many-to-many', () => {
    describe('where tables have the same prefix', () => {
      it('should create a table wp_table1wp_table2s', function () {
        const Table2 = this.sequelize.define('wp_table2', { foo: DataTypes.STRING }),
          Table1 = this.sequelize.define('wp_table1', { foo: DataTypes.STRING });

        Table1.belongsToMany(Table2, { through: 'wp_table1swp_table2s' });
        Table2.belongsToMany(Table1, { through: 'wp_table1swp_table2s' });

        expect(this.sequelize.modelManager.getModel('wp_table1swp_table2s')).to.exist;
      });
    });

    describe('when join table name is specified', () => {
      beforeEach(function () {
        const Table2 = this.sequelize.define('ms_table1', { foo: DataTypes.STRING }),
          Table1 = this.sequelize.define('ms_table2', { foo: DataTypes.STRING });

        Table1.belongsToMany(Table2, { through: 'table1_to_table2' });
        Table2.belongsToMany(Table1, { through: 'table1_to_table2' });
      });

      it('should not use a combined name', function () {
        expect(this.sequelize.modelManager.getModel('ms_table1sms_table2s')).not.to.exist;
      });

      it('should use the specified name', function () {
        expect(this.sequelize.modelManager.getModel('table1_to_table2')).to.exist;
      });
    });
  });

  describe('HasMany', () => {
    describe('addDAO / getModel', () => {
      beforeEach(async function () {
        // prevent periods from occurring in the table name since they are used to delimit (table.column)
        this.User = this.sequelize.define('User' + config.rand(), { name: DataTypes.STRING });
        this.Task = this.sequelize.define('Task' + config.rand(), { name: DataTypes.STRING });
        this.users = null;
        this.tasks = null;

        this.User.belongsToMany(this.Task, { as: 'Tasks', through: 'usertasks' });
        this.Task.belongsToMany(this.User, { as: 'Users', through: 'usertasks' });

        const users = [],
          tasks = [];

        for (let i = 0; i < 5; ++i) {
          users[users.length] = { name: 'User' + Math.random() };
        }

        for (let x = 0; x < 5; ++x) {
          tasks[tasks.length] = { name: 'Task' + Math.random() };
        }

        await this.sequelize.sync({ force: true });
        await this.User.bulkCreate(users);
        await this.Task.bulkCreate(tasks);

        const _users = await this.User.findAll();
        const _tasks = await this.Task.findAll();

        this.user = _users[0];
        this.task = _tasks[0];
      });

      it('should correctly add an association to the dao', async function () {
        const _tasks = await this.user.getTasks();
        expect(_tasks).to.have.length(0);

        await this.user.addTask(this.task);

        const addedTasks = await this.user.getTasks();
        expect(addedTasks).to.have.length(1);
      });
    });

    describe('removeDAO', () => {
      it('should correctly remove associated objects', async function () {
        const users = [],
          tasks = [];

        // prevent periods from occurring in the table name since they are used to delimit (table.column)
        this.User = this.sequelize.define('User' + config.rand(), { name: DataTypes.STRING });
        this.Task = this.sequelize.define('Task' + config.rand(), { name: DataTypes.STRING });
        this.users = null;
        this.tasks = null;

        this.User.belongsToMany(this.Task, { as: 'Tasks', through: 'usertasks' });
        this.Task.belongsToMany(this.User, { as: 'Users', through: 'usertasks' });

        for (let i = 0; i < 5; ++i) {
          users[users.length] = { id: i + 1, name: 'User' + Math.random() };
        }

        for (let x = 0; x < 5; ++x) {
          tasks[tasks.length] = { id: x + 1, name: 'Task' + Math.random() };
        }

        await this.sequelize.sync({ force: true });
        await this.User.bulkCreate(users);
        await this.Task.bulkCreate(tasks);

        const _users = await this.User.findAll();
        const _tasks = await this.Task.findAll();

        this.user = _users[0];
        this.task = _tasks[0];
        this.users = _users;
        this.tasks = _tasks;

        expect(await this.user.getTasks()).to.have.length(0);

        await this.user.setTasks(this.tasks);
        expect(await this.user.getTasks()).to.have.length(this.tasks.length);

        await this.user.removeTask(this.tasks[0]);
        expect(await this.user.getTasks()).to.have.length(this.tasks.length - 1);

        await this.user.removeTasks([this.tasks[1], this.tasks[2]]);
        expect(await this.user.getTasks()).to.have.length(this.tasks.length - 3);
      });
    });
  });
});
