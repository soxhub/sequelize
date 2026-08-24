import { describe, it } from 'mocha';
import { expect } from 'chai';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

const sortById = function (a, b) {
  return a.id < b.id ? -1 : 1;
};

describe(Support.getTestDialectTeaser('Includes with schemas'), () => {
  describe('findAll', () => {
    let models;

    const fixtureA = async () => {
      await current.dropAllSchemas();
      await current.createSchema('account');

      const AccUser = current.define('AccUser', {}, { schema: 'account' }),
        Company = current.define(
          'Company',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Product = current.define(
          'Product',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Tag = current.define(
          'Tag',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Price = current.define(
          'Price',
          {
            value: DataTypes.FLOAT
          },
          { schema: 'account' }
        ),
        Customer = current.define(
          'Customer',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        GroupMember = current.define('GroupMember', {}, { schema: 'account' }),
        Rank = current.define(
          'Rank',
          {
            name: DataTypes.STRING,
            canInvite: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            },
            canRemove: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            },
            canPost: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            }
          },
          { schema: 'account' }
        );

      models = {
        AccUser,
        Company,
        Product,
        Tag,
        Price,
        Customer,
        Group,
        GroupMember,
        Rank
      };

      AccUser.hasMany(Product);
      Product.belongsTo(AccUser);

      Product.belongsToMany(Tag, { through: 'product_tag' });
      Tag.belongsToMany(Product, { through: 'product_tag' });
      Product.belongsTo(Tag, { as: 'Category' });
      Product.belongsTo(Company);

      Product.hasMany(Price);
      Price.belongsTo(Product);

      AccUser.hasMany(GroupMember, { as: 'Memberships' });
      GroupMember.belongsTo(AccUser);
      GroupMember.belongsTo(Rank);
      GroupMember.belongsTo(Group);
      Group.hasMany(GroupMember, { as: 'Memberships' });

      await current.sync({ force: true });

      await Promise.all([
        Group.bulkCreate([{ name: 'Developers' }, { name: 'Designers' }, { name: 'Managers' }]),
        Company.bulkCreate([
          { name: 'Sequelize' },
          { name: 'Coca Cola' },
          { name: 'Bonanza' },
          { name: 'NYSE' },
          { name: 'Coshopr' }
        ]),
        Rank.bulkCreate([
          { name: 'Admin', canInvite: 1, canRemove: 1, canPost: 1 },
          { name: 'Trustee', canInvite: 1, canRemove: 0, canPost: 1 },
          { name: 'Member', canInvite: 1, canRemove: 0, canPost: 0 }
        ]),
        Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }])
      ]);

      const [groups, companies, ranks, tags] = await Promise.all([
        Group.findAll(),
        Company.findAll(),
        Rank.findAll(),
        Tag.findAll()
      ]);

      // Sequential on purpose: each pass re-reads every Product row and indexes
      // into it as products[i * 5 + n], so the previous pass's rows must already
      // be committed.
      for (const i of [0, 1, 2, 3, 4]) {
        const [user, products] = await Promise.all([
          AccUser.create(),
          (async () => {
            await Product.bulkCreate([
              { title: 'Chair' },
              { title: 'Desk' },
              { title: 'Bed' },
              { title: 'Pen' },
              { title: 'Monitor' }
            ]);
            return await Product.findAll();
          })()
        ]);

        const groupMembers = [
          { AccUserId: user.id, GroupId: groups[0].id, RankId: ranks[0].id },
          { AccUserId: user.id, GroupId: groups[1].id, RankId: ranks[2].id }
        ];
        if (i < 3) {
          groupMembers.push({ AccUserId: user.id, GroupId: groups[2].id, RankId: ranks[1].id });
        }

        await Promise.all([
          GroupMember.bulkCreate(groupMembers),
          user.setProducts([products[i * 5 + 0], products[i * 5 + 1], products[i * 5 + 3]]),
          Promise.all([
            products[i * 5 + 0].setTags([tags[0], tags[2]]),
            products[i * 5 + 1].setTags([tags[1]]),
            products[i * 5 + 0].setCategory(tags[1]),
            products[i * 5 + 2].setTags([tags[0]]),
            products[i * 5 + 3].setTags([tags[0]])
          ]),
          Promise.all([
            products[i * 5 + 0].setCompany(companies[4]),
            products[i * 5 + 1].setCompany(companies[3]),
            products[i * 5 + 2].setCompany(companies[2]),
            products[i * 5 + 3].setCompany(companies[1]),
            products[i * 5 + 4].setCompany(companies[0])
          ]),
          Price.bulkCreate([
            { ProductId: products[i * 5 + 0].id, value: 5 },
            { ProductId: products[i * 5 + 0].id, value: 10 },
            { ProductId: products[i * 5 + 1].id, value: 5 },
            { ProductId: products[i * 5 + 1].id, value: 10 },
            { ProductId: products[i * 5 + 1].id, value: 15 },
            { ProductId: products[i * 5 + 1].id, value: 20 },
            { ProductId: products[i * 5 + 2].id, value: 20 },
            { ProductId: products[i * 5 + 3].id, value: 20 }
          ])
        ]);
      }
    };

    it('should support an include with multiple different association types', async () => {
      await current.dropAllSchemas();
      await current.createSchema('account');

      const AccUser = current.define('AccUser', {}, { schema: 'account' }),
        Product = current.define(
          'Product',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Tag = current.define(
          'Tag',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Price = current.define(
          'Price',
          {
            value: DataTypes.FLOAT
          },
          { schema: 'account' }
        ),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        GroupMember = current.define('GroupMember', {}, { schema: 'account' }),
        Rank = current.define(
          'Rank',
          {
            name: DataTypes.STRING,
            canInvite: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            },
            canRemove: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            }
          },
          { schema: 'account' }
        );

      AccUser.hasMany(Product);
      Product.belongsTo(AccUser);

      Product.belongsToMany(Tag, { through: 'product_tag' });
      Tag.belongsToMany(Product, { through: 'product_tag' });
      Product.belongsTo(Tag, { as: 'Category' });

      Product.hasMany(Price);
      Price.belongsTo(Product);

      AccUser.hasMany(GroupMember, { as: 'Memberships' });
      GroupMember.belongsTo(AccUser);
      GroupMember.belongsTo(Rank);
      GroupMember.belongsTo(Group);
      Group.hasMany(GroupMember, { as: 'Memberships' });

      await current.sync({ force: true });

      const [groups, ranks, tags] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'Developers' }, { name: 'Designers' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await Rank.bulkCreate([
            { name: 'Admin', canInvite: 1, canRemove: 1 },
            { name: 'Member', canInvite: 1, canRemove: 0 }
          ]);
          return await Rank.findAll();
        })(),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
          return await Tag.findAll();
        })()
      ]);

      // Sequential on purpose: each pass re-reads every Product row and indexes
      // into it as products[i * 2 + n].
      for (const i of [0, 1, 2, 3, 4]) {
        const [user, products] = await Promise.all([
          AccUser.create(),
          (async () => {
            await Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }]);
            return await Product.findAll();
          })()
        ]);

        await Promise.all([
          GroupMember.bulkCreate([
            { AccUserId: user.id, GroupId: groups[0].id, RankId: ranks[0].id },
            { AccUserId: user.id, GroupId: groups[1].id, RankId: ranks[1].id }
          ]),
          user.setProducts([products[i * 2 + 0], products[i * 2 + 1]]),
          products[i * 2 + 0].setTags([tags[0], tags[2]]),
          products[i * 2 + 1].setTags([tags[1]]),
          products[i * 2 + 0].setCategory(tags[1]),
          Price.bulkCreate([
            { ProductId: products[i * 2 + 0].id, value: 5 },
            { ProductId: products[i * 2 + 0].id, value: 10 },
            { ProductId: products[i * 2 + 1].id, value: 5 },
            { ProductId: products[i * 2 + 1].id, value: 10 },
            { ProductId: products[i * 2 + 1].id, value: 15 },
            { ProductId: products[i * 2 + 1].id, value: 20 }
          ])
        ]);
      }

      const users = await AccUser.findAll({
        include: [
          { model: GroupMember, as: 'Memberships', include: [Group, Rank] },
          { model: Product, include: [Tag, { model: Tag, as: 'Category' }, Price] }
        ],
        order: [[AccUser.rawAttributes.id, 'ASC']]
      });

      users.forEach((user) => {
        expect(user.Memberships).to.be.ok;
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
    });

    it('should support many levels of belongsTo', async () => {
      const A = current.define('a', {}, { schema: 'account' }),
        B = current.define('b', {}, { schema: 'account' }),
        C = current.define('c', {}, { schema: 'account' }),
        D = current.define('d', {}, { schema: 'account' }),
        E = current.define('e', {}, { schema: 'account' }),
        F = current.define('f', {}, { schema: 'account' }),
        G = current.define('g', {}, { schema: 'account' }),
        H = current.define('h', {}, { schema: 'account' });

      A.belongsTo(B);
      B.belongsTo(C);
      C.belongsTo(D);
      D.belongsTo(E);
      E.belongsTo(F);
      F.belongsTo(G);
      G.belongsTo(H);

      let b;
      const singles = [B, C, D, E, F, G, H];

      await current.sync();
      await A.bulkCreate([{}, {}, {}, {}, {}, {}, {}, {}]);

      // Sequential on purpose: each model is linked to the one created before it.
      let previousInstance;
      for (const model of singles) {
        const instance = await model.create({});

        if (previousInstance) {
          await previousInstance['set' + Sequelize.Utils.uppercaseFirst(model.name)](instance);
        } else {
          b = instance;
        }

        previousInstance = instance;
      }

      const created = await A.findAll();

      await Promise.all(created.map((a) => a.setB(b)));

      const as = await A.findAll({
        include: [
          {
            model: B,
            include: [
              {
                model: C,
                include: [
                  {
                    model: D,
                    include: [{ model: E, include: [{ model: F, include: [{ model: G, include: [{ model: H }] }] }] }]
                  }
                ]
              }
            ]
          }
        ]
      });

      expect(as.length).to.be.ok;
      as.forEach((a) => {
        expect(a.b.c.d.e.f.g.h).to.be.ok;
      });
    });

    it('should support ordering with only belongsTo includes', async () => {
      const User = current.define('SpecialUser', {}, { schema: 'account' }),
        Item = current.define('Item', { test: DataTypes.STRING }, { schema: 'account' }),
        Order = current.define('Order', { position: DataTypes.INTEGER }, { schema: 'account' });

      User.belongsTo(Item, { as: 'itemA', foreignKey: 'itemA_id' });
      User.belongsTo(Item, { as: 'itemB', foreignKey: 'itemB_id' });
      User.belongsTo(Order);

      await current.sync();

      await Promise.all([
        User.bulkCreate([{}, {}, {}]),
        Item.bulkCreate([{ test: 'abc' }, { test: 'def' }, { test: 'ghi' }, { test: 'jkl' }]),
        Order.bulkCreate([{ position: 2 }, { position: 3 }, { position: 1 }])
      ]);

      const [users, items, orders] = await Promise.all([
        User.findAll(),
        Item.findAll({ order: ['id'] }),
        Order.findAll({ order: ['id'] })
      ]);

      await Promise.all([
        users[0].setItemA(items[0]),
        users[0].setItemB(items[1]),
        users[0].setOrder(orders[2]),
        users[1].setItemA(items[2]),
        users[1].setItemB(items[3]),
        users[1].setOrder(orders[1]),
        users[2].setItemA(items[0]),
        users[2].setItemB(items[3]),
        users[2].setOrder(orders[0])
      ]);

      const as = await User.findAll({
        include: [{ model: Item, as: 'itemA', where: { test: 'abc' } }, { model: Item, as: 'itemB' }, Order],
        order: [[Order, 'position']]
      });

      expect(as.length).to.eql(2);
      expect(as[0].itemA.test).to.eql('abc');
      expect(as[1].itemA.test).to.eql('abc');
      expect(as[0].Order.position).to.eql(1);
      expect(as[1].Order.position).to.eql(2);
    });

    it('should include attributes from through models', async () => {
      const Product = current.define(
          'Product',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Tag = current.define(
          'Tag',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        ProductTag = current.define(
          'ProductTag',
          {
            priority: DataTypes.INTEGER
          },
          { schema: 'account' }
        );

      Product.belongsToMany(Tag, { through: ProductTag });
      Tag.belongsToMany(Product, { through: ProductTag });

      await current.sync({ force: true });

      await Promise.all([
        Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }]),
        Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
      ]);

      const [created, tags] = await Promise.all([Product.findAll(), Tag.findAll()]);

      await Promise.all([
        created[0].addTag(tags[0], { through: { priority: 1 } }),
        created[0].addTag(tags[1], { through: { priority: 2 } }),
        created[1].addTag(tags[1], { through: { priority: 1 } }),
        created[2].addTag(tags[0], { through: { priority: 3 } }),
        created[2].addTag(tags[1], { through: { priority: 1 } }),
        created[2].addTag(tags[2], { through: { priority: 2 } })
      ]);

      const products = await Product.findAll({
        include: [{ model: Tag }],
        order: [
          ['id', 'ASC'],
          [Tag, 'id', 'ASC']
        ]
      });

      expect(products[0].Tags[0].ProductTag.priority).to.equal(1);
      expect(products[0].Tags[1].ProductTag.priority).to.equal(2);
      expect(products[1].Tags[0].ProductTag.priority).to.equal(1);
      expect(products[2].Tags[0].ProductTag.priority).to.equal(3);
      expect(products[2].Tags[1].ProductTag.priority).to.equal(1);
      expect(products[2].Tags[2].ProductTag.priority).to.equal(2);
    });

    it('should support a required belongsTo include', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define('Group', {}, { schema: 'account' });

      User.belongsTo(Group);

      await current.sync({ force: true });

      await Promise.all([Group.bulkCreate([{}, {}]), User.bulkCreate([{}, {}, {}])]);

      const [groups, created] = await Promise.all([Group.findAll(), User.findAll()]);

      await created[2].setGroup(groups[1]);

      const users = await User.findAll({
        include: [{ model: Group, required: true }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].Group).to.be.ok;
    });

    it('should be possible to extend the on clause with a where option on a belongsTo include', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group);

      await current.sync({ force: true });

      await Promise.all([Group.bulkCreate([{ name: 'A' }, { name: 'B' }]), User.bulkCreate([{}, {}])]);

      const [groups, created] = await Promise.all([Group.findAll(), User.findAll()]);

      await Promise.all([created[0].setGroup(groups[1]), created[1].setGroup(groups[0])]);

      const users = await User.findAll({
        include: [{ model: Group, where: { name: 'A' } }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].Group).to.be.ok;
      expect(users[0].Group.name).to.equal('A');
    });

    it('should be possible to extend the on clause with a where option on a belongsTo include', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group);

      await current.sync({ force: true });

      await Promise.all([Group.bulkCreate([{ name: 'A' }, { name: 'B' }]), User.bulkCreate([{}, {}])]);

      const [groups, created] = await Promise.all([Group.findAll(), User.findAll()]);

      await Promise.all([created[0].setGroup(groups[1]), created[1].setGroup(groups[0])]);

      const users = await User.findAll({
        include: [{ model: Group, required: true }]
      });

      users.forEach((user) => {
        expect(user.Group).to.be.ok;
      });
    });

    it('should be possible to define a belongsTo include as required with child hasMany with limit', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Category = current.define(
          'Category',
          {
            category: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group);
      Group.hasMany(Category);

      await current.sync({ force: true });

      await Promise.all([
        Group.bulkCreate([{ name: 'A' }, { name: 'B' }]),
        User.bulkCreate([{}, {}]),
        Category.bulkCreate([{}, {}])
      ]);

      const [groups, created, categories] = await Promise.all([Group.findAll(), User.findAll(), Category.findAll()]);

      await Promise.all([
        created[0].setGroup(groups[1]),
        created[1].setGroup(groups[0]),
        ...groups.map((group) => group.setCategories(categories))
      ]);

      const users = await User.findAll({
        include: [{ model: Group, required: true, include: [{ model: Category }] }],
        limit: 1
      });

      expect(users.length).to.equal(1);
      users.forEach((user) => {
        expect(user.Group).to.be.ok;
        expect(user.Group.Categories).to.be.ok;
      });
    });

    it('should be possible to define a belongsTo include as required with child hasMany with limit and aliases', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Category = current.define(
          'Category',
          {
            category: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group, { as: 'Team' });
      Group.hasMany(Category, { as: 'Tags' });

      await current.sync({ force: true });

      await Promise.all([
        Group.bulkCreate([{ name: 'A' }, { name: 'B' }]),
        User.bulkCreate([{}, {}]),
        Category.bulkCreate([{}, {}])
      ]);

      const [groups, created, categories] = await Promise.all([Group.findAll(), User.findAll(), Category.findAll()]);

      await Promise.all([
        created[0].setTeam(groups[1]),
        created[1].setTeam(groups[0]),
        ...groups.map((group) => group.setTags(categories))
      ]);

      const users = await User.findAll({
        include: [{ model: Group, required: true, as: 'Team', include: [{ model: Category, as: 'Tags' }] }],
        limit: 1
      });

      expect(users.length).to.equal(1);
      users.forEach((user) => {
        expect(user.Team).to.be.ok;
        expect(user.Team.Tags).to.be.ok;
      });
    });

    it('should be possible to define a belongsTo include as required with child hasMany which is not required with limit', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Category = current.define(
          'Category',
          {
            category: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group);
      Group.hasMany(Category);

      await current.sync({ force: true });

      await Promise.all([
        Group.bulkCreate([{ name: 'A' }, { name: 'B' }]),
        User.bulkCreate([{}, {}]),
        Category.bulkCreate([{}, {}])
      ]);

      const [groups, created, categories] = await Promise.all([Group.findAll(), User.findAll(), Category.findAll()]);

      await Promise.all([
        created[0].setGroup(groups[1]),
        created[1].setGroup(groups[0]),
        ...groups.map((group) => group.setCategories(categories))
      ]);

      const users = await User.findAll({
        include: [{ model: Group, required: true, include: [{ model: Category, required: false }] }],
        limit: 1
      });

      expect(users.length).to.equal(1);
      users.forEach((user) => {
        expect(user.Group).to.be.ok;
        expect(user.Group.Categories).to.be.ok;
      });
    });

    it('should be possible to extend the on clause with a where option on a hasOne include', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Project = current.define(
          'Project',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.hasOne(Project, { as: 'LeaderOf' });

      await current.sync({ force: true });

      await Promise.all([Project.bulkCreate([{ title: 'Alpha' }, { title: 'Beta' }]), User.bulkCreate([{}, {}])]);

      const [projects, created] = await Promise.all([Project.findAll(), User.findAll()]);

      await Promise.all([created[1].setLeaderOf(projects[1]), created[0].setLeaderOf(projects[0])]);

      const users = await User.findAll({
        include: [{ model: Project, as: 'LeaderOf', where: { title: 'Beta' } }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].LeaderOf).to.be.ok;
      expect(users[0].LeaderOf.title).to.equal('Beta');
    });

    it('should be possible to extend the on clause with a where option on a hasMany include with a through model', async () => {
      const Product = current.define(
          'Product',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Tag = current.define(
          'Tag',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        ProductTag = current.define(
          'ProductTag',
          {
            priority: DataTypes.INTEGER
          },
          { schema: 'account' }
        );

      Product.belongsToMany(Tag, { through: ProductTag });
      Tag.belongsToMany(Product, { through: ProductTag });

      await current.sync({ force: true });

      await Promise.all([
        Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }]),
        Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
      ]);

      const [created, tags] = await Promise.all([Product.findAll(), Tag.findAll()]);

      await Promise.all([
        created[0].addTag(tags[0], { priority: 1 }),
        created[0].addTag(tags[1], { priority: 2 }),
        created[1].addTag(tags[1], { priority: 1 }),
        created[2].addTag(tags[0], { priority: 3 }),
        created[2].addTag(tags[1], { priority: 1 }),
        created[2].addTag(tags[2], { priority: 2 })
      ]);

      const products = await Product.findAll({
        include: [{ model: Tag, where: { name: 'C' } }]
      });

      expect(products.length).to.equal(1);
      expect(products[0].Tags.length).to.equal(1);
    });

    it('should be possible to extend the on clause with a where option on nested includes', async () => {
      const User = current.define(
          'User',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Product = current.define(
          'Product',
          {
            title: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Tag = current.define(
          'Tag',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        Price = current.define(
          'Price',
          {
            value: DataTypes.FLOAT
          },
          { schema: 'account' }
        ),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        ),
        GroupMember = current.define('GroupMember', {}, { schema: 'account' }),
        Rank = current.define(
          'Rank',
          {
            name: DataTypes.STRING,
            canInvite: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            },
            canRemove: {
              type: DataTypes.INTEGER,
              defaultValue: 0
            }
          },
          { schema: 'account' }
        );

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

      await Promise.all([
        Group.bulkCreate([{ name: 'Developers' }, { name: 'Designers' }]),
        Rank.bulkCreate([
          { name: 'Admin', canInvite: 1, canRemove: 1 },
          { name: 'Member', canInvite: 1, canRemove: 0 }
        ]),
        Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
      ]);

      const [groups, ranks, tags] = await Promise.all([Group.findAll(), Rank.findAll(), Tag.findAll()]);

      // Sequential on purpose: each pass re-reads every Product row and indexes
      // into it as products[i * 2 + n].
      for (const i of [0, 1, 2, 3, 4]) {
        const [user, products] = await Promise.all([
          User.create({ name: 'FooBarzz' }),
          (async () => {
            await Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }]);
            return await Product.findAll();
          })()
        ]);

        await Promise.all([
          GroupMember.bulkCreate([
            { UserId: user.id, GroupId: groups[0].id, RankId: ranks[0].id },
            { UserId: user.id, GroupId: groups[1].id, RankId: ranks[1].id }
          ]),
          user.setProducts([products[i * 2 + 0], products[i * 2 + 1]]),
          products[i * 2 + 0].setTags([tags[0], tags[2]]),
          products[i * 2 + 1].setTags([tags[1]]),
          products[i * 2 + 0].setCategory(tags[1]),
          Price.bulkCreate([
            { ProductId: products[i * 2 + 0].id, value: 5 },
            { ProductId: products[i * 2 + 0].id, value: 10 },
            { ProductId: products[i * 2 + 1].id, value: 5 },
            { ProductId: products[i * 2 + 1].id, value: 10 },
            { ProductId: products[i * 2 + 1].id, value: 15 },
            { ProductId: products[i * 2 + 1].id, value: 20 }
          ])
        ]);
      }

      const users = await User.findAll({
        include: [
          { model: GroupMember, as: 'Memberships', include: [Group, { model: Rank, where: { name: 'Admin' } }] },
          {
            model: Product,
            include: [
              Tag,
              { model: Tag, as: 'Category' },
              {
                model: Price,
                where: {
                  value: {
                    gt: 15
                  }
                }
              }
            ]
          }
        ],
        order: [['id', 'ASC']]
      });

      users.forEach((user) => {
        expect(user.Memberships.length).to.equal(1);
        expect(user.Memberships[0].Rank.name).to.equal('Admin');
        expect(user.Products.length).to.equal(1);
        expect(user.Products[0].Prices.length).to.equal(1);
      });
    });

    it('should be possible to use limit and a where with a belongsTo include', async () => {
      const User = current.define('User', {}, { schema: 'account' }),
        Group = current.define(
          'Group',
          {
            name: DataTypes.STRING
          },
          { schema: 'account' }
        );

      User.belongsTo(Group);

      await current.sync({ force: true });

      const [groups, created] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}, {}, {}]);
          return await User.findAll();
        })()
      ]);

      await Promise.all([
        created[1].setGroup(groups[0]),
        created[2].setGroup(groups[0]),
        created[3].setGroup(groups[1]),
        created[0].setGroup(groups[0])
      ]);

      const users = await User.findAll({
        include: [{ model: Group, where: { name: 'A' } }],
        limit: 2
      });

      expect(users.length).to.equal(2);

      users.forEach((user) => {
        expect(user.Group.name).to.equal('A');
      });
    });

    it('should be possible use limit, attributes and a where on a belongsTo with additional hasMany includes', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        attributes: ['title'],
        include: [{ model: models.Company, where: { name: 'NYSE' } }, { model: models.Tag }, { model: models.Price }],
        limit: 3,
        order: [['id', 'ASC']]
      });

      expect(products.length).to.equal(3);

      products.forEach((product) => {
        expect(product.Company.name).to.equal('NYSE');
        expect(product.Tags.length).to.be.ok;
        expect(product.Prices.length).to.be.ok;
      });
    });

    it('should be possible to use limit and a where on a hasMany with additional includes', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        include: [
          { model: models.Company },
          { model: models.Tag },
          {
            model: models.Price,
            where: {
              value: { gt: 5 }
            }
          }
        ],
        limit: 6,
        order: [['id', 'ASC']]
      });

      expect(products.length).to.equal(6);

      products.forEach((product) => {
        expect(product.Tags.length).to.be.ok;
        expect(product.Prices.length).to.be.ok;

        product.Prices.forEach((price) => {
          expect(price.value).to.be.above(5);
        });
      });
    });

    it('should be possible to use limit and a where on a hasMany with a through model with additional includes', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        include: [
          { model: models.Company },
          { model: models.Tag, where: { name: ['A', 'B', 'C'] } },
          { model: models.Price }
        ],
        limit: 10,
        order: [['id', 'ASC']]
      });

      expect(products.length).to.equal(10);

      products.forEach((product) => {
        expect(product.Tags.length).to.be.ok;
        expect(product.Prices.length).to.be.ok;

        product.Tags.forEach((tag) => {
          expect(['A', 'B', 'C']).to.include(tag.name);
        });
      });
    });

    it('should support including date fields, with the correct timeszone', async () => {
      const User = current.define(
          'user',
          {
            dateField: Sequelize.DATE
          },
          { timestamps: false, schema: 'account' }
        ),
        Group = current.define(
          'group',
          {
            dateField: Sequelize.DATE
          },
          { timestamps: false, schema: 'account' }
        );

      User.belongsToMany(Group, { through: 'group_user' });
      Group.belongsToMany(User, { through: 'group_user' });

      await current.sync();

      const user = await User.create({ dateField: Date.UTC(2014, 1, 20) });
      const group = await Group.create({ dateField: Date.UTC(2014, 1, 20) });

      await user.addGroup(group);

      const users = await User.findAll({
        where: {
          id: user.id
        },
        include: [Group]
      });

      expect(users[0].dateField.getTime()).to.equal(Date.UTC(2014, 1, 20));
      expect(users[0].groups[0].dateField.getTime()).to.equal(Date.UTC(2014, 1, 20));
    });
  });

  describe('findOne', () => {
    it('should work with schemas', async () => {
      const UserModel = current.define(
        'User',
        {
          Id: {
            type: DataTypes.INTEGER,
            primaryKey: true
          },
          Name: DataTypes.STRING,
          UserType: DataTypes.INTEGER,
          Email: DataTypes.STRING,
          PasswordHash: DataTypes.STRING,
          Enabled: {
            type: DataTypes.BOOLEAN
          },
          CreatedDatetime: DataTypes.DATE,
          UpdatedDatetime: DataTypes.DATE
        },
        {
          schema: 'hero',
          tableName: 'User',
          timestamps: false
        }
      );

      const UserIdColumn = { type: Sequelize.INTEGER, references: { model: UserModel, key: 'Id' } };

      const ResumeModel = current.define(
        'Resume',
        {
          Id: {
            type: Sequelize.INTEGER,
            primaryKey: true
          },
          UserId: UserIdColumn,
          Name: Sequelize.STRING,
          Contact: Sequelize.STRING,
          School: Sequelize.STRING,
          WorkingAge: Sequelize.STRING,
          Description: Sequelize.STRING,
          PostType: Sequelize.INTEGER,
          RefreshDatetime: Sequelize.DATE,
          CreatedDatetime: Sequelize.DATE
        },
        {
          schema: 'hero',
          tableName: 'resume',
          timestamps: false
        }
      );

      UserModel.hasOne(ResumeModel, {
        foreignKey: 'UserId',
        as: 'Resume'
      });

      ResumeModel.belongsTo(UserModel, {
        foreignKey: 'UserId'
      });

      await current.dropAllSchemas();
      await current.createSchema('hero');
      await current.sync({ force: true });

      await UserModel.findOne({
        where: {
          Id: 1
        },
        include: [
          {
            model: ResumeModel,
            as: 'Resume'
          }
        ]
      });
    });
  });
});
