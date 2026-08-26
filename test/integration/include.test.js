import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../index.js';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import _ from 'lodash';

const current = Support.sequelize;

const sortById = function (a, b) {
  return a.id < b.id ? -1 : 1;
};

describe(Support.getTestDialectTeaser('Include'), () => {
  describe('find', () => {
    it('should support an empty belongsTo include', async () => {
      const Company = current.define('Company', {}),
        User = current.define('User', {});

      User.belongsTo(Company, { as: 'Employer' });

      await current.sync({ force: true });
      await User.create();

      const user = await User.findOne({
        include: [{ model: Company, as: 'Employer' }]
      });

      expect(user).to.be.ok;
    });

    it('should support a belongsTo association reference', async () => {
      const Company = current.define('Company', {}),
        User = current.define('User', {}),
        Employer = User.belongsTo(Company, { as: 'Employer' });

      await current.sync({ force: true });
      await User.create();

      const user = await User.findOne({
        include: [Employer]
      });

      expect(user).to.be.ok;
    });

    it('should support a belongsTo association reference with a where', async () => {
      const Company = current.define('Company', { name: DataTypes.STRING }),
        User = current.define('User', {}),
        Employer = User.belongsTo(Company, { as: 'Employer', foreignKey: 'employerId' });

      await current.sync({ force: true });

      const company = await Company.create({
        name: 'CyberCorp'
      });

      await User.create({
        employerId: company.get('id')
      });

      const user = await User.findOne({
        include: [{ association: Employer, where: { name: 'CyberCorp' } }]
      });

      expect(user).to.be.ok;
    });

    it('should support a empty hasOne include', async () => {
      const Company = current.define('Company', {}),
        Person = current.define('Person', {});

      Company.hasOne(Person, { as: 'CEO' });

      await current.sync({ force: true });
      await Company.create();

      const company = await Company.findOne({
        include: [{ model: Person, as: 'CEO' }]
      });

      expect(company).to.be.ok;
    });

    it('should support a hasOne association reference', async () => {
      const Company = current.define('Company', {}),
        Person = current.define('Person', {}),
        CEO = Company.hasOne(Person, { as: 'CEO' });

      await current.sync({ force: true });
      await Company.create();

      const user = await Company.findOne({
        include: [CEO]
      });

      expect(user).to.be.ok;
    });

    it('should support including a belongsTo association rather than a model/as pair', async () => {
      const Company = current.define('Company', {}),
        Person = current.define('Person', {});

      Person.relation = {
        Employer: Person.belongsTo(Company, { as: 'employer' })
      };

      await current.sync({ force: true });

      const [person, company] = await Promise.all([Person.create(), Company.create()]);

      await person.setEmployer(company);

      const found = await Person.findOne({
        include: [Person.relation.Employer]
      });

      expect(found).to.be.ok;
      expect(found.employer).to.be.ok;
    });

    it('should support a hasMany association reference', async () => {
      const User = current.define('user', {}),
        Task = current.define('task', {}),
        Tasks = User.hasMany(Task);

      Task.belongsTo(User);

      await current.sync({ force: true });

      const created = await User.create();
      await created.createTask();

      const user = await User.findOne({
        include: [Tasks]
      });

      expect(user).to.be.ok;
      expect(user.tasks).to.be.ok;
    });

    it('should support a hasMany association reference with a where condition', async () => {
      const User = current.define('user', {}),
        Task = current.define('task', { title: DataTypes.STRING }),
        Tasks = User.hasMany(Task);

      Task.belongsTo(User);

      await current.sync({ force: true });

      const created = await User.create();

      await Promise.all([
        created.createTask({
          title: 'trivial'
        }),
        created.createTask({
          title: 'pursuit'
        })
      ]);

      const user = await User.findOne({
        include: [{ association: Tasks, where: { title: 'trivial' } }]
      });

      expect(user).to.be.ok;
      expect(user.tasks).to.be.ok;
      expect(user.tasks.length).to.equal(1);
    });

    it('should support a belongsToMany association reference', async () => {
      const User = current.define('user', {}),
        Group = current.define('group', {}),
        Groups = User.belongsToMany(Group, { through: 'UserGroup' });

      Group.belongsToMany(User, { through: 'UserGroup' });

      await current.sync({ force: true });

      const created = await User.create();
      await created.createGroup();

      const user = await User.findOne({
        include: [Groups]
      });

      expect(user).to.be.ok;
      expect(user.groups).to.be.ok;
    });

    it('should support a simple nested belongsTo -> belongsTo include', async () => {
      const Task = current.define('Task', {}),
        User = current.define('User', {}),
        Group = current.define('Group', {});

      Task.belongsTo(User);
      User.belongsTo(Group);

      await current.sync({ force: true });

      const [createdTask, createdUser, createdGroup] = await Promise.all([
        Task.create(),
        User.create(),
        Group.create()
      ]);

      await Promise.all([createdTask.setUser(createdUser), createdUser.setGroup(createdGroup)]);

      const task = await Task.findOne({
        where: {
          id: createdTask.id
        },
        include: [{ model: User, include: [{ model: Group }] }]
      });

      expect(task.User).to.be.ok;
      expect(task.User.Group).to.be.ok;
    });

    it('should support a simple sibling set of belongsTo include', async () => {
      const Task = current.define('Task', {}),
        User = current.define('User', {}),
        Group = current.define('Group', {});

      Task.belongsTo(User);
      Task.belongsTo(Group);

      await current.sync({ force: true });

      const created = await Task.create(
        {
          User: {},
          Group: {}
        },
        {
          include: [User, Group]
        }
      );

      const task = await Task.findOne({
        where: {
          id: created.id
        },
        include: [{ model: User }, { model: Group }]
      });

      expect(task.User).to.be.ok;
      expect(task.Group).to.be.ok;
    });

    it('should support a simple nested hasOne -> hasOne include', async () => {
      const Task = current.define('Task', {}),
        User = current.define('User', {}),
        Group = current.define('Group', {});

      User.hasOne(Task);
      Group.hasOne(User);
      User.belongsTo(Group);

      await current.sync({ force: true });

      const user = await User.create(
        {
          Task: {},
          Group: {}
        },
        {
          include: [Task, Group]
        }
      );

      const group = await Group.findOne({
        where: {
          id: user.Group.id
        },
        include: [{ model: User, include: [{ model: Task }] }]
      });

      expect(group.User).to.be.ok;
      expect(group.User.Task).to.be.ok;
    });

    it('should support a simple nested hasMany -> belongsTo include', async () => {
      const Task = current.define('Task', {}),
        User = current.define('User', {}),
        Project = current.define('Project', {});

      User.hasMany(Task);
      Task.belongsTo(Project);

      await current.sync({ force: true });
      await Project.bulkCreate([{ id: 1 }, { id: 2 }]);

      const created = await User.create(
        {
          Tasks: [{ ProjectId: 1 }, { ProjectId: 2 }, { ProjectId: 1 }, { ProjectId: 2 }]
        },
        {
          include: [Task]
        }
      );

      const user = await User.findOne({
        where: {
          id: created.id
        },
        include: [{ model: Task, include: [{ model: Project }] }]
      });

      expect(user.Tasks).to.be.ok;
      expect(user.Tasks.length).to.equal(4);

      user.Tasks.forEach((task) => {
        expect(task.Project).to.be.ok;
      });
    });

    it('should support a simple nested belongsTo -> hasMany include', async () => {
      const Task = current.define('Task', {}),
        Worker = current.define('Worker', {}),
        Project = current.define('Project', {});

      Worker.belongsTo(Project);
      Project.hasMany(Worker);
      Project.hasMany(Task);

      await current.sync({ force: true });

      const project = await Project.create(
        {
          Workers: [{}],
          Tasks: [{}, {}, {}, {}]
        },
        {
          include: [Worker, Task]
        }
      );

      const worker = await Worker.findOne({
        where: {
          id: project.Workers[0].id
        },
        include: [{ model: Project, include: [{ model: Task }] }]
      });

      expect(worker.Project).to.be.ok;
      expect(worker.Project.Tasks).to.be.ok;
      expect(worker.Project.Tasks.length).to.equal(4);
    });

    it('should support a simple nested hasMany <-> hasMany include', async () => {
      const User = current.define('User', {}),
        Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        });

      User.hasMany(Product);
      Product.belongsToMany(Tag, { through: 'product_tag' });
      Tag.belongsToMany(Product, { through: 'product_tag' });

      await current.sync({ force: true });

      const [products, tags] = await Promise.all([
        (async () => {
          await User.create(
            {
              id: 1,
              Products: [{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }, { title: 'Bed' }]
            },
            {
              include: [Product]
            }
          );
          return await Product.findAll({ order: [['id']] });
        })(),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
          return await Tag.findAll({ order: [['id']] });
        })()
      ]);

      await Promise.all([
        products[0].setTags([tags[0], tags[2]]),
        products[1].setTags([tags[1]]),
        products[2].setTags([tags[0], tags[1], tags[2]])
      ]);

      const user = await User.findOne({
        where: {
          id: 1
        },
        include: [{ model: Product, include: [{ model: Tag }] }],
        order: [User.rawAttributes.id, [Product, 'id']]
      });

      expect(user.Products.length).to.equal(4);
      expect(user.Products[0].Tags.length).to.equal(2);
      expect(user.Products[1].Tags.length).to.equal(1);
      expect(user.Products[2].Tags.length).to.equal(3);
      expect(user.Products[3].Tags.length).to.equal(0);
    });

    it('should support an include with multiple different association types', async () => {
      const User = current.define('User', {}),
        Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        }),
        Price = current.define('Price', {
          value: DataTypes.FLOAT
        }),
        Group = current.define('Group', {
          name: DataTypes.STRING
        }),
        GroupMember = current.define('GroupMember', {}),
        Rank = current.define('Rank', {
          name: DataTypes.STRING,
          canInvite: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          },
          canRemove: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          }
        });

      User.hasMany(Product);
      Product.belongsTo(User);

      Product.belongsToMany(Tag, { through: 'product_tag' });
      Tag.belongsToMany(Product, { through: 'product_tag' });
      Product.belongsTo(Tag, { as: 'Category' });

      Product.hasMany(Price);
      Price.belongsTo(Product);

      User.hasMany(GroupMember, { as: 'Memberships' });
      GroupMember.belongsTo(User);
      GroupMember.belongsTo(Rank);
      GroupMember.belongsTo(Group);
      Group.hasMany(GroupMember, { as: 'Memberships' });

      await current.sync({ force: true });

      const [product1, product2, createdUser, tags] = await Promise.all([
        Product.create(
          {
            id: 1,
            title: 'Chair',
            Prices: [{ value: 5 }, { value: 10 }]
          },
          { include: [Price] }
        ),
        Product.create(
          {
            id: 2,
            title: 'Desk',
            Prices: [{ value: 5 }, { value: 10 }, { value: 15 }, { value: 20 }]
          },
          { include: [Price] }
        ),
        User.create(
          {
            id: 1,
            Memberships: [
              { id: 1, Group: { name: 'Developers' }, Rank: { name: 'Admin', canInvite: 1, canRemove: 1 } },
              { id: 2, Group: { name: 'Designers' }, Rank: { name: 'Member', canInvite: 1, canRemove: 0 } }
            ]
          },
          {
            include: { model: GroupMember, as: 'Memberships', include: [Group, Rank] }
          }
        ),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
          return await Tag.findAll();
        })()
      ]);

      await Promise.all([
        createdUser.setProducts([product1, product2]),
        product1.setTags([tags[0], tags[2]]),
        product2.setTags([tags[1]]),
        product1.setCategory(tags[1])
      ]);

      const user = await User.findOne({
        where: { id: 1 },
        include: [
          { model: GroupMember, as: 'Memberships', include: [Group, Rank] },
          { model: Product, include: [Tag, { model: Tag, as: 'Category' }, Price] }
        ]
      });

      user.Memberships.sort(sortById);
      expect(user.Memberships.length).to.equal(2);
      expect(user.Memberships[0].Group.name).to.equal('Developers');
      expect(user.Memberships[0].Rank.canRemove).to.equal(1);
      expect(user.Memberships[1].Group.name).to.equal('Designers');
      expect(user.Memberships[1].Rank.canRemove).to.equal(0);

      user.Products.sort(sortById);
      expect(user.Products.length).to.equal(2);
      expect(user.Products[0].Tags.length).to.equal(2);
      expect(user.Products[1].Tags.length).to.equal(1);
      expect(user.Products[0].Category).to.be.ok;
      expect(user.Products[1].Category).not.to.be.ok;

      expect(user.Products[0].Prices.length).to.equal(2);
      expect(user.Products[1].Prices.length).to.equal(4);
    });

    it('should support specifying attributes', async () => {
      const Project = current.define('Project', {
        title: Sequelize.STRING
      });

      const Task = current.define('Task', {
        title: Sequelize.STRING,
        description: Sequelize.TEXT
      });

      Project.hasMany(Task);
      Task.belongsTo(Project);

      await current.sync({ force: true });
      await Task.create(
        {
          title: 'FooBar',
          Project: { title: 'BarFoo' }
        },
        {
          include: [Project]
        }
      );

      const tasks = await Task.findAll({
        attributes: ['title'],
        include: [{ model: Project, attributes: ['title'] }]
      });

      expect(tasks[0].title).to.equal('FooBar');
      expect(tasks[0].Project.title).to.equal('BarFoo');

      expect(_.omit(tasks[0].get(), 'Project')).to.deep.equal({ title: 'FooBar' });
      expect(tasks[0].Project.get()).to.deep.equal({ title: 'BarFoo' });
    });

    it('should support Sequelize.literal and renaming of attributes in included model attributes', async () => {
      const Post = current.define('Post', {});
      const PostComment = current.define('PostComment', {
        someProperty: Sequelize.VIRTUAL, // Since we specify the AS part as a part of the literal string, not with sequelize syntax, we have to tell sequelize about the field
        comment_title: Sequelize.STRING
      });

      Post.hasMany(PostComment);

      await current.sync({ force: true });

      const post = await Post.create({});

      await post.createPostComment({
        comment_title: 'WAT'
      });

      const findAttributes = [
        Sequelize.literal('EXISTS(SELECT 1) AS "PostComments.someProperty"'),
        [Sequelize.literal('EXISTS(SELECT 1)'), 'someProperty2']
      ];

      findAttributes.push(['comment_title', 'commentTitle']);

      const posts = await Post.findAll({
        include: [
          {
            model: PostComment,
            attributes: findAttributes
          }
        ]
      });

      expect(posts[0].PostComments[0].get('someProperty')).to.be.ok;
      expect(posts[0].PostComments[0].get('someProperty2')).to.be.ok;
      expect(posts[0].PostComments[0].get('commentTitle')).to.equal('WAT');
    });

    it('should support self associated hasMany (with through) include', async () => {
      const Group = current.define('Group', {
        name: DataTypes.STRING
      });

      Group.belongsToMany(Group, { through: 'groups_outsourcing_companies', as: 'OutsourcingCompanies' });

      await current.sync({ force: true });
      await Group.bulkCreate([{ name: 'SoccerMoms' }, { name: 'Coca Cola' }, { name: 'Dell' }, { name: 'Pepsi' }]);

      const groups = await Group.findAll();

      await groups[0].setOutsourcingCompanies(groups.slice(1));

      const group = await Group.findOne({
        where: {
          id: groups[0].id
        },
        include: [{ model: Group, as: 'OutsourcingCompanies' }]
      });

      expect(group.OutsourcingCompanies).to.have.length(3);
    });

    it('should support including date fields, with the correct timeszone', async () => {
      const User = current.define(
          'user',
          {
            dateField: Sequelize.DATE
          },
          { timestamps: false }
        ),
        Group = current.define(
          'group',
          {
            dateField: Sequelize.DATE
          },
          { timestamps: false }
        );

      User.belongsToMany(Group, { through: 'group_user' });
      Group.belongsToMany(User, { through: 'group_user' });

      await current.sync({ force: true });

      const [createdUser, group] = await Promise.all([
        User.create({ dateField: Date.UTC(2014, 1, 20) }),
        Group.create({ dateField: Date.UTC(2014, 1, 20) })
      ]);

      await createdUser.addGroup(group);

      const user = await User.findOne({
        where: {
          id: createdUser.id
        },
        include: [Group]
      });

      expect(user.dateField.getTime()).to.equal(Date.UTC(2014, 1, 20));
      expect(user.groups[0].dateField.getTime()).to.equal(Date.UTC(2014, 1, 20));
    });

    it('should support include when retrieving associated objects', async () => {
      const User = current.define('user', {
          name: DataTypes.STRING
        }),
        Group = current.define('group', {
          name: DataTypes.STRING
        }),
        UserGroup = current.define('user_group', {
          vip: DataTypes.INTEGER
        });

      User.hasMany(Group);
      Group.belongsTo(User);
      User.belongsToMany(Group, {
        through: UserGroup,
        as: 'Clubs'
      });
      Group.belongsToMany(User, {
        through: UserGroup,
        as: 'Members'
      });

      await current.sync({ force: true });

      const [owner, member, group] = await Promise.all([
        User.create({ name: 'Owner' }),
        User.create({ name: 'Member' }),
        Group.create({ name: 'Group' })
      ]);

      await owner.addGroup(group);
      await group.addMember(member);

      const groups = await owner.getGroups({
        include: [
          {
            model: User,
            as: 'Members'
          }
        ]
      });

      expect(groups.length).to.equal(1);
      expect(groups[0].Members[0].name).to.equal('Member');
    });
  });

  const createUsersAndItems = async () => {
    const User = current.define('User', {}),
      Item = current.define('Item', { test: DataTypes.STRING });

    User.hasOne(Item);
    Item.belongsTo(User);

    await current.sync({ force: true });

    const [users, items] = await Promise.all([
      (async () => {
        await User.bulkCreate([{}, {}, {}]);
        return await User.findAll();
      })(),
      (async () => {
        await Item.bulkCreate([{ test: 'abc' }, { test: 'def' }, { test: 'ghi' }]);
        return await Item.findAll();
      })()
    ]);

    await Promise.all([users[0].setItem(items[0]), users[1].setItem(items[1]), users[2].setItem(items[2])]);

    return { User, Item };
  };

  describe('where', () => {
    let User, Item;

    beforeEach(async () => {
      ({ User, Item } = await createUsersAndItems());
    });

    it('should support Sequelize.and()', async () => {
      const result = await User.findAll({
        include: [{ model: Item, where: Sequelize.and({ test: 'def' }) }]
      });

      expect(result.length).to.eql(1);
      expect(result[0].Item.test).to.eql('def');
    });

    it('should support Sequelize.or()', () => {
      return expect(
        User.findAll({
          include: [
            {
              model: Item,
              where: Sequelize.or(
                {
                  test: 'def'
                },
                {
                  test: 'abc'
                }
              )
            }
          ]
        })
      ).resolves.to.have.length(2);
    });
  });

  describe('findAndCountAll', () => {
    it('should include associations to findAndCountAll', async () => {
      const { User, Item } = await createUsersAndItems();

      const result = await User.findAndCountAll({
        include: [
          {
            model: Item,
            where: {
              test: 'def'
            }
          }
        ]
      });

      expect(result.count).to.eql(1);

      expect(result.rows.length).to.eql(1);
      expect(result.rows[0].Item.test).to.eql('def');
    });
  });

  describe('association getter', () => {
    it('should support getting an include on a N:M association getter', async () => {
      const Question = current.define('Question', {}),
        Answer = current.define('Answer', {}),
        Questionnaire = current.define('Questionnaire', {});

      Question.belongsToMany(Answer, { through: 'question_answer' });
      Answer.belongsToMany(Question, { through: 'question_answer' });

      Questionnaire.hasMany(Question);
      Question.belongsTo(Questionnaire);

      await current.sync({ force: true });

      const questionnaire = await Questionnaire.create();

      await questionnaire.getQuestions({
        include: Answer
      });
    });
  });

  describe('nested includes', () => {
    let Employee, Team, Clearence;

    beforeEach(async () => {
      Employee = current.define('Employee', { name: DataTypes.STRING });
      Team = current.define('Team', { name: DataTypes.STRING });
      Clearence = current.define('Clearence', { level: DataTypes.INTEGER });

      Team.Members = Team.hasMany(Employee, { as: 'members' });
      Employee.Clearence = Employee.hasOne(Clearence, { as: 'clearence' });
      Clearence.Employee = Clearence.belongsTo(Employee, { as: 'employee' });

      await current.sync({ force: true });

      const instances = await Promise.all([
        Team.create({ name: 'TeamA' }),
        Team.create({ name: 'TeamB' }),
        Employee.create({ name: 'John' }),
        Employee.create({ name: 'Jane' }),
        Employee.create({ name: 'Josh' }),
        Employee.create({ name: 'Jill' }),
        Clearence.create({ level: 3 }),
        Clearence.create({ level: 5 })
      ]);

      await Promise.all([
        instances[0].addMembers([instances[2], instances[3]]),
        instances[1].addMembers([instances[4], instances[5]]),
        instances[2].setClearence(instances[6]),
        instances[3].setClearence(instances[7])
      ]);
    });

    it('should not ripple grandchild required to top level find when required of child is set to false', async () => {
      const teams = await Team.findAll({
        include: [
          {
            association: Team.Members,
            required: false,
            include: [
              {
                association: Employee.Clearence,
                required: true
              }
            ]
          }
        ]
      });

      expect(teams).to.have.length(2);
    });

    it('should not ripple grandchild required to top level find when required of child is not given (implicitly false)', async () => {
      const teams = await Team.findAll({
        include: [
          {
            association: Team.Members,
            include: [
              {
                association: Employee.Clearence,
                required: true
              }
            ]
          }
        ]
      });

      expect(teams).to.have.length(2);
    });

    it('should ripple grandchild required to top level find when required of child is set to true as well', async () => {
      const teams = await Team.findAll({
        include: [
          {
            association: Team.Members,
            required: true,
            include: [
              {
                association: Employee.Clearence,
                required: true
              }
            ]
          }
        ]
      });

      expect(teams).to.have.length(1);
    });
  });
});
