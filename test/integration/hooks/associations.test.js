import * as chai from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const expect = chai.expect;

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

  describe('associations', () => {
    describe('1:1', () => {
      describe('cascade onUpdate', () => {
        beforeEach(async function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasOne(this.Tasks, { onUpdate: 'cascade', hooks: true });
          this.Tasks.belongsTo(this.Projects);

          await this.Projects.sync({ force: true });
          await this.Tasks.sync({ force: true });
        });

        it('on success', async function () {
          let beforeHook = false,
            afterHook = false;

          this.Tasks.beforeUpdate(() => {
            beforeHook = true;
            return Promise.resolve();
          });

          this.Tasks.afterUpdate(() => {
            afterHook = true;
            return Promise.resolve();
          });

          const project = await this.Projects.create({ title: 'New Project' });
          const task = await this.Tasks.create({ title: 'New Task' });

          await project.setTask(task);
          await project.updateAttributes({ id: 2 });

          expect(beforeHook).to.be.true;
          expect(afterHook).to.be.true;
        });

        it('on error', async function () {
          this.Tasks.afterUpdate(() => {
            return Promise.reject(new Error('Whoops!'));
          });

          const project = await this.Projects.create({ title: 'New Project' });
          const task = await this.Tasks.create({ title: 'New Task' });

          const err = await expect(project.setTask(task)).to.be.rejected;
          expect(err).to.be.instanceOf(Error);
        });
      });

      describe('cascade onDelete', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasOne(this.Tasks, { onDelete: 'CASCADE', hooks: true });
          this.Tasks.belongsTo(this.Projects);

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeDestroy(beforeTask);
            this.Tasks.afterDestroy(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.setTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.calledOnce).to.be.true;
            expect(afterTask.calledOnce).to.be.true;
          });

          it('with errors', async function () {
            const CustomErrorText = 'Whoops!';
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error(CustomErrorText));
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.setTask(task);
            await expect(project.destroy()).to.eventually.be.rejectedWith(CustomErrorText);

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.true;
            expect(afterTask).to.be.false;
          });
        });
      });

      describe('no cascade update', () => {
        beforeEach(async function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasOne(this.Tasks);
          this.Tasks.belongsTo(this.Projects);

          await this.Projects.sync({ force: true });
          await this.Tasks.sync({ force: true });
        });

        it('on success', async function () {
          const beforeHook = sinon.spy(),
            afterHook = sinon.spy();

          this.Tasks.beforeUpdate(beforeHook);
          this.Tasks.afterUpdate(afterHook);

          const project = await this.Projects.create({ title: 'New Project' });
          const task = await this.Tasks.create({ title: 'New Task' });

          await project.setTask(task);
          await project.updateAttributes({ id: 2 });

          expect(beforeHook.calledOnce).to.be.true;
          expect(afterHook.calledOnce).to.be.true;
        });

        it('on error', async function () {
          this.Tasks.afterUpdate(() => {
            throw new Error('Whoops!');
          });

          const project = await this.Projects.create({ title: 'New Project' });
          const task = await this.Tasks.create({ title: 'New Task' });

          await expect(project.setTask(task)).to.be.rejected;
        });
      });

      describe('no cascade delete', () => {
        beforeEach(async function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasMany(this.Tasks);
          this.Tasks.belongsTo(this.Projects);

          await this.Projects.sync({ force: true });
          await this.Tasks.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeUpdate(beforeTask);
            this.Tasks.afterUpdate(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.called, 'beforeProject should have been called').to.be.true;
            expect(afterProject.called, 'afterProject should have been called').to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeUpdate(() => {
              beforeTask();
              throw new Error('Whoops!');
            });
            this.Tasks.afterUpdate(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            // `add` sets the foreign key with a bulk update and does not pass
            // individualHooks, so the throwing beforeUpdate hook never runs and
            // the association succeeds.
            await project.addTask(task);

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });
        });
      });
    });

    describe('1:M', () => {
      describe('cascade', () => {
        beforeEach(async function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasMany(this.Tasks, { onDelete: 'cascade', hooks: true });
          this.Tasks.belongsTo(this.Projects, { hooks: true });

          await this.Projects.sync({ force: true });
          await this.Tasks.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeDestroy(beforeTask);
            this.Tasks.afterDestroy(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.calledOnce).to.be.true;
            expect(afterTask.calledOnce).to.be.true;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);

            const err = await expect(project.destroy()).to.be.rejected;

            expect(err).to.be.instanceOf(Error);
            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.true;
            expect(afterTask).to.be.false;
          });
        });
      });

      describe('no cascade', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.hasMany(this.Tasks);
          this.Tasks.belongsTo(this.Projects);

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeUpdate(beforeTask);
            this.Tasks.afterUpdate(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.called, 'beforeProject should have been called').to.be.true;
            expect(afterProject.called, 'afterProject should have been called').to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeUpdate(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            this.Tasks.afterUpdate(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            // `add` sets the foreign key with a bulk update and does not pass
            // individualHooks, so the rejecting beforeUpdate hook never runs and
            // the association succeeds.
            await project.addTask(task);

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.false;
            expect(afterTask).to.be.false;
          });
        });
      });
    });

    describe('M:M', () => {
      describe('cascade', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.belongsToMany(this.Tasks, { cascade: 'onDelete', through: 'projects_and_tasks', hooks: true });
          this.Tasks.belongsToMany(this.Projects, { cascade: 'onDelete', through: 'projects_and_tasks', hooks: true });

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeDestroy(beforeTask);
            this.Tasks.afterDestroy(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            // Since Sequelize does not cascade M:M, these should be false
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.destroy();

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.false;
            expect(afterTask).to.be.false;
          });
        });
      });

      describe('no cascade', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.Projects.belongsToMany(this.Tasks, { hooks: true, through: 'project_tasks' });
          this.Tasks.belongsToMany(this.Projects, { hooks: true, through: 'project_tasks' });

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            this.Projects.beforeCreate(beforeProject);
            this.Projects.afterCreate(afterProject);
            this.Tasks.beforeUpdate(beforeTask);
            this.Tasks.afterUpdate(afterTask);

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeUpdate(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            this.Tasks.afterUpdate(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await this.Projects.create({ title: 'New Project' });
            const task = await this.Tasks.create({ title: 'New Task' });

            await project.addTask(task);

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.false;
            expect(afterTask).to.be.false;
          });
        });
      });
    });

    // NOTE: Reenable when FK constraints create table query is fixed when using hooks

    describe('multiple 1:M', () => {
      describe('cascade', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.MiniTasks = this.sequelize.define('MiniTask', {
            mini_title: DataTypes.STRING
          });

          this.Projects.hasMany(this.Tasks, { onDelete: 'cascade', hooks: true });
          this.Projects.hasMany(this.MiniTasks, { onDelete: 'cascade', hooks: true });

          this.Tasks.belongsTo(this.Projects, { hooks: true });
          this.Tasks.hasMany(this.MiniTasks, { onDelete: 'cascade', hooks: true });

          this.MiniTasks.belongsTo(this.Projects, { hooks: true });
          this.MiniTasks.belongsTo(this.Tasks, { hooks: true });

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            this.MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.resolve();
            });

            this.MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, minitask] = await Promise.all([
              this.Projects.create({ title: 'New Project' }),
              this.MiniTasks.create({ mini_title: 'New MiniTask' })
            ]);

            await project.addMiniTask(minitask);
            await project.destroy();

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.false;
            expect(afterTask).to.be.false;
            expect(beforeMiniTask).to.be.true;
            expect(afterMiniTask).to.be.true;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            this.MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            this.MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, minitask] = await Promise.all([
              this.Projects.create({ title: 'New Project' }),
              this.MiniTasks.create({ mini_title: 'New MiniTask' })
            ]);

            await project.addMiniTask(minitask);
            await expect(project.destroy()).to.be.rejectedWith('Whoops!');

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.false;
            expect(afterTask).to.be.false;
            expect(beforeMiniTask).to.be.true;
            expect(afterMiniTask).to.be.false;
          });
        });
      });
    });

    describe('multiple 1:M sequential hooks', () => {
      describe('cascade', () => {
        beforeEach(function () {
          this.Projects = this.sequelize.define('Project', {
            title: DataTypes.STRING
          });

          this.Tasks = this.sequelize.define('Task', {
            title: DataTypes.STRING
          });

          this.MiniTasks = this.sequelize.define('MiniTask', {
            mini_title: DataTypes.STRING
          });

          this.Projects.hasMany(this.Tasks, { onDelete: 'cascade', hooks: true });
          this.Projects.hasMany(this.MiniTasks, { onDelete: 'cascade', hooks: true });

          this.Tasks.belongsTo(this.Projects, { hooks: true });
          this.Tasks.hasMany(this.MiniTasks, { onDelete: 'cascade', hooks: true });

          this.MiniTasks.belongsTo(this.Projects, { hooks: true });
          this.MiniTasks.belongsTo(this.Tasks, { hooks: true });

          return this.sequelize.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            this.Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            this.MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.resolve();
            });

            this.MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, task, minitask] = await Promise.all([
              this.Projects.create({ title: 'New Project' }),
              this.Tasks.create({ title: 'New Task' }),
              this.MiniTasks.create({ mini_title: 'New MiniTask' })
            ]);

            await Promise.all([task.addMiniTask(minitask), project.addTask(task)]);
            await project.destroy();

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.true;
            expect(afterTask).to.be.true;
            expect(beforeMiniTask).to.be.true;
            expect(afterMiniTask).to.be.true;
          });

          it('with errors', async function () {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;
            const CustomErrorText = 'Whoops!';

            this.Projects.beforeCreate(() => {
              beforeProject = true;
            });

            this.Projects.afterCreate(() => {
              afterProject = true;
            });

            this.Tasks.beforeDestroy(() => {
              beforeTask = true;
              throw new Error(CustomErrorText);
            });

            this.Tasks.afterDestroy(() => {
              afterTask = true;
            });

            this.MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
            });

            this.MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
            });

            const [project, task, minitask] = await Promise.all([
              this.Projects.create({ title: 'New Project' }),
              this.Tasks.create({ title: 'New Task' }),
              this.MiniTasks.create({ mini_title: 'New MiniTask' })
            ]);

            await Promise.all([task.addMiniTask(minitask), project.addTask(task)]);
            await expect(project.destroy()).to.eventually.be.rejectedWith(CustomErrorText);

            expect(beforeProject).to.be.true;
            expect(afterProject).to.be.true;
            expect(beforeTask).to.be.true;
            expect(afterTask).to.be.false;
            expect(beforeMiniTask).to.be.false;
            expect(afterMiniTask).to.be.false;
          });
        });
      });
    });
  });
});
