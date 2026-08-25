import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../../support.js';
import DataTypes from '../../../../lib/data-types.js';
import _ from 'lodash';

const Sequelize = Support.Sequelize;

const current = Support.sequelize;

if (current.dialect.supports['UNION ALL']) {
  describe(Support.getTestDialectTeaser('Model'), () => {
    describe('findAll', () => {
      describe('groupedLimit', () => {
        let clock, User, Project, Task, ProjectUserParanoid, projects;

        beforeAll(() => {
          clock = sinon.useFakeTimers({ toFake: ['Date'] });
        });

        afterEach(() => {
          clock.reset();
        });

        afterAll(() => {
          clock.restore();
        });

        beforeEach(async () => {
          User = current.define('user', {
            age: Sequelize.INTEGER
          });
          Project = current.define('project', {
            title: DataTypes.STRING
          });
          Task = current.define('task');

          ProjectUserParanoid = current.define(
            'project_user_paranoid',
            {},
            {
              timestamps: true,
              paranoid: true,
              createdAt: false,
              updatedAt: false
            }
          );

          User.Projects = User.belongsToMany(Project, { through: 'project_user' });
          Project.belongsToMany(User, { as: 'members', through: 'project_user' });

          User.ParanoidProjects = User.belongsToMany(Project, { through: ProjectUserParanoid });
          Project.belongsToMany(User, { as: 'paranoidMembers', through: ProjectUserParanoid });

          User.Tasks = User.hasMany(Task);

          await current.sync({ force: true });

          await Promise.all([
            User.bulkCreate([{ age: -5 }, { age: 45 }, { age: 7 }, { age: -9 }, { age: 8 }, { age: 15 }, { age: -9 }]),
            Project.bulkCreate([{}, {}]),
            Task.bulkCreate([{}, {}])
          ]);

          const [users, allProjects, tasks] = await Promise.all([User.findAll(), Project.findAll(), Task.findAll()]);

          await Promise.all([
            allProjects[0].setMembers(users.slice(0, 4)),
            allProjects[1].setMembers(users.slice(2)),
            allProjects[0].setParanoidMembers(users.slice(0, 4)),
            allProjects[1].setParanoidMembers(users.slice(2)),
            users[2].setTasks(tasks)
          ]);

          projects = allProjects;
        });

        describe('on: belongsToMany', () => {
          it('maps attributes from a grouped limit to models', async () => {
            const users = await User.findAll({
              groupedLimit: {
                limit: 3,
                on: User.Projects,
                values: projects.map((item) => item.get('id'))
              }
            });

            expect(users).to.have.length(5);
            users
              .filter((u) => u.get('id') !== 3)
              .forEach((u) => {
                expect(u.get('projects')).to.have.length(1);
              });
            users
              .filter((u) => u.get('id') === 3)
              .forEach((u) => {
                expect(u.get('projects')).to.have.length(2);
              });
          });

          it('maps attributes from a grouped limit to models with include', async () => {
            const users = await User.findAll({
              groupedLimit: {
                limit: 3,
                on: User.Projects,
                values: projects.map((item) => item.get('id'))
              },
              order: ['id'],
              include: [User.Tasks]
            });

            /*
             project1 - 1, 2, 3
             project2 - 3, 4, 5
             */
            expect(users).to.have.length(5);
            expect(users.map((u) => u.get('id'))).to.deep.equal([1, 2, 3, 4, 5]);

            expect(users[2].get('tasks')).to.have.length(2);
            users
              .filter((u) => u.get('id') !== 3)
              .forEach((u) => {
                expect(u.get('projects')).to.have.length(1);
              });
            users
              .filter((u) => u.get('id') === 3)
              .forEach((u) => {
                expect(u.get('projects')).to.have.length(2);
              });
          });

          it('works with computed order', async () => {
            const users = await User.findAll({
              attributes: ['id'],
              groupedLimit: {
                limit: 3,
                on: User.Projects,
                values: projects.map((item) => item.get('id'))
              },
              order: [Sequelize.fn('ABS', Sequelize.col('age'))],
              include: [User.Tasks]
            });

            /*
             project1 - 1, 3, 4
             project2 - 3, 5, 4
           */
            expect(users).to.have.length(4);
            expect(users.map((u) => u.get('id'))).to.deep.equal([1, 3, 5, 4]);
          });

          it('works with multiple orders', async () => {
            const users = await User.findAll({
              attributes: ['id'],
              groupedLimit: {
                limit: 3,
                on: User.Projects,
                values: projects.map((item) => item.get('id'))
              },
              order: [Sequelize.fn('ABS', Sequelize.col('age')), ['id', 'DESC']],
              include: [User.Tasks]
            });

            /*
              project1 - 1, 3, 4
              project2 - 3, 5, 7
             */
            expect(users).to.have.length(5);
            expect(users.map((u) => u.get('id'))).to.deep.equal([1, 3, 5, 7, 4]);
          });

          it('works with paranoid junction models', async () => {
            const users = await User.findAll({
              attributes: ['id'],
              groupedLimit: {
                limit: 3,
                on: User.ParanoidProjects,
                values: projects.map((item) => item.get('id'))
              },
              order: [Sequelize.fn('ABS', Sequelize.col('age')), ['id', 'DESC']],
              include: [User.Tasks]
            });

            /*
            project1 - 1, 3, 4
            project2 - 3, 5, 7
           */
            expect(users).to.have.length(5);
            expect(users.map((u) => u.get('id'))).to.deep.equal([1, 3, 5, 7, 4]);

            await Promise.all([
              projects[0].setParanoidMembers(users.slice(0, 2)),
              projects[1].setParanoidMembers(users.slice(4))
            ]);

            const remaining = await User.findAll({
              attributes: ['id'],
              groupedLimit: {
                limit: 3,
                on: User.ParanoidProjects,
                values: projects.map((item) => item.get('id'))
              },
              order: [Sequelize.fn('ABS', Sequelize.col('age')), ['id', 'DESC']],
              include: [User.Tasks]
            });

            /*
            project1 - 1, 3
            project2 - 4
           */
            expect(remaining).to.have.length(3);
            expect(remaining.map((u) => u.get('id'))).to.deep.equal([1, 3, 4]);
          });
        });

        describe('on: hasMany', () => {
          let hasManyUsers;

          beforeEach(async () => {
            User = current.define('user');
            Task = current.define('task');
            User.Tasks = User.hasMany(Task);

            await current.sync({ force: true });

            await Promise.all([
              User.bulkCreate([{}, {}, {}]),
              Task.bulkCreate([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }])
            ]);

            const [users, tasks] = await Promise.all([User.findAll(), Task.findAll()]);
            hasManyUsers = users;

            await Promise.all([
              users[0].setTasks(tasks[0]),
              users[1].setTasks(tasks.slice(1, 4)),
              users[2].setTasks(tasks.slice(4))
            ]);
          });

          it('Applies limit and order correctly', async () => {
            const tasks = await Task.findAll({
              order: [['id', 'DESC']],
              groupedLimit: {
                limit: 3,
                on: User.Tasks,
                values: hasManyUsers.map((item) => item.get('id'))
              }
            });

            const byUser = _.groupBy(tasks, _.property('userId'));
            expect(Object.keys(byUser)).to.have.length(3);

            expect(byUser[1]).to.have.length(1);
            expect(byUser[2]).to.have.length(3);
            expect(_.invokeMap(byUser[2], 'get', 'id')).to.deep.equal([4, 3, 2]);
            expect(byUser[3]).to.have.length(2);
          });
        });
      });
    });
  });
}
