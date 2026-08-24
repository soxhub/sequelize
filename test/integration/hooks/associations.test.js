import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let Projects, Tasks, MiniTasks;

  beforeEach(() => {
    // Registered only so sync() creates their tables; the association hooks run against
    // the models each describe defines below.
    current.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });

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

  describe('associations', () => {
    describe('1:1', () => {
      describe('cascade onUpdate', () => {
        beforeEach(async () => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasOne(Tasks, { onUpdate: 'cascade', hooks: true });
          Tasks.belongsTo(Projects);

          await Projects.sync({ force: true });
          await Tasks.sync({ force: true });
        });

        it('on success', async () => {
          let beforeHook = false,
            afterHook = false;

          Tasks.beforeUpdate(() => {
            beforeHook = true;
            return Promise.resolve();
          });

          Tasks.afterUpdate(() => {
            afterHook = true;
            return Promise.resolve();
          });

          const project = await Projects.create({ title: 'New Project' });
          const task = await Tasks.create({ title: 'New Task' });

          await project.setTask(task);
          await project.update({ id: 2 });

          expect(beforeHook).to.be.true;
          expect(afterHook).to.be.true;
        });

        it('on error', async () => {
          Tasks.afterUpdate(() => {
            return Promise.reject(new Error('Whoops!'));
          });

          const project = await Projects.create({ title: 'New Project' });
          const task = await Tasks.create({ title: 'New Task' });

          const err = await expect(project.setTask(task)).to.be.rejected;
          expect(err).to.be.instanceOf(Error);
        });
      });

      describe('cascade onDelete', () => {
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasOne(Tasks, { onDelete: 'CASCADE', hooks: true });
          Tasks.belongsTo(Projects);

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeDestroy(beforeTask);
            Tasks.afterDestroy(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.setTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.calledOnce).to.be.true;
            expect(afterTask.calledOnce).to.be.true;
          });

          it('with errors', async () => {
            const CustomErrorText = 'Whoops!';
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error(CustomErrorText));
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(async () => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasOne(Tasks);
          Tasks.belongsTo(Projects);

          await Projects.sync({ force: true });
          await Tasks.sync({ force: true });
        });

        it('on success', async () => {
          const beforeHook = sinon.spy(),
            afterHook = sinon.spy();

          Tasks.beforeUpdate(beforeHook);
          Tasks.afterUpdate(afterHook);

          const project = await Projects.create({ title: 'New Project' });
          const task = await Tasks.create({ title: 'New Task' });

          await project.setTask(task);
          await project.update({ id: 2 });

          expect(beforeHook.calledOnce).to.be.true;
          expect(afterHook.calledOnce).to.be.true;
        });

        it('on error', async () => {
          Tasks.afterUpdate(() => {
            throw new Error('Whoops!');
          });

          const project = await Projects.create({ title: 'New Project' });
          const task = await Tasks.create({ title: 'New Task' });

          await expect(project.setTask(task)).to.be.rejected;
        });
      });

      describe('no cascade delete', () => {
        beforeEach(async () => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasMany(Tasks);
          Tasks.belongsTo(Projects);

          await Projects.sync({ force: true });
          await Tasks.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeUpdate(beforeTask);
            Tasks.afterUpdate(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.called, 'beforeProject should have been called').to.be.true;
            expect(afterProject.called, 'afterProject should have been called').to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeUpdate(() => {
              beforeTask();
              throw new Error('Whoops!');
            });
            Tasks.afterUpdate(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(async () => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasMany(Tasks, { onDelete: 'cascade', hooks: true });
          Tasks.belongsTo(Projects, { hooks: true });

          await Projects.sync({ force: true });
          await Tasks.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeDestroy(beforeTask);
            Tasks.afterDestroy(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.calledOnce).to.be.true;
            expect(afterTask.calledOnce).to.be.true;
          });

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.hasMany(Tasks);
          Tasks.belongsTo(Projects);

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeUpdate(beforeTask);
            Tasks.afterUpdate(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.called, 'beforeProject should have been called').to.be.true;
            expect(afterProject.called, 'afterProject should have been called').to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeUpdate(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            Tasks.afterUpdate(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.belongsToMany(Tasks, { cascade: 'onDelete', through: 'projects_and_tasks', hooks: true });
          Tasks.belongsToMany(Projects, { cascade: 'onDelete', through: 'projects_and_tasks', hooks: true });

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeDestroy(beforeTask);
            Tasks.afterDestroy(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.destroy();

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            // Since Sequelize does not cascade M:M, these should be false
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          Projects.belongsToMany(Tasks, { hooks: true, through: 'project_tasks' });
          Tasks.belongsToMany(Projects, { hooks: true, through: 'project_tasks' });

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            const beforeProject = sinon.spy(),
              afterProject = sinon.spy(),
              beforeTask = sinon.spy(),
              afterTask = sinon.spy();

            Projects.beforeCreate(beforeProject);
            Projects.afterCreate(afterProject);
            Tasks.beforeUpdate(beforeTask);
            Tasks.afterUpdate(afterTask);

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

            await project.addTask(task);
            await project.removeTask(task);

            expect(beforeProject.calledOnce).to.be.true;
            expect(afterProject.calledOnce).to.be.true;
            expect(beforeTask.called, 'beforeTask should not have been called').to.be.false;
            expect(afterTask.called, 'afterTask should not have been called').to.be.false;
          });

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeUpdate(() => {
              beforeTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            Tasks.afterUpdate(() => {
              afterTask = true;
              return Promise.resolve();
            });

            const project = await Projects.create({ title: 'New Project' });
            const task = await Tasks.create({ title: 'New Task' });

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
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          MiniTasks = current.define('MiniTask', {
            mini_title: DataTypes.STRING
          });

          Projects.hasMany(Tasks, { onDelete: 'cascade', hooks: true });
          Projects.hasMany(MiniTasks, { onDelete: 'cascade', hooks: true });

          Tasks.belongsTo(Projects, { hooks: true });
          Tasks.hasMany(MiniTasks, { onDelete: 'cascade', hooks: true });

          MiniTasks.belongsTo(Projects, { hooks: true });
          MiniTasks.belongsTo(Tasks, { hooks: true });

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.resolve();
            });

            MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, minitask] = await Promise.all([
              Projects.create({ title: 'New Project' }),
              MiniTasks.create({ mini_title: 'New MiniTask' })
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

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.reject(new Error('Whoops!'));
            });

            MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, minitask] = await Promise.all([
              Projects.create({ title: 'New Project' }),
              MiniTasks.create({ mini_title: 'New MiniTask' })
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
        beforeEach(() => {
          Projects = current.define('Project', {
            title: DataTypes.STRING
          });

          Tasks = current.define('Task', {
            title: DataTypes.STRING
          });

          MiniTasks = current.define('MiniTask', {
            mini_title: DataTypes.STRING
          });

          Projects.hasMany(Tasks, { onDelete: 'cascade', hooks: true });
          Projects.hasMany(MiniTasks, { onDelete: 'cascade', hooks: true });

          Tasks.belongsTo(Projects, { hooks: true });
          Tasks.hasMany(MiniTasks, { onDelete: 'cascade', hooks: true });

          MiniTasks.belongsTo(Projects, { hooks: true });
          MiniTasks.belongsTo(Tasks, { hooks: true });

          return current.sync({ force: true });
        });

        describe('#remove', () => {
          it('with no errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;

            Projects.beforeCreate(() => {
              beforeProject = true;
              return Promise.resolve();
            });

            Projects.afterCreate(() => {
              afterProject = true;
              return Promise.resolve();
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              return Promise.resolve();
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
              return Promise.resolve();
            });

            MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
              return Promise.resolve();
            });

            MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
              return Promise.resolve();
            });

            const [project, task, minitask] = await Promise.all([
              Projects.create({ title: 'New Project' }),
              Tasks.create({ title: 'New Task' }),
              MiniTasks.create({ mini_title: 'New MiniTask' })
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

          it('with errors', async () => {
            let beforeProject = false,
              afterProject = false,
              beforeTask = false,
              afterTask = false,
              beforeMiniTask = false,
              afterMiniTask = false;
            const CustomErrorText = 'Whoops!';

            Projects.beforeCreate(() => {
              beforeProject = true;
            });

            Projects.afterCreate(() => {
              afterProject = true;
            });

            Tasks.beforeDestroy(() => {
              beforeTask = true;
              throw new Error(CustomErrorText);
            });

            Tasks.afterDestroy(() => {
              afterTask = true;
            });

            MiniTasks.beforeDestroy(() => {
              beforeMiniTask = true;
            });

            MiniTasks.afterDestroy(() => {
              afterMiniTask = true;
            });

            const [project, task, minitask] = await Promise.all([
              Projects.create({ title: 'New Project' }),
              Tasks.create({ title: 'New Task' }),
              MiniTasks.create({ mini_title: 'New MiniTask' })
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
