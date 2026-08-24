import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';
import _ from 'lodash';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('BelongsToMany'), () => {
  describe('getAssociations', () => {
    let User;
    let Task;
    let seededTasks;

    beforeEach(async () => {
      User = current.define('User', { username: DataTypes.STRING });
      Task = current.define('Task', { title: DataTypes.STRING, active: DataTypes.BOOLEAN });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [john, task1, task2] = await Promise.all([
        User.create({ username: 'John' }),
        Task.create({ title: 'Get rich', active: true }),
        Task.create({ title: 'Die trying', active: false })
      ]);

      seededTasks = [task1, task2];

      await john.setTasks([task1, task2]);
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);

        const Article = sequelize.define('Article', { title: DataTypes.STRING });
        const Label = sequelize.define('Label', { text: DataTypes.STRING });

        Article.belongsToMany(Label, { through: 'ArticleLabels' });
        Label.belongsToMany(Article, { through: 'ArticleLabels' });

        await sequelize.sync({ force: true });

        const [article, label, t] = await Promise.all([
          Article.create({ title: 'foo' }),
          Label.create({ text: 'bar' }),
          sequelize.transaction()
        ]);

        await article.setLabels([label], { transaction: t });

        const articles = await Article.findAll({ transaction: t });
        expect(await articles[0].getLabels()).to.have.length(0);

        const transactionArticles = await Article.findAll({ transaction: t });
        expect(await transactionArticles[0].getLabels({ transaction: t })).to.have.length(1);

        await t.rollback();
      });
    }

    it('gets all associated objects with all fields', async () => {
      const john = await User.findOne({ where: { username: 'John' } });
      const tasks = await john.getTasks();

      tasks[0].attributes.forEach((attr) => {
        expect(tasks[0]).to.have.property(attr);
      });
    });

    it('gets all associated objects when no options are passed', async () => {
      const john = await User.findOne({ where: { username: 'John' } });

      expect(await john.getTasks()).to.have.length(2);
    });

    it('only get objects that fulfill the options', async () => {
      const john = await User.findOne({ where: { username: 'John' } });

      const tasks = await john.getTasks({
        where: {
          active: true
        }
      });

      expect(tasks).to.have.length(1);
    });

    it('supports a where not in', async () => {
      const john = await User.findOne({
        where: {
          username: 'John'
        }
      });

      const tasks = await john.getTasks({
        where: {
          title: {
            not: ['Get rich']
          }
        }
      });

      expect(tasks).to.have.length(1);
    });

    it('supports a where not in on the primary key', async () => {
      const john = await User.findOne({
        where: {
          username: 'John'
        }
      });

      const tasks = await john.getTasks({
        where: {
          id: {
            not: [seededTasks[0].get('id')]
          }
        }
      });

      expect(tasks).to.have.length(1);
    });

    it('only gets objects that fulfill options with a formatted value', async () => {
      const john = await User.findOne({ where: { username: 'John' } });

      expect(await john.getTasks({ where: { active: true } })).to.have.length(1);
    });

    it('get associated objects with an eager load', async () => {
      const john = await User.findOne({ where: { username: 'John' }, include: [Task] });

      expect(john.Tasks).to.have.length(2);
    });

    it('get associated objects with an eager load with conditions but not required', async () => {
      const Label = current.define('Label', { title: DataTypes.STRING, isActive: DataTypes.BOOLEAN });

      Task.hasMany(Label);
      Label.belongsTo(Task);

      await Label.sync({ force: true });

      const john = await User.findOne({
        where: { username: 'John' },
        include: [
          { model: Task, required: false, include: [{ model: Label, required: false, where: { isActive: true } }] }
        ]
      });

      expect(john.Tasks).to.have.length(2);
    });

    it('should support schemas', async () => {
      const AcmeUser = current
          .define('User', {
            username: DataTypes.STRING
          })
          .schema('acme', '_'),
        AcmeProject = current
          .define('Project', {
            title: DataTypes.STRING,
            active: DataTypes.BOOLEAN
          })
          .schema('acme', '_'),
        AcmeProjectUsers = current
          .define('ProjectUsers', {
            status: DataTypes.STRING,
            data: DataTypes.INTEGER
          })
          .schema('acme', '_');

      AcmeUser.belongsToMany(AcmeProject, { through: AcmeProjectUsers });
      AcmeProject.belongsToMany(AcmeUser, { through: AcmeProjectUsers });

      await current.dropAllSchemas();
      await current.createSchema('acme');
      await Promise.all([AcmeUser.sync({ force: true }), AcmeProject.sync({ force: true })]);
      await AcmeProjectUsers.sync({ force: true });

      const u = await AcmeUser.create();
      const p = await AcmeProject.create();

      await u.addProject(p, { through: { status: 'active', data: 42 } });

      const projects = await u.getProjects();

      expect(projects).to.have.length(1);
      const project = projects[0];
      expect(project.ProjectUsers).to.be.ok;
      expect(project.status).not.to.exist;
      expect(project.ProjectUsers.status).to.equal('active');

      await current.dropSchema('acme');

      const schemas = await current.showAllSchemas();

      expect(schemas).to.be.empty;
    });

    it('supports custom primary keys and foreign keys', async () => {
      const CustomPkUser = current.define(
        'User',
        {
          id_user: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false
          }
        },
        {
          tableName: 'tbl_user'
        }
      );

      const Group = current.define(
        'Group',
        {
          id_group: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
          }
        },
        {
          tableName: 'tbl_group'
        }
      );

      const User_has_Group = current.define(
        'User_has_Group',
        {},
        {
          tableName: 'tbl_user_has_group'
        }
      );

      CustomPkUser.belongsToMany(Group, { as: 'groups', through: User_has_Group, foreignKey: 'id_user' });
      Group.belongsToMany(CustomPkUser, { as: 'users', through: User_has_Group, foreignKey: 'id_group' });

      await current.sync({ force: true });

      const [created, group] = await Promise.all([CustomPkUser.create(), Group.create()]);

      await created.addGroup(group);

      const user = await CustomPkUser.findOne({
        where: {}
      });

      await user.getGroups();
    });

    it('supports primary key attributes with different field names', async () => {
      const FieldNameUser = current.define(
        'User',
        {
          id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'user_id'
          }
        },
        {
          tableName: 'tbl_user'
        }
      );

      const Group = current.define(
        'Group',
        {
          id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'group_id'
          }
        },
        {
          tableName: 'tbl_group'
        }
      );

      const User_has_Group = current.define(
        'User_has_Group',
        {},
        {
          tableName: 'tbl_user_has_group'
        }
      );

      FieldNameUser.belongsToMany(Group, { through: User_has_Group });
      Group.belongsToMany(FieldNameUser, { through: User_has_Group });

      await current.sync({ force: true });

      const [user, group] = await Promise.all([FieldNameUser.create(), Group.create()]);

      await user.addGroup(group);

      await Promise.all([
        FieldNameUser.findOne({
          where: {},
          include: [Group]
        }),
        FieldNameUser.findAll({
          include: [Group]
        })
      ]);
    });

    it('supports primary key attributes with different field names where parent include is required', async () => {
      const FieldNameUser = current.define(
        'User',
        {
          id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'user_id'
          }
        },
        {
          tableName: 'tbl_user'
        }
      );

      const Company = current.define(
        'Company',
        {
          id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'company_id'
          }
        },
        {
          tableName: 'tbl_company'
        }
      );

      const Group = current.define(
        'Group',
        {
          id: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            field: 'group_id'
          }
        },
        {
          tableName: 'tbl_group'
        }
      );

      const Company_has_Group = current.define(
        'Company_has_Group',
        {},
        {
          tableName: 'tbl_company_has_group'
        }
      );

      FieldNameUser.belongsTo(Company);
      Company.hasMany(FieldNameUser);
      Company.belongsToMany(Group, { through: Company_has_Group });
      Group.belongsToMany(Company, { through: Company_has_Group });

      await current.sync({ force: true });

      const [user, group, company] = await Promise.all([FieldNameUser.create(), Group.create(), Company.create()]);

      await Promise.all([user.setCompany(company), company.addGroup(group)]);

      await Promise.all([
        FieldNameUser.findOne({
          where: {},
          include: [{ model: Company, include: [Group] }]
        }),
        FieldNameUser.findAll({
          include: [{ model: Company, include: [Group] }]
        }),
        FieldNameUser.findOne({
          where: {},
          include: [{ model: Company, required: true, include: [Group] }]
        }),
        FieldNameUser.findAll({
          include: [{ model: Company, required: true, include: [Group] }]
        })
      ]);
    });
  });

  describe('countAssociations', () => {
    let User;
    let Task;
    let UserTask;
    let user;

    beforeEach(async () => {
      User = current.define('User', {
        username: DataTypes.STRING
      });
      Task = current.define('Task', {
        title: DataTypes.STRING,
        active: DataTypes.BOOLEAN
      });
      UserTask = current.define('UserTask', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        started: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        }
      });

      User.belongsToMany(Task, { through: UserTask });
      Task.belongsToMany(User, { through: UserTask });

      await current.sync({ force: true });

      const [john, task1, task2] = await Promise.all([
        User.create({ username: 'John' }),
        Task.create({ title: 'Get rich', active: true }),
        Task.create({ title: 'Die trying', active: false })
      ]);

      user = john;

      await john.setTasks([task1, task2]);
    });

    it('should count all associations', () => {
      return expect(user.countTasks({})).to.eventually.equal(2);
    });

    it('should count filtered associations', () => {
      return expect(
        user.countTasks({
          where: {
            active: true
          }
        })
      ).to.eventually.equal(1);
    });

    it('should count scoped associations', () => {
      User.belongsToMany(Task, {
        as: 'activeTasks',
        through: UserTask,
        scope: {
          active: true
        }
      });

      return expect(user.countActiveTasks({})).to.eventually.equal(1);
    });

    it('should count scoped through associations', async () => {
      User.belongsToMany(Task, {
        as: 'startedTasks',
        through: {
          model: UserTask,
          scope: {
            started: true
          }
        }
      });

      await Promise.all([
        (async () => {
          const task = await Task.create();
          return await user.addTask(task, {
            through: { started: true }
          });
        })(),
        (async () => {
          const task = await Task.create();
          return await user.addTask(task, {
            through: { started: true }
          });
        })()
      ]);

      await expect(user.countStartedTasks({})).to.eventually.equal(2);
    });
  });

  describe('setAssociations', () => {
    it('clears associations when passing null to the set-method', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'task' })]);

      await task.setUsers([user]);

      expect(await task.getUsers()).to.have.length(1);

      await task.setUsers(null);

      expect(await task.getUsers()).to.have.length(0);
    });

    it('should be able to set twice with custom primary keys', async () => {
      const User = current.define('User', {
          uid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          username: DataTypes.STRING
        }),
        Task = current.define('Task', {
          tid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          title: DataTypes.STRING
        });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user1, user2, task] = await Promise.all([
        User.create({ username: 'foo' }),
        User.create({ username: 'bar' }),
        Task.create({ title: 'task' })
      ]);

      await task.setUsers([user1]);

      user2.user_has_task = { usertitle: 'Something' };

      await task.setUsers([user1, user2]);

      expect(await task.getUsers()).to.have.length(2);
    });

    it('joins an association with custom primary keys', async () => {
      const Group = current.define('group', {
          group_id: { type: DataTypes.INTEGER, primaryKey: true },
          name: DataTypes.STRING(64)
        }),
        Member = current.define('member', {
          member_id: { type: DataTypes.INTEGER, primaryKey: true },
          email: DataTypes.STRING(64)
        });

      Group.belongsToMany(Member, { through: 'group_members', foreignKey: 'group_id', otherKey: 'member_id' });
      Member.belongsToMany(Group, { through: 'group_members', foreignKey: 'member_id', otherKey: 'group_id' });

      await current.sync({ force: true });

      const [group, member] = await Promise.all([
        Group.create({ group_id: 1, name: 'Group1' }),
        Member.create({ member_id: 10, email: 'team@sequelizejs.com' })
      ]);

      await group.addMember(member);

      const members = await group.getMembers();

      expect(members).to.be.instanceof(Array);
      expect(members).to.have.length(1);
      expect(members[0].member_id).to.equal(10);
      expect(members[0].email).to.equal('team@sequelizejs.com');
    });

    it('supports passing the primary key instead of an object', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user, task1, task2] = await Promise.all([
        User.create({ id: 12 }),
        Task.create({ id: 50, title: 'get started' }),
        Task.create({ id: 5, title: 'wat' })
      ]);

      await user.addTask(task1.id);
      await user.setTasks([task2.id]);

      const tasks = await user.getTasks();

      expect(tasks).to.have.length(1);
      expect(tasks[0].title).to.equal('wat');
    });

    it('using scope to set associations', async () => {
      const ItemTag = current.define('ItemTag', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          tag_id: { type: DataTypes.INTEGER, unique: false },
          taggable: { type: DataTypes.STRING },
          taggable_id: { type: DataTypes.INTEGER, unique: false }
        }),
        Tag = current.define('Tag', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        }),
        Comment = current.define('Comment', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        }),
        Post = current.define('Post', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        });

      Post.belongsToMany(Tag, {
        through: { model: ItemTag, unique: false, scope: { taggable: 'post' } },
        foreignKey: 'taggable_id'
      });

      Comment.belongsToMany(Tag, {
        through: { model: ItemTag, unique: false, scope: { taggable: 'comment' } },
        foreignKey: 'taggable_id'
      });

      await current.sync({ force: true });

      const [post, comment, tag] = await Promise.all([
        Post.create({ name: 'post1' }),
        Comment.create({ name: 'comment1' }),
        Tag.create({ name: 'tag1' })
      ]);

      await post.setTags([tag]);
      await comment.setTags([tag]);

      const [postTags, commentTags] = await Promise.all([post.getTags(), comment.getTags()]);

      expect(postTags).to.have.length(1);
      expect(commentTags).to.have.length(1);
    });

    it('updating association via set associations with scope', async () => {
      const ItemTag = current.define('ItemTag', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          tag_id: { type: DataTypes.INTEGER, unique: false },
          taggable: { type: DataTypes.STRING },
          taggable_id: { type: DataTypes.INTEGER, unique: false }
        }),
        Tag = current.define('Tag', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        }),
        Comment = current.define('Comment', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        }),
        Post = current.define('Post', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        });

      Post.belongsToMany(Tag, {
        through: { model: ItemTag, unique: false, scope: { taggable: 'post' } },
        foreignKey: 'taggable_id'
      });

      Comment.belongsToMany(Tag, {
        through: { model: ItemTag, unique: false, scope: { taggable: 'comment' } },
        foreignKey: 'taggable_id'
      });

      await current.sync({ force: true });

      const [post, comment, tag, secondTag] = await Promise.all([
        Post.create({ name: 'post1' }),
        Comment.create({ name: 'comment1' }),
        Tag.create({ name: 'tag1' }),
        Tag.create({ name: 'tag2' })
      ]);

      await post.setTags([tag, secondTag]);
      await comment.setTags([tag, secondTag]);
      await post.setTags([tag]);

      const [postTags, commentTags] = await Promise.all([post.getTags(), comment.getTags()]);

      expect(postTags).to.have.length(1);
      expect(commentTags).to.have.length(2);
    });
  });

  describe('createAssociations', () => {
    it('creates a new associated object', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const task = await Task.create({ title: 'task' });
      const createdUser = await task.createUser({ username: 'foo' });

      expect(createdUser).to.be.instanceof(User);
      expect(createdUser.username).to.equal('foo');

      expect(await task.getUsers()).to.have.length(1);
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);

        const TxUser = sequelize.define('User', { username: DataTypes.STRING });
        const TxTask = sequelize.define('Task', { title: DataTypes.STRING });

        TxUser.belongsToMany(TxTask, { through: 'UserTasks' });
        TxTask.belongsToMany(TxUser, { through: 'UserTasks' });

        await sequelize.sync({ force: true });

        const [txTask, t] = await Promise.all([TxTask.create({ title: 'task' }), sequelize.transaction()]);

        await txTask.createUser({ username: 'foo' }, { transaction: t });

        expect(await txTask.getUsers()).to.have.length(0);
        expect(await txTask.getUsers({ transaction: t })).to.have.length(1);

        await t.rollback();
      });
    }

    it('supports setting through table attributes', async () => {
      const User = current.define('user', {}),
        Group = current.define('group', {}),
        UserGroups = current.define('user_groups', {
          isAdmin: Sequelize.BOOLEAN
        });

      User.belongsToMany(Group, { through: UserGroups });
      Group.belongsToMany(User, { through: UserGroups });

      await current.sync({ force: true });

      const group = await Group.create({});

      await Promise.all([
        group.createUser({ id: 1 }, { through: { isAdmin: true } }),
        group.createUser({ id: 2 }, { through: { isAdmin: false } })
      ]);

      const userGroups = await UserGroups.findAll();

      userGroups.sort((a, b) => {
        return a.userId < b.userId ? -1 : 1;
      });
      expect(userGroups[0].userId).to.equal(1);
      expect(userGroups[0].isAdmin).to.be.ok;
      expect(userGroups[1].userId).to.equal(2);
      expect(userGroups[1].isAdmin).not.to.be.ok;
    });

    it('supports using the field parameter', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const task = await Task.create({ title: 'task' });
      const createdUser = await task.createUser({ username: 'foo' }, { fields: ['username'] });

      expect(createdUser).to.be.instanceof(User);
      expect(createdUser.username).to.equal('foo');

      expect(await task.getUsers()).to.have.length(1);
    });
  });

  describe('addAssociations', () => {
    it('supports both single instance and array', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user, task1, task2] = await Promise.all([
        User.create({ id: 12 }),
        Task.create({ id: 50, title: 'get started' }),
        Task.create({ id: 52, title: 'get done' })
      ]);

      await Promise.all([user.addTask(task1), user.addTask([task2])]);

      const tasks = await user.getTasks();

      expect(tasks).to.have.length(2);
      expect(
        _.find(tasks, (item) => {
          return item.title === 'get started';
        })
      ).to.be.ok;
      expect(
        _.find(tasks, (item) => {
          return item.title === 'get done';
        })
      ).to.be.ok;
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);

        const TxUser = sequelize.define('User', { username: DataTypes.STRING });
        const TxTask = sequelize.define('Task', { title: DataTypes.STRING });

        TxUser.belongsToMany(TxTask, { through: 'UserTasks' });
        TxTask.belongsToMany(TxUser, { through: 'UserTasks' });

        await sequelize.sync({ force: true });

        const [txUser, txTask, t] = await Promise.all([
          TxUser.create({ username: 'foo' }),
          TxTask.create({ title: 'task' }),
          sequelize.transaction()
        ]);

        await txTask.addUser(txUser, { transaction: t });

        expect(await txTask.hasUser(txUser)).to.be.false;
        expect(await txTask.hasUser(txUser, { transaction: t })).to.be.true;

        await t.rollback();
      });

      it('supports transactions when updating a through model', async () => {
        const sequelize = await Support.prepareTransactionTest(current);

        const TxUser = sequelize.define('User', { username: DataTypes.STRING });
        const TxTask = sequelize.define('Task', { title: DataTypes.STRING });

        const TxUserTask = sequelize.define('UserTask', {
          status: Sequelize.STRING
        });

        TxUser.belongsToMany(TxTask, { through: TxUserTask });
        TxTask.belongsToMany(TxUser, { through: TxUserTask });

        await sequelize.sync({ force: true });

        const [txUser, txTask, t] = await Promise.all([
          TxUser.create({ username: 'foo' }),
          TxTask.create({ title: 'task' }),
          sequelize.transaction({ isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED })
        ]);

        await txTask.addUser(txUser, { through: { status: 'pending' } }); // Create without transaction, so the old value is accesible from outside the transaction
        await txTask.addUser(txUser, { transaction: t, through: { status: 'completed' } }); // Add an already exisiting user in a transaction, updating a value in the join table

        const [tasks, transactionTasks] = await Promise.all([txUser.getTasks(), txUser.getTasks({ transaction: t })]);

        expect(tasks[0].UserTask.status).to.equal('pending');
        expect(transactionTasks[0].UserTask.status).to.equal('completed');

        await t.rollback();
      });
    }

    it('supports passing the primary key instead of an object', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user, task] = await Promise.all([User.create({ id: 12 }), Task.create({ id: 50, title: 'get started' })]);

      await user.addTask(task.id);

      const tasks = await user.getTasks();

      expect(tasks[0].title).to.equal('get started');
    });

    it('should not pass indexes to the join table', () => {
      const User = current.define(
        'User',
        { username: DataTypes.STRING },
        {
          indexes: [
            {
              name: 'username_unique',
              unique: true,
              method: 'BTREE',
              fields: ['username']
            }
          ]
        }
      );
      const Task = current.define(
        'Task',
        { title: DataTypes.STRING },
        {
          indexes: [
            {
              name: 'title_index',
              method: 'BTREE',
              fields: ['title']
            }
          ]
        }
      );
      //create associations
      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });
      return current.sync({ force: true });
    });
  });

  describe('addMultipleAssociations', () => {
    it('supports both single instance and array', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });

      const [user, task1, task2] = await Promise.all([
        User.create({ id: 12 }),
        Task.create({ id: 50, title: 'get started' }),
        Task.create({ id: 52, title: 'get done' })
      ]);

      await Promise.all([user.addTasks(task1), user.addTasks([task2])]);

      const tasks = await user.getTasks();

      expect(tasks).to.have.length(2);
      expect(
        _.find(tasks, (item) => {
          return item.title === 'get started';
        })
      ).to.be.ok;
      expect(
        _.find(tasks, (item) => {
          return item.title === 'get done';
        })
      ).to.be.ok;
    });

    it('adds associations without removing the current ones', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      await current.sync({ force: true });
      await User.bulkCreate([{ username: 'foo ' }, { username: 'bar ' }, { username: 'baz ' }]);

      const [task, users] = await Promise.all([Task.create({ title: 'task' }), User.findAll()]);

      await task.setUsers([users[0]]);
      await task.addUsers([users[1], users[2]]);

      expect(await task.getUsers()).to.have.length(3);

      // Re-add user 0's object, this should be harmless
      // Re-add user 0's id, this should be harmless
      await Promise.all([
        expect(task.addUsers([users[0]])).not.to.be.rejected,
        expect(task.addUsers([users[0].id])).not.to.be.rejected
      ]);

      expect(await task.getUsers()).to.have.length(3);
    });
  });

  describe('through model validations', () => {
    let project;
    let employee;

    beforeEach(async () => {
      const Project = current.define('Project', {
        name: Sequelize.STRING
      });

      const Employee = current.define('Employee', {
        name: Sequelize.STRING
      });

      const Participation = current.define('Participation', {
        role: {
          type: Sequelize.STRING,
          allowNull: false,
          validate: {
            len: {
              args: [2, 50],
              msg: 'too bad'
            }
          }
        }
      });

      Project.belongsToMany(Employee, { as: 'Participants', through: Participation });
      Employee.belongsToMany(Project, { as: 'Participations', through: Participation });

      await current.sync({ force: true });

      [project, employee] = await Promise.all([
        Project.create({ name: 'project 1' }),
        Employee.create({ name: 'employee 1' })
      ]);
    });

    it('runs on add', () => {
      return expect(project.addParticipant(employee, { through: { role: '' } })).to.be.rejected;
    });

    it('runs on set', () => {
      return expect(project.setParticipants([employee], { through: { role: '' } })).to.be.rejected;
    });

    it('runs on create', () => {
      return expect(project.createParticipant({ name: 'employee 2' }, { through: { role: '' } })).to.be.rejected;
    });
  });

  describe('optimizations using bulk create, destroy and update', () => {
    let User;
    let Task;

    beforeEach(() => {
      User = current.define('User', { username: DataTypes.STRING }, { timestamps: false });
      Task = current.define('Task', { title: DataTypes.STRING }, { timestamps: false });

      User.belongsToMany(Task, { through: 'UserTasks' });
      Task.belongsToMany(User, { through: 'UserTasks' });

      return current.sync({ force: true });
    });

    it('uses one insert into statement', async () => {
      const spy = sinon.spy();

      const [user, task1, task2] = await Promise.all([
        User.create({ username: 'foo' }),
        Task.create({ id: 12, title: 'task1' }),
        Task.create({ id: 15, title: 'task2' })
      ]);

      await user.setTasks([task1, task2], {
        logging: spy
      });

      expect(spy.calledTwice).to.be.ok;
    });

    it('uses one delete from statement', async () => {
      const spy = sinon.spy();

      const [user, task1, task2] = await Promise.all([
        User.create({ username: 'foo' }),
        Task.create({ title: 'task1' }),
        Task.create({ title: 'task2' })
      ]);

      await user.setTasks([task1, task2]);

      await user.setTasks(null, {
        logging: spy
      });

      expect(spy.calledTwice).to.be.ok;
    });
  }); // end optimization using bulk create, destroy and update

  describe('join table creation', () => {
    let User;
    let Task;

    beforeEach(() => {
      User = current.define('User', { username: DataTypes.STRING }, { tableName: 'users' });
      Task = current.define('Task', { title: DataTypes.STRING }, { tableName: 'tasks' });

      User.belongsToMany(Task, { through: 'user_has_tasks' });
      Task.belongsToMany(User, { through: 'user_has_tasks' });

      return current.sync({ force: true });
    });

    it('should work with non integer primary keys', () => {
      const Beacons = current.define('Beacon', {
        id: {
          primaryKey: true,
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4
        },
        name: {
          type: DataTypes.STRING
        }
      });

      // Usar not to clash with the beforEach definition
      const Users = current.define('Usar', {
        name: {
          type: DataTypes.STRING
        }
      });

      Beacons.belongsToMany(Users, { through: 'UserBeacons' });
      Users.belongsToMany(Beacons, { through: 'UserBeacons' });

      return current.sync({ force: true });
    });

    it('makes join table non-paranoid by default', () => {
      const paranoidSequelize = Support.createSequelizeInstance({
          define: {
            paranoid: true
          }
        }),
        ParanoidUser = paranoidSequelize.define('ParanoidUser', {}),
        ParanoidTask = paranoidSequelize.define('ParanoidTask', {});

      ParanoidUser.belongsToMany(ParanoidTask, { through: 'UserTasks' });
      ParanoidTask.belongsToMany(ParanoidUser, { through: 'UserTasks' });

      expect(ParanoidUser.options.paranoid).to.be.ok;
      expect(ParanoidTask.options.paranoid).to.be.ok;

      for (const association of Object.values(ParanoidUser.associations)) {
        expect(association.through.model.options.paranoid).not.to.be.ok;
      }
    });
  });

  describe('foreign keys', () => {
    it('should correctly generate underscored keys', () => {
      const User = current.define(
        'User',
        {},
        {
          tableName: 'users',
          underscored: true,
          timestamps: false
        }
      );

      const Place = current.define(
        'Place',
        {
          //fields
        },
        {
          tableName: 'places',
          underscored: true,
          timestamps: false
        }
      );

      User.belongsToMany(Place, { through: 'user_places' });
      Place.belongsToMany(User, { through: 'user_places' });

      const attributes = current.model('user_places').rawAttributes;

      expect(attributes.place_id).to.be.ok;
      expect(attributes.user_id).to.be.ok;
    });

    it('should infer otherKey from paired BTM relationship with a through string defined', () => {
      const User = current.define('User', {});
      const Place = current.define('Place', {});

      const Places = User.belongsToMany(Place, { through: 'user_places', foreignKey: 'user_id' });
      const Users = Place.belongsToMany(User, { through: 'user_places', foreignKey: 'place_id' });

      expect(Places.foreignKey).to.equal('user_id');
      expect(Users.foreignKey).to.equal('place_id');

      expect(Places.otherKey).to.equal('place_id');
      expect(Users.otherKey).to.equal('user_id');
    });

    it('should infer otherKey from paired BTM relationship with a through model defined', () => {
      const User = current.define('User', {});
      const Place = current.define('User', {});
      const UserPlace = current.define(
        'UserPlace',
        { id: { primaryKey: true, type: DataTypes.INTEGER, autoIncrement: true } },
        { timestamps: false }
      );

      const Places = User.belongsToMany(Place, { through: UserPlace, foreignKey: 'user_id' });
      const Users = Place.belongsToMany(User, { through: UserPlace, foreignKey: 'place_id' });

      expect(Places.foreignKey).to.equal('user_id');
      expect(Users.foreignKey).to.equal('place_id');

      expect(Places.otherKey).to.equal('place_id');
      expect(Users.otherKey).to.equal('user_id');

      expect(Object.keys(UserPlace.rawAttributes).length).to.equal(3); // Defined primary key and two foreign keys
    });
  });

  describe('foreign key with fields specified', () => {
    let User;
    let Project;
    let Group;

    beforeEach(() => {
      User = current.define('User', { name: DataTypes.STRING });
      Project = current.define('Project', { name: DataTypes.STRING });
      // Registered only so sync() creates its table; no test references it directly.
      current.define('Puppy', { breed: DataTypes.STRING });

      // doubly linked has many
      User.belongsToMany(Project, {
        through: 'user_projects',
        as: 'Projects',
        foreignKey: {
          field: 'user_id',
          name: 'userId'
        },
        otherKey: {
          field: 'project_id',
          name: 'projectId'
        }
      });
      Project.belongsToMany(User, {
        through: 'user_projects',
        as: 'Users',
        foreignKey: {
          field: 'project_id',
          name: 'projectId'
        },
        otherKey: {
          field: 'user_id',
          name: 'userId'
        }
      });
    });

    it('should correctly get associations even after a child instance is deleted', async () => {
      const spy = sinon.spy();

      await current.sync({ force: true });

      const [created, project1, project2] = await Promise.all([
        User.create({ name: 'Matt' }),
        Project.create({ name: 'Good Will Hunting' }),
        Project.create({ name: 'The Departed' })
      ]);

      await created.addProjects([project1, project2], {
        logging: spy
      });

      expect(spy.calledTwice).to.be.true;
      spy.resetHistory();

      const projects = await created.getProjects({
        logging: spy
      });

      expect(spy.calledOnce).to.be.ok;
      expect(projects[0]).to.be.ok;

      await projects[0].destroy();

      const user = await User.findOne({
        where: { id: created.id },
        include: [{ model: Project, as: 'Projects' }]
      });

      expect(user.Projects[0]).to.be.ok;
    });

    it('should correctly get associations when doubly linked', async () => {
      const spy = sinon.spy();

      await current.sync({ force: true });

      const [user, created] = await Promise.all([
        User.create({ name: 'Matt' }),
        Project.create({ name: 'Good Will Hunting' })
      ]);

      await user.addProject(created, { logging: spy });

      expect(spy.calledTwice).to.be.ok; // Once for SELECT, once for INSERT
      spy.resetHistory();

      const projects = await user.getProjects({
        logging: spy
      });

      const project = projects[0];
      expect(spy.calledOnce).to.be.ok;
      spy.resetHistory();

      expect(project).to.be.ok;

      await user.removeProject(project, {
        logging: spy
      });

      expect(spy.calledOnce).to.be.true;
    });

    it('should be able to handle nested includes properly', async () => {
      Group = current.define('Group', { groupName: DataTypes.STRING });

      Group.belongsToMany(User, {
        through: 'group_users',
        as: 'Users',
        foreignKey: {
          field: 'group_id',
          name: 'groupId'
        },
        otherKey: {
          field: 'user_id',
          name: 'userId'
        }
      });
      User.belongsToMany(Group, {
        through: 'group_users',
        as: 'Groups',
        foreignKey: {
          field: 'user_id',
          name: 'userId'
        },
        otherKey: {
          field: 'group_id',
          name: 'groupId'
        }
      });

      await current.sync({ force: true });

      const [created, user, project] = await Promise.all([
        Group.create({ groupName: 'The Illuminati' }),
        User.create({ name: 'Matt' }),
        Project.create({ name: 'Good Will Hunting' })
      ]);

      await user.addProject(project);
      await created.addUser(user);

      // get the group and include both the users in the group and their project's
      const groups = await Group.findAll({
        where: { id: created.id },
        include: [
          {
            model: User,
            as: 'Users',
            include: [{ model: Project, as: 'Projects' }]
          }
        ]
      });

      const group = groups[0];
      expect(group).to.be.ok;

      const foundUser = group.Users[0];
      expect(foundUser).to.be.ok;

      const foundProject = foundUser.Projects[0];
      expect(foundProject).to.be.ok;
      expect(foundProject.name).to.equal('Good Will Hunting');
    });
  });

  describe('primary key handling for join table', () => {
    let User;
    let Task;
    let UserTasks;
    let UserTasks2;
    let UsersTasks;

    beforeEach(() => {
      User = current.define('User', { username: DataTypes.STRING }, { tableName: 'users' });
      Task = current.define('Task', { title: DataTypes.STRING }, { tableName: 'tasks' });
    });

    it('removes the primary key if it was added by sequelize', () => {
      UserTasks = current.define('usertasks', {});

      User.belongsToMany(Task, { through: UserTasks });
      Task.belongsToMany(User, { through: UserTasks });

      expect(Object.keys(UserTasks.primaryKeys).sort()).to.deep.equal(['TaskId', 'UserId']);
    });

    it('keeps the primary key if it was added by the user', () => {
      UserTasks = current.define('usertasks', {
        id: {
          type: Sequelize.INTEGER,
          autoincrement: true,
          primaryKey: true
        }
      });
      UserTasks2 = current.define('usertasks2', {
        userTasksId: {
          type: Sequelize.INTEGER,
          autoincrement: true,
          primaryKey: true
        }
      });

      User.belongsToMany(Task, { through: UserTasks });
      Task.belongsToMany(User, { through: UserTasks });

      User.belongsToMany(Task, { through: UserTasks2 });
      Task.belongsToMany(User, { through: UserTasks2 });

      expect(Object.keys(UserTasks.primaryKeys)).to.deep.equal(['id']);
      expect(Object.keys(UserTasks2.primaryKeys)).to.deep.equal(['userTasksId']);

      for (const model of [UserTasks, UserTasks2]) {
        const fk = Object.keys(model.options.uniqueKeys)[0];
        expect(model.options.uniqueKeys[fk].fields.sort()).to.deep.equal(['TaskId', 'UserId']);
      }
    });

    describe('without sync', () => {
      beforeEach(async () => {
        await current.queryInterface.createTable('users', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          username: DataTypes.STRING,
          createdAt: DataTypes.DATE,
          updatedAt: DataTypes.DATE
        });
        await current.queryInterface.createTable('tasks', {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          title: DataTypes.STRING,
          createdAt: DataTypes.DATE,
          updatedAt: DataTypes.DATE
        });
        await current.queryInterface.createTable('users_tasks', {
          TaskId: DataTypes.INTEGER,
          UserId: DataTypes.INTEGER,
          createdAt: DataTypes.DATE,
          updatedAt: DataTypes.DATE
        });
      });

      it('removes all associations', async () => {
        UsersTasks = current.define('UsersTasks', {}, { tableName: 'users_tasks' });

        User.belongsToMany(Task, { through: UsersTasks });
        Task.belongsToMany(User, { through: UsersTasks });

        expect(Object.keys(UsersTasks.primaryKeys).sort()).to.deep.equal(['TaskId', 'UserId']);

        const [user, task] = await Promise.all([User.create({ username: 'foo' }), Task.create({ title: 'foo' })]);

        await user.addTask(task);

        expect(await user.setTasks(null)).to.be.ok;
      });
    });
  });

  describe('through', () => {
    let User;
    let Project;
    let UserProjects;

    beforeEach(() => {
      User = current.define('User', {});
      Project = current.define('Project', {});
      UserProjects = current.define('UserProjects', {
        status: DataTypes.STRING,
        data: DataTypes.INTEGER
      });

      User.belongsToMany(Project, { through: UserProjects });
      Project.belongsToMany(User, { through: UserProjects });

      return current.sync();
    });

    describe('fetching from join table', () => {
      it('should contain the data from the join table on .UserProjects a DAO', async () => {
        const [user, created] = await Promise.all([User.create(), Project.create()]);

        await user.addProject(created, { through: { status: 'active', data: 42 } });

        const projects = await user.getProjects();
        const project = projects[0];

        expect(project.UserProjects).to.be.ok;
        expect(project.status).not.to.exist;
        expect(project.UserProjects.status).to.equal('active');
        expect(project.UserProjects.data).to.equal(42);
      });

      it('should be able to limit the join table attributes returned', async () => {
        const [user, created] = await Promise.all([User.create(), Project.create()]);

        await user.addProject(created, { through: { status: 'active', data: 42 } });

        const projects = await user.getProjects({ joinTableAttributes: ['status'] });
        const project = projects[0];

        expect(project.UserProjects).to.be.ok;
        expect(project.status).not.to.exist;
        expect(project.UserProjects.status).to.equal('active');
        expect(project.UserProjects.data).not.to.exist;
      });
    });

    describe('inserting in join table', () => {
      describe('add', () => {
        it('should insert data provided on the object into the join table', async () => {
          const [u, p] = await Promise.all([User.create(), Project.create()]);

          p.UserProjects = { status: 'active' };

          await u.addProject(p);

          const up = await UserProjects.findOne({ where: { UserId: u.id, ProjectId: p.id } });

          expect(up.status).to.equal('active');
        });

        it('should insert data provided as a second argument into the join table', async () => {
          const [u, p] = await Promise.all([User.create(), Project.create()]);

          await u.addProject(p, { through: { status: 'active' } });

          const up = await UserProjects.findOne({ where: { UserId: u.id, ProjectId: p.id } });

          expect(up.status).to.equal('active');
        });

        it('should be able to add twice (second call result in UPDATE call) without any attributes (and timestamps off) on the through model', async () => {
          const Worker = current.define('Worker', {}, { timestamps: false }),
            Task = current.define('Task', {}, { timestamps: false }),
            WorkerTasks = current.define('WorkerTasks', {}, { timestamps: false });

          Worker.belongsToMany(Task, { through: WorkerTasks });
          Task.belongsToMany(Worker, { through: WorkerTasks });

          await current.sync({ force: true });

          const worker = await Worker.create({ id: 1337 });
          const task = await Task.create({ id: 7331 });

          await worker.addTask(task);
          await worker.addTask(task);
        });

        it('should be able to add twice (second call result in UPDATE call) with custom primary keys and without any attributes (and timestamps off) on the through model', async () => {
          const Worker = current.define(
              'Worker',
              {
                id: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  primaryKey: true,
                  autoIncrement: true
                }
              },
              { timestamps: false }
            ),
            Task = current.define(
              'Task',
              {
                id: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  primaryKey: true,
                  autoIncrement: true
                }
              },
              { timestamps: false }
            ),
            WorkerTasks = current.define(
              'WorkerTasks',
              {
                id: {
                  type: DataTypes.INTEGER,
                  allowNull: false,
                  primaryKey: true,
                  autoIncrement: true
                }
              },
              { timestamps: false }
            );

          Worker.belongsToMany(Task, { through: WorkerTasks });
          Task.belongsToMany(Worker, { through: WorkerTasks });

          await current.sync({ force: true });

          const worker = await Worker.create({ id: 1337 });
          const task = await Task.create({ id: 7331 });

          await worker.addTask(task);
          await worker.addTask(task);
        });
      });

      describe('set', () => {
        it('should be able to combine properties on the associated objects, and default values', async () => {
          const [user, projects] = await Promise.all([
            User.create(),
            (async () => {
              await Project.bulkCreate([{}, {}]);
              return await Project.findAll();
            })()
          ]);

          const p1 = projects[0];
          const p2 = projects[1];

          p1.UserProjects = { status: 'inactive' };

          await user.setProjects([p1, p2], { through: { status: 'active' } });

          const [up1, up2] = await Promise.all([
            UserProjects.findOne({ where: { UserId: user.id, ProjectId: p1.id } }),
            UserProjects.findOne({ where: { UserId: user.id, ProjectId: p2.id } })
          ]);

          expect(up1.status).to.equal('inactive');
          expect(up2.status).to.equal('active');
        });

        it('should be able to set twice (second call result in UPDATE calls) without any attributes (and timestamps off) on the through model', async () => {
          const Worker = current.define('Worker', {}, { timestamps: false }),
            Task = current.define('Task', {}, { timestamps: false }),
            WorkerTasks = current.define('WorkerTasks', {}, { timestamps: false });

          Worker.belongsToMany(Task, { through: WorkerTasks });
          Task.belongsToMany(Worker, { through: WorkerTasks });

          await current.sync({ force: true });

          const [worker, tasks] = await Promise.all([
            Worker.create(),
            (async () => {
              await Task.bulkCreate([{}, {}]);
              return await Task.findAll();
            })()
          ]);

          await worker.setTasks(tasks);
          await worker.setTasks(tasks);
        });
      });

      describe('query with through.where', () => {
        it('should support query the through model', async () => {
          const user = await User.create();

          await Promise.all([
            user.createProject({}, { through: { status: 'active', data: 1 } }),
            user.createProject({}, { through: { status: 'inactive', data: 2 } }),
            user.createProject({}, { through: { status: 'inactive', data: 3 } })
          ]);

          const [activeProjects, inactiveProjectCount] = await Promise.all([
            user.getProjects({ through: { where: { status: 'active' } } }),
            user.countProjects({ through: { where: { status: 'inactive' } } })
          ]);

          expect(activeProjects).to.have.lengthOf(1);
          expect(inactiveProjectCount).to.eql(2);
        });
      });
    });

    describe('removing from the join table', () => {
      it('should remove a single entry without any attributes (and timestamps off) on the through model', async () => {
        const Worker = current.define('Worker', {}, { timestamps: false }),
          Task = current.define('Task', {}, { timestamps: false }),
          WorkerTasks = current.define('WorkerTasks', {}, { timestamps: false });

        Worker.belongsToMany(Task, { through: WorkerTasks });
        Task.belongsToMany(Worker, { through: WorkerTasks });

        // Test setup
        await current.sync({ force: true });

        const [worker, tasks] = await Promise.all([
          Worker.create({}),
          (async () => {
            await Task.bulkCreate([{}, {}, {}]);
            return await Task.findAll();
          })()
        ]);

        // Set all tasks, then remove one task by instance, then remove one task by id, then return all tasks
        await worker.setTasks(tasks);
        await worker.removeTask(tasks[0]);
        await worker.removeTask(tasks[1].id);

        expect(await worker.getTasks()).to.have.length(1);
      });

      it('should remove multiple entries without any attributes (and timestamps off) on the through model', async () => {
        const Worker = current.define('Worker', {}, { timestamps: false }),
          Task = current.define('Task', {}, { timestamps: false }),
          WorkerTasks = current.define('WorkerTasks', {}, { timestamps: false });

        Worker.belongsToMany(Task, { through: WorkerTasks });
        Task.belongsToMany(Worker, { through: WorkerTasks });

        // Test setup
        await current.sync({ force: true });

        const [worker, tasks] = await Promise.all([
          Worker.create({}),
          (async () => {
            await Task.bulkCreate([{}, {}, {}, {}, {}]);
            return await Task.findAll();
          })()
        ]);

        // Set all tasks, then remove two tasks by instance, then remove two tasks by id, then return all tasks
        await worker.setTasks(tasks);
        await worker.removeTasks([tasks[0], tasks[1]]);
        await worker.removeTasks([tasks[2].id, tasks[3].id]);

        expect(await worker.getTasks()).to.have.length(1);
      });
    });
  });

  describe('belongsTo and hasMany at once', () => {
    let A;
    let B;

    beforeEach(() => {
      A = current.define('a', { name: Sequelize.STRING });
      B = current.define('b', { name: Sequelize.STRING });
    });

    describe('source belongs to target', () => {
      beforeEach(() => {
        A.belongsTo(B, { as: 'relation1' });
        A.belongsToMany(B, { as: 'relation2', through: 'AB' });
        B.belongsToMany(A, { as: 'relation2', through: 'AB' });

        return current.sync({ force: true });
      });

      it('correctly uses bId in A', async () => {
        const a1 = A.build({ name: 'a1' }),
          b1 = B.build({ name: 'b1' });

        await a1.save();
        await b1.save();
        await a1.setRelation1(b1);

        const a = await A.findOne({ where: { name: 'a1' } });

        expect(a.relation1Id).to.be.eq(b1.id);
      });
    });

    describe('target belongs to source', () => {
      beforeEach(() => {
        B.belongsTo(A, { as: 'relation1' });
        A.belongsToMany(B, { as: 'relation2', through: 'AB' });
        B.belongsToMany(A, { as: 'relation2', through: 'AB' });

        return current.sync({ force: true });
      });

      it('correctly uses bId in A', async () => {
        const a1 = A.build({ name: 'a1' }),
          b1 = B.build({ name: 'b1' });

        await a1.save();
        await b1.save();
        await b1.setRelation1(a1);

        const b = await B.findOne({ where: { name: 'b1' } });

        expect(b.relation1Id).to.be.eq(a1.id);
      });
    });
  });

  describe('alias', () => {
    it('creates the join table when through is a string', async () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      User.belongsToMany(Group, { as: 'MyGroups', through: 'group_user' });
      Group.belongsToMany(User, { as: 'MyUsers', through: 'group_user' });

      await current.sync({ force: true });

      const result = await current.getQueryInterface().showAllTables();

      expect(result.indexOf('group_user')).not.to.equal(-1);
    });

    it('creates the join table when through is a model', async () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {}),
        UserGroup = current.define('GroupUser', {}, { tableName: 'user_groups' });

      User.belongsToMany(Group, { as: 'MyGroups', through: UserGroup });
      Group.belongsToMany(User, { as: 'MyUsers', through: UserGroup });

      await current.sync({ force: true });

      const result = await current.getQueryInterface().showAllTables();

      expect(result.indexOf('user_groups')).not.to.equal(-1);
    });

    it('correctly identifies its counterpart when through is a string', () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      User.belongsToMany(Group, { as: 'MyGroups', through: 'group_user' });
      Group.belongsToMany(User, { as: 'MyUsers', through: 'group_user' });

      expect(Group.associations.MyUsers.through.model === User.associations.MyGroups.through.model);
      expect(Group.associations.MyUsers.through.model.rawAttributes.UserId).to.exist;
      expect(Group.associations.MyUsers.through.model.rawAttributes.GroupId).to.exist;
    });

    it('correctly identifies its counterpart when through is a model', () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {}),
        UserGroup = current.define('GroupUser', {}, { tableName: 'user_groups' });

      User.belongsToMany(Group, { as: 'MyGroups', through: UserGroup });
      Group.belongsToMany(User, { as: 'MyUsers', through: UserGroup });

      expect(Group.associations.MyUsers.through.model === User.associations.MyGroups.through.model);

      expect(Group.associations.MyUsers.through.model.rawAttributes.UserId).to.exist;
      expect(Group.associations.MyUsers.through.model.rawAttributes.GroupId).to.exist;
    });
  });

  describe('multiple hasMany', () => {
    let User;
    let Project;

    beforeEach(() => {
      User = current.define('user', { name: Sequelize.STRING });
      Project = current.define('project', { projectName: Sequelize.STRING });
    });

    describe('project has owners and users and owners and users have projects', () => {
      beforeEach(() => {
        Project.belongsToMany(User, { as: 'owners', through: 'projectOwners' });
        Project.belongsToMany(User, { as: 'users', through: 'projectUsers' });

        User.belongsToMany(Project, { as: 'ownedProjects', through: 'projectOwners' });
        User.belongsToMany(Project, { as: 'memberProjects', through: 'projectUsers' });

        return current.sync({ force: true });
      });

      it('correctly sets user and owner', async () => {
        const p1 = Project.build({ projectName: 'p1' }),
          u1 = User.build({ name: 'u1' }),
          u2 = User.build({ name: 'u2' });

        await p1.save();
        await u1.save();
        await u2.save();
        await p1.setUsers([u1]);
        await p1.setOwners([u2]);
      });
    });
  });

  describe('Foreign key constraints', () => {
    let Task;
    let User;
    let UserTasksLong;

    beforeEach(() => {
      Task = current.define('task', { title: DataTypes.STRING });
      User = current.define('user', { username: DataTypes.STRING });
      // Registered only so sync() creates its table; the tests reference it by name.
      current.define('tasksusers', { userId: DataTypes.INTEGER, taskId: DataTypes.INTEGER });
    });

    it('can cascade deletes both ways by default', async () => {
      User.belongsToMany(Task, { through: 'tasksusers' });
      Task.belongsToMany(User, { through: 'tasksusers' });

      await current.sync({ force: true });

      const [user1, task1, user2, task2] = await Promise.all([
        User.create({ id: 67, username: 'foo' }),
        Task.create({ id: 52, title: 'task' }),
        User.create({ id: 89, username: 'bar' }),
        Task.create({ id: 42, title: 'kast' })
      ]);

      await Promise.all([user1.setTasks([task1]), task2.setUsers([user2])]);
      await Promise.all([user1.destroy(), task2.destroy()]);

      const [tu1, tu2] = await Promise.all([
        current.model('tasksusers').findAll({ where: { userId: user1.id } }),
        current.model('tasksusers').findAll({ where: { taskId: task2.id } }),
        User.findOne({
          where: current.or({ username: 'Franz Joseph' }),
          include: [
            {
              model: Task,
              where: {
                title: {
                  $ne: 'task'
                }
              }
            }
          ]
        })
      ]);

      expect(tu1).to.have.length(0);
      expect(tu2).to.have.length(0);
    });

    if (current.dialect.supports.constraints.restrict) {
      it('can restrict deletes both ways', async () => {
        User.belongsToMany(Task, { onDelete: 'RESTRICT', through: 'tasksusers' });
        Task.belongsToMany(User, { onDelete: 'RESTRICT', through: 'tasksusers' });

        await current.sync({ force: true });

        const [user1, task1, user2, task2] = await Promise.all([
          User.create({ id: 67, username: 'foo' }),
          Task.create({ id: 52, title: 'task' }),
          User.create({ id: 89, username: 'bar' }),
          Task.create({ id: 42, title: 'kast' })
        ]);

        await Promise.all([user1.setTasks([task1]), task2.setUsers([user2])]);

        await Promise.all([
          expect(user1.destroy()).to.have.been.rejectedWith(current.ForeignKeyConstraintError), // Fails because of RESTRICT constraint
          expect(task2.destroy()).to.have.been.rejectedWith(current.ForeignKeyConstraintError)
        ]);
      });

      it('can cascade and restrict deletes', async () => {
        User.belongsToMany(Task, { onDelete: 'RESTRICT', through: 'tasksusers' });
        Task.belongsToMany(User, { onDelete: 'CASCADE', through: 'tasksusers' });

        await current.sync({ force: true });

        const [user1, task1, user2, task2] = await Promise.all([
          User.create({ id: 67, username: 'foo' }),
          Task.create({ id: 52, title: 'task' }),
          User.create({ id: 89, username: 'bar' }),
          Task.create({ id: 42, title: 'kast' })
        ]);

        await Promise.all([user1.setTasks([task1]), task2.setUsers([user2])]);

        await Promise.all([
          expect(user1.destroy()).to.have.been.rejectedWith(current.ForeignKeyConstraintError), // Fails because of RESTRICT constraint
          task2.destroy()
        ]);

        const usertasks = await current.model('tasksusers').findAll({ where: { taskId: task2.id } });

        // This should not exist because deletes cascade
        expect(usertasks).to.have.length(0);
      });
    }

    it('should be possible to remove all constraints', async () => {
      User.belongsToMany(Task, { constraints: false, through: 'tasksusers' });
      Task.belongsToMany(User, { constraints: false, through: 'tasksusers' });

      await current.sync({ force: true });

      const [user1, task1, user2, task2] = await Promise.all([
        User.create({ id: 67, username: 'foo' }),
        Task.create({ id: 52, title: 'task' }),
        User.create({ id: 89, username: 'bar' }),
        Task.create({ id: 42, title: 'kast' })
      ]);

      await Promise.all([user1.setTasks([task1]), task2.setUsers([user2])]);
      await Promise.all([user1.destroy(), task2.destroy()]);

      const [ut1, ut2] = await Promise.all([
        current.model('tasksusers').findAll({ where: { userId: user1.id } }),
        current.model('tasksusers').findAll({ where: { taskId: task2.id } })
      ]);

      expect(ut1).to.have.length(1);
      expect(ut2).to.have.length(1);
    });

    it('create custom unique identifier', async () => {
      UserTasksLong = current.define(
        'table_user_task_with_very_long_name',
        {
          id_user_very_long_field: {
            type: DataTypes.INTEGER(1)
          },
          id_task_very_long_field: {
            type: DataTypes.INTEGER(1)
          }
        },
        { tableName: 'table_user_task_with_very_long_name' }
      );
      User.belongsToMany(Task, {
        as: 'MyTasks',
        through: UserTasksLong,
        foreignKey: 'id_user_very_long_field'
      });
      Task.belongsToMany(User, {
        as: 'MyUsers',
        through: UserTasksLong,
        foreignKey: 'id_task_very_long_field',
        uniqueKey: 'custom_user_group_unique'
      });

      await current.sync({ force: true });

      expect(Task.associations.MyUsers.through.model.rawAttributes.id_user_very_long_field.unique).to.equal(
        'custom_user_group_unique'
      );
      expect(Task.associations.MyUsers.through.model.rawAttributes.id_task_very_long_field.unique).to.equal(
        'custom_user_group_unique'
      );
    });
  });

  describe('Association options', () => {
    describe('allows the user to provide an attribute definition object as foreignKey', () => {
      it('works when taking a column directly from the object', () => {
        const Project = current.define('project', {}),
          User = current.define('user', {
            uid: {
              type: Sequelize.INTEGER,
              primaryKey: true
            }
          });

        const UserProjects = User.belongsToMany(Project, {
          foreignKey: { name: 'user_id', defaultValue: 42 },
          through: 'UserProjects'
        });
        expect(UserProjects.through.model.rawAttributes.user_id).to.be.ok;
        expect(UserProjects.through.model.rawAttributes.user_id.references.model).to.equal(User.getTableName());
        expect(UserProjects.through.model.rawAttributes.user_id.references.key).to.equal('uid');
        expect(UserProjects.through.model.rawAttributes.user_id.defaultValue).to.equal(42);
      });
    });

    it('should throw an error if foreignKey and as result in a name clash', () => {
      const User = current.define('user', {
        user: Sequelize.INTEGER
      });

      expect(User.belongsToMany.bind(User, User, { as: 'user', through: 'UserUser' })).to.throw(
        "Naming collision between attribute 'user' and association 'user' on model user. To remedy this, change either foreignKey or as in your association definition"
      );
    });
  });

  describe('selfAssociations', () => {
    it('should work with self reference', async () => {
      const User = current.define('User', {
          name: Sequelize.STRING(100)
        }),
        Follow = current.define('Follow');

      User.belongsToMany(User, { through: Follow, as: 'User' });
      User.belongsToMany(User, { through: Follow, as: 'Fan' });

      await current.sync({ force: true });

      const users = await Promise.all([
        User.create({ name: 'Khsama' }),
        User.create({ name: 'Vivek' }),
        User.create({ name: 'Satya' })
      ]);

      await Promise.all([users[0].addFan(users[1]), users[1].addUser(users[2]), users[2].addFan(users[0])]);
    });

    it('should work with custom self reference', async () => {
      const User = current.define('User', {
          name: Sequelize.STRING(100)
        }),
        UserFollowers = current.define('UserFollower');

      User.belongsToMany(User, {
        as: {
          singular: 'Follower',
          plural: 'Followers'
        },
        through: UserFollowers
      });

      User.belongsToMany(User, {
        as: {
          singular: 'Invitee',
          plural: 'Invitees'
        },
        foreignKey: 'InviteeId',
        through: 'Invites'
      });

      await current.sync({ force: true });

      const users = await Promise.all([User.create({ name: 'Jalrangi' }), User.create({ name: 'Sargrahi' })]);

      await Promise.all([
        users[0].addFollower(users[1]),
        users[1].addFollower(users[0]),
        users[0].addInvitee(users[1]),
        users[1].addInvitee(users[0])
      ]);
    });

    it('should setup correct foreign keys', () => {
      /* camcelCase */
      let Person = current.define('Person'),
        PersonChildren = current.define('PersonChildren'),
        Children;

      Children = Person.belongsToMany(Person, { as: 'Children', through: PersonChildren });

      expect(Children.foreignKey).to.equal('PersonId');
      expect(Children.otherKey).to.equal('ChildId');
      expect(PersonChildren.rawAttributes[Children.foreignKey]).to.be.ok;
      expect(PersonChildren.rawAttributes[Children.otherKey]).to.be.ok;

      /* underscored */
      Person = current.define('Person', {}, { underscored: true });
      PersonChildren = current.define('PersonChildren', {}, { underscored: true });
      Children = Person.belongsToMany(Person, { as: 'Children', through: PersonChildren });

      expect(Children.foreignKey).to.equal('person_id');
      expect(Children.otherKey).to.equal('child_id');
      expect(PersonChildren.rawAttributes[Children.foreignKey]).to.be.ok;
      expect(PersonChildren.rawAttributes[Children.otherKey]).to.be.ok;
    });
  });
});
