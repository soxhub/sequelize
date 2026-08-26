import { describe, it, expect } from 'vitest';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('BelongsTo'), () => {
  describe('Model.associations', () => {
    it('should store all assocations when associting to the same table multiple times', () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      Group.belongsTo(User);
      Group.belongsTo(User, { foreignKey: 'primaryGroupId', as: 'primaryUsers' });
      Group.belongsTo(User, { foreignKey: 'secondaryGroupId', as: 'secondaryUsers' });

      expect(Object.keys(Group.associations)).to.deep.equal(['User', 'primaryUsers', 'secondaryUsers']);
    });
  });

  describe('get', () => {
    describe('multiple', () => {
      it('should fetch associations for multiple instances', async () => {
        const User = current.define('User', {}),
          Task = current.define('Task', {});

        Task.User = Task.belongsTo(User, { as: 'user' });

        await current.sync({ force: true });

        const tasks = await Promise.all([
          Task.create(
            {
              id: 1,
              user: { id: 1 }
            },
            {
              include: [Task.User]
            }
          ),
          Task.create(
            {
              id: 2,
              user: { id: 2 }
            },
            {
              include: [Task.User]
            }
          ),
          Task.create({
            id: 3
          })
        ]);

        const result = await Task.User.get(tasks);

        expect(result[tasks[0].id].id).to.equal(tasks[0].user.id);
        expect(result[tasks[1].id].id).to.equal(tasks[1].user.id);
        expect(result[tasks[2].id]).to.be.undefined;
      });
    });
  });

  describe('getAssociation', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING }),
          Group = sequelize.define('Group', { name: Support.Sequelize.STRING });

        Group.belongsTo(User);

        await sequelize.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const group = await Group.create({ name: 'bar' });
        const t = await sequelize.transaction();

        await group.setUser(user, { transaction: t });

        const groups = await Group.findAll();
        const associatedUser = await groups[0].getUser();

        expect(associatedUser).to.be.null;

        const transactionGroups = await Group.findAll({ transaction: t });
        const transactionUser = await transactionGroups[0].getUser({ transaction: t });

        expect(transactionUser).to.be.not.null;

        await t.rollback();
      });
    }

    it("should be able to handle a where object that's a first class citizen.", async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING, gender: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING, status: Sequelize.STRING });

      Task.belongsTo(User);

      await User.sync({ force: true });
      // Can't use Promise.all cause of foreign key references
      await Task.sync({ force: true });

      const [userA, , task] = await Promise.all([
        User.create({ username: 'foo', gender: 'male' }),
        User.create({ username: 'bar', gender: 'female' }),
        Task.create({ title: 'task', status: 'inactive' })
      ]);

      await task.setUserXYZ(userA);

      const user = await task.getUserXYZ({ where: { gender: 'female' } });

      expect(user).to.be.null;
    });

    it('supports schemas', async () => {
      const User = current
          .define('UserXYZ', { username: Sequelize.STRING, gender: Sequelize.STRING })
          .schema('archive'),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING, status: Sequelize.STRING }).schema('archive');

      Task.belongsTo(User);

      await current.dropAllSchemas();
      await current.createSchema('archive');
      await User.sync({ force: true });
      await Task.sync({ force: true });

      const [created, task] = await Promise.all([
        User.create({ username: 'foo', gender: 'male' }),
        Task.create({ title: 'task', status: 'inactive' })
      ]);

      await task.setUserXYZ(created);

      const user = await task.getUserXYZ();

      expect(user).to.be.ok;

      await current.dropSchema('archive');

      const schemas = await current.showAllSchemas();

      expect(schemas).to.be.empty;
    });
  });

  describe('setAssociation', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING }),
          Group = sequelize.define('Group', { name: Support.Sequelize.STRING });

        Group.belongsTo(User);

        await sequelize.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const group = await Group.create({ name: 'bar' });
        const t = await sequelize.transaction();

        await group.setUser(user, { transaction: t });

        const groups = await Group.findAll();
        const associatedUser = await groups[0].getUser();

        expect(associatedUser).to.be.null;

        await t.rollback();
      });
    }

    it('can set the association with declared primary keys...', async () => {
      const User = current.define('UserXYZ', {
          user_id: { type: DataTypes.INTEGER, primaryKey: true },
          username: DataTypes.STRING
        }),
        Task = current.define('TaskXYZ', {
          task_id: { type: DataTypes.INTEGER, primaryKey: true },
          title: DataTypes.STRING
        });

      Task.belongsTo(User, { foreignKey: 'user_id' });

      await current.sync({ force: true });

      const user = await User.create({ user_id: 1, username: 'foo' });
      const task = await Task.create({ task_id: 1, title: 'task' });

      await task.setUserXYZ(user);

      const associatedUser = await task.getUserXYZ();
      expect(associatedUser).not.to.be.null;

      await task.setUserXYZ(null);

      const clearedUser = await task.getUserXYZ();
      expect(clearedUser).to.be.null;
    });

    it('clears the association if null is passed', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        Task = current.define('TaskXYZ', { title: DataTypes.STRING });

      Task.belongsTo(User);

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await task.setUserXYZ(user);

      const associatedUser = await task.getUserXYZ();
      expect(associatedUser).not.to.be.null;

      await task.setUserXYZ(null);

      const clearedUser = await task.getUserXYZ();
      expect(clearedUser).to.be.null;
    });

    it('should throw a ForeignKeyConstraintError if the associated record does not exist', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        Task = current.define('TaskXYZ', { title: DataTypes.STRING });

      Task.belongsTo(User);

      await current.sync({ force: true });

      await expect(Task.create({ title: 'task', UserXYZId: 5 })).rejects.toThrow(Sequelize.ForeignKeyConstraintError);

      const task = await Task.create({ title: 'task' });

      await expect(Task.update({ title: 'taskUpdate', UserXYZId: 5 }, { where: { id: task.id } })).rejects.toThrow(
        Sequelize.ForeignKeyConstraintError
      );
    });

    it('supports passing the primary key instead of an object', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        Task = current.define('TaskXYZ', { title: DataTypes.STRING });

      Task.belongsTo(User);

      await current.sync({ force: true });

      const user = await User.create({ id: 15, username: 'jansemand' });
      const task = await Task.create({});

      await task.setUserXYZ(user.id);

      const associatedUser = await task.getUserXYZ();

      expect(associatedUser.username).to.equal('jansemand');
    });

    it('should support logging', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        Task = current.define('TaskXYZ', { title: DataTypes.STRING }),
        spy = sinon.spy();

      Task.belongsTo(User);

      await current.sync({ force: true });

      const user = await User.create();
      const task = await Task.create({});

      await task.setUserXYZ(user, { logging: spy });

      expect(spy.called).to.be.ok;
    });

    it('should not clobber atributes', async () => {
      const Comment = current.define('comment', {
        text: DataTypes.STRING
      });

      const Post = current.define('post', {
        title: DataTypes.STRING
      });

      Post.hasOne(Comment);
      Comment.belongsTo(Post);

      await current.sync();

      const post = await Post.create({
        title: 'Post title'
      });
      const comment = await Comment.create({
        text: 'OLD VALUE'
      });

      comment.text = 'UPDATED VALUE';

      await comment.setPost(post);

      expect(comment.text).to.equal('UPDATED VALUE');
    });

    it('should set the foreign key value without saving when using save: false', async () => {
      const Comment = current.define('comment', {
        text: DataTypes.STRING
      });

      const Post = current.define('post', {
        title: DataTypes.STRING
      });

      Post.hasMany(Comment, { foreignKey: 'post_id' });
      Comment.belongsTo(Post, { foreignKey: 'post_id' });

      await current.sync({ force: true });

      const [post, comment] = await Promise.all([Post.create(), Comment.create()]);

      expect(comment.get('post_id')).not.to.be.ok;

      const setter = comment.setPost(post, { save: false });

      expect(setter).to.be.undefined;
      expect(comment.get('post_id')).to.equal(post.get('id'));
      expect(comment.changed('post_id')).to.be.true;
    });

    it('supports setting same association twice', async () => {
      const Home = current.define('home', {}),
        User = current.define('user');

      Home.belongsTo(User);

      await current.sync({ force: true });

      const [home, user] = await Promise.all([Home.create(), User.create()]);

      await home.setUser(user);
      await home.setUser(user);

      await expect(home.getUser()).resolves.to.have.property('id', user.get('id'));
    });
  });

  describe('createAssociation', () => {
    it('creates an associated model instance', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      Task.belongsTo(User);

      await current.sync({ force: true });

      const task = await Task.create({ title: 'task' });

      await task.createUser({ username: 'bob' });

      const user = await task.getUser();

      expect(user).not.to.be.null;
      expect(user.username).to.equal('bob');
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING }),
          Group = sequelize.define('Group', { name: Support.Sequelize.STRING });

        Group.belongsTo(User);

        await sequelize.sync({ force: true });

        const group = await Group.create({ name: 'bar' });
        const t = await sequelize.transaction();

        await group.createUser({ username: 'foo' }, { transaction: t });

        const user = await group.getUser();
        expect(user).to.be.null;

        const transactionUser = await group.getUser({ transaction: t });
        expect(transactionUser).not.to.be.null;

        await t.rollback();
      });
    }
  });

  describe('foreign key', () => {
    it('should lowercase foreign keys when using underscored', () => {
      const User = current.define('User', { username: Sequelize.STRING }, { underscored: true }),
        Account = current.define('Account', { name: Sequelize.STRING }, { underscored: true });

      User.belongsTo(Account);

      expect(User.rawAttributes.account_id).to.exist;
    });

    it('should use model name when using camelcase', () => {
      const User = current.define('User', { username: Sequelize.STRING }, { underscored: false }),
        Account = current.define('Account', { name: Sequelize.STRING }, { underscored: false });

      User.belongsTo(Account);

      expect(User.rawAttributes.AccountId).to.exist;
    });

    it('should support specifying the field of a foreign key', async () => {
      const User = current.define('User', { username: Sequelize.STRING }, { underscored: false }),
        Account = current.define('Account', { title: Sequelize.STRING }, { underscored: false });

      User.belongsTo(Account, {
        foreignKey: {
          name: 'AccountId',
          field: 'account_id'
        }
      });

      expect(User.rawAttributes.AccountId).to.exist;
      expect(User.rawAttributes.AccountId.field).to.equal('account_id');

      await Account.sync({ force: true });
      // Can't use Promise.all cause of foreign key references
      await User.sync({ force: true });

      const [createdUser, account] = await Promise.all([
        User.create({ username: 'foo' }),
        Account.create({ title: 'pepsico' })
      ]);

      await createdUser.setAccount(account);

      const user = await createdUser.getAccount();

      // the sql query should correctly look at task_id instead of taskId
      expect(user).to.not.be.null;

      const task = await User.findOne({
        where: { username: 'foo' },
        include: [Account]
      });

      expect(task.Account).to.exist;
    });
  });

  describe('foreign key constraints', () => {
    it('are enabled by default', async () => {
      const Task = current.define('Task', { title: DataTypes.STRING }),
        User = current.define('User', { username: DataTypes.STRING });

      Task.belongsTo(User); // defaults to SET NULL

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await task.setUser(user);
      await user.destroy();
      await task.reload();

      expect(task.UserId).to.equal(null);
    });

    it('sets to NO ACTION if allowNull: false', async () => {
      const Task = current.define('Task', { title: DataTypes.STRING }),
        User = current.define('User', { username: DataTypes.STRING });

      Task.belongsTo(User, { foreignKey: { allowNull: false } }); // defaults to NO ACTION

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });

      await Task.create({ title: 'task', UserId: user.id });

      await expect(user.destroy()).rejects.toThrow(Sequelize.ForeignKeyConstraintError);

      const tasks = await Task.findAll();

      expect(tasks).to.have.length(1);
    });

    it('should be possible to disable them', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      Task.belongsTo(User, { constraints: false });

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await task.setUser(user);
      await user.destroy();
      await task.reload();

      expect(task.UserId).to.equal(user.id);
    });

    it('can cascade deletes', async () => {
      const Task = current.define('Task', { title: DataTypes.STRING }),
        User = current.define('User', { username: DataTypes.STRING });

      Task.belongsTo(User, { onDelete: 'cascade' });

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await task.setUser(user);
      await user.destroy();

      const tasks = await Task.findAll();

      expect(tasks).to.have.length(0);
    });

    if (current.dialect.supports.constraints.restrict) {
      it('can restrict deletes', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        Task.belongsTo(User, { onDelete: 'restrict' });

        await current.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await task.setUser(user);

        await expect(user.destroy()).rejects.toThrow(Sequelize.ForeignKeyConstraintError);

        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
      });

      it('can restrict updates', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        Task.belongsTo(User, { onUpdate: 'restrict' });

        await current.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await task.setUser(user);

        // Changing the id of a DAO requires a little dance since
        // the `UPDATE` query generated by `save()` uses `id` in the
        // `WHERE` clause

        const tableName = user.sequelize.getQueryInterface().QueryGenerator.addSchema(user.constructor);
        await expect(
          user.sequelize.getQueryInterface().update(user, tableName, { id: 999 }, { id: user.id })
        ).rejects.toThrow(Sequelize.ForeignKeyConstraintError);

        // Should fail due to FK restriction
        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
      });
    }

    // NOTE: mssql does not support changing an autoincrement primary key
    if (Support.getTestDialect() !== 'mssql') {
      it('can cascade updates', async () => {
        const Task = current.define('Task', { title: DataTypes.STRING }),
          User = current.define('User', { username: DataTypes.STRING });

        Task.belongsTo(User, { onUpdate: 'cascade' });

        await current.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await task.setUser(user);

        // Changing the id of a DAO requires a little dance since
        // the `UPDATE` query generated by `save()` uses `id` in the
        // `WHERE` clause

        const tableName = user.sequelize.getQueryInterface().QueryGenerator.addSchema(user.constructor);
        await user.sequelize.getQueryInterface().update(user, tableName, { id: 999 }, { id: user.id });

        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
        expect(tasks[0].UserId).to.equal(999);
      });
    }
  });

  describe('Association column', () => {
    it('has correct type and name for non-id primary keys with non-integer type', async () => {
      const User = current.define('UserPKBT', {
        username: {
          type: DataTypes.STRING
        }
      });

      const Group = current.define('GroupPKBT', {
        name: {
          type: DataTypes.STRING,
          primaryKey: true
        }
      });

      User.belongsTo(Group);

      await current.sync({ force: true });

      expect(User.rawAttributes.GroupPKBTName.type).to.an.instanceof(DataTypes.STRING);
    });

    it('should support a non-primary key as the association column on a target without a primary key', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.removeAttribute('id');
      Task.belongsTo(User, { foreignKey: 'user_name', targetKey: 'username' });

      await current.sync({ force: true });

      const newUser = await User.create({ username: 'bob' });
      const newTask = await Task.create({ title: 'some task' });

      await newTask.setUser(newUser);

      const foundTask = await Task.findOne({ where: { title: 'some task' } });
      const foundUser = await foundTask.getUser();

      expect(foundUser.username).to.equal('bob');
    });

    it('should support a non-primary unique key as the association column', async () => {
      const User = current.define('User', {
          username: {
            type: DataTypes.STRING,
            field: 'user_name',
            unique: true
          }
        }),
        Task = current.define('Task', {
          title: DataTypes.STRING
        });

      Task.belongsTo(User, { foreignKey: 'user_name', targetKey: 'username' });

      await current.sync({ force: true });

      const newUser = await User.create({ username: 'bob' });
      const newTask = await Task.create({ title: 'some task' });

      await newTask.setUser(newUser);

      const foundTask = await Task.findOne({ where: { title: 'some task' } });
      const foundUser = await foundTask.getUser();

      expect(foundUser.username).to.equal('bob');
    });

    it('should support a non-primary key as the association column with a field option', async () => {
      const User = current.define('User', {
          username: {
            type: DataTypes.STRING,
            field: 'the_user_name_field'
          }
        }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.removeAttribute('id');
      Task.belongsTo(User, { foreignKey: 'user_name', targetKey: 'username' });

      await current.sync({ force: true });

      const newUser = await User.create({ username: 'bob' });
      const newTask = await Task.create({ title: 'some task' });

      await newTask.setUser(newUser);

      const foundTask = await Task.findOne({ where: { title: 'some task' } });
      const foundUser = await foundTask.getUser();

      expect(foundUser.username).to.equal('bob');
    });
  });

  describe('Association options', () => {
    it('can specify data type for autogenerated relational keys', async () => {
      const User = current.define('UserXYZ', { username: DataTypes.STRING }),
        dataTypes = [DataTypes.INTEGER, DataTypes.BIGINT, DataTypes.STRING],
        Tasks = {};

      dataTypes.forEach((dataType) => {
        const tableName = 'TaskXYZ_' + dataType.key;
        Tasks[dataType] = current.define(tableName, { title: DataTypes.STRING });

        Tasks[dataType].belongsTo(User, { foreignKey: 'userId', keyType: dataType, constraints: false });
      });

      await current.sync({ force: true });

      dataTypes.forEach((dataType) => {
        expect(Tasks[dataType].rawAttributes.userId.type).to.be.an.instanceof(dataType);
      });
    });

    describe('allows the user to provide an attribute definition object as foreignKey', () => {
      it('works with a column that hasnt been defined before', () => {
        const Task = current.define('task', {}),
          User = current.define('user', {});

        Task.belongsTo(User, {
          foreignKey: {
            allowNull: false,
            name: 'uid'
          }
        });

        expect(Task.rawAttributes.uid).to.be.ok;
        expect(Task.rawAttributes.uid.allowNull).to.be.false;
        expect(Task.rawAttributes.uid.references.model).to.equal(User.getTableName());
        expect(Task.rawAttributes.uid.references.key).to.equal('id');
      });

      it('works when taking a column directly from the object', () => {
        const User = current.define('user', {
            uid: {
              type: Sequelize.INTEGER,
              primaryKey: true
            }
          }),
          Profile = current.define('project', {
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false
            }
          });

        Profile.belongsTo(User, { foreignKey: Profile.rawAttributes.user_id });

        expect(Profile.rawAttributes.user_id).to.be.ok;
        expect(Profile.rawAttributes.user_id.references.model).to.equal(User.getTableName());
        expect(Profile.rawAttributes.user_id.references.key).to.equal('uid');
        expect(Profile.rawAttributes.user_id.allowNull).to.be.false;
      });

      it('works when merging with an existing definition', () => {
        const Task = current.define('task', {
            projectId: {
              defaultValue: 42,
              type: Sequelize.INTEGER
            }
          }),
          Project = current.define('project', {});

        Task.belongsTo(Project, { foreignKey: { allowNull: true } });

        expect(Task.rawAttributes.projectId).to.be.ok;
        expect(Task.rawAttributes.projectId.defaultValue).to.equal(42);
        expect(Task.rawAttributes.projectId.allowNull).to.be.ok;
      });
    });

    it('should throw an error if foreignKey and as result in a name clash', () => {
      const Person = current.define('person', {}),
        Car = current.define('car', {});

      expect(Car.belongsTo.bind(Car, Person, { foreignKey: 'person' })).to.throw(
        "Naming collision between attribute 'person' and association 'person' on model car. To remedy this, change either foreignKey or as in your association definition"
      );
    });

    it('should throw an error if an association clashes with the name of an already define attribute', () => {
      const Person = current.define('person', {}),
        Car = current.define('car', {
          person: Sequelize.INTEGER
        });

      expect(Car.belongsTo.bind(Car, Person, { as: 'person' })).to.throw(
        "Naming collision between attribute 'person' and association 'person' on model car. To remedy this, change either foreignKey or as in your association definition"
      );
    });
  });
});

