import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import sinon from 'sinon';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';
import DataTypes from '../../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let clock;

  beforeAll(() => {
    clock = sinon.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(() => {
    clock.restore();
  });

  describe('attributes', () => {
    describe('field', () => {
      let SharedUser, Task, Comment;

      beforeEach(() => {
        const queryInterface = current.getQueryInterface();

        SharedUser = current.define(
          'user',
          {
            id: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true,
              field: 'userId'
            },
            name: {
              type: DataTypes.STRING,
              field: 'full_name'
            },
            taskCount: {
              type: DataTypes.INTEGER,
              field: 'task_count',
              defaultValue: 0,
              allowNull: false
            }
          },
          {
            tableName: 'users',
            timestamps: false
          }
        );

        Task = current.define(
          'task',
          {
            id: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true,
              field: 'taskId'
            },
            title: {
              type: DataTypes.STRING,
              field: 'name'
            }
          },
          {
            tableName: 'tasks',
            timestamps: false
          }
        );

        Comment = current.define(
          'comment',
          {
            id: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true,
              field: 'commentId'
            },
            text: { type: DataTypes.STRING, field: 'comment_text' },
            notes: { type: DataTypes.STRING, field: 'notes' },
            likes: { type: DataTypes.INTEGER, field: 'like_count' },
            createdAt: { type: DataTypes.DATE, field: 'created_at', allowNull: false },
            updatedAt: { type: DataTypes.DATE, field: 'updated_at', allowNull: false }
          },
          {
            tableName: 'comments',
            timestamps: true
          }
        );

        SharedUser.hasMany(Task, {
          foreignKey: 'user_id'
        });
        Task.belongsTo(SharedUser, {
          foreignKey: 'user_id'
        });
        Task.hasMany(Comment, {
          foreignKey: 'task_id'
        });
        Comment.belongsTo(Task, {
          foreignKey: 'task_id'
        });

        SharedUser.belongsToMany(Comment, {
          foreignKey: 'userId',
          otherKey: 'commentId',
          through: 'userComments'
        });

        return Promise.all([
          queryInterface.createTable('users', {
            userId: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true
            },
            full_name: {
              type: DataTypes.STRING
            },
            task_count: {
              type: DataTypes.INTEGER,
              allowNull: false,
              defaultValue: 0
            }
          }),
          queryInterface.createTable('tasks', {
            taskId: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true
            },
            user_id: {
              type: DataTypes.INTEGER
            },
            name: {
              type: DataTypes.STRING
            }
          }),
          queryInterface.createTable('comments', {
            commentId: {
              type: DataTypes.INTEGER,
              allowNull: false,
              primaryKey: true,
              autoIncrement: true
            },
            task_id: {
              type: DataTypes.INTEGER
            },
            comment_text: {
              type: DataTypes.STRING
            },
            notes: {
              type: DataTypes.STRING
            },
            like_count: {
              type: DataTypes.INTEGER
            },
            created_at: {
              type: DataTypes.DATE,
              allowNull: false
            },
            updated_at: {
              type: DataTypes.DATE
            }
          }),
          queryInterface.createTable('userComments', {
            commentId: {
              type: DataTypes.INTEGER
            },
            userId: {
              type: DataTypes.INTEGER
            }
          })
        ]);
      });

      describe('primaryKey', () => {
        describe('in combination with allowNull', () => {
          let ModelUnderTest;

          beforeEach(async () => {
            ModelUnderTest = current.define('ModelUnderTest', {
              identifier: {
                primaryKey: true,
                type: Sequelize.STRING,
                allowNull: false
              }
            });

            await ModelUnderTest.sync({ force: true });
          });

          it('sets the column to not allow null', async () => {
            const fields = await ModelUnderTest.describe();
            expect(fields.identifier).to.include({ allowNull: false });
          });
        });

        it('should support instance.destroy()', async () => {
          const user = await SharedUser.create();
          await user.destroy();

          expect(await SharedUser.findByPk(user.get('id'))).to.be.null;
        });

        it('should support Model.destroy()', async () => {
          const user = await SharedUser.create();

          await SharedUser.destroy({
            where: {
              id: user.get('id')
            }
          });

          expect(await SharedUser.findByPk(user.get('id'))).to.be.null;
        });
      });

      describe('field and attribute name is the same', () => {
        beforeEach(() => {
          return Comment.bulkCreate([{ notes: 'Number one' }, { notes: 'Number two' }]);
        });

        it('bulkCreate should work', async () => {
          const comments = await Comment.findAll();
          expect(comments[0].notes).to.equal('Number one');
          expect(comments[1].notes).to.equal('Number two');
        });

        it('find with where should work', async () => {
          const comments = await Comment.findAll({ where: { notes: 'Number one' } });
          expect(comments).to.have.length(1);
          expect(comments[0].notes).to.equal('Number one');
        });

        it('reload should work', async () => {
          const comment = await Comment.findByPk(1);
          const reloaded = await comment.reload();

          expect(reloaded.notes).to.equal('Number one');
        });

        it('save should work', async () => {
          const created = await Comment.create({ notes: 'my note' });
          created.notes = 'new note';

          const saved = await created.save();
          const comment = await saved.reload();

          expect(comment.notes).to.equal('new note');
        });
      });

      it('increment should work', async () => {
        await Comment.destroy({ truncate: true });

        const created = await Comment.create({ note: 'oh boy, here I go again', likes: 23 });
        const incremented = await created.increment('likes');
        const comment = await incremented.reload();

        expect(comment.likes).to.be.equal(24);
      });

      it('decrement should work', async () => {
        await Comment.destroy({ truncate: true });

        const created = await Comment.create({ note: 'oh boy, here I go again', likes: 23 });
        const decremented = await created.decrement('likes');
        const comment = await decremented.reload();

        expect(comment.likes).to.be.equal(22);
      });

      it('sum should work', async () => {
        await Comment.destroy({ truncate: true });
        await Comment.create({ note: 'oh boy, here I go again', likes: 23 });

        const likes = await Comment.sum('likes');
        expect(likes).to.be.equal(23);
      });

      it('should create, fetch and update with alternative field names from a simple model', async () => {
        await SharedUser.create({
          name: 'Foobar'
        });

        const found = await SharedUser.findOne({
          limit: 1
        });
        expect(found.get('name')).to.equal('Foobar');

        await found.update({
          name: 'Barfoo'
        });

        const updated = await SharedUser.findOne({
          limit: 1
        });
        expect(updated.get('name')).to.equal('Barfoo');
      });

      it('should bulk update', async () => {
        const Entity = current.define('Entity', {
          strField: { type: Sequelize.STRING, field: 'str_field' }
        });

        await current.sync({ force: true });
        await Entity.create({ strField: 'foo' });
        await Entity.update({ strField: 'bar' }, { where: { strField: 'foo' } });

        const entity = await Entity.findOne({
          where: {
            strField: 'bar'
          }
        });

        expect(entity).to.be.ok;
        expect(entity.get('strField')).to.equal('bar');
      });

      it('should not contain the field properties after create', async () => {
        const Model = current.define(
          'test',
          {
            id: {
              type: Sequelize.INTEGER,
              field: 'test_id',
              autoIncrement: true,
              primaryKey: true,
              validate: {
                min: 1
              }
            },
            title: {
              allowNull: false,
              type: Sequelize.STRING(255),
              field: 'test_title'
            }
          },
          {
            timestamps: true,
            underscored: true,
            freezeTableName: true
          }
        );

        await Model.sync({ force: true });

        const data = await Model.create({ title: 'test' });
        expect(data.get('test_title')).to.be.an('undefined');
        expect(data.get('test_id')).to.be.an('undefined');
      });

      it('should make the aliased auto incremented primary key available after create', async () => {
        const user = await SharedUser.create({
          name: 'Barfoo'
        });

        expect(user.get('id')).to.be.ok;
      });

      it('should work with where on includes for find', async () => {
        const user = await SharedUser.create({
          name: 'Barfoo'
        });

        const createdTask = await user.createTask({
          title: 'DatDo'
        });

        await createdTask.createComment({
          text: 'Comment'
        });

        const task = await Task.findOne({
          include: [{ model: Comment }, { model: SharedUser }],
          where: { title: 'DatDo' }
        });

        expect(task.get('title')).to.equal('DatDo');
        expect(task.get('comments')[0].get('text')).to.equal('Comment');
        expect(task.get('user')).to.be.ok;
      });

      it('should work with where on includes for findAll', async () => {
        const created = await SharedUser.create({
          name: 'Foobar'
        });

        const task = await created.createTask({
          title: 'DoDat'
        });

        await task.createComment({
          text: 'Comment'
        });

        const users = await SharedUser.findAll({
          include: [{ model: Task, where: { title: 'DoDat' }, include: [{ model: Comment }] }]
        });

        users.forEach((user) => {
          expect(user.get('name')).to.be.ok;
          expect(user.get('tasks')[0].get('title')).to.equal('DoDat');
          expect(user.get('tasks')[0].get('comments')).to.be.ok;
        });
      });

      it('should work with increment', async () => {
        const user = await SharedUser.create();
        const incremented = await user.increment('taskCount');
        const reloaded = await incremented.reload();

        expect(reloaded.get('taskCount')).to.equal(1);
      });

      it('should work with a simple where', async () => {
        await SharedUser.create({
          name: 'Foobar'
        });

        const user = await SharedUser.findOne({
          where: {
            name: 'Foobar'
          }
        });

        expect(user).to.be.ok;
      });

      it('should work with a where or', async () => {
        await SharedUser.create({
          name: 'Foobar'
        });

        const user = await SharedUser.findOne({
          where: current.or(
            {
              name: 'Foobar'
            },
            {
              name: 'Lollerskates'
            }
          )
        });

        expect(user).to.be.ok;
      });

      it('should work with bulkCreate and findAll', async () => {
        await SharedUser.bulkCreate([
          {
            name: 'Abc'
          },
          {
            name: 'Bcd'
          },
          {
            name: 'Cde'
          }
        ]);

        const users = await SharedUser.findAll();
        users.forEach((user) => {
          expect(['Abc', 'Bcd', 'Cde'].indexOf(user.get('name')) !== -1).to.be.true;
        });
      });

      it('should support renaming of sequelize method fields', async () => {
        const Test = current.define('test', {
          someProperty: Sequelize.VIRTUAL // Since we specify the AS part as a part of the literal string, not with sequelize syntax, we have to tell sequelize about the field
        });

        await current.sync({ force: true });
        await Test.create({});

        const findAttributes = [
          Sequelize.literal('EXISTS(SELECT 1) AS "someProperty"'),
          [Sequelize.literal('EXISTS(SELECT 1)'), 'someProperty2']
        ];

        const tests = await Test.findAll({
          attributes: findAttributes
        });

        expect(tests[0].get('someProperty')).to.be.ok;
        expect(tests[0].get('someProperty2')).to.be.ok;
      });

      it('should sync foreign keys with custom field names', async () => {
        await current.sync({ force: true });

        const attrs = Task.tableAttributes;
        expect(attrs.user_id.references.model).to.equal('users');
        expect(attrs.user_id.references.key).to.equal('userId');
      });

      it('should find the value of an attribute with a custom field name', async () => {
        await SharedUser.create({ name: 'test user' });

        const user = await SharedUser.findOne({ where: { name: 'test user' } });
        expect(user.name).to.equal('test user');
      });

      it('field names that are the same as property names should create, update, and read correctly', async () => {
        await Comment.create({
          notes: 'Foobar'
        });

        const found = await Comment.findOne({
          limit: 1
        });
        expect(found.get('notes')).to.equal('Foobar');

        await found.update({
          notes: 'Barfoo'
        });

        const updated = await Comment.findOne({
          limit: 1
        });
        expect(updated.get('notes')).to.equal('Barfoo');
      });

      it('should work with a belongsTo association getter', async () => {
        const userId = Math.floor(Math.random() * 100000);

        const [userA, task] = await Promise.all([
          SharedUser.create({
            id: userId
          }),
          Task.create({
            user_id: userId
          })
        ]);

        const userB = await task.getUser();

        expect(userA.get('id')).to.equal(userB.get('id'));
        expect(userA.get('id')).to.equal(userId);
        expect(userB.get('id')).to.equal(userId);
      });

      it('should work with paranoid instance.destroy()', async () => {
        const User = current.define(
          'User',
          {
            deletedAt: {
              type: DataTypes.DATE,
              field: 'deleted_at'
            }
          },
          {
            timestamps: true,
            paranoid: true
          }
        );

        await User.sync({ force: true });

        const user = await User.create();
        await user.destroy();

        clock.tick(1000);

        const users = await User.findAll();
        expect(users.length).to.equal(0);
      });

      it('should work with paranoid Model.destroy()', async () => {
        const User = current.define(
          'User',
          {
            deletedAt: {
              type: DataTypes.DATE,
              field: 'deleted_at'
            }
          },
          {
            timestamps: true,
            paranoid: true
          }
        );

        await User.sync({ force: true });

        const user = await User.create();
        await User.destroy({ where: { id: user.get('id') } });

        const users = await User.findAll();
        expect(users.length).to.equal(0);
      });

      it('should work with `belongsToMany` association `count`', async () => {
        const user = await SharedUser.create({
          name: 'John'
        });

        const commentCount = await user.countComments();
        expect(commentCount).to.equal(0);
      });

      it('should work with `hasMany` association `count`', async () => {
        const user = await SharedUser.create({
          name: 'John'
        });

        const taskCount = await user.countTasks();
        expect(taskCount).to.equal(0);
      });
    });
  });
});
