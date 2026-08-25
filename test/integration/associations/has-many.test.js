import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';
import moment from 'moment';
import sinon from 'sinon';
import _ from 'lodash';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('HasMany'), () => {
  describe('Model.associations', () => {
    it('should store all assocations when associting to the same table multiple times', () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      Group.hasMany(User);
      Group.hasMany(User, { foreignKey: 'primaryGroupId', as: 'primaryUsers' });
      Group.hasMany(User, { foreignKey: 'secondaryGroupId', as: 'secondaryUsers' });

      expect(Object.keys(Group.associations)).to.deep.equal(['Users', 'primaryUsers', 'secondaryUsers']);
    });
  });

  describe('count', () => {
    it('should not fail due to ambiguous field', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING, active: DataTypes.BOOLEAN });

      User.hasMany(Task);
      const subtasks = Task.hasMany(Task, { as: 'subtasks' });

      await current.sync({ force: true });

      const user = await User.create(
        {
          username: 'John',
          Tasks: [
            {
              title: 'Get rich',
              active: true
            }
          ]
        },
        {
          include: [Task]
        }
      );

      await Promise.all([
        user.get('Tasks')[0].createSubtask({ title: 'Make a startup', active: false }),
        user.get('Tasks')[0].createSubtask({ title: 'Engage rock stars', active: true })
      ]);

      await expect(
        user.countTasks({
          attributes: [Task.primaryKeyField, 'title'],
          include: [
            {
              attributes: [],
              association: subtasks,
              where: {
                active: true
              }
            }
          ],
          group: current.col(Task.name.concat('.', Task.primaryKeyField))
        })
      ).to.eventually.equal(1);
    });
  });

  describe('get', () => {
    if (current.dialect.supports.groupedLimit) {
      describe('multiple', () => {
        it('should fetch associations for multiple instances', async () => {
          const User = current.define('User', {}),
            Task = current.define('Task', {});

          User.Tasks = User.hasMany(Task, { as: 'tasks' });

          await current.sync({ force: true });

          const users = await Promise.all([
            User.create(
              {
                id: 1,
                tasks: [{}, {}, {}]
              },
              {
                include: [User.Tasks]
              }
            ),
            User.create(
              {
                id: 2,
                tasks: [{}]
              },
              {
                include: [User.Tasks]
              }
            ),
            User.create({
              id: 3
            })
          ]);

          const result = await User.Tasks.get(users);

          expect(result[users[0].id].length).to.equal(3);
          expect(result[users[1].id].length).to.equal(1);
          expect(result[users[2].id].length).to.equal(0);
        });

        it('should fetch associations for multiple instances with limit and order', async () => {
          const User = current.define('User', {}),
            Task = current.define('Task', {
              title: DataTypes.STRING
            });

          User.Tasks = User.hasMany(Task, { as: 'tasks' });

          await current.sync({ force: true });

          const users = await Promise.all([
            User.create(
              {
                tasks: [{ title: 'b' }, { title: 'd' }, { title: 'c' }, { title: 'a' }]
              },
              {
                include: [User.Tasks]
              }
            ),
            User.create(
              {
                tasks: [{ title: 'a' }, { title: 'c' }, { title: 'b' }]
              },
              {
                include: [User.Tasks]
              }
            )
          ]);

          const result = await User.Tasks.get(users, {
            limit: 2,
            order: [['title', 'ASC']]
          });

          expect(result[users[0].id].length).to.equal(2);
          expect(result[users[0].id][0].title).to.equal('a');
          expect(result[users[0].id][1].title).to.equal('b');

          expect(result[users[1].id].length).to.equal(2);
          expect(result[users[1].id][0].title).to.equal('a');
          expect(result[users[1].id][1].title).to.equal('b');
        });

        it('should fetch multiple layers of associations with limit and order with separate=true', async () => {
          const User = current.define('User', {}),
            Task = current.define('Task', {
              title: DataTypes.STRING
            }),
            SubTask = current.define('SubTask', {
              title: DataTypes.STRING
            });

          User.Tasks = User.hasMany(Task, { as: 'tasks' });
          Task.SubTasks = Task.hasMany(SubTask, { as: 'subtasks' });

          await current.sync({ force: true });

          await Promise.all([
            User.create(
              {
                id: 1,
                tasks: [
                  { title: 'b', subtasks: [{ title: 'c' }, { title: 'a' }] },
                  { title: 'd' },
                  { title: 'c', subtasks: [{ title: 'b' }, { title: 'a' }, { title: 'c' }] },
                  { title: 'a', subtasks: [{ title: 'c' }, { title: 'a' }, { title: 'b' }] }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.SubTasks] }]
              }
            ),
            User.create(
              {
                id: 2,
                tasks: [
                  { title: 'a', subtasks: [{ title: 'b' }, { title: 'a' }, { title: 'c' }] },
                  { title: 'c', subtasks: [{ title: 'a' }] },
                  { title: 'b', subtasks: [{ title: 'a' }, { title: 'b' }] }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.SubTasks] }]
              }
            )
          ]);

          const users = await User.findAll({
            include: [
              {
                association: User.Tasks,
                limit: 2,
                order: [['title', 'ASC']],
                separate: true,
                as: 'tasks',
                include: [
                  {
                    association: Task.SubTasks,
                    order: [['title', 'DESC']],
                    separate: true,
                    as: 'subtasks'
                  }
                ]
              }
            ],
            order: [['id', 'ASC']]
          });

          expect(users[0].tasks.length).to.equal(2);

          expect(users[0].tasks[0].title).to.equal('a');
          expect(users[0].tasks[0].subtasks.length).to.equal(3);
          expect(users[0].tasks[0].subtasks[0].title).to.equal('c');
          expect(users[0].tasks[0].subtasks[1].title).to.equal('b');
          expect(users[0].tasks[0].subtasks[2].title).to.equal('a');

          expect(users[0].tasks[1].title).to.equal('b');
          expect(users[0].tasks[1].subtasks.length).to.equal(2);
          expect(users[0].tasks[1].subtasks[0].title).to.equal('c');
          expect(users[0].tasks[1].subtasks[1].title).to.equal('a');

          expect(users[1].tasks.length).to.equal(2);
          expect(users[1].tasks[0].title).to.equal('a');
          expect(users[1].tasks[0].subtasks.length).to.equal(3);
          expect(users[1].tasks[0].subtasks[0].title).to.equal('c');
          expect(users[1].tasks[0].subtasks[1].title).to.equal('b');
          expect(users[1].tasks[0].subtasks[2].title).to.equal('a');

          expect(users[1].tasks[1].title).to.equal('b');
          expect(users[1].tasks[1].subtasks.length).to.equal(2);
          expect(users[1].tasks[1].subtasks[0].title).to.equal('b');
          expect(users[1].tasks[1].subtasks[1].title).to.equal('a');
        });

        it('should fetch associations for multiple instances with limit and order and a belongsTo relation', async () => {
          const User = current.define('User', {}),
            Task = current.define('Task', {
              title: DataTypes.STRING,
              categoryId: {
                type: DataTypes.INTEGER,
                field: 'category_id'
              }
            }),
            Category = current.define('Category', {});

          User.Tasks = User.hasMany(Task, { as: 'tasks' });
          Task.Category = Task.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });

          await current.sync({ force: true });

          const users = await Promise.all([
            User.create(
              {
                tasks: [
                  { title: 'b', category: {} },
                  { title: 'd', category: {} },
                  { title: 'c', category: {} },
                  { title: 'a', category: {} }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.Category] }]
              }
            ),
            User.create(
              {
                tasks: [
                  { title: 'a', category: {} },
                  { title: 'c', category: {} },
                  { title: 'b', category: {} }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.Category] }]
              }
            )
          ]);

          const result = await User.Tasks.get(users, {
            limit: 2,
            order: [['title', 'ASC']],
            include: [Task.Category]
          });

          expect(result[users[0].id].length).to.equal(2);
          expect(result[users[0].id][0].title).to.equal('a');
          expect(result[users[0].id][0].category).to.be.ok;
          expect(result[users[0].id][1].title).to.equal('b');
          expect(result[users[0].id][1].category).to.be.ok;

          expect(result[users[1].id].length).to.equal(2);
          expect(result[users[1].id][0].title).to.equal('a');
          expect(result[users[1].id][0].category).to.be.ok;
          expect(result[users[1].id][1].title).to.equal('b');
          expect(result[users[1].id][1].category).to.be.ok;
        });

        it('supports schemas', async () => {
          const User = current.define('User', {}).schema('work'),
            Task = current
              .define('Task', {
                title: DataTypes.STRING
              })
              .schema('work'),
            SubTask = current
              .define('SubTask', {
                title: DataTypes.STRING
              })
              .schema('work');

          User.Tasks = User.hasMany(Task, { as: 'tasks' });
          Task.SubTasks = Task.hasMany(SubTask, { as: 'subtasks' });

          await current.dropAllSchemas();
          await current.createSchema('work');
          await User.sync({ force: true });
          await Task.sync({ force: true });
          await SubTask.sync({ force: true });

          await Promise.all([
            User.create(
              {
                id: 1,
                tasks: [
                  { title: 'b', subtasks: [{ title: 'c' }, { title: 'a' }] },
                  { title: 'd' },
                  { title: 'c', subtasks: [{ title: 'b' }, { title: 'a' }, { title: 'c' }] },
                  { title: 'a', subtasks: [{ title: 'c' }, { title: 'a' }, { title: 'b' }] }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.SubTasks] }]
              }
            ),
            User.create(
              {
                id: 2,
                tasks: [
                  { title: 'a', subtasks: [{ title: 'b' }, { title: 'a' }, { title: 'c' }] },
                  { title: 'c', subtasks: [{ title: 'a' }] },
                  { title: 'b', subtasks: [{ title: 'a' }, { title: 'b' }] }
                ]
              },
              {
                include: [{ association: User.Tasks, include: [Task.SubTasks] }]
              }
            )
          ]);

          const users = await User.findAll({
            include: [
              {
                association: User.Tasks,
                limit: 2,
                order: [['title', 'ASC']],
                separate: true,
                as: 'tasks',
                include: [
                  {
                    association: Task.SubTasks,
                    order: [['title', 'DESC']],
                    separate: true,
                    as: 'subtasks'
                  }
                ]
              }
            ],
            order: [['id', 'ASC']]
          });

          expect(users[0].tasks.length).to.equal(2);

          expect(users[0].tasks[0].title).to.equal('a');
          expect(users[0].tasks[0].subtasks.length).to.equal(3);
          expect(users[0].tasks[0].subtasks[0].title).to.equal('c');
          expect(users[0].tasks[0].subtasks[1].title).to.equal('b');
          expect(users[0].tasks[0].subtasks[2].title).to.equal('a');

          expect(users[0].tasks[1].title).to.equal('b');
          expect(users[0].tasks[1].subtasks.length).to.equal(2);
          expect(users[0].tasks[1].subtasks[0].title).to.equal('c');
          expect(users[0].tasks[1].subtasks[1].title).to.equal('a');

          expect(users[1].tasks.length).to.equal(2);
          expect(users[1].tasks[0].title).to.equal('a');
          expect(users[1].tasks[0].subtasks.length).to.equal(3);
          expect(users[1].tasks[0].subtasks[0].title).to.equal('c');
          expect(users[1].tasks[0].subtasks[1].title).to.equal('b');
          expect(users[1].tasks[0].subtasks[2].title).to.equal('a');

          expect(users[1].tasks[1].title).to.equal('b');
          expect(users[1].tasks[1].subtasks.length).to.equal(2);
          expect(users[1].tasks[1].subtasks[0].title).to.equal('b');
          expect(users[1].tasks[1].subtasks[1].title).to.equal('a');

          await current.dropSchema('work');

          const schemas = await current.showAllSchemas();

          expect(schemas).to.be.empty;
        });
      });
    }
  });

  describe('(1:N)', () => {
    let SharedArticle, SharedLabel;

    describe('hasSingle', () => {
      beforeEach(() => {
        SharedArticle = current.define('Article', { title: DataTypes.STRING });
        SharedLabel = current.define('Label', { text: DataTypes.STRING });

        SharedArticle.hasMany(SharedLabel);

        return current.sync({ force: true });
      });

      it('should only generate one set of foreignKeys', () => {
        SharedArticle = current.define('Article', { title: DataTypes.STRING }, { timestamps: false });
        SharedLabel = current.define('Label', { text: DataTypes.STRING }, { timestamps: false });

        SharedLabel.belongsTo(SharedArticle);
        SharedArticle.hasMany(SharedLabel);

        expect(Object.keys(SharedLabel.rawAttributes)).to.deep.equal(['id', 'text', 'ArticleId']);
        expect(Object.keys(SharedLabel.rawAttributes).length).to.equal(3);
      });

      if (current.dialect.supports.transactions) {
        it('supports transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);
          const Article = sequelize.define('Article', { title: DataTypes.STRING });
          const Label = sequelize.define('Label', { text: DataTypes.STRING });

          Article.hasMany(Label);

          await sequelize.sync({ force: true });

          const [article, label] = await Promise.all([Article.create({ title: 'foo' }), Label.create({ text: 'bar' })]);

          const t = await sequelize.transaction();

          await article.setLabels([label], { transaction: t });

          const articles = await Article.findAll({ transaction: t });
          expect(await articles[0].hasLabel(label)).to.be.false;

          const transactionArticles = await Article.findAll({ transaction: t });
          expect(await transactionArticles[0].hasLabel(label, { transaction: t })).to.be.true;

          await t.rollback();
        });
      }

      it('does not have any labels assigned to it initially', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        const [hasLabel1, hasLabel2] = await Promise.all([article.hasLabel(label1), article.hasLabel(label2)]);

        expect(hasLabel1).to.be.false;
        expect(hasLabel2).to.be.false;
      });

      it('answers true if the label has been assigned', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.addLabel(label1);

        const [hasLabel1, hasLabel2] = await Promise.all([article.hasLabel(label1), article.hasLabel(label2)]);

        expect(hasLabel1).to.be.true;
        expect(hasLabel2).to.be.false;
      });

      it('answers correctly if the label has been assigned when passing a primary key instead of an object', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.addLabel(label1);

        const [hasLabel1, hasLabel2] = await Promise.all([article.hasLabel(label1.id), article.hasLabel(label2.id)]);

        expect(hasLabel1).to.be.true;
        expect(hasLabel2).to.be.false;
      });
    });

    describe('hasAll', () => {
      beforeEach(() => {
        SharedArticle = current.define('Article', {
          title: DataTypes.STRING
        });
        SharedLabel = current.define('Label', {
          text: DataTypes.STRING
        });

        SharedArticle.hasMany(SharedLabel);

        return current.sync({ force: true });
      });

      if (current.dialect.supports.transactions) {
        it('supports transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);

          const Article = sequelize.define('Article', { title: DataTypes.STRING });
          const Label = sequelize.define('Label', { text: DataTypes.STRING });

          Article.hasMany(Label);

          await sequelize.sync({ force: true });

          const [article, label] = await Promise.all([Article.create({ title: 'foo' }), Label.create({ text: 'bar' })]);

          const t = await sequelize.transaction();

          await article.setLabels([label], { transaction: t });

          const articles = await Article.findAll({ transaction: t });

          const [hasLabel1, hasLabel2] = await Promise.all([
            articles[0].hasLabels([label]),
            articles[0].hasLabels([label], { transaction: t })
          ]);

          expect(hasLabel1).to.be.false;
          expect(hasLabel2).to.be.true;

          await t.rollback();
        });
      }

      it('answers false if only some labels have been assigned', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.addLabel(label1);

        expect(await article.hasLabels([label1, label2])).to.be.false;
      });

      it('answers false if only some labels have been assigned when passing a primary key instead of an object', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.addLabel(label1);

        expect(await article.hasLabels([label1.id, label2.id])).to.be.false;
      });

      it('answers true if all label have been assigned', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.setLabels([label1, label2]);

        expect(await article.hasLabels([label1, label2])).to.be.true;
      });

      it('answers true if all label have been assigned when passing a primary key instead of an object', async () => {
        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness' }),
          SharedLabel.create({ text: 'Epicness' })
        ]);

        await article.setLabels([label1, label2]);

        expect(await article.hasLabels([label1.id, label2.id])).to.be.true;
      });
    });

    describe('setAssociations', () => {
      if (current.dialect.supports.transactions) {
        it('supports transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);

          const Article = sequelize.define('Article', { title: DataTypes.STRING });
          const Label = sequelize.define('Label', { text: DataTypes.STRING });

          Article.hasMany(Label);

          await sequelize.sync({ force: true });

          const [article, label, t] = await Promise.all([
            Article.create({ title: 'foo' }),
            Label.create({ text: 'bar' }),
            sequelize.transaction()
          ]);

          await article.setLabels([label], { transaction: t });

          const outsideLabels = await Label.findAll({ where: { ArticleId: article.id }, transaction: undefined });
          expect(outsideLabels.length).to.equal(0);

          const insideLabels = await Label.findAll({ where: { ArticleId: article.id }, transaction: t });
          expect(insideLabels.length).to.equal(1);

          await t.rollback();
        });
      }

      it('clears associations when passing null to the set-method', async () => {
        const User = current.define('User', { username: DataTypes.STRING }),
          Task = current.define('Task', { title: DataTypes.STRING });

        Task.hasMany(User);

        await current.sync({ force: true });

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

        await task.setUsers([user]);

        expect(await task.getUsers()).to.have.length(1);

        await task.setUsers(null);

        expect(await task.getUsers()).to.have.length(0);
      });

      it('supports passing the primary key instead of an object', async () => {
        const Article = current.define('Article', { title: DataTypes.STRING }),
          Label = current.define('Label', { text: DataTypes.STRING });

        Article.hasMany(Label);

        await current.sync({ force: true });

        const [article, label1, label2] = await Promise.all([
          Article.create({}),
          Label.create({ text: 'label one' }),
          Label.create({ text: 'label two' })
        ]);

        await article.addLabel(label1.id);
        await article.setLabels([label2.id]);

        const labels = await article.getLabels();

        expect(labels).to.have.length(1);
        expect(labels[0].text).to.equal('label two');
      });
    });

    describe('addAssociations', () => {
      if (current.dialect.supports.transactions) {
        it('supports transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);

          const Article = sequelize.define('Article', { title: DataTypes.STRING });
          const Label = sequelize.define('Label', { text: DataTypes.STRING });
          Article.hasMany(Label);

          await sequelize.sync({ force: true });

          const [article, label] = await Promise.all([Article.create({ title: 'foo' }), Label.create({ text: 'bar' })]);

          const t = await sequelize.transaction();

          await article.addLabel(label, { transaction: t });

          const outsideLabels = await Label.findAll({ where: { ArticleId: article.id }, transaction: undefined });
          expect(outsideLabels.length).to.equal(0);

          const insideLabels = await Label.findAll({ where: { ArticleId: article.id }, transaction: t });
          expect(insideLabels.length).to.equal(1);

          await t.rollback();
        });
      }

      it('supports passing the primary key instead of an object', async () => {
        const Article = current.define('Article', { title: DataTypes.STRING }),
          Label = current.define('Label', { text: DataTypes.STRING });

        Article.hasMany(Label);

        await current.sync({ force: true });

        const [article, label] = await Promise.all([Article.create({}), Label.create({ text: 'label one' })]);

        await article.addLabel(label.id);

        const labels = await article.getLabels();

        expect(labels[0].text).to.equal('label one'); // Make sure that we didn't modify one of the other attributes while building / saving a new instance
      });
    });

    describe('addMultipleAssociations', () => {
      it('adds associations without removing the current ones', async () => {
        const User = current.define('User', { username: DataTypes.STRING }),
          Task = current.define('Task', { title: DataTypes.STRING });

        Task.hasMany(User);

        await current.sync({ force: true });
        await User.bulkCreate([{ username: 'foo ' }, { username: 'bar ' }, { username: 'baz ' }]);

        const task = await Task.create({ title: 'task' });
        const users = await User.findAll();

        await task.setUsers([users[0]]);
        await task.addUsers([users[1], users[2]]);

        expect(await task.getUsers()).to.have.length(3);
      });

      it('handles decent sized bulk creates', async () => {
        const User = current.define('User', {
            username: DataTypes.STRING,
            num: DataTypes.INTEGER,
            status: DataTypes.STRING
          }),
          Task = current.define('Task', { title: DataTypes.STRING });

        Task.hasMany(User);

        await current.sync({ force: true });
        await User.bulkCreate(_.range(1000).map((i) => ({ username: 'user' + i, num: i, status: 'live' })));
        await Task.create({ title: 'task' });

        const users = await User.findAll();

        expect(users).to.have.length(1000);
      });
    });
    it('clears associations when passing null to the set-method with omitNull set to true', async () => {
      current.options.omitNull = true;

      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      Task.hasMany(User);

      try {
        await current.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await task.setUsers([user]);

        expect(await task.getUsers()).to.have.length(1);

        await task.setUsers(null);

        expect(await task.getUsers()).to.have.length(0);
      } finally {
        current.options.omitNull = false;
      }
    });

    describe('createAssociations', () => {
      it('creates a new associated object', async () => {
        const Article = current.define('Article', { title: DataTypes.STRING }),
          Label = current.define('Label', { text: DataTypes.STRING });

        Article.hasMany(Label);

        await current.sync({ force: true });

        const article = await Article.create({ title: 'foo' });

        await article.createLabel({ text: 'bar' });

        const labels = await Label.findAll({ where: { ArticleId: article.id } });

        expect(labels.length).to.equal(1);
      });

      it('creates the object with the association directly', async () => {
        const spy = sinon.spy();

        const Article = current.define('Article', {
            title: DataTypes.STRING
          }),
          Label = current.define('Label', {
            text: DataTypes.STRING
          });

        Article.hasMany(Label);

        await current.sync({ force: true });

        const article = await Article.create({ title: 'foo' });
        const label = await article.createLabel({ text: 'bar' }, { logging: spy });

        expect(spy.calledOnce).to.be.true;
        expect(label.ArticleId).to.equal(article.id);
      });

      if (current.dialect.supports.transactions) {
        it('supports transactions', async () => {
          const sequelize = await Support.prepareTransactionTest(current);

          const Article = sequelize.define('Article', { title: DataTypes.STRING });
          const Label = sequelize.define('Label', { text: DataTypes.STRING });

          Article.hasMany(Label);

          await sequelize.sync({ force: true });

          const article = await Article.create({ title: 'foo' });
          const t = await sequelize.transaction();

          await article.createLabel({ text: 'bar' }, { transaction: t });

          const allLabels = await Label.findAll();
          expect(allLabels.length).to.equal(0);

          const outsideLabels = await Label.findAll({ where: { ArticleId: article.id } });
          expect(outsideLabels.length).to.equal(0);

          const insideLabels = await Label.findAll({ where: { ArticleId: article.id }, transaction: t });
          expect(insideLabels.length).to.equal(1);

          await t.rollback();
        });
      }

      it('supports passing the field option', async () => {
        const Article = current.define('Article', {
            title: DataTypes.STRING
          }),
          Label = current.define('Label', {
            text: DataTypes.STRING
          });

        Article.hasMany(Label);

        await current.sync({ force: true });

        const article = await Article.create();

        await article.createLabel(
          {
            text: 'yolo'
          },
          {
            fields: ['text']
          }
        );

        const labels = await article.getLabels();

        expect(labels.length).to.be.ok;
      });
    });

    describe('getting assocations with options', () => {
      let User, Task;

      beforeEach(async () => {
        User = current.define('User', { username: DataTypes.STRING });
        Task = current.define('Task', { title: DataTypes.STRING, active: DataTypes.BOOLEAN });

        User.hasMany(Task);

        await current.sync({ force: true });

        const [john, task1, task2] = await Promise.all([
          User.create({ username: 'John' }),
          Task.create({ title: 'Get rich', active: true }),
          Task.create({ title: 'Die trying', active: false })
        ]);

        await john.setTasks([task1, task2]);
      });

      it('should treat the where object of associations as a first class citizen', async () => {
        SharedArticle = current.define('Article', {
          title: DataTypes.STRING
        });
        SharedLabel = current.define('Label', {
          text: DataTypes.STRING,
          until: DataTypes.DATE
        });

        SharedArticle.hasMany(SharedLabel);

        await current.sync({ force: true });

        const [article, label1, label2] = await Promise.all([
          SharedArticle.create({ title: 'Article' }),
          SharedLabel.create({ text: 'Awesomeness', until: '2014-01-01 01:00:00' }),
          SharedLabel.create({ text: 'Epicness', until: '2014-01-03 01:00:00' })
        ]);

        await article.setLabels([label1, label2]);

        const labels = await article.getLabels({ where: { until: { $gt: moment('2014-01-02').toDate() } } });

        expect(labels).to.be.instanceof(Array);
        expect(labels).to.have.length(1);
        expect(labels[0].text).to.equal('Epicness');
      });

      it('gets all associated objects when no options are passed', async () => {
        const john = await User.findOne({ where: { username: 'John' } });

        expect(await john.getTasks()).to.have.length(2);
      });

      it('only get objects that fulfill the options', async () => {
        const john = await User.findOne({ where: { username: 'John' } });

        const tasks = await john.getTasks({ where: { active: true }, limit: 10, order: [['id', 'DESC']] });

        expect(tasks).to.have.length(1);
      });
    });

    describe('countAssociations', () => {
      let User, Task, seededUser;

      beforeEach(async () => {
        User = current.define('User', { username: DataTypes.STRING });
        Task = current.define('Task', { title: DataTypes.STRING, active: DataTypes.BOOLEAN });

        User.hasMany(Task, {
          foreignKey: 'userId'
        });

        await current.sync({ force: true });

        const [john, task1, task2] = await Promise.all([
          User.create({ username: 'John' }),
          Task.create({ title: 'Get rich', active: true }),
          Task.create({ title: 'Die trying', active: false })
        ]);

        seededUser = john;

        await john.setTasks([task1, task2]);
      });

      it('should count all associations', () => {
        return expect(seededUser.countTasks({})).to.eventually.equal(2);
      });

      it('should count filtered associations', () => {
        return expect(
          seededUser.countTasks({
            where: {
              active: true
            }
          })
        ).to.eventually.equal(1);
      });

      it('should count scoped associations', () => {
        User.hasMany(Task, {
          foreignKey: 'userId',
          as: 'activeTasks',
          scope: {
            active: true
          }
        });

        return expect(seededUser.countActiveTasks({})).to.eventually.equal(1);
      });
    });

    describe('selfAssociations', () => {
      it('should work with alias', () => {
        const Person = current.define('Group', {});

        Person.hasMany(Person, { as: 'Children' });

        return current.sync();
      });
    });
  });

  describe('Foreign key constraints', () => {
    describe('1:m', () => {
      it('sets null by default', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        User.hasMany(Task);

        await current.sync({ force: true });

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

        await user.setTasks([task]);
        await user.destroy();
        await task.reload();

        expect(task.UserId).to.equal(null);
      });

      it('sets to CASCADE if allowNull: false', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        User.hasMany(Task, { foreignKey: { allowNull: false } }); // defaults to CASCADE

        await current.sync({ force: true });

        const user = await User.create({ username: 'foo' });

        await Task.create({ title: 'task', UserId: user.id });
        await user.destroy();

        const tasks = await Task.findAll();

        expect(tasks).to.be.empty;
      });

      it('should be possible to remove all constraints', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        User.hasMany(Task, { constraints: false });

        await current.sync({ force: true });

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

        await user.setTasks([task]);
        await user.destroy();
        await task.reload();

        expect(task.UserId).to.equal(user.id);
      });

      it('can cascade deletes', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        User.hasMany(Task, { onDelete: 'cascade' });

        await current.sync({ force: true });

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

        await user.setTasks([task]);
        await user.destroy();

        const tasks = await Task.findAll();

        expect(tasks).to.have.length(0);
      });

      // NOTE: mssql does not support changing an autoincrement primary key

      it('can cascade updates', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        User.hasMany(Task, { onUpdate: 'cascade' });

        await current.sync({ force: true });

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

        await user.setTasks([task]);

        // Changing the id of a DAO requires a little dance since
        // the `UPDATE` query generated by `save()` uses `id` in the
        // `WHERE` clause

        const tableName = user.sequelize.getQueryInterface().QueryGenerator.addSchema(user.constructor);
        await user.sequelize.getQueryInterface().update(user, tableName, { id: 999 }, { id: user.id });

        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
        expect(tasks[0].UserId).to.equal(999);
      });

      if (current.dialect.supports.constraints.restrict) {
        it('can restrict deletes', async () => {
          const Task = current.define('Task', { title: DataTypes.STRING }),
            User = current.define('User', { username: DataTypes.STRING });

          User.hasMany(Task, { onDelete: 'restrict' });

          await current.sync({ force: true });

          const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

          await user.setTasks([task]);

          await expect(user.destroy()).to.be.rejectedWith(current.ForeignKeyConstraintError);

          // Should fail due to FK violation
          const tasks = await Task.findAll();

          expect(tasks).to.have.length(1);
        });

        it('can restrict updates', async () => {
          const Task = current.define('Task', { title: DataTypes.STRING }),
            User = current.define('User', { username: DataTypes.STRING });

          User.hasMany(Task, { onUpdate: 'restrict' });

          await current.sync({ force: true });

          const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

          await user.setTasks([task]);

          // Changing the id of a DAO requires a little dance since
          // the `UPDATE` query generated by `save()` uses `id` in the
          // `WHERE` clause

          const tableName = user.sequelize.getQueryInterface().QueryGenerator.addSchema(user.constructor);
          await expect(
            user.sequelize.getQueryInterface().update(user, tableName, { id: 999 }, { id: user.id })
          ).to.be.rejectedWith(current.ForeignKeyConstraintError);

          // Should fail due to FK violation
          const tasks = await Task.findAll();

          expect(tasks).to.have.length(1);
        });
      }
    });
  });

  describe('Association options', () => {
    it('can specify data type for autogenerated relational keys', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        dataTypes = [Sequelize.INTEGER, Sequelize.BIGINT, Sequelize.STRING],
        Tasks = {};

      // Sequential on purpose: each pass syncs a table named after the previous
      // one's data type, so the syncs must not interleave.
      for (const dataType of dataTypes) {
        const tableName = 'TaskXYZ_' + dataType.key;
        Tasks[dataType] = current.define(tableName, { title: DataTypes.STRING });

        User.hasMany(Tasks[dataType], { foreignKey: 'userId', keyType: dataType, constraints: false });

        await Tasks[dataType].sync({ force: true });

        expect(Tasks[dataType].rawAttributes.userId.type).to.be.an.instanceof(dataType);
      }
    });

    it('infers the keyType if none provided', async () => {
      const User = current.define('User', {
          id: { type: DataTypes.STRING, primaryKey: true },
          username: DataTypes.STRING
        }),
        Task = current.define('Task', {
          title: DataTypes.STRING
        });

      User.hasMany(Task);

      await current.sync({ force: true });

      expect(Task.rawAttributes.UserId.type instanceof DataTypes.STRING).to.be.ok;
    });

    describe('allows the user to provide an attribute definition object as foreignKey', () => {
      it('works with a column that hasnt been defined before', () => {
        const Task = current.define('task', {}),
          User = current.define('user', {});

        User.hasMany(Task, {
          foreignKey: {
            name: 'uid',
            allowNull: false
          }
        });

        expect(Task.rawAttributes.uid).to.be.ok;
        expect(Task.rawAttributes.uid.allowNull).to.be.false;
        expect(Task.rawAttributes.uid.references.model).to.equal(User.getTableName());
        expect(Task.rawAttributes.uid.references.key).to.equal('id');
      });

      it('works when taking a column directly from the object', () => {
        const Project = current.define('project', {
            user_id: {
              type: Sequelize.INTEGER,
              defaultValue: 42
            }
          }),
          User = current.define('user', {
            uid: {
              type: Sequelize.INTEGER,
              primaryKey: true
            }
          });

        User.hasMany(Project, { foreignKey: Project.rawAttributes.user_id });

        expect(Project.rawAttributes.user_id).to.be.ok;
        expect(Project.rawAttributes.user_id.references.model).to.equal(User.getTableName());
        expect(Project.rawAttributes.user_id.references.key).to.equal('uid');
        expect(Project.rawAttributes.user_id.defaultValue).to.equal(42);
      });

      it('works when merging with an existing definition', () => {
        const Task = current.define('task', {
            userId: {
              defaultValue: 42,
              type: Sequelize.INTEGER
            }
          }),
          User = current.define('user', {});

        User.hasMany(Task, { foreignKey: { allowNull: true } });

        expect(Task.rawAttributes.userId).to.be.ok;
        expect(Task.rawAttributes.userId.defaultValue).to.equal(42);
        expect(Task.rawAttributes.userId.allowNull).to.be.ok;
      });
    });

    it('should throw an error if foreignKey and as result in a name clash', () => {
      const User = current.define('user', {
        user: Sequelize.INTEGER
      });

      expect(User.hasMany.bind(User, User, { as: 'user' })).to.throw(
        "Naming collision between attribute 'user' and association 'user' on model user. To remedy this, change either foreignKey or as in your association definition"
      );
    });
  });

  describe('sourceKey', () => {
    let User, Task;

    beforeEach(() => {
      User = current.define(
        'UserXYZ',
        { username: Sequelize.STRING, email: Sequelize.STRING },
        { indexes: [{ fields: ['email'], unique: true }] }
      );
      Task = current.define('TaskXYZ', {
        title: Sequelize.STRING,
        userEmail: { type: Sequelize.STRING, field: 'user_email_xyz' }
      });

      User.hasMany(Task, { foreignKey: 'userEmail', sourceKey: 'email', as: 'tasks' });

      return current.sync({ force: true });
    });

    it('should use sourceKey', async () => {
      const user = await User.create({ username: 'John', email: 'john@example.com' });

      await Task.create({ title: 'Fix PR', userEmail: 'john@example.com' });

      const tasks = await user.getTasks();

      expect(tasks.length).to.equal(1);
      expect(tasks[0].title).to.equal('Fix PR');
    });

    it('should count related records', async () => {
      const user = await User.create({ username: 'John', email: 'john@example.com' });

      await Task.create({ title: 'Fix PR', userEmail: 'john@example.com' });

      expect(await user.countTasks()).to.equal(1);
    });

    it('should set right field when add relative', async () => {
      const user = await User.create({ username: 'John', email: 'john@example.com' });
      const task = await Task.create({ title: 'Fix PR' });

      await user.addTask(task);

      expect(await user.hasTask(task.id)).to.be.true;
    });

    it('should create with nested associated models', async () => {
      const values = {
        username: 'John',
        email: 'john@example.com',
        tasks: [{ title: 'Fix new PR' }]
      };

      const created = await User.create(values, { include: ['tasks'] });

      // Make sure tasks are defined for created user
      expect(created).to.have.property('tasks');
      expect(created.tasks).to.be.an('array');
      expect(created.tasks).to.lengthOf(1);
      expect(created.tasks[0].title).to.be.equal(values.tasks[0].title, 'task title is correct');

      const user = await User.findOne({ where: { email: values.email } });
      const tasks = await user.getTasks();

      // Make sure tasks relationship is successful
      expect(tasks).to.be.an('array');
      expect(tasks).to.lengthOf(1);
      expect(tasks[0].title).to.be.equal(values.tasks[0].title, 'task title is correct');
    });
  });

  describe('sourceKey with where clause in include', () => {
    let User, Task;

    beforeEach(() => {
      User = current.define(
        'User',
        { username: Sequelize.STRING, email: { type: Sequelize.STRING, field: 'mail' } },
        { indexes: [{ fields: ['mail'], unique: true }] }
      );
      Task = current.define('Task', {
        title: Sequelize.STRING,
        userEmail: Sequelize.STRING,
        taskStatus: Sequelize.STRING
      });

      User.hasMany(Task, { foreignKey: 'userEmail', sourceKey: 'mail' });

      return current.sync({ force: true });
    });

    it('should use the specified sourceKey instead of the primary key', async () => {
      await User.create({ username: 'John', email: 'john@example.com' });
      await Task.bulkCreate([
        { title: 'Active Task', userEmail: 'john@example.com', taskStatus: 'Active' },
        { title: 'Inactive Task', userEmail: 'john@example.com', taskStatus: 'Inactive' }
      ]);

      const user = await User.findOne({
        include: [
          {
            model: Task,
            where: { taskStatus: 'Active' }
          }
        ],
        where: { username: 'John' }
      });

      expect(user).to.be.ok;
      expect(user.Tasks.length).to.equal(1);
      expect(user.Tasks[0].title).to.equal('Active Task');
    });
  });
});
