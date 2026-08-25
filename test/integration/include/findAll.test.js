import { describe, it } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

const sortById = function (a, b) {
  return a.id < b.id ? -1 : 1;
};

describe(Support.getTestDialectTeaser('Include'), () => {
  describe('findAll', () => {
    let models;

    const fixtureA = async () => {
      const User = current.define('User', {}),
        Company = current.define('Company', {
          name: DataTypes.STRING
        }),
        Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        }),
        Price = current.define('Price', {
          value: DataTypes.FLOAT
        }),
        Customer = current.define('Customer', {
          name: DataTypes.STRING
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
          },
          canPost: {
            type: DataTypes.INTEGER,
            defaultValue: 0
          }
        });

      models = {
        User,
        Company,
        Product,
        Tag,
        Price,
        Customer,
        Group,
        GroupMember,
        Rank
      };

      User.hasMany(Product);
      Product.belongsTo(User);

      Product.belongsToMany(Tag, { through: 'product_tag' });
      Tag.belongsToMany(Product, { through: 'product_tag' });
      Product.belongsTo(Tag, { as: 'Category' });
      Product.belongsTo(Company);

      Product.hasMany(Price);
      Price.belongsTo(Product);

      User.hasMany(GroupMember, { as: 'Memberships' });
      GroupMember.belongsTo(User);
      GroupMember.belongsTo(Rank);
      GroupMember.belongsTo(Group);
      Group.hasMany(GroupMember, { as: 'Memberships' });

      await current.sync({ force: true });

      const [groups, companies, ranks, tags] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'Developers' }, { name: 'Designers' }, { name: 'Managers' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await Company.bulkCreate([
            { name: 'Sequelize' },
            { name: 'Coca Cola' },
            { name: 'Bonanza' },
            { name: 'NYSE' },
            { name: 'Coshopr' }
          ]);
          return await Company.findAll();
        })(),
        (async () => {
          await Rank.bulkCreate([
            { name: 'Admin', canInvite: 1, canRemove: 1, canPost: 1 },
            { name: 'Trustee', canInvite: 1, canRemove: 0, canPost: 1 },
            { name: 'Member', canInvite: 1, canRemove: 0, canPost: 0 }
          ]);
          return await Rank.findAll();
        })(),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]);
          return await Tag.findAll();
        })()
      ]);

      // Sequential on purpose: each pass re-reads every Product row and indexes
      // into it as products[i * 5 + n], so the previous pass's rows must already
      // be committed.
      for (const i of [0, 1, 2, 3, 4]) {
        const [user, products] = await Promise.all([
          User.create(),
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

    it('should work on a nested set of relations with a where condition in between relations', async () => {
      const User = current.define('User', {}),
        SubscriptionForm = current.define('SubscriptionForm', {}),
        Collection = current.define('Collection', {}),
        Category = current.define('Category', {}),
        SubCategory = current.define('SubCategory', {}),
        Capital = current.define('Capital', {});

      User.hasOne(SubscriptionForm, { foreignKey: 'boundUser' });
      SubscriptionForm.belongsTo(User, { foreignKey: 'boundUser' });

      SubscriptionForm.hasOne(Collection, { foreignKey: 'boundDesigner' });
      Collection.belongsTo(SubscriptionForm, { foreignKey: 'boundDesigner' });

      SubscriptionForm.belongsTo(Category, { foreignKey: 'boundCategory' });
      Category.hasMany(SubscriptionForm, { foreignKey: 'boundCategory' });

      Capital.hasMany(Category, { foreignKey: 'boundCapital' });
      Category.belongsTo(Capital, { foreignKey: 'boundCapital' });

      Category.hasMany(SubCategory, { foreignKey: 'boundCategory' });
      SubCategory.belongsTo(Category, { foreignKey: 'boundCategory' });

      await current.sync({ force: true });

      await User.findOne({
        include: [
          {
            model: SubscriptionForm,
            include: [
              {
                model: Collection,
                where: {
                  id: 13
                }
              },
              {
                model: Category,
                include: [
                  {
                    model: SubCategory
                  },
                  {
                    model: Capital,
                    include: [
                      {
                        model: Category
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    it('should accept nested `where` and `limit` at the same time', async () => {
      const Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        }),
        ProductTag = current.define('ProductTag', {
          priority: DataTypes.INTEGER
        }),
        Set = current.define('Set', {
          title: DataTypes.STRING
        });

      Set.hasMany(Product);
      Product.belongsTo(Set);
      Product.belongsToMany(Tag, { through: ProductTag });
      Tag.belongsToMany(Product, { through: ProductTag });

      await current.sync({ force: true });

      await Promise.all([
        Set.bulkCreate([{ title: 'office' }]),
        Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }]),
        Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
      ]);

      const [sets, products, tags] = await Promise.all([Set.findAll(), Product.findAll(), Tag.findAll()]);

      await Promise.all([
        sets[0].addProducts([products[0], products[1]]),
        (async () => {
          await products[0].addTag(tags[0], { priority: 1 });
          await products[0].addTag(tags[1], { priority: 2 });
          await products[0].addTag(tags[2], { priority: 1 });
        })(),
        (async () => {
          await products[1].addTag(tags[1], { priority: 2 });
          await products[2].addTag(tags[1], { priority: 3 });
          await products[2].addTag(tags[2], { priority: 0 });
        })()
      ]);

      await Set.findAll({
        include: [
          {
            model: Product,
            include: [
              {
                model: Tag,
                where: {
                  name: 'A'
                }
              }
            ]
          }
        ],
        limit: 1
      });
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
          User.create(),
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
          { model: GroupMember, as: 'Memberships', include: [Group, Rank] },
          { model: Product, include: [Tag, { model: Tag, as: 'Category' }, Price] }
        ],
        order: [['id', 'ASC']]
      });

      users.forEach((user) => {
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
      const A = current.define('a', {}),
        B = current.define('b', {}),
        C = current.define('c', {}),
        D = current.define('d', {}),
        E = current.define('e', {}),
        F = current.define('f', {}),
        G = current.define('g', {}),
        H = current.define('h', {});

      A.belongsTo(B);
      B.belongsTo(C);
      C.belongsTo(D);
      D.belongsTo(E);
      E.belongsTo(F);
      F.belongsTo(G);
      G.belongsTo(H);

      await current.sync({ force: true });

      const [created, b] = await Promise.all([
        (async () => {
          await A.bulkCreate([{}, {}, {}, {}, {}, {}, {}, {}]);
          return await A.findAll();
        })(),
        (async () => {
          // Sequential on purpose: each model is linked to the one created before it.
          let previousInstance, first;

          for (const model of [B, C, D, E, F, G, H]) {
            const instance = await model.create({});

            if (previousInstance) {
              await previousInstance['set' + Sequelize.Utils.uppercaseFirst(model.name)](instance);
            } else {
              first = instance;
            }

            previousInstance = instance;
          }

          return first;
        })()
      ]);

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

    it('should support many levels of belongsTo (with a lower level having a where)', async () => {
      const A = current.define('a', {}),
        B = current.define('b', {}),
        C = current.define('c', {}),
        D = current.define('d', {}),
        E = current.define('e', {}),
        F = current.define('f', {}),
        G = current.define('g', {
          name: DataTypes.STRING
        }),
        H = current.define('h', {
          name: DataTypes.STRING
        });

      A.belongsTo(B);
      B.belongsTo(C);
      C.belongsTo(D);
      D.belongsTo(E);
      E.belongsTo(F);
      F.belongsTo(G);
      G.belongsTo(H);

      await current.sync({ force: true });

      const [created, b] = await Promise.all([
        (async () => {
          await A.bulkCreate([{}, {}, {}, {}, {}, {}, {}, {}]);
          return await A.findAll();
        })(),
        (async () => {
          // Sequential on purpose: each model is linked to the one created before it.
          let previousInstance, first;

          for (const model of [B, C, D, E, F, G, H]) {
            const values = {};

            if (model.name === 'g') {
              values.name = 'yolo';
            }

            const instance = await model.create(values);

            if (previousInstance) {
              await previousInstance['set' + Sequelize.Utils.uppercaseFirst(model.name)](instance);
            } else {
              first = instance;
            }

            previousInstance = instance;
          }

          return first;
        })()
      ]);

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
                    include: [
                      {
                        model: E,
                        include: [
                          {
                            model: F,
                            include: [
                              {
                                model: G,
                                where: {
                                  name: 'yolo'
                                },
                                include: [{ model: H }]
                              }
                            ]
                          }
                        ]
                      }
                    ]
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
      const User = current.define('User', {}),
        Item = current.define('Item', { test: DataTypes.STRING }),
        Order = current.define('Order', { position: DataTypes.INTEGER });

      User.belongsTo(Item, { as: 'itemA', foreignKey: 'itemA_id' });
      User.belongsTo(Item, { as: 'itemB', foreignKey: 'itemB_id' });
      User.belongsTo(Order);

      await current.sync();

      const [users, items, orders] = await Promise.all([
        (async () => {
          await User.bulkCreate([{}, {}, {}]);
          return await User.findAll();
        })(),
        (async () => {
          await Item.bulkCreate([{ test: 'abc' }, { test: 'def' }, { test: 'ghi' }, { test: 'jkl' }]);
          return await Item.findAll({ order: ['id'] });
        })(),
        (async () => {
          await Order.bulkCreate([{ position: 2 }, { position: 3 }, { position: 1 }]);
          return await Order.findAll({ order: ['id'] });
        })()
      ]);

      const user1 = users[0];
      const user2 = users[1];
      const user3 = users[2];

      const item1 = items[0];
      const item2 = items[1];
      const item3 = items[2];
      const item4 = items[3];

      const order1 = orders[0];
      const order2 = orders[1];
      const order3 = orders[2];

      await Promise.all([
        user1.setItemA(item1),
        user1.setItemB(item2),
        user1.setOrder(order3),
        user2.setItemA(item3),
        user2.setItemB(item4),
        user2.setOrder(order2),
        user3.setItemA(item1),
        user3.setItemB(item4),
        user3.setOrder(order1)
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
      const Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        }),
        ProductTag = current.define('ProductTag', {
          priority: DataTypes.INTEGER
        });

      Product.belongsToMany(Tag, { through: ProductTag });
      Tag.belongsToMany(Product, { through: ProductTag });

      await current.sync({ force: true });

      const [created, tags] = await Promise.all([
        (async () => {
          await Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }]);
          return await Product.findAll();
        })(),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
          return await Tag.findAll();
        })()
      ]);

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
      const User = current.define('User', {}),
        Group = current.define('Group', {});

      User.belongsTo(Group);

      await current.sync({ force: true });

      const [groups, created] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{}, {}]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}, {}]);
          return await User.findAll();
        })()
      ]);

      await created[2].setGroup(groups[1]);

      const users = await User.findAll({
        include: [{ model: Group, required: true }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].Group).to.be.ok;
    });

    it('should be possible to extend the on clause with a where option on a belongsTo include', async () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        });

      User.belongsTo(Group);

      await current.sync({ force: true });

      const [groups, created] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })()
      ]);

      await Promise.all([created[0].setGroup(groups[1]), created[1].setGroup(groups[0])]);

      const users = await User.findAll({
        include: [{ model: Group, where: { name: 'A' } }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].Group).to.be.ok;
      expect(users[0].Group.name).to.equal('A');
    });

    it('should be possible to extend the on clause with a where option on a belongsTo include', async () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        });

      User.belongsTo(Group);

      await current.sync({ force: true });

      const [groups, created] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })()
      ]);

      await Promise.all([created[0].setGroup(groups[1]), created[1].setGroup(groups[0])]);

      const users = await User.findAll({
        include: [{ model: Group, required: true }]
      });

      users.forEach((user) => {
        expect(user.Group).to.be.ok;
      });
    });

    it('should be possible to define a belongsTo include as required with child hasMany not required', async () => {
      const Address = current.define('Address', { active: DataTypes.BOOLEAN }),
        Street = current.define('Street', { active: DataTypes.BOOLEAN }),
        User = current.define('User', { username: DataTypes.STRING });

      // Associate
      User.belongsTo(Address, { foreignKey: 'addressId' });
      Address.hasMany(User, { foreignKey: 'addressId' });

      Address.belongsTo(Street, { foreignKey: 'streetId' });
      Street.hasMany(Address, { foreignKey: 'streetId' });

      // Sync
      await current.sync({ force: true });

      const street = await Street.create({ active: true });
      const address = await Address.create({ active: true, streetId: street.id });

      await User.create({ username: 'John', addressId: address.id });

      const john = await User.findOne({
        where: { username: 'John' },
        include: [
          {
            model: Address,
            required: true,
            where: {
              active: true
            },
            include: [
              {
                model: Street
              }
            ]
          }
        ]
      });

      expect(john.Address).to.be.ok;
      expect(john.Address.Street).to.be.ok;
    });

    it('should be possible to define a belongsTo include as required with child hasMany with limit', async () => {
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        }),
        Category = current.define('Category', {
          category: DataTypes.STRING
        });

      User.belongsTo(Group);
      Group.hasMany(Category);

      await current.sync({ force: true });

      const [groups, created, categories] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })(),
        (async () => {
          await Category.bulkCreate([{}, {}]);
          return await Category.findAll();
        })()
      ]);

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
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        }),
        Category = current.define('Category', {
          category: DataTypes.STRING
        });

      User.belongsTo(Group, { as: 'Team' });
      Group.hasMany(Category, { as: 'Tags' });

      await current.sync({ force: true });

      const [groups, created, categories] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })(),
        (async () => {
          await Category.bulkCreate([{}, {}]);
          return await Category.findAll();
        })()
      ]);

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
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        }),
        Category = current.define('Category', {
          category: DataTypes.STRING
        });

      User.belongsTo(Group);
      Group.hasMany(Category);

      await current.sync({ force: true });

      const [groups, created, categories] = await Promise.all([
        (async () => {
          await Group.bulkCreate([{ name: 'A' }, { name: 'B' }]);
          return await Group.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })(),
        (async () => {
          await Category.bulkCreate([{}, {}]);
          return await Category.findAll();
        })()
      ]);

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
      const User = current.define('User', {}),
        Project = current.define('Project', {
          title: DataTypes.STRING
        });

      User.hasOne(Project, { as: 'LeaderOf' });

      await current.sync({ force: true });

      const [projects, created] = await Promise.all([
        (async () => {
          await Project.bulkCreate([{ title: 'Alpha' }, { title: 'Beta' }]);
          return await Project.findAll();
        })(),
        (async () => {
          await User.bulkCreate([{}, {}]);
          return await User.findAll();
        })()
      ]);

      await Promise.all([created[1].setLeaderOf(projects[1]), created[0].setLeaderOf(projects[0])]);

      const users = await User.findAll({
        include: [{ model: Project, as: 'LeaderOf', where: { title: 'Beta' } }]
      });

      expect(users.length).to.equal(1);
      expect(users[0].LeaderOf).to.be.ok;
      expect(users[0].LeaderOf.title).to.equal('Beta');
    });

    it('should be possible to extend the on clause with a where option on a hasMany include with a through model', async () => {
      const Product = current.define('Product', {
          title: DataTypes.STRING
        }),
        Tag = current.define('Tag', {
          name: DataTypes.STRING
        }),
        ProductTag = current.define('ProductTag', {
          priority: DataTypes.INTEGER
        });

      Product.belongsToMany(Tag, { through: ProductTag });
      Tag.belongsToMany(Product, { through: ProductTag });

      await current.sync({ force: true });

      const [created, tags] = await Promise.all([
        (async () => {
          await Product.bulkCreate([{ title: 'Chair' }, { title: 'Desk' }, { title: 'Dress' }]);
          return await Product.findAll();
        })(),
        (async () => {
          await Tag.bulkCreate([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
          return await Tag.findAll();
        })()
      ]);

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
      const User = current.define('User', {
          name: DataTypes.STRING
        }),
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
          Promise.all([
            products[i * 2 + 0].setTags([tags[0], tags[2]]),
            products[i * 2 + 1].setTags([tags[1]]),
            products[i * 2 + 0].setCategory(tags[1])
          ]),
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
      const User = current.define('User', {}),
        Group = current.define('Group', {
          name: DataTypes.STRING
        });

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
        created[0].setGroup(groups[0]),
        created[1].setGroup(groups[0]),
        created[2].setGroup(groups[0]),
        created[3].setGroup(groups[1])
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
        attributes: ['id', 'title'],
        include: [{ model: models.Company, where: { name: 'NYSE' } }, { model: models.Tag }, { model: models.Price }],
        limit: 3,
        order: [[current.col(models.Product.name + '.id'), 'ASC']]
      });

      expect(products.length).to.equal(3);

      products.forEach((product) => {
        expect(product.Company.name).to.equal('NYSE');
        expect(product.Tags.length).to.be.ok;
        expect(product.Prices.length).to.be.ok;
      });
    });

    it('should be possible to have the primary key in attributes', async () => {
      const Parent = current.define('Parent', {});
      const Child1 = current.define('Child1', {});

      Parent.hasMany(Child1);
      Child1.belongsTo(Parent);

      await current.sync({ force: true });

      const [parent, child] = await Promise.all([Parent.create(), Child1.create()]);

      await parent.addChild1(child);

      await Child1.findOne({
        include: [
          {
            model: Parent,
            attributes: ['id'], // This causes a duplicated entry in the query
            where: {
              id: parent.id
            }
          }
        ]
      });
    });

    it('should be possible to turn off the attributes for the through table', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        attributes: ['title'],
        include: [{ model: models.Tag, through: { attributes: [] }, required: true }]
      });

      products.forEach((product) => {
        expect(product.Tags.length).to.be.ok;
        product.Tags.forEach((tag) => {
          expect(tag.get().productTags).not.to.be.ok;
        });
      });
    });

    it('should be possible to select on columns inside a through table', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        attributes: ['title'],
        include: [
          {
            model: models.Tag,
            through: {
              where: {
                ProductId: 3
              }
            },
            required: true
          }
        ]
      });

      expect(products).have.length(1);
    });

    it('should be possible to select on columns inside a through table and a limit', async () => {
      await fixtureA();

      const products = await models.Product.findAll({
        attributes: ['title'],
        include: [
          {
            model: models.Tag,
            through: {
              where: {
                ProductId: 3
              }
            },
            required: true
          }
        ],
        limit: 5
      });

      expect(products).have.length(1);
    });

    // Test case by @eshell
    it('should be possible not to include the main id in the attributes', async () => {
      const Member = current.define('Member', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true
        },
        email: {
          type: Sequelize.STRING,
          unique: true,
          allowNull: false,
          validate: {
            isEmail: true,
            notNull: true,
            notEmpty: true
          }
        },
        password: Sequelize.STRING
      });
      const Album = current.define('Album', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true
        },
        title: {
          type: Sequelize.STRING(25),
          allowNull: false
        }
      });

      Album.belongsTo(Member);
      Member.hasMany(Album);

      await current.sync({ force: true });

      const members = [],
        albums = [],
        memberCount = 20;

      for (let i = 1; i <= memberCount; i++) {
        members.push({
          id: i,
          email: 'email' + i + '@lmu.com',
          password: 'testing' + i
        });
        albums.push({
          title: 'Album' + i,
          MemberId: i
        });
      }

      await Member.bulkCreate(members);
      await Album.bulkCreate(albums);

      const foundMembers = await Member.findAll({
        attributes: ['email'],
        include: [
          {
            model: Album
          }
        ]
      });

      expect(foundMembers.length).to.equal(20);
      foundMembers.forEach((member) => {
        expect(member.get('id')).not.to.be.ok;
        expect(member.Albums.length).to.equal(1);
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

    it('should still pull the main record(s) when an included model is not required and has where restrictions without matches', async () => {
      const A = current.define('a', { name: DataTypes.STRING(40) }),
        B = current.define('b', { name: DataTypes.STRING(40) });

      A.belongsToMany(B, { through: 'a_b' });
      B.belongsToMany(A, { through: 'a_b' });

      await current.sync({ force: true });
      await A.create({
        name: 'Foobar'
      });

      const as = await A.findAll({
        where: { name: 'Foobar' },
        include: [{ model: B, where: { name: 'idontexist' }, required: false }]
      });

      expect(as.length).to.equal(1);
      expect(as[0].get('bs')).deep.equal([]);
    });

    it('should work with paranoid, a main record where, an include where, and a limit', async () => {
      const Post = current.define(
        'post',
        {
          date: DataTypes.DATE,
          public: DataTypes.BOOLEAN
        },
        {
          paranoid: true
        }
      );
      const Category = current.define('category', {
        slug: DataTypes.STRING
      });

      Post.hasMany(Category);
      Category.belongsTo(Post);

      await current.sync({ force: true });

      const created = await Promise.all([
        Post.create({ public: true }),
        Post.create({ public: true }),
        Post.create({ public: true }),
        Post.create({ public: true })
      ]);

      await Promise.all(created.slice(1, 3).map((post) => post.createCategory({ slug: 'food' })));

      const posts = await Post.findAll({
        limit: 2,
        where: {
          public: true
        },
        include: [
          {
            model: Category,
            where: {
              slug: 'food'
            }
          }
        ]
      });

      expect(posts.length).to.equal(2);
    });

    it('should work on a nested set of required 1:1 relations', async () => {
      const Person = current.define('Person', {
        name: {
          type: Sequelize.STRING,
          allowNull: false
        }
      });

      const UserPerson = current.define('UserPerson', {
        PersonId: {
          type: Sequelize.INTEGER,
          primaryKey: true
        },

        rank: {
          type: Sequelize.STRING
        }
      });

      const User = current.define('User', {
        UserPersonId: {
          type: Sequelize.INTEGER,
          primaryKey: true
        },

        login: {
          type: Sequelize.STRING,
          unique: true,
          allowNull: false
        }
      });

      UserPerson.belongsTo(Person, {
        foreignKey: {
          allowNull: false
        },
        onDelete: 'CASCADE'
      });
      Person.hasOne(UserPerson, {
        foreignKey: {
          allowNull: false
        },
        onDelete: 'CASCADE'
      });

      User.belongsTo(UserPerson, {
        foreignKey: {
          name: 'UserPersonId',
          allowNull: false
        },
        onDelete: 'CASCADE'
      });
      UserPerson.hasOne(User, {
        foreignKey: {
          name: 'UserPersonId',
          allowNull: false
        },
        onDelete: 'CASCADE'
      });

      await current.sync({ force: true });

      await Person.findAll({
        offset: 0,
        limit: 20,
        attributes: ['id', 'name'],
        include: [
          {
            model: UserPerson,
            required: true,
            attributes: ['rank'],
            include: [
              {
                model: User,
                required: true,
                attributes: ['login']
              }
            ]
          }
        ]
      });
    });

    it('should work with an empty include.where', async () => {
      const User = current.define('User', {}),
        Company = current.define('Company', {}),
        Group = current.define('Group', {});

      User.belongsTo(Company);
      User.belongsToMany(Group, { through: 'UsersGroups' });
      Group.belongsToMany(User, { through: 'UsersGroups' });

      await current.sync({ force: true });

      await User.findAll({
        include: [
          { model: Group, where: {} },
          { model: Company, where: {} }
        ]
      });
    });

    it('should be able to order on the main table and a required belongsTo relation with custom tablenames and limit ', async () => {
      const User = current.define(
        'User',
        {
          lastName: DataTypes.STRING
        },
        { tableName: 'dem_users' }
      );
      const Company = current.define(
        'Company',
        {
          rank: DataTypes.INTEGER
        },
        { tableName: 'dem_companies' }
      );

      User.belongsTo(Company);
      Company.hasMany(User);

      await current.sync({ force: true });

      const [albertsen, zenith, hansen, company1, company2] = await Promise.all([
        User.create({ lastName: 'Albertsen' }),
        User.create({ lastName: 'Zenith' }),
        User.create({ lastName: 'Hansen' }),
        Company.create({ rank: 1 }),
        Company.create({ rank: 2 })
      ]);

      await Promise.all([albertsen.setCompany(company1), zenith.setCompany(company2), hansen.setCompany(company2)]);

      const users = await User.findAll({
        include: [{ model: Company, required: true }],
        order: [
          [Company, 'rank', 'ASC'],
          ['lastName', 'DESC']
        ],
        limit: 5
      });

      expect(users[0].lastName).to.equal('Albertsen');
      expect(users[0].Company.rank).to.equal(1);

      expect(users[1].lastName).to.equal('Zenith');
      expect(users[1].Company.rank).to.equal(2);

      expect(users[2].lastName).to.equal('Hansen');
      expect(users[2].Company.rank).to.equal(2);
    });

    it('should ignore include with attributes: [] (used for aggregates)', async () => {
      const Post = current.define('Post', {
          title: DataTypes.STRING
        }),
        Comment = current.define('Comment', {
          content: DataTypes.TEXT
        });

      Post.Comments = Post.hasMany(Comment, { as: 'comments' });

      await current.sync({ force: true });
      await Post.create(
        {
          title: Math.random().toString(),
          comments: [
            { content: Math.random().toString() },
            { content: Math.random().toString() },
            { content: Math.random().toString() }
          ]
        },
        {
          include: [Post.Comments]
        }
      );

      const posts = await Post.findAll({
        attributes: [[current.fn('COUNT', current.col('comments.id')), 'commentCount']],
        include: [{ association: Post.Comments, attributes: [] }],
        group: ['Post.id']
      });

      expect(posts.length).to.equal(1);

      const post = posts[0];

      expect(post.get('comments')).not.to.be.ok;
      expect(parseInt(post.get('commentCount'), 10)).to.equal(3);
    });

    it('should not add primary key when including and aggregating with raw: true', async () => {
      const Post = current.define('Post', {
          title: DataTypes.STRING
        }),
        Comment = current.define('Comment', {
          content: DataTypes.TEXT
        });

      Post.Comments = Post.hasMany(Comment, { as: 'comments' });

      await current.sync({ force: true });
      await Post.create(
        {
          title: Math.random().toString(),
          comments: [
            { content: Math.random().toString() },
            { content: Math.random().toString() },
            { content: Math.random().toString() }
          ]
        },
        {
          include: [Post.Comments]
        }
      );

      const posts = await Post.findAll({
        attributes: [],
        include: [
          {
            association: Post.Comments,
            attributes: [[current.fn('COUNT', current.col('comments.id')), 'commentCount']]
          }
        ],
        raw: true
      });

      expect(posts.length).to.equal(1);

      const post = posts[0];
      expect(post.id).not.to.be.ok;
      expect(parseInt(post['comments.commentCount'], 10)).to.equal(3);
    });

    it('Should return posts with nested include with inner join with a m:n association', async () => {
      const User = current.define('User', {
        username: {
          type: DataTypes.STRING,
          primaryKey: true
        }
      });

      const Entity = current.define('Entity', {
        entity_id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        creator: {
          type: DataTypes.STRING,
          allowNull: false
        },
        votes: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        }
      });

      const Post = current.define('Post', {
        post_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true
        }
      });

      const TaggableSentient = current.define('TaggableSentient', {
        nametag: {
          type: DataTypes.STRING,
          primaryKey: true
        }
      });

      Entity.belongsTo(User, { foreignKey: 'creator', targetKey: 'username' });
      Post.belongsTo(Entity, { foreignKey: 'post_id', targetKey: 'entity_id' });

      Entity.belongsToMany(TaggableSentient, {
        as: 'tags',
        through: { model: 'EntityTag', unique: false },
        foreignKey: 'entity_id',
        otherKey: 'tag_name'
      });

      TaggableSentient.belongsToMany(Entity, {
        as: 'tags',
        through: { model: 'EntityTag', unique: false },
        foreignKey: 'tag_name',
        otherKey: 'entity_id'
      });

      await current.sync({ force: true });
      await User.create({ username: 'bob' });
      await TaggableSentient.create({ nametag: 'bob' });

      const entity = await Entity.create({ creator: 'bob' });

      await Promise.all([Post.create({ post_id: entity.entity_id }), entity.addTags('bob')]);

      const posts = await Post.findAll({
        include: [
          {
            model: Entity,
            required: true,
            include: [
              {
                model: User,
                required: true
              },
              {
                model: TaggableSentient,
                as: 'tags',
                required: true,
                through: {
                  where: {
                    tag_name: ['bob']
                  }
                }
              }
            ]
          }
        ],
        limit: 5,
        offset: 0
      });

      expect(posts.length).to.equal(1);
      expect(posts[0].Entity.creator).to.equal('bob');
      expect(posts[0].Entity.tags.length).to.equal(1);
      expect(posts[0].Entity.tags[0].EntityTag.tag_name).to.equal('bob');
      expect(posts[0].Entity.tags[0].EntityTag.entity_id).to.equal(posts[0].post_id);
    });

    it('should be able to generate a correct request with inner and outer join', async () => {
      const Customer = current.define('customer', {
        name: DataTypes.STRING
      });

      const ShippingAddress = current.define('shippingAddress', {
        address: DataTypes.STRING,
        verified: DataTypes.BOOLEAN
      });

      const Order = current.define('purchaseOrder', {
        description: DataTypes.TEXT
      });

      const Shipment = current.define('shipment', {
        trackingNumber: DataTypes.STRING
      });

      Customer.hasMany(ShippingAddress);
      ShippingAddress.belongsTo(Customer);

      Customer.hasMany(Order);
      Order.belongsTo(Customer);

      Shipment.belongsTo(Order);
      Order.hasOne(Shipment);

      await current.sync({ force: true });

      await Shipment.findOne({
        include: [
          {
            model: Order,
            required: true,
            include: [
              {
                model: Customer,
                include: [
                  {
                    model: ShippingAddress,
                    where: { verified: true }
                  }
                ]
              }
            ]
          }
        ]
      });
    });
  });
});
