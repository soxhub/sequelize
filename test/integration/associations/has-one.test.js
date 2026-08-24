import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import Sequelize from '../../../index.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('HasOne'), () => {
  describe('Model.associations', () => {
    it('should store all assocations when associting to the same table multiple times', () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      Group.hasOne(User);
      Group.hasOne(User, { foreignKey: 'primaryGroupId', as: 'primaryUsers' });
      Group.hasOne(User, { foreignKey: 'secondaryGroupId', as: 'secondaryUsers' });

      expect(Object.keys(Group.associations)).to.deep.equal(['User', 'primaryUsers', 'secondaryUsers']);
    });
  });

  describe('get', () => {
    describe('multiple', () => {
      it('should fetch associations for multiple instances', async () => {
        const User = current.define('User', {}),
          Player = current.define('Player', {});

        Player.User = Player.hasOne(User, { as: 'user' });

        await current.sync({ force: true });

        const players = await Promise.all([
          Player.create(
            {
              id: 1,
              user: {}
            },
            {
              include: [Player.User]
            }
          ),
          Player.create(
            {
              id: 2,
              user: {}
            },
            {
              include: [Player.User]
            }
          ),
          Player.create({
            id: 3
          })
        ]);

        const result = await Player.User.get(players);

        expect(result[players[0].id].id).to.equal(players[0].user.id);
        expect(result[players[1].id].id).to.equal(players[1].user.id);
        expect(result[players[2].id]).to.equal(null);
      });
    });
  });

  describe('getAssocation', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING }),
          Group = sequelize.define('Group', { name: Support.Sequelize.STRING });

        Group.hasOne(User);

        await sequelize.sync({ force: true });

        const fakeUser = await User.create({ username: 'foo' });
        const user = await User.create({ username: 'foo' });
        const group = await Group.create({ name: 'bar' });
        const t = await sequelize.transaction();

        await group.setUser(user, { transaction: t });

        const groups = await Group.findAll();
        const associatedUser = await groups[0].getUser();

        expect(associatedUser).to.be.null;

        const transactionGroups = await Group.findAll({ transaction: t });
        const transactionUser = await transactionGroups[0].getUser({ transaction: t });

        expect(transactionUser).not.to.be.null;
        expect(transactionUser.id).to.equal(user.id);
        expect(transactionUser.id).not.to.equal(fakeUser.id);

        await t.rollback();
      });
    }

    it("should be able to handle a where object that's a first class citizen.", async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING, status: Sequelize.STRING });

      User.hasOne(Task);

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task', status: 'inactive' });

      await user.setTaskXYZ(task);

      const activeTask = await user.getTaskXYZ({ where: { status: 'active' } });

      expect(activeTask).to.be.null;
    });

    it('supports schemas', async () => {
      const User = current.define('User', { username: Support.Sequelize.STRING }).schema('admin'),
        Group = current.define('Group', { name: Support.Sequelize.STRING }).schema('admin');

      Group.hasOne(User);

      await current.dropAllSchemas();
      await current.createSchema('admin');
      await Group.sync({ force: true });
      await User.sync({ force: true });

      const [fakeUser, user, group] = await Promise.all([
        User.create({ username: 'foo' }),
        User.create({ username: 'foo' }),
        Group.create({ name: 'bar' })
      ]);

      await group.setUser(user);

      const groups = await Group.findAll();
      const associatedUser = await groups[0].getUser();

      expect(associatedUser).not.to.be.null;
      expect(associatedUser.id).to.equal(user.id);
      expect(associatedUser.id).not.to.equal(fakeUser.id);

      await current.dropSchema('admin');

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

        Group.hasOne(User);

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

    it('can set an association with predefined primary keys', async () => {
      const User = current.define('UserXYZZ', {
          userCoolIdTag: { type: Sequelize.INTEGER, primaryKey: true },
          username: Sequelize.STRING
        }),
        Task = current.define('TaskXYZZ', {
          taskOrSomething: { type: Sequelize.INTEGER, primaryKey: true },
          title: Sequelize.STRING
        });

      User.hasOne(Task, { foreignKey: 'userCoolIdTag' });

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ userCoolIdTag: 1, username: 'foo' });
      const task = await Task.create({ taskOrSomething: 1, title: 'bar' });

      await user.setTaskXYZZ(task);

      const associatedTask = await user.getTaskXYZZ();
      expect(associatedTask).not.to.be.null;

      await user.setTaskXYZZ(null);

      const _task = await user.getTaskXYZZ();
      expect(_task).to.be.null;
    });

    it('clears the association if null is passed', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING });

      User.hasOne(Task);

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await user.setTaskXYZ(task);

      const associatedTask = await user.getTaskXYZ();
      expect(associatedTask).not.to.equal(null);

      await user.setTaskXYZ(null);

      const clearedTask = await user.getTaskXYZ();
      expect(clearedTask).to.equal(null);
    });

    it('should throw a ForeignKeyConstraintError if the associated record does not exist', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING });

      User.hasOne(Task);

      await User.sync({ force: true });
      await Task.sync({ force: true });

      await expect(Task.create({ title: 'task', UserXYZId: 5 })).to.be.rejectedWith(
        Sequelize.ForeignKeyConstraintError
      );

      const task = await Task.create({ title: 'task' });

      await expect(Task.update({ title: 'taskUpdate', UserXYZId: 5 }, { where: { id: task.id } })).to.be.rejectedWith(
        Sequelize.ForeignKeyConstraintError
      );
    });

    it('supports passing the primary key instead of an object', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING });

      User.hasOne(Task);

      await current.sync({ force: true });

      const user = await User.create({});
      const task = await Task.create({ id: 19, title: 'task it!' });

      await user.setTaskXYZ(task.id);

      const associatedTask = await user.getTaskXYZ();

      expect(associatedTask.title).to.equal('task it!');
    });

    it('supports updating with a primary key instead of an object', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING });

      User.hasOne(Task);

      await current.sync({ force: true });

      const [user, task] = await Promise.all([
        User.create({ id: 1, username: 'foo' }),
        Task.create({ id: 20, title: 'bar' })
      ]);

      await user.setTaskXYZ(task.id);

      const associatedTask = await user.getTaskXYZ();
      expect(associatedTask).not.to.be.null;

      const task2 = await Task.create({ id: 2, title: 'bar2' });

      await user.setTaskXYZ(task2.id);

      const updatedTask = await user.getTaskXYZ();
      expect(updatedTask).not.to.be.null;
    });

    it('supports setting same association twice', async () => {
      const Home = current.define('home', {}),
        User = current.define('user');

      User.hasOne(Home);

      await current.sync({ force: true });

      const [home, user] = await Promise.all([Home.create(), User.create()]);

      await user.setHome(home);
      await user.setHome(home);

      await expect(user.getHome()).to.eventually.have.property('id', home.get('id'));
    });
  });

  describe('createAssociation', () => {
    it('creates an associated model instance', async () => {
      const User = current.define('User', { username: Sequelize.STRING }),
        Task = current.define('Task', { title: Sequelize.STRING });

      User.hasOne(Task);

      await current.sync({ force: true });

      const user = await User.create({ username: 'bob' });

      await user.createTask({ title: 'task' });

      const task = await user.getTask();

      expect(task).not.to.be.null;
      expect(task.title).to.equal('task');
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Sequelize.STRING }),
          Group = sequelize.define('Group', { name: Sequelize.STRING });

        User.hasOne(Group);

        await sequelize.sync({ force: true });

        const user = await User.create({ username: 'bob' });
        const t = await sequelize.transaction();

        await user.createGroup({ name: 'testgroup' }, { transaction: t });

        const users = await User.findAll();
        const group = await users[0].getGroup();

        expect(group).to.be.null;

        const transactionUsers = await User.findAll({ transaction: t });
        const transactionGroup = await transactionUsers[0].getGroup({ transaction: t });

        expect(transactionGroup).to.be.not.null;

        await t.rollback();
      });
    }
  });

  describe('foreign key', () => {
    it('should lowercase foreign keys when using underscored', () => {
      const User = current.define('User', { username: Sequelize.STRING }, { underscored: true }),
        Account = current.define('Account', { name: Sequelize.STRING }, { underscored: true });

      Account.hasOne(User);

      expect(User.rawAttributes.account_id).to.exist;
    });

    it('should use model name when using camelcase', () => {
      const User = current.define('User', { username: Sequelize.STRING }, { underscored: false }),
        Account = current.define('Account', { name: Sequelize.STRING }, { underscored: false });

      Account.hasOne(User);

      expect(User.rawAttributes.AccountId).to.exist;
    });

    it('should support specifying the field of a foreign key', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING, gender: Sequelize.STRING }),
        Task = current.define('TaskXYZ', { title: Sequelize.STRING, status: Sequelize.STRING });

      Task.hasOne(User, {
        foreignKey: {
          name: 'taskId',
          field: 'task_id'
        }
      });

      expect(User.rawAttributes.taskId).to.exist;
      expect(User.rawAttributes.taskId.field).to.equal('task_id');

      await Task.sync({ force: true });
      // Can't use Promise.all cause of foreign key references
      await User.sync({ force: true });

      const [createdUser, createdTask] = await Promise.all([
        User.create({ username: 'foo', gender: 'male' }),
        Task.create({ title: 'task', status: 'inactive' })
      ]);

      await createdTask.setUserXYZ(createdUser);

      const user = await createdTask.getUserXYZ();

      // the sql query should correctly look at task_id instead of taskId
      expect(user).to.not.be.null;

      const task = await Task.findOne({
        where: { title: 'task' },
        include: [User]
      });

      expect(task.UserXYZ).to.exist;
    });
  });

  describe('foreign key constraints', () => {
    it('are enabled by default', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      User.hasOne(Task); // defaults to set NULL

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await user.setTask(task);
      await user.destroy();
      await task.reload();

      expect(task.UserId).to.equal(null);
    });

    it('sets to CASCADE if allowNull: false', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      User.hasOne(Task, { foreignKey: { allowNull: false } }); // defaults to CASCADE

      await current.sync({ force: true });

      const user = await User.create({ username: 'foo' });

      await Task.create({ title: 'task', UserId: user.id });
      await user.destroy();

      const tasks = await Task.findAll();

      expect(tasks).to.be.empty;
    });

    it('should be possible to disable them', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      User.hasOne(Task, { constraints: false });

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await user.setTask(task);
      await user.destroy();
      await task.reload();

      expect(task.UserId).to.equal(user.id);
    });

    it('can cascade deletes', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      User.hasOne(Task, { onDelete: 'cascade' });

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });
      const task = await Task.create({ title: 'task' });

      await user.setTask(task);
      await user.destroy();

      const tasks = await Task.findAll();

      expect(tasks).to.have.length(0);
    });

    it('works when cascading a delete with hooks but there is no associate (i.e. "has zero")', async () => {
      const Task = current.define('Task', { title: Sequelize.STRING }),
        User = current.define('User', { username: Sequelize.STRING });

      User.hasOne(Task, { onDelete: 'cascade', hooks: true });

      await User.sync({ force: true });
      await Task.sync({ force: true });

      const user = await User.create({ username: 'foo' });

      await user.destroy();
    });

    // NOTE: mssql does not support changing an autoincrement primary key
    if (Support.getTestDialect() !== 'mssql') {
      it('can cascade updates', async () => {
        const Task = current.define('Task', { title: Sequelize.STRING }),
          User = current.define('User', { username: Sequelize.STRING });

        User.hasOne(Task, { onUpdate: 'cascade' });

        await User.sync({ force: true });
        await Task.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await user.setTask(task);

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

    if (current.dialect.supports.constraints.restrict) {
      it('can restrict deletes', async () => {
        const Task = current.define('Task', { title: Sequelize.STRING }),
          User = current.define('User', { username: Sequelize.STRING });

        User.hasOne(Task, { onDelete: 'restrict' });

        await User.sync({ force: true });
        await Task.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await user.setTask(task);

        await expect(user.destroy()).to.eventually.be.rejectedWith(Sequelize.ForeignKeyConstraintError);

        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
      });

      it('can restrict updates', async () => {
        const Task = current.define('Task', { title: Sequelize.STRING }),
          User = current.define('User', { username: Sequelize.STRING });

        User.hasOne(Task, { onUpdate: 'restrict' });

        await User.sync({ force: true });
        await Task.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const task = await Task.create({ title: 'task' });

        await user.setTask(task);

        // Changing the id of a DAO requires a little dance since
        // the `UPDATE` query generated by `save()` uses `id` in the
        // `WHERE` clause

        const tableName = user.sequelize.getQueryInterface().QueryGenerator.addSchema(user.constructor);
        await expect(
          user.sequelize.getQueryInterface().update(user, tableName, { id: 999 }, { id: user.id })
        ).to.eventually.be.rejectedWith(Sequelize.ForeignKeyConstraintError);

        // Should fail due to FK restriction
        const tasks = await Task.findAll();

        expect(tasks).to.have.length(1);
      });
    }
  });

  describe('Association column', () => {
    it('has correct type for non-id primary keys with non-integer type', async () => {
      const User = current.define('UserPKBT', {
        username: {
          type: Sequelize.STRING
        }
      });

      const Group = current.define('GroupPKBT', {
        name: {
          type: Sequelize.STRING,
          primaryKey: true
        }
      });

      Group.hasOne(User);

      await current.sync({ force: true });

      expect(User.rawAttributes.GroupPKBTName.type).to.an.instanceof(Sequelize.STRING);
    });
  });

  describe('Association options', () => {
    it('can specify data type for autogenerated relational keys', async () => {
      const User = current.define('UserXYZ', { username: Sequelize.STRING }),
        dataTypes = [Sequelize.INTEGER, Sequelize.BIGINT, Sequelize.STRING],
        Tasks = {};

      await Promise.all(
        dataTypes.map(async (dataType) => {
          const tableName = 'TaskXYZ_' + dataType.key;
          Tasks[dataType] = current.define(tableName, { title: Sequelize.STRING });

          User.hasOne(Tasks[dataType], { foreignKey: 'userId', keyType: dataType, constraints: false });

          await Tasks[dataType].sync({ force: true });

          expect(Tasks[dataType].rawAttributes.userId.type).to.be.an.instanceof(dataType);
        })
      );
    });

    describe('allows the user to provide an attribute definition object as foreignKey', () => {
      it('works with a column that hasnt been defined before', () => {
        const User = current.define('user', {});
        let Profile = current.define('project', {});

        User.hasOne(Profile, {
          foreignKey: {
            allowNull: false,
            name: 'uid'
          }
        });

        expect(Profile.rawAttributes.uid).to.be.ok;
        expect(Profile.rawAttributes.uid.references.model).to.equal(User.getTableName());
        expect(Profile.rawAttributes.uid.references.key).to.equal('id');
        expect(Profile.rawAttributes.uid.allowNull).to.be.false;

        // Let's clear it
        Profile = current.define('project', {});
        User.hasOne(Profile, {
          foreignKey: {
            allowNull: false,
            name: 'uid'
          }
        });

        expect(Profile.rawAttributes.uid).to.be.ok;
        expect(Profile.rawAttributes.uid.references.model).to.equal(User.getTableName());
        expect(Profile.rawAttributes.uid.references.key).to.equal('id');
        expect(Profile.rawAttributes.uid.allowNull).to.be.false;
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

        User.hasOne(Profile, { foreignKey: Profile.rawAttributes.user_id });

        expect(Profile.rawAttributes.user_id).to.be.ok;
        expect(Profile.rawAttributes.user_id.references.model).to.equal(User.getTableName());
        expect(Profile.rawAttributes.user_id.references.key).to.equal('uid');
        expect(Profile.rawAttributes.user_id.allowNull).to.be.false;
      });

      it('works when merging with an existing definition', () => {
        const User = current.define('user', {
            uid: {
              type: Sequelize.INTEGER,
              primaryKey: true
            }
          }),
          Project = current.define('project', {
            userUid: {
              type: Sequelize.INTEGER,
              defaultValue: 42
            }
          });

        User.hasOne(Project, { foreignKey: { allowNull: false } });

        expect(Project.rawAttributes.userUid).to.be.ok;
        expect(Project.rawAttributes.userUid.allowNull).to.be.false;
        expect(Project.rawAttributes.userUid.references.model).to.equal(User.getTableName());
        expect(Project.rawAttributes.userUid.references.key).to.equal('uid');
        expect(Project.rawAttributes.userUid.defaultValue).to.equal(42);
      });
    });

    it('should throw an error if an association clashes with the name of an already define attribute', () => {
      const User = current.define('user', {
          attribute: Sequelize.STRING
        }),
        Attribute = current.define('attribute', {});

      expect(User.hasOne.bind(User, Attribute)).to.throw(
        "Naming collision between attribute 'attribute' and association 'attribute' on model user. To remedy this, change either foreignKey or as in your association definition"
      );
    });
  });

  describe('Counter part', () => {
    describe('BelongsTo', () => {
      it('should only generate one foreign key', () => {
        const Orders = current.define('Orders', {}, { timestamps: false }),
          InternetOrders = current.define('InternetOrders', {}, { timestamps: false });

        InternetOrders.belongsTo(Orders, {
          foreignKeyConstraint: true
        });
        Orders.hasOne(InternetOrders, {
          foreignKeyConstraint: true
        });

        expect(Object.keys(InternetOrders.rawAttributes).length).to.equal(2);
        expect(InternetOrders.rawAttributes.OrderId).to.be.ok;
        expect(InternetOrders.rawAttributes.OrdersId).not.to.be.ok;
      });
    });
  });
});