describe('Association', () => {
  it('should set foreignKey on foreign table', async () => {
    const Mail = current.define('mail', {}, { timestamps: false });
    const Entry = current.define('entry', {}, { timestamps: false });
    const User = current.define('user', {}, { timestamps: false });
    Entry.belongsTo(User, { as: 'owner', foreignKey: { name: 'ownerId', allowNull: false } });
    Entry.belongsTo(Mail, {
      as: 'mail',
      foreignKey: {
        name: 'mailId',
        allowNull: false
      }
    });
    Mail.belongsToMany(User, {
      as: 'recipients',
      through: 'MailRecipients',
      otherKey: {
        name: 'recipientId',
        allowNull: false
      },
      foreignKey: {
        name: 'mailId',
        allowNull: false
      },
      timestamps: false
    });
    Mail.hasMany(Entry, {
      as: 'entries',
      foreignKey: {
        name: 'mailId',
        allowNull: false
      }
    });
    User.hasMany(Entry, {
      as: 'entries',
      foreignKey: {
        name: 'ownerId',
        allowNull: false
      }
    });
    await current.sync({ force: true });
    await User.create({});

    const mail = await Mail.create({});

    await Entry.create({ mailId: mail.id, ownerId: 1 });
    await Entry.create({ mailId: mail.id, ownerId: 1 });
    // set recipients
    await mail.setRecipients([1]);

    const result = await Entry.findAndCountAll({
      offset: 0,
      limit: 10,
      order: [['id', 'DESC']],
      include: [
        {
          association: Entry.associations.mail,
          include: [
            {
              association: Mail.associations.recipients,
              through: {
                where: {
                  recipientId: 1
                }
              },
              required: true
            }
          ],
          required: true
        }
      ]
    });

    expect(result.count).to.equal(2);
    expect(result.rows[0].get({ plain: true })).to.deep.equal({
      id: 2,
      ownerId: 1,
      mailId: 1,
      mail: {
        id: 1,
        recipients: [
          {
            id: 1,
            MailRecipients: {
              mailId: 1,
              recipientId: 1
            }
          }
        ]
      }
    });
  });
});
