import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { mapWithConcurrency } from '../../lib/utils/promise-helpers.js';
import { expect } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import sinon from 'sinon';
import _ from 'lodash';
import moment from 'moment';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  before(function () {
    // Only fake `Date` — faking timers/immediates freezes the timer pg's pool
    // and retry logic rely on, which hangs queries like `CREATE INDEX CONCURRENTLY`
    // (see the "indexes in options" test). sinon >=11 fakes those by default.
    this.clock = sinon.useFakeTimers({ toFake: ['Date'] });
  });

  after(function () {
    this.clock.restore();
  });

  beforeEach(function () {
    this.User = this.sequelize.define('User', {
      username: DataTypes.STRING,
      secretValue: DataTypes.STRING,
      data: DataTypes.STRING,
      intVal: DataTypes.INTEGER,
      theDate: DataTypes.DATE,
      aBool: DataTypes.BOOLEAN
    });

    return this.User.sync({ force: true });
  });

  describe('constructor', () => {
    it('uses the passed dao name as tablename if freezeTableName', function () {
      const User = this.sequelize.define('FrozenUser', {}, { freezeTableName: true });
      expect(User.tableName).to.equal('FrozenUser');
    });

    it('uses the pluralized dao name as tablename unless freezeTableName', function () {
      const User = this.sequelize.define('SuperUser', {}, { freezeTableName: false });
      expect(User.tableName).to.equal('SuperUsers');
    });

    it('uses checks to make sure dao factory isnt leaking on multiple define', function () {
      this.sequelize.define('SuperUser', {}, { freezeTableName: false });
      const factorySize = this.sequelize.modelManager.all.length;

      this.sequelize.define('SuperUser', {}, { freezeTableName: false });
      const factorySize2 = this.sequelize.modelManager.all.length;

      expect(factorySize).to.equal(factorySize2);
    });

    it('allows us us to predefine the ID column with our own specs', async function () {
      const User = this.sequelize.define('UserCol', {
        id: {
          type: Sequelize.STRING,
          defaultValue: 'User',
          primaryKey: true
        }
      });

      await User.sync({ force: true });

      await expect(User.create({ id: 'My own ID!' })).to.eventually.have.property('id', 'My own ID!');
    });

    it('throws an error if 2 autoIncrements are passed', function () {
      expect(() => {
        this.sequelize.define('UserWithTwoAutoIncrements', {
          userid: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          userscore: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true }
        });
      }).to.throw(Error, 'Invalid Instance definition. Only one autoincrement field allowed.');
    });

    it('throws an error if a custom model-wide validation is not a function', function () {
      expect(() => {
        this.sequelize.define(
          'Foo',
          {
            field: Sequelize.INTEGER
          },
          {
            validate: {
              notFunction: 33
            }
          }
        );
      }).to.throw(
        Error,
        'Members of the validate option must be functions. Model: Foo, error with validate member notFunction'
      );
    });

    it('throws an error if a custom model-wide validation has the same name as a field', function () {
      expect(() => {
        this.sequelize.define(
          'Foo',
          {
            field: Sequelize.INTEGER
          },
          {
            validate: {
              field() {}
            }
          }
        );
      }).to.throw(
        Error,
        'A model validator function must not have the same name as a field. Model: Foo, field/validation name: field'
      );
    });

    it('should allow me to set a default value for createdAt and updatedAt', async function () {
      const UserTable = this.sequelize.define(
        'UserCol',
        {
          aNumber: Sequelize.INTEGER,
          createdAt: {
            type: Sequelize.DATE,
            defaultValue: moment('2012-01-01').toDate()
          },
          updatedAt: {
            type: Sequelize.DATE,
            defaultValue: moment('2012-01-02').toDate()
          }
        },
        { timestamps: true }
      );

      await UserTable.sync({ force: true });

      const user = await UserTable.create({ aNumber: 5 });

      await UserTable.bulkCreate([{ aNumber: 10 }, { aNumber: 12 }]);

      const users = await UserTable.findAll({ where: { aNumber: { gte: 10 } } });

      expect(moment(user.createdAt).format('YYYY-MM-DD')).to.equal('2012-01-01');
      expect(moment(user.updatedAt).format('YYYY-MM-DD')).to.equal('2012-01-02');
      users.forEach((u) => {
        expect(moment(u.createdAt).format('YYYY-MM-DD')).to.equal('2012-01-01');
        expect(moment(u.updatedAt).format('YYYY-MM-DD')).to.equal('2012-01-02');
      });
    });

    it('should allow me to set a function as default value', async function () {
      const defaultFunction = sinon.stub().returns(5);
      const UserTable = this.sequelize.define(
        'UserCol',
        {
          aNumber: {
            type: Sequelize.INTEGER,
            defaultValue: defaultFunction
          }
        },
        { timestamps: true }
      );

      await UserTable.sync({ force: true });

      const user = await UserTable.create();
      const user2 = await UserTable.create();

      expect(user.aNumber).to.equal(5);
      expect(user2.aNumber).to.equal(5);
      expect(defaultFunction.callCount).to.equal(2);
    });

    it('should allow me to override updatedAt, createdAt, and deletedAt fields', async function () {
      const UserTable = this.sequelize.define(
        'UserCol',
        {
          aNumber: Sequelize.INTEGER
        },
        {
          timestamps: true,
          updatedAt: 'updatedOn',
          createdAt: 'dateCreated',
          deletedAt: 'deletedAtThisTime',
          paranoid: true
        }
      );

      await UserTable.sync({ force: true });

      const user = await UserTable.create({ aNumber: 4 });

      expect(user.updatedOn).to.exist;
      expect(user.dateCreated).to.exist;

      await user.destroy();
      await user.reload({ paranoid: false });

      expect(user.deletedAtThisTime).to.exist;
    });

    it('should allow me to disable some of the timestamp fields', async function () {
      const UpdatingUser = this.sequelize.define(
        'UpdatingUser',
        {
          name: DataTypes.STRING
        },
        {
          timestamps: true,
          updatedAt: false,
          createdAt: false,
          deletedAt: 'deletedAtThisTime',
          paranoid: true
        }
      );

      await UpdatingUser.sync({ force: true });

      const user = await UpdatingUser.create({
        name: 'heyo'
      });

      expect(user.createdAt).not.to.exist;
      expect(user.false).not.to.exist; // because, you know we might accidentally add a field named 'false'

      user.name = 'heho';

      const savedUser = await user.save();

      expect(savedUser.updatedAt).not.to.exist;

      await savedUser.destroy();
      await savedUser.reload({ paranoid: false });

      expect(savedUser.deletedAtThisTime).to.exist;
    });

    it('returns proper defaultValues after save when setter is set', async function () {
      const titleSetter = sinon.spy(),
        Task = this.sequelize.define(
          'TaskBuild',
          {
            title: {
              type: Sequelize.STRING(50),
              allowNull: false,
              defaultValue: ''
            }
          },
          {
            setterMethods: {
              title: titleSetter
            }
          }
        );

      await Task.sync({ force: true });

      const record = await Task.build().save();

      expect(record.title).to.be.a('string');
      expect(record.title).to.equal('');
      expect(titleSetter.notCalled).to.be.ok; // The setter method should not be invoked for default values
    });

    it('should work with both paranoid and underscored being true', async function () {
      const UserTable = this.sequelize.define(
        'UserCol',
        {
          aNumber: Sequelize.INTEGER
        },
        {
          paranoid: true,
          underscored: true
        }
      );

      await UserTable.sync({ force: true });
      await UserTable.create({ aNumber: 30 });

      const c = await UserTable.count();

      expect(c).to.equal(1);
    });

    it('allows multiple column unique keys to be defined', function () {
      const User = this.sequelize.define('UserWithUniqueUsername', {
        username: { type: Sequelize.STRING, unique: 'user_and_email' },
        email: { type: Sequelize.STRING, unique: 'user_and_email' },
        aCol: { type: Sequelize.STRING, unique: 'a_and_b' },
        bCol: { type: Sequelize.STRING, unique: 'a_and_b' }
      });

      return User.sync({
        force: true,
        logging: _.after(
          2,
          _.once(() => {})
        )
      });
    });

    it('allows unique on column with field aliases', async function () {
      const User = this.sequelize.define('UserWithUniqueFieldAlias', {
        userName: { type: Sequelize.STRING, unique: 'user_name_unique', field: 'user_name' }
      });

      await User.sync({ force: true });

      const indexes = await this.sequelize.queryInterface.showIndex(User.tableName);

      expect(indexes).to.have.length(2);
      const idxUnique = indexes[1];
      expect(idxUnique.primary).to.equal(false);
      expect(idxUnique.unique).to.equal(true);
      expect(idxUnique.fields).to.deep.equal([
        { attribute: 'user_name', collate: undefined, order: undefined, length: undefined }
      ]);
    });

    it('allows us to customize the error message for unique constraint', async function () {
      const User = this.sequelize.define('UserWithUniqueUsername', {
        username: {
          type: Sequelize.STRING,
          unique: { name: 'user_and_email', msg: 'User and email must be unique' }
        },
        email: { type: Sequelize.STRING, unique: 'user_and_email' }
      });

      await User.sync({ force: true });

      const err = await expect(
        Promise.all([
          User.create({ username: 'tobi', email: 'tobi@tobi.me' }),
          User.create({ username: 'tobi', email: 'tobi@tobi.me' })
        ])
      ).to.be.rejectedWith(this.sequelize.UniqueConstraintError);

      expect(err.message).to.equal('User and email must be unique');
    });

    // If you use migrations to create unique indexes that have explicit names and/or contain fields
    // that have underscore in their name. Then sequelize must use the index name to map the custom message to the error thrown from db.
    it('allows us to map the customized error message with unique constraint name', async function () {
      // Fake migration style index creation with explicit index definition
      let User = this.sequelize.define(
        'UserWithUniqueUsername',
        {
          user_id: { type: Sequelize.INTEGER },
          email: { type: Sequelize.STRING }
        },
        {
          indexes: [
            {
              name: 'user_and_email_index',
              msg: 'User and email must be unique',
              unique: true,
              method: 'BTREE',
              fields: ['user_id', { attribute: 'email', collate: 'en_US', order: 'DESC', length: 5 }]
            }
          ]
        }
      );

      await User.sync({ force: true });

      // Redefine the model to use the index in database and override error message
      User = this.sequelize.define('UserWithUniqueUsername', {
        user_id: {
          type: Sequelize.INTEGER,
          unique: { name: 'user_and_email_index', msg: 'User and email must be unique' }
        },
        email: { type: Sequelize.STRING, unique: 'user_and_email_index' }
      });

      const err = await expect(
        Promise.all([
          User.create({ user_id: 1, email: 'tobi@tobi.me' }),
          User.create({ user_id: 1, email: 'tobi@tobi.me' })
        ])
      ).to.be.rejectedWith(this.sequelize.UniqueConstraintError);

      expect(err.message).to.equal('User and email must be unique');
    });

    it('should allow the user to specify indexes in options', async function () {
      const indices = [
        {
          name: 'a_b_uniq',
          unique: true,
          method: 'BTREE',
          fields: ['fieldB', { attribute: 'fieldA', collate: 'en_US', order: 'DESC', length: 5 }]
        }
      ];

      indices.push({
        type: 'FULLTEXT',
        fields: ['fieldC'],
        concurrently: true
      });

      indices.push({
        type: 'FULLTEXT',
        fields: ['fieldD']
      });

      const Model = this.sequelize.define(
        'model',
        {
          fieldA: Sequelize.STRING,
          fieldB: Sequelize.INTEGER,
          fieldC: Sequelize.STRING,
          fieldD: Sequelize.STRING
        },
        {
          indexes: indices,
          engine: 'MyISAM'
        }
      );

      await this.sequelize.sync();
      await this.sequelize.sync(); // The second call should not try to create the indices again

      const indexes = await this.sequelize.queryInterface.showIndex(Model.tableName);

      // Postgres returns indexes in alphabetical order
      const idx1 = indexes[0];
      const idx2 = indexes[1];
      const idx3 = indexes[2];

      expect(idx1.fields).to.deep.equal([
        { attribute: 'fieldB', length: undefined, order: undefined, collate: undefined },
        { attribute: 'fieldA', length: undefined, order: 'DESC', collate: 'en_US' }
      ]);

      expect(idx2.fields).to.deep.equal([
        { attribute: 'fieldC', length: undefined, order: undefined, collate: undefined }
      ]);

      expect(idx3.fields).to.deep.equal([
        { attribute: 'fieldD', length: undefined, order: undefined, collate: undefined }
      ]);

      expect(idx1.name).to.equal('a_b_uniq');
      expect(idx1.unique).to.be.ok;

      expect(idx2.name).to.equal('models_field_c');
      expect(idx2.unique).not.to.be.ok;
    });
  });

  describe('build', () => {
    it("doesn't create database entries", async function () {
      this.User.build({ username: 'John Wayne' });

      const users = await this.User.findAll();

      expect(users).to.have.length(0);
    });

    it('fills the objects with default values', function () {
      const Task = this.sequelize.define('TaskBuild', {
        title: { type: Sequelize.STRING, defaultValue: 'a task!' },
        foo: { type: Sequelize.INTEGER, defaultValue: 2 },
        bar: { type: Sequelize.DATE },
        foobar: { type: Sequelize.TEXT, defaultValue: 'asd' },
        flag: { type: Sequelize.BOOLEAN, defaultValue: false }
      });

      expect(Task.build().title).to.equal('a task!');
      expect(Task.build().foo).to.equal(2);
      expect(Task.build().bar).to.not.be.ok;
      expect(Task.build().foobar).to.equal('asd');
      expect(Task.build().flag).to.be.false;
    });

    it('fills the objects with default values', function () {
      const Task = this.sequelize.define(
        'TaskBuild',
        {
          title: { type: Sequelize.STRING, defaultValue: 'a task!' },
          foo: { type: Sequelize.INTEGER, defaultValue: 2 },
          bar: { type: Sequelize.DATE },
          foobar: { type: Sequelize.TEXT, defaultValue: 'asd' },
          flag: { type: Sequelize.BOOLEAN, defaultValue: false }
        },
        { timestamps: false }
      );
      expect(Task.build().title).to.equal('a task!');
      expect(Task.build().foo).to.equal(2);
      expect(Task.build().bar).to.not.be.ok;
      expect(Task.build().foobar).to.equal('asd');
      expect(Task.build().flag).to.be.false;
    });

    it('attaches getter and setter methods from attribute definition', function () {
      const Product = this.sequelize.define('ProductWithSettersAndGetters1', {
        price: {
          type: Sequelize.INTEGER,
          get() {
            return 'answer = ' + this.getDataValue('price');
          },
          set(v) {
            return this.setDataValue('price', v + 42);
          }
        }
      });

      expect(Product.build({ price: 42 }).price).to.equal('answer = 84');

      const p = Product.build({ price: 1 });
      expect(p.price).to.equal('answer = 43');

      p.price = 0;
      expect(p.price).to.equal('answer = 42');
    });

    it('attaches getter and setter methods from options', function () {
      const Product = this.sequelize.define(
        'ProductWithSettersAndGetters2',
        {
          priceInCents: Sequelize.INTEGER
        },
        {
          setterMethods: {
            price(value) {
              this.dataValues.priceInCents = value * 100;
            }
          },
          getterMethods: {
            price() {
              return '$' + this.getDataValue('priceInCents') / 100;
            },

            priceInCents() {
              return this.dataValues.priceInCents;
            }
          }
        }
      );

      expect(Product.build({ price: 20 }).priceInCents).to.equal(20 * 100);
      expect(Product.build({ priceInCents: 30 * 100 }).price).to.equal('$' + 30);
    });

    it('attaches getter and setter methods from options only if not defined in attribute', function () {
      const Product = this.sequelize.define(
        'ProductWithSettersAndGetters3',
        {
          price1: {
            type: Sequelize.INTEGER,
            set(v) {
              this.setDataValue('price1', v * 10);
            }
          },
          price2: {
            type: Sequelize.INTEGER,
            get() {
              return this.getDataValue('price2') * 10;
            }
          }
        },
        {
          setterMethods: {
            price1(v) {
              this.setDataValue('price1', v * 100);
            }
          },
          getterMethods: {
            price2() {
              return '$' + this.getDataValue('price2');
            }
          }
        }
      );

      const p = Product.build({ price1: 1, price2: 2 });

      expect(p.price1).to.equal(10);
      expect(p.price2).to.equal(20);
    });

    describe('include', () => {
      it('should support basic includes', function () {
        const Product = this.sequelize.define('Product', {
          title: Sequelize.STRING
        });
        const Tag = this.sequelize.define('Tag', {
          name: Sequelize.STRING
        });
        const User = this.sequelize.define('User', {
          first_name: Sequelize.STRING,
          last_name: Sequelize.STRING
        });

        Product.hasMany(Tag);
        Product.belongsTo(User);

        const product = Product.build(
          {
            id: 1,
            title: 'Chair',
            Tags: [
              { id: 1, name: 'Alpha' },
              { id: 2, name: 'Beta' }
            ],
            User: {
              id: 1,
              first_name: 'Mick',
              last_name: 'Hansen'
            }
          },
          {
            include: [User, Tag]
          }
        );

        expect(product.Tags).to.be.ok;
        expect(product.Tags.length).to.equal(2);
        expect(product.Tags[0]).to.be.instanceof(Tag);
        expect(product.User).to.be.ok;
        expect(product.User).to.be.instanceof(User);
      });

      it('should support includes with aliases', function () {
        const Product = this.sequelize.define('Product', {
          title: Sequelize.STRING
        });
        const Tag = this.sequelize.define('Tag', {
          name: Sequelize.STRING
        });
        const User = this.sequelize.define('User', {
          first_name: Sequelize.STRING,
          last_name: Sequelize.STRING
        });

        Product.hasMany(Tag, { as: 'categories' });
        Product.belongsToMany(User, { as: 'followers', through: 'product_followers' });
        User.belongsToMany(Product, { as: 'following', through: 'product_followers' });

        const product = Product.build(
          {
            id: 1,
            title: 'Chair',
            categories: [
              { id: 1, name: 'Alpha' },
              { id: 2, name: 'Beta' },
              { id: 3, name: 'Charlie' },
              { id: 4, name: 'Delta' }
            ],
            followers: [
              {
                id: 1,
                first_name: 'Mick',
                last_name: 'Hansen'
              },
              {
                id: 2,
                first_name: 'Jan',
                last_name: 'Meier'
              }
            ]
          },
          {
            include: [
              { model: User, as: 'followers' },
              { model: Tag, as: 'categories' }
            ]
          }
        );

        expect(product.categories).to.be.ok;
        expect(product.categories.length).to.equal(4);
        expect(product.categories[0]).to.be.instanceof(Tag);
        expect(product.followers).to.be.ok;
        expect(product.followers.length).to.equal(2);
        expect(product.followers[0]).to.be.instanceof(User);
      });
    });
  });

  describe('findOne', () => {
    if (current.dialect.supports.transactions) {
      it('supports the transaction option in the first parameter', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { username: Sequelize.STRING, foo: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const user = await User.findOne({ where: { username: 'foo' }, transaction: t });

        expect(user).to.not.be.null;

        await t.rollback();
      });
    }

    it('should not fail if model is paranoid and where is an empty array', async function () {
      const User = this.sequelize.define('User', { username: Sequelize.STRING }, { paranoid: true });

      await User.sync({ force: true });
      await User.create({ username: 'A fancy name' });

      const u = await User.findOne({ where: [] });

      expect(u.username).to.equal('A fancy name');
    });

    // https://github.com/sequelize/sequelize/issues/8406
    it('should work if model is paranoid and only operator in where clause is a Symbol', async function () {
      const User = this.sequelize.define('User', { username: Sequelize.STRING }, { paranoid: true });

      await User.sync({ force: true });
      await User.create({ username: 'foo' });

      const user = await User.findOne({
        where: {
          [Sequelize.Op.or]: [{ username: 'bar' }, { username: 'baz' }]
        }
      });

      expect(user).to.not.be.ok;
    });
  });

  describe('findOrInitialize', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { username: Sequelize.STRING, foo: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const [user1] = await User.findOrBuild({
          where: { username: 'foo' }
        });
        const [user2] = await User.findOrBuild({
          where: { username: 'foo' },
          transaction: t
        });
        const [user3] = await User.findOrBuild({
          where: { username: 'foo' },
          defaults: { foo: 'asd' },
          transaction: t
        });

        expect(user1.isNewRecord).to.be.true;
        expect(user2.isNewRecord).to.be.false;
        expect(user3.isNewRecord).to.be.false;

        await t.commit();
      });
    }

    describe('returns an instance if it already exists', () => {
      it('with a single find field', async function () {
        const user = await this.User.create({ username: 'Username' });

        const [_user, initialized] = await this.User.findOrBuild({
          where: { username: user.username }
        });

        expect(_user.id).to.equal(user.id);
        expect(_user.username).to.equal('Username');
        expect(initialized).to.be.false;
      });

      it('with multiple find fields', async function () {
        const user = await this.User.create({ username: 'Username', data: 'data' });

        const [_user, initialized] = await this.User.findOrBuild({
          where: {
            username: user.username,
            data: user.data
          }
        });

        expect(_user.id).to.equal(user.id);
        expect(_user.username).to.equal('Username');
        expect(_user.data).to.equal('data');
        expect(initialized).to.be.false;
      });

      it('builds a new instance with default value.', async function () {
        const data = {
            username: 'Username'
          },
          default_values = {
            data: 'ThisIsData'
          };

        const [user, initialized] = await this.User.findOrBuild({
          where: data,
          defaults: default_values
        });

        expect(user.id).to.be.null;
        expect(user.username).to.equal('Username');
        expect(user.data).to.equal('ThisIsData');
        expect(initialized).to.be.true;
        expect(user.isNewRecord).to.be.true;
      });
    });
  });

  describe('update', () => {
    it('throws an error if no where clause is given', async function () {
      const User = this.sequelize.define('User', { username: DataTypes.STRING });

      await this.sequelize.sync({ force: true });

      const err = await expect(User.update()).to.be.rejectedWith(Error);

      expect(err.message).to.equal('Missing where attribute in the options parameter');
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });
        await User.create({ username: 'foo' });

        const t = await sequelize.transaction();

        await User.update({ username: 'bar' }, { where: { username: 'foo' }, transaction: t });

        const users1 = await User.findAll();
        const users2 = await User.findAll({ transaction: t });

        expect(users1[0].username).to.equal('foo');
        expect(users2[0].username).to.equal('bar');

        await t.rollback();
      });
    }

    it('updates the attributes that we select only without updating createdAt', async function () {
      const User = this.sequelize.define(
        'User1',
        {
          username: Sequelize.STRING,
          secretValue: Sequelize.STRING
        },
        {
          paranoid: true
        }
      );

      let test = false;

      await User.sync({ force: true });

      const user = await User.create({ username: 'Peter', secretValue: '42' });

      await user.update(
        { secretValue: '43' },
        {
          fields: ['secretValue'],
          logging() {
            test = true;
          }
        }
      );

      expect(test).to.be.true;
    });

    it('allows sql logging of updated statements', async function () {
      const User = this.sequelize.define(
        'User',
        {
          name: Sequelize.STRING,
          bio: Sequelize.TEXT
        },
        {
          paranoid: true
        }
      );
      let test = false;

      await User.sync({ force: true });

      const u = await User.create({ name: 'meg', bio: 'none' });

      expect(u).to.exist;

      await u.update(
        { name: 'brian' },
        {
          logging(sql) {
            test = true;
            expect(sql).to.exist;
            expect(sql.toUpperCase().indexOf('UPDATE')).to.be.above(-1);
          }
        }
      );

      expect(test).to.be.true;
    });

    it('updates only values that match filter', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);
      await this.User.update({ username: 'Bill' }, { where: { secretValue: '42' } });

      const users = await this.User.findAll({ order: ['id'] });

      expect(users.length).to.equal(3);

      users.forEach((user) => {
        if (user.secretValue === '42') {
          expect(user.username).to.equal('Bill');
        } else {
          expect(user.username).to.equal('Bob');
        }
      });
    });

    it('updates only values that match the allowed fields', async function () {
      const data = [{ username: 'Peter', secretValue: '42' }];

      await this.User.bulkCreate(data);

      await this.User.update(
        { username: 'Bill', secretValue: '43' },
        { where: { secretValue: '42' }, fields: ['username'] }
      );

      const users = await this.User.findAll({ order: ['id'] });

      expect(users.length).to.equal(1);

      const user = users[0];
      expect(user.username).to.equal('Bill');
      expect(user.secretValue).to.equal('42');
    });

    it('updates with casting', async function () {
      await this.User.create({
        username: 'John'
      });

      await this.User.update({ username: this.sequelize.cast('1', 'char') }, { where: { username: 'John' } });

      const users = await this.User.findAll();

      expect(users[0].username).to.equal('1');
    });

    it('updates with function and column value', async function () {
      await this.User.create({
        username: 'John'
      });

      await this.User.update(
        { username: this.sequelize.fn('upper', this.sequelize.col('username')) },
        { where: { username: 'John' } }
      );

      const users = await this.User.findAll();

      expect(users[0].username).to.equal('JOHN');
    });

    it('does not update virtual attributes', async function () {
      const User = this.sequelize.define('User', {
        username: Sequelize.STRING,
        virtual: Sequelize.VIRTUAL
      });

      await User.create({
        username: 'jan'
      });

      await User.update(
        {
          username: 'kurt',
          virtual: 'test'
        },
        {
          where: {
            username: 'jan'
          }
        }
      );

      const [user] = await User.findAll();

      expect(user.username).to.equal('kurt');
    });

    it("doesn't update attributes that are altered by virtual setters when option is enabled", async function () {
      const User = this.sequelize.define('UserWithVirtualSetters', {
        username: Sequelize.STRING,
        illness_name: Sequelize.STRING,
        illness_pain: Sequelize.INTEGER,
        illness: {
          type: Sequelize.VIRTUAL,
          set(value) {
            this.set('illness_name', value.name);
            this.set('illness_pain', value.pain);
          }
        }
      });

      await User.sync({ force: true });

      await User.create({
        username: 'Jan',
        illness_name: 'Headache',
        illness_pain: 5
      });

      await User.update(
        {
          illness: { pain: 10, name: 'Backache' }
        },
        {
          where: {
            username: 'Jan'
          },
          sideEffects: false
        }
      );

      const [user] = await User.findAll();

      expect(user.illness_pain).to.be.equal(5);
    });

    it('updates attributes that are altered by virtual setters', async function () {
      const User = this.sequelize.define('UserWithVirtualSetters', {
        username: Sequelize.STRING,
        illness_name: Sequelize.STRING,
        illness_pain: Sequelize.INTEGER,
        illness: {
          type: Sequelize.VIRTUAL,
          set(value) {
            this.set('illness_name', value.name);
            this.set('illness_pain', value.pain);
          }
        }
      });

      await User.sync({ force: true });

      await User.create({
        username: 'Jan',
        illness_name: 'Headache',
        illness_pain: 5
      });

      await User.update(
        {
          illness: { pain: 10, name: 'Backache' }
        },
        {
          where: {
            username: 'Jan'
          }
        }
      );

      const [user] = await User.findAll();

      expect(user.illness_pain).to.be.equal(10);
    });

    it('should properly set data when individualHooks are true', async function () {
      this.User.beforeUpdate((instance) => {
        instance.set('intVal', 1);
      });

      const user = await this.User.create({ username: 'Peter' });

      await this.User.update({ data: 'test' }, { where: { id: user.id }, individualHooks: true });

      const userUpdated = await this.User.findByPk(user.id);

      expect(userUpdated.intVal).to.be.equal(1);
    });

    it('sets updatedAt to the current timestamp', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);

      const created = await this.User.findAll({ order: ['id'] });

      this.updatedAt = created[0].updatedAt;

      expect(this.updatedAt).to.be.ok;
      expect(this.updatedAt).to.equalTime(created[2].updatedAt); // All users should have the same updatedAt

      // Pass the time so we can actually see a change
      this.clock.tick(1000);

      await this.User.update({ username: 'Bill' }, { where: { secretValue: '42' } });

      const users = await this.User.findAll({ order: ['id'] });

      expect(users[0].username).to.equal('Bill');
      expect(users[1].username).to.equal('Bill');
      expect(users[2].username).to.equal('Bob');

      expect(users[0].updatedAt).to.be.afterTime(this.updatedAt);
      expect(users[2].updatedAt).to.equalTime(this.updatedAt);
    });

    it('returns the number of affected rows', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);

      const [affectedRows] = await this.User.update({ username: 'Bill' }, { where: { secretValue: '42' } });

      expect(affectedRows).to.equal(2);

      const [unaffectedRows] = await this.User.update({ username: 'Bill' }, { where: { secretValue: '44' } });

      expect(unaffectedRows).to.equal(0);
    });

    it('does not update soft deleted records when model is paranoid', async function () {
      const ParanoidUser = this.sequelize.define('ParanoidUser', { username: DataTypes.STRING }, { paranoid: true });

      await this.sequelize.sync({ force: true });
      await ParanoidUser.bulkCreate([{ username: 'user1' }, { username: 'user2' }]);

      await ParanoidUser.destroy({
        where: {
          username: 'user1'
        }
      });

      await ParanoidUser.update(
        { username: 'foo' },
        {
          where: {}
        }
      );

      const users = await ParanoidUser.findAll({
        paranoid: false,
        where: {
          username: 'foo'
        }
      });

      expect(users).to.have.lengthOf(1, 'should not update soft-deleted record');
    });

    it('updates soft deleted records when paranoid is overridden', async function () {
      const ParanoidUser = this.sequelize.define('ParanoidUser', { username: DataTypes.STRING }, { paranoid: true });

      await this.sequelize.sync({ force: true });
      await ParanoidUser.bulkCreate([{ username: 'user1' }, { username: 'user2' }]);

      await ParanoidUser.destroy({
        where: {
          username: 'user1'
        }
      });

      await ParanoidUser.update(
        { username: 'foo' },
        {
          where: {},
          paranoid: false
        }
      );

      const users = await ParanoidUser.findAll({
        paranoid: false,
        where: {
          username: 'foo'
        }
      });

      expect(users).to.have.lengthOf(2);
    });

    it('returns the affected rows if `options.returning` is true', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);

      const [count, rows] = await this.User.update(
        { username: 'Bill' },
        { where: { secretValue: '42' }, returning: true }
      );

      expect(count).to.equal(2);
      expect(rows).to.have.length(2);

      const [missCount, missRows] = await this.User.update(
        { username: 'Bill' },
        { where: { secretValue: '44' }, returning: true }
      );

      expect(missCount).to.equal(0);
      expect(missRows).to.have.length(0);
    });
  });

  describe('destroy', () => {
    it('convenient method `truncate` should clear the table', async function () {
      const User = this.sequelize.define('User', { username: DataTypes.STRING }),
        data = [{ username: 'user1' }, { username: 'user2' }];

      await this.sequelize.sync({ force: true });
      await User.bulkCreate(data);
      await User.truncate();

      await expect(User.findAll()).to.eventually.have.length(0);
    });

    it('truncate should clear the table', async function () {
      const User = this.sequelize.define('User', { username: DataTypes.STRING }),
        data = [{ username: 'user1' }, { username: 'user2' }];

      await this.sequelize.sync({ force: true });
      await User.bulkCreate(data);
      await User.destroy({ truncate: true });

      await expect(User.findAll()).to.eventually.have.length(0);
    });

    it('throws an error if no where clause is given', async function () {
      const User = this.sequelize.define('User', { username: DataTypes.STRING });

      await this.sequelize.sync({ force: true });

      const err = await expect(User.destroy()).to.be.rejectedWith(Error);

      expect(err.message).to.equal('Missing where or truncate attribute in the options parameter of model.destroy.');
    });

    it('deletes all instances when given an empty where object', async function () {
      const User = this.sequelize.define('User', { username: DataTypes.STRING }),
        data = [{ username: 'user1' }, { username: 'user2' }];

      await this.sequelize.sync({ force: true });
      await User.bulkCreate(data);

      const affectedRows = await User.destroy({ where: {} });

      expect(affectedRows).to.equal(2);

      const users = await User.findAll();

      expect(users).to.have.length(0);
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });
        await User.create({ username: 'foo' });

        const t = await sequelize.transaction();

        await User.destroy({
          where: {},
          transaction: t
        });

        const count1 = await User.count();
        const count2 = await User.count({ transaction: t });

        expect(count1).to.equal(1);
        expect(count2).to.equal(0);

        await t.rollback();
      });
    }

    it('deletes values that match filter', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);
      await this.User.destroy({ where: { secretValue: '42' } });

      const users = await this.User.findAll({ order: ['id'] });

      expect(users.length).to.equal(1);
      expect(users[0].username).to.equal('Bob');
    });

    it('works without a primary key', async function () {
      const Log = this.sequelize.define('Log', {
        client_id: DataTypes.INTEGER,
        content: DataTypes.TEXT,
        timestamp: DataTypes.DATE
      });
      Log.removeAttribute('id');

      await Log.sync({ force: true });

      await Log.create({
        client_id: 13,
        content: 'Error!',
        timestamp: new Date()
      });

      await Log.destroy({
        where: {
          client_id: 13
        }
      });

      const logs = await Log.findAll();

      expect(logs.length).to.equal(0);
    });

    it('supports .field', async function () {
      const UserProject = this.sequelize.define('UserProject', {
        userId: {
          type: DataTypes.INTEGER,
          field: 'user_id'
        }
      });

      await UserProject.sync({ force: true });

      await UserProject.create({
        userId: 10
      });

      await UserProject.destroy({
        where: {
          userId: 10
        }
      });

      const userProjects = await UserProject.findAll();

      expect(userProjects.length).to.equal(0);
    });

    it('sets deletedAt to the current timestamp if paranoid is true', async function () {
      const qi = this.sequelize.queryInterface.QueryGenerator.quoteIdentifier.bind(
          this.sequelize.queryInterface.QueryGenerator
        ),
        ParanoidUser = this.sequelize.define(
          'ParanoidUser',
          {
            username: Sequelize.STRING,
            secretValue: Sequelize.STRING,
            data: Sequelize.STRING,
            intVal: { type: Sequelize.INTEGER, defaultValue: 1 }
          },
          {
            paranoid: true
          }
        ),
        data = [
          { username: 'Peter', secretValue: '42' },
          { username: 'Paul', secretValue: '42' },
          { username: 'Bob', secretValue: '43' }
        ];

      await ParanoidUser.sync({ force: true });
      await ParanoidUser.bulkCreate(data);

      // since we save in UTC, let's format to UTC time
      this.date = moment().utc().format('YYYY-MM-DD h:mm');

      await ParanoidUser.destroy({ where: { secretValue: '42' } });

      const remaining = await ParanoidUser.findAll({ order: ['id'] });

      expect(remaining.length).to.equal(1);
      expect(remaining[0].username).to.equal('Bob');

      const [users] = await this.sequelize.query(
        'SELECT * FROM ' + qi('ParanoidUsers') + ' WHERE ' + qi('deletedAt') + ' IS NOT NULL ORDER BY ' + qi('id')
      );

      expect(users[0].username).to.equal('Peter');
      expect(users[1].username).to.equal('Paul');

      expect(moment(new Date(users[0].deletedAt)).utc().format('YYYY-MM-DD h:mm')).to.equal(this.date);
      expect(moment(new Date(users[1].deletedAt)).utc().format('YYYY-MM-DD h:mm')).to.equal(this.date);
    });

    it('does not set deletedAt for previously destroyed instances if paranoid is true', async function () {
      const User = this.sequelize.define(
        'UserCol',
        {
          secretValue: Sequelize.STRING,
          username: Sequelize.STRING
        },
        { paranoid: true }
      );

      await User.sync({ force: true });

      await User.bulkCreate([
        { username: 'Toni', secretValue: '42' },
        { username: 'Tobi', secretValue: '42' },
        { username: 'Max', secretValue: '42' }
      ]);

      const user = await User.findByPk(1);

      await user.destroy();
      await user.reload({ paranoid: false });

      const deletedAt = user.deletedAt;

      await User.destroy({ where: { secretValue: '42' } });
      await user.reload({ paranoid: false });

      expect(user.deletedAt).to.eql(deletedAt);
    });

    describe("can't find records marked as deleted with paranoid being true", () => {
      it('with the DAOFactory', async function () {
        const User = this.sequelize.define(
          'UserCol',
          {
            username: Sequelize.STRING
          },
          { paranoid: true }
        );

        await User.sync({ force: true });
        await User.bulkCreate([{ username: 'Toni' }, { username: 'Tobi' }, { username: 'Max' }]);

        const user = await User.findByPk(1);

        await user.destroy();

        const deletedUser = await User.findByPk(1);

        expect(deletedUser).to.be.null;

        const cnt = await User.count();

        expect(cnt).to.equal(2);

        const users = await User.findAll();

        expect(users).to.have.length(2);
      });
    });

    describe('can find paranoid records if paranoid is marked as false in query', () => {
      it('with the DAOFactory', async function () {
        const User = this.sequelize.define(
          'UserCol',
          {
            username: Sequelize.STRING
          },
          { paranoid: true }
        );

        await User.sync({ force: true });
        await User.bulkCreate([{ username: 'Toni' }, { username: 'Tobi' }, { username: 'Max' }]);

        const user = await User.findByPk(1);

        await user.destroy();

        const deletedUser = await User.findOne({ where: 1, paranoid: false });

        expect(deletedUser).to.exist;

        const missingUser = await User.findByPk(1);

        expect(missingUser).to.be.null;

        const [cnt, cntWithDeleted] = await Promise.all([User.count(), User.count({ paranoid: false })]);

        expect(cnt).to.equal(2);
        expect(cntWithDeleted).to.equal(3);
      });
    });

    it('should include deleted associated records if include has paranoid marked as false', async function () {
      const User = this.sequelize.define(
        'User',
        {
          username: Sequelize.STRING
        },
        { paranoid: true }
      );
      const Pet = this.sequelize.define(
        'Pet',
        {
          name: Sequelize.STRING,
          UserId: Sequelize.INTEGER
        },
        { paranoid: true }
      );

      User.hasMany(Pet);
      Pet.belongsTo(User);

      await User.sync({ force: true });
      await Pet.sync({ force: true });

      const user = await User.create({ username: 'Joe' });

      await Pet.bulkCreate([
        { name: 'Fido', UserId: user.id },
        { name: 'Fifi', UserId: user.id }
      ]);

      const pet = await Pet.findByPk(1);

      await pet.destroy();

      const [userWithPets, userWithDeletedPets] = await Promise.all([
        User.findOne({ where: { id: user.id }, include: Pet }),
        User.findOne({
          where: { id: user.id },
          include: [{ model: Pet, paranoid: false }]
        })
      ]);

      expect(userWithPets).to.exist;
      expect(userWithPets.Pets).to.have.length(1);
      expect(userWithDeletedPets).to.exist;
      expect(userWithDeletedPets.Pets).to.have.length(2);
    });

    it('should delete a paranoid record if I set force to true', async function () {
      const User = this.sequelize.define(
        'paranoiduser',
        {
          username: Sequelize.STRING
        },
        { paranoid: true }
      );

      await User.sync({ force: true });

      await User.bulkCreate([{ username: 'Bob' }, { username: 'Tobi' }, { username: 'Max' }, { username: 'Tony' }]);

      const bob = await User.findOne({ where: { username: 'Bob' } });

      await bob.destroy({ force: true });

      await expect(User.findOne({ where: { username: 'Bob' } })).to.eventually.be.null;

      const tobi = await User.findOne({ where: { username: 'Tobi' } });

      await tobi.destroy();

      const tobiRow = await this.sequelize.query("SELECT * FROM paranoidusers WHERE username='Tobi'", { plain: true });

      expect(tobiRow.username).to.equal('Tobi');

      await User.destroy({ where: { username: 'Tony' } });

      const tonyRow = await this.sequelize.query("SELECT * FROM paranoidusers WHERE username='Tony'", { plain: true });

      expect(tonyRow.username).to.equal('Tony');

      await User.destroy({ where: { username: ['Tony', 'Max'] }, force: true });

      const [users] = await this.sequelize.query('SELECT * FROM paranoidusers', { raw: true });

      expect(users).to.have.length(1);
      expect(users[0].username).to.equal('Tobi');
    });

    it('returns the number of affected rows', async function () {
      const data = [
        { username: 'Peter', secretValue: '42' },
        { username: 'Paul', secretValue: '42' },
        { username: 'Bob', secretValue: '43' }
      ];

      await this.User.bulkCreate(data);

      const affectedRows = await this.User.destroy({ where: { secretValue: '42' } });

      expect(affectedRows).to.equal(2);

      const unaffectedRows = await this.User.destroy({ where: { secretValue: '44' } });

      expect(unaffectedRows).to.equal(0);
    });

    it('supports table schema/prefix', async function () {
      const data = [
          { username: 'Peter', secretValue: '42' },
          { username: 'Paul', secretValue: '42' },
          { username: 'Bob', secretValue: '43' }
        ],
        prefixUser = this.User.schema('prefix');

      await this.sequelize.queryInterface.dropAllSchemas();
      await this.sequelize.queryInterface.createSchema('prefix');

      await prefixUser.sync({ force: true });
      await prefixUser.bulkCreate(data);
      await prefixUser.destroy({ where: { secretValue: '42' } });

      const users = await prefixUser.findAll({ order: ['id'] });

      expect(users.length).to.equal(1);
      expect(users[0].username).to.equal('Bob');
    });

    it('should work if model is paranoid and only operator in where clause is a Symbol', async function () {
      const User = this.sequelize.define(
        'User',
        {
          username: Sequelize.STRING
        },
        {
          paranoid: true
        }
      );

      await User.sync({ force: true });
      await User.create({ username: 'foo' });
      await User.create({ username: 'bar' });

      await User.destroy({
        where: {
          [Sequelize.Op.or]: [{ username: 'bar' }, { username: 'baz' }]
        }
      });

      const users = await User.findAll();

      expect(users).to.have.length(1);
      expect(users[0].get('username')).to.equal('foo');
    });
  });

  describe('restore', () => {
    it('returns an error if the model is not paranoid', async function () {
      await this.User.create({ username: 'Peter', secretValue: '42' });

      await expect(this.User.restore({ where: { secretValue: '42' } })).to.be.rejectedWith(
        Error,
        'Model is not paranoid'
      );
    });

    it('restores a previously deleted model', async function () {
      const ParanoidUser = this.sequelize.define(
          'ParanoidUser',
          {
            username: Sequelize.STRING,
            secretValue: Sequelize.STRING,
            data: Sequelize.STRING,
            intVal: { type: Sequelize.INTEGER, defaultValue: 1 }
          },
          {
            paranoid: true
          }
        ),
        data = [
          { username: 'Peter', secretValue: '42' },
          { username: 'Paul', secretValue: '43' },
          { username: 'Bob', secretValue: '44' }
        ];

      await ParanoidUser.sync({ force: true });
      await ParanoidUser.bulkCreate(data);
      await ParanoidUser.destroy({ where: { secretValue: '42' } });
      await ParanoidUser.restore({ where: { secretValue: '42' } });

      const user = await ParanoidUser.findOne({ where: { secretValue: '42' } });

      expect(user).to.be.ok;
      expect(user.username).to.equal('Peter');
    });
  });

  describe('equals', () => {
    it('correctly determines equality of objects', async function () {
      const u = await this.User.create({ username: 'hallo', data: 'welt' });

      expect(u.equals(u)).to.be.ok;
    });

    // sqlite can't handle multiple primary keys

    it('correctly determines equality with multiple primary keys', async function () {
      const userKeys = this.sequelize.define('userkeys', {
        foo: { type: Sequelize.STRING, primaryKey: true },
        bar: { type: Sequelize.STRING, primaryKey: true },
        name: Sequelize.STRING,
        bio: Sequelize.TEXT
      });

      await userKeys.sync({ force: true });

      const u = await userKeys.create({ foo: '1', bar: '2', name: 'hallo', bio: 'welt' });

      expect(u.equals(u)).to.be.ok;
    });
  });

  describe('equalsOneOf', () => {
    // sqlite can't handle multiple primary keys

    beforeEach(function () {
      this.userKey = this.sequelize.define('userKeys', {
        foo: { type: Sequelize.STRING, primaryKey: true },
        bar: { type: Sequelize.STRING, primaryKey: true },
        name: Sequelize.STRING,
        bio: Sequelize.TEXT
      });

      return this.userKey.sync({ force: true });
    });

    it('determines equality if one is matching', async function () {
      const u = await this.userKey.create({ foo: '1', bar: '2', name: 'hallo', bio: 'welt' });

      expect(u.equalsOneOf([u, { a: 1 }])).to.be.ok;
    });

    it("doesn't determine equality if none is matching", async function () {
      const u = await this.userKey.create({ foo: '1', bar: '2', name: 'hallo', bio: 'welt' });

      expect(u.equalsOneOf([{ b: 2 }, { a: 1 }])).to.not.be.ok;
    });
  });

  describe('count', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const count1 = await User.count();
        const count2 = await User.count({ transaction: t });

        expect(count1).to.equal(0);
        expect(count2).to.equal(1);

        await t.rollback();
      });
    }

    it('counts all created objects', async function () {
      await this.User.bulkCreate([{ username: 'user1' }, { username: 'user2' }]);

      const count = await this.User.count();

      expect(count).to.equal(2);
    });

    it('returns multiple rows when using group', async function () {
      await this.User.bulkCreate([
        { username: 'user1', data: 'A' },
        { username: 'user2', data: 'A' },
        { username: 'user3', data: 'B' }
      ]);

      const count = await this.User.count({
        attributes: ['data'],
        group: ['data']
      });

      expect(count.length).to.equal(2);
    });

    describe('options sent to aggregate', () => {
      let options, aggregateSpy;

      beforeEach(function () {
        options = { where: { username: 'user1' } };

        aggregateSpy = sinon.spy(this.User, 'aggregate');
      });

      afterEach(() => {
        expect(
          aggregateSpy.calledWith(
            sinon.match.any,
            sinon.match.any,
            sinon.match.object.and(sinon.match.has('where', { username: 'user1' }))
          ),
          'aggregateSpy should have been called with expected arguments'
        ).to.be.true;

        aggregateSpy.restore();
      });

      it('modifies option "limit" by setting it to null', async function () {
        options.limit = 5;

        await this.User.count(options);

        expect(
          aggregateSpy.calledWith(
            sinon.match.any,
            sinon.match.any,
            sinon.match.object.and(sinon.match.has('limit', null))
          ),
          'aggregateSpy should have been called with expected arguments'
        ).to.be.true;
      });

      it('modifies option "offset" by setting it to null', async function () {
        options.offset = 10;

        await this.User.count(options);

        expect(
          aggregateSpy.calledWith(
            sinon.match.any,
            sinon.match.any,
            sinon.match.object.and(sinon.match.has('offset', null))
          ),
          'aggregateSpy should have been called with expected arguments'
        ).to.be.true;
      });

      it('modifies option "order" by setting it to null', async function () {
        options.order = 'username';

        await this.User.count(options);

        expect(
          aggregateSpy.calledWith(
            sinon.match.any,
            sinon.match.any,
            sinon.match.object.and(sinon.match.has('order', null))
          ),
          'aggregateSpy should have been called with expected arguments'
        ).to.be.true;
      });
    });

    it('allows sql logging', async function () {
      let test = false;

      await this.User.count({
        logging(sql) {
          test = true;
          expect(sql).to.exist;
          expect(sql.toUpperCase().indexOf('SELECT')).to.be.above(-1);
        }
      });

      expect(test).to.be.true;
    });

    it('filters object', async function () {
      await this.User.create({ username: 'user1' });
      await this.User.create({ username: 'foo' });

      const count = await this.User.count({ where: { username: { $like: '%us%' } } });

      expect(count).to.equal(1);
    });

    it('supports distinct option', async function () {
      const Post = this.sequelize.define('Post', {});
      const PostComment = this.sequelize.define('PostComment', {});
      Post.hasMany(PostComment);

      await Post.sync({ force: true });
      await PostComment.sync({ force: true });

      const post = await Post.create({});

      await PostComment.bulkCreate([{ PostId: post.id }, { PostId: post.id }]);

      const [count1, count2] = await Promise.all([
        Post.count({ distinct: false, include: [{ model: PostComment, required: false }] }),
        Post.count({ distinct: true, include: [{ model: PostComment, required: false }] })
      ]);

      expect(count1).to.equal(2);
      expect(count2).to.equal(1);
    });
  });

  describe('min', () => {
    beforeEach(async function () {
      this.UserWithAge = this.sequelize.define('UserWithAge', {
        age: Sequelize.INTEGER
      });

      this.UserWithDec = this.sequelize.define('UserWithDec', {
        value: Sequelize.DECIMAL(10, 3)
      });

      await this.UserWithAge.sync({ force: true });
      await this.UserWithDec.sync({ force: true });
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { age: Sequelize.INTEGER });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.bulkCreate([{ age: 2 }, { age: 5 }, { age: 3 }], { transaction: t });

        const min1 = await User.min('age');
        const min2 = await User.min('age', { transaction: t });

        expect(min1).to.be.not.ok;
        expect(min2).to.equal(2);

        await t.rollback();
      });
    }

    it('should return the min value', async function () {
      await this.UserWithAge.bulkCreate([{ age: 3 }, { age: 2 }]);

      const min = await this.UserWithAge.min('age');

      expect(min).to.equal(2);
    });

    it('allows sql logging', async function () {
      let test = false;

      await this.UserWithAge.min('age', {
        logging(sql) {
          test = true;
          expect(sql).to.exist;
          expect(sql.toUpperCase().indexOf('SELECT')).to.be.above(-1);
        }
      });

      expect(test).to.be.true;
    });

    it('should allow decimals in min', async function () {
      await this.UserWithDec.bulkCreate([{ value: 5.5 }, { value: 3.5 }]);

      const min = await this.UserWithDec.min('value');

      expect(min).to.equal(3.5);
    });

    it('should allow strings in min', async function () {
      await this.User.bulkCreate([{ username: 'bbb' }, { username: 'yyy' }]);

      const min = await this.User.min('username');

      expect(min).to.equal('bbb');
    });

    it('should allow dates in min', async function () {
      await this.User.bulkCreate([{ theDate: new Date(2000, 1, 1) }, { theDate: new Date(1990, 1, 1) }]);

      const min = await this.User.min('theDate');

      expect(min).to.be.a('Date');
      expect(new Date(1990, 1, 1)).to.equalDate(min);
    });
  });

  describe('max', () => {
    beforeEach(async function () {
      this.UserWithAge = this.sequelize.define('UserWithAge', {
        age: Sequelize.INTEGER,
        order: Sequelize.INTEGER
      });

      this.UserWithDec = this.sequelize.define('UserWithDec', {
        value: Sequelize.DECIMAL(10, 3)
      });

      await this.UserWithAge.sync({ force: true });
      await this.UserWithDec.sync({ force: true });
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async function () {
        const sequelize = await Support.prepareTransactionTest(this.sequelize);
        const User = sequelize.define('User', { age: Sequelize.INTEGER });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.bulkCreate([{ age: 2 }, { age: 5 }, { age: 3 }], { transaction: t });

        const min1 = await User.max('age');
        const min2 = await User.max('age', { transaction: t });

        expect(min1).to.be.not.ok;
        expect(min2).to.equal(5);

        await t.rollback();
      });
    }

    it('should return the max value for a field named the same as an SQL reserved keyword', async function () {
      await this.UserWithAge.bulkCreate([
        { age: 2, order: 3 },
        { age: 3, order: 5 }
      ]);

      const max = await this.UserWithAge.max('order');

      expect(max).to.equal(5);
    });

    it('should return the max value', async function () {
      await this.UserWithAge.bulkCreate([{ age: 2 }, { age: 3 }]);

      const max = await this.UserWithAge.max('age');

      expect(max).to.equal(3);
    });

    it('should allow decimals in max', async function () {
      await this.UserWithDec.bulkCreate([{ value: 3.5 }, { value: 5.5 }]);

      const max = await this.UserWithDec.max('value');

      expect(max).to.equal(5.5);
    });

    it('should allow dates in max', async function () {
      await this.User.bulkCreate([{ theDate: new Date(2013, 11, 31) }, { theDate: new Date(2000, 1, 1) }]);

      const max = await this.User.max('theDate');

      expect(max).to.be.a('Date');
      expect(max).to.equalDate(new Date(2013, 11, 31));
    });

    it('should allow strings in max', async function () {
      await this.User.bulkCreate([{ username: 'aaa' }, { username: 'zzz' }]);

      const max = await this.User.max('username');

      expect(max).to.equal('zzz');
    });

    it('allows sql logging', async function () {
      let logged = false;

      await this.UserWithAge.max('age', {
        logging(sql) {
          expect(sql).to.exist;
          logged = true;
          expect(sql.toUpperCase().indexOf('SELECT')).to.be.above(-1);
        }
      });

      expect(logged).to.true;
    });
  });

  describe('sum', () => {
    beforeEach(function () {
      this.UserWithAge = this.sequelize.define('UserWithAge', {
        age: Sequelize.INTEGER,
        order: Sequelize.INTEGER,
        gender: Sequelize.ENUM('male', 'female')
      });

      this.UserWithDec = this.sequelize.define('UserWithDec', {
        value: Sequelize.DECIMAL(10, 3)
      });

      this.UserWithFields = this.sequelize.define('UserWithFields', {
        age: {
          type: Sequelize.INTEGER,
          field: 'user_age'
        },
        order: Sequelize.INTEGER,
        gender: {
          type: Sequelize.ENUM('male', 'female'),
          field: 'male_female'
        }
      });

      return Promise.all([
        this.UserWithAge.sync({ force: true }),
        this.UserWithDec.sync({ force: true }),
        this.UserWithFields.sync({ force: true })
      ]);
    });

    it('should return the sum of the values for a field named the same as an SQL reserved keyword', async function () {
      await this.UserWithAge.bulkCreate([
        { age: 2, order: 3 },
        { age: 3, order: 5 }
      ]);

      const sum = await this.UserWithAge.sum('order');

      expect(sum).to.equal(8);
    });

    it('should return the sum of a field in various records', async function () {
      await this.UserWithAge.bulkCreate([{ age: 2 }, { age: 3 }]);

      const sum = await this.UserWithAge.sum('age');

      expect(sum).to.equal(5);
    });

    it('should allow decimals in sum', async function () {
      await this.UserWithDec.bulkCreate([{ value: 3.5 }, { value: 5.25 }]);

      const sum = await this.UserWithDec.sum('value');

      expect(sum).to.equal(8.75);
    });

    it('should accept a where clause', async function () {
      const options = { where: { gender: 'male' } };

      await this.UserWithAge.bulkCreate([
        { age: 2, gender: 'male' },
        { age: 3, gender: 'female' }
      ]);

      const sum = await this.UserWithAge.sum('age', options);

      expect(sum).to.equal(2);
    });

    it('should accept a where clause with custom fields', async function () {
      await this.UserWithFields.bulkCreate([
        { age: 2, gender: 'male' },
        { age: 3, gender: 'female' }
      ]);

      await expect(
        this.UserWithFields.sum('age', {
          where: { gender: 'male' }
        })
      ).to.eventually.equal(2);
    });

    it('allows sql logging', async function () {
      let logged = false;

      await this.UserWithAge.sum('age', {
        logging(sql) {
          expect(sql).to.exist;
          logged = true;
          expect(sql.toUpperCase().indexOf('SELECT')).to.be.above(-1);
        }
      });

      expect(logged).to.true;
    });
  });

  describe('schematic support', () => {
    beforeEach(async function () {
      this.UserPublic = this.sequelize.define('UserPublic', {
        age: Sequelize.INTEGER
      });

      this.UserSpecial = this.sequelize.define('UserSpecial', {
        age: Sequelize.INTEGER
      });

      await this.sequelize.dropAllSchemas();
      await this.sequelize.createSchema('schema_test');
      await this.sequelize.createSchema('special');

      this.UserSpecialSync = await this.UserSpecial.schema('special').sync({ force: true });
    });

    it('should be able to drop with schemas', function () {
      return this.UserSpecial.drop();
    });

    it('should be able to list schemas', async function () {
      const schemas = await this.sequelize.showAllSchemas();

      expect(schemas).to.be.instanceof(Array);

      // sqlite & MySQL doesn't actually create schemas unless Model.sync() is called
      // Postgres supports schemas natively
      expect(schemas).to.have.length(2);
    });

    it('should describeTable using the default schema settings', async function () {
      const UserPublic = this.sequelize.define('Public', {
        username: Sequelize.STRING
      });
      let count = 0;

      await UserPublic.sync({ force: true });
      await UserPublic.schema('special').sync({ force: true });

      const table = await this.sequelize.queryInterface.describeTable('Publics', {
        logging() {}
      });

      expect(table.id.defaultValue).to.not.contain('special');
      count++;

      const specialTable = await this.sequelize.queryInterface.describeTable('Publics', {
        schema: 'special',
        logging() {}
      });

      expect(specialTable.id.defaultValue).to.contain('special');
      count++;

      expect(count).to.equal(2);
    });

    it('should be able to reference a table with a schema set', async function () {
      const UserPub = this.sequelize.define(
        'UserPub',
        {
          username: Sequelize.STRING
        },
        { schema: 'prefix' }
      );

      const ItemPub = this.sequelize.define(
        'ItemPub',
        {
          name: Sequelize.STRING
        },
        { schema: 'prefix' }
      );

      UserPub.hasMany(ItemPub, {
        foreignKeyConstraint: true
      });

      await this.sequelize.queryInterface.dropAllSchemas();
      await this.sequelize.queryInterface.createSchema('prefix');

      await UserPub.sync({ force: true });

      await ItemPub.sync({
        force: true,
        logging: _.after(
          2,
          _.once((sql) => {
            expect(sql).to.match(/REFERENCES\s+"prefix"\."UserPubs" \("id"\)/);
          })
        )
      });
    });

    it('should be able to create and update records under any valid schematic', async function () {
      let logged = 0;

      const UserPublicSync = await this.UserPublic.sync({ force: true });

      await UserPublicSync.create(
        { age: 3 },
        {
          logging: (UserPublic) => {
            logged++;
            expect(this.UserSpecialSync.getTableName().toString()).to.equal('"special"."UserSpecials"');
            expect(UserPublic.indexOf('INSERT INTO "UserPublics"')).to.be.above(-1);
          }
        }
      );

      const UserSpecial = await this.UserSpecialSync.schema('special').create(
        { age: 3 },
        {
          logging(sql) {
            logged++;
            expect(sql.indexOf('INSERT INTO "special"."UserSpecials"')).to.be.above(-1);
          }
        }
      );

      await UserSpecial.update(
        { age: 5 },
        {
          logging(user) {
            logged++;
            expect(user.indexOf('UPDATE "special"."UserSpecials"')).to.be.above(-1);
          }
        }
      );

      expect(logged).to.equal(3);
    });
  });

  describe('references', () => {
    beforeEach(async function () {
      this.Author = this.sequelize.define('author', { firstName: Sequelize.STRING });

      await this.sequelize.getQueryInterface().dropTable('posts', { force: true });
      await this.sequelize.getQueryInterface().dropTable('authors', { force: true });
      await this.Author.sync();
    });

    it('uses an existing dao factory and references the author table', function () {
      const authorIdColumn = { type: Sequelize.INTEGER, references: { model: this.Author, key: 'id' } };

      const Post = this.sequelize.define('post', {
        title: Sequelize.STRING,
        authorId: authorIdColumn
      });

      this.Author.hasMany(Post);
      Post.belongsTo(this.Author);

      // The posts table gets dropped in the before filter.
      return Post.sync({
        logging: _.once((sql) => {
          expect(sql).to.match(/"authorId" INTEGER REFERENCES "authors" \("id"\)/);
        })
      });
    });

    it('uses a table name as a string and references the author table', function () {
      const authorIdColumn = { type: Sequelize.INTEGER, references: { model: 'authors', key: 'id' } };

      const Post = this.sequelize.define('post', { title: Sequelize.STRING, authorId: authorIdColumn });

      this.Author.hasMany(Post);
      Post.belongsTo(this.Author);

      // The posts table gets dropped in the before filter.
      return Post.sync({
        logging: _.once((sql) => {
          expect(sql).to.match(/"authorId" INTEGER REFERENCES "authors" \("id"\)/);
        })
      });
    });

    it('emits an error event as the referenced table name is invalid', async function () {
      const authorIdColumn = { type: Sequelize.INTEGER, references: { model: '4uth0r5', key: 'id' } };

      const Post = this.sequelize.define('post', { title: Sequelize.STRING, authorId: authorIdColumn });

      this.Author.hasMany(Post);
      Post.belongsTo(this.Author);

      // The posts table gets dropped in the before filter.
      const err = await expect(Post.sync()).to.be.rejected;

      expect(err.message).to.match(/relation "4uth0r5" does not exist/);
    });

    it('works with comments', function () {
      // Test for a case where the comment was being moved to the end of the table when there was also a reference on the column, see #1521
      const Member = this.sequelize.define('Member', {});
      const idColumn = {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: false,
        comment: 'asdf'
      };

      idColumn.references = { model: Member, key: 'id' };

      this.sequelize.define('Profile', { id: idColumn });

      return this.sequelize.sync({ force: true });
    });
  });

  describe('blob', () => {
    beforeEach(function () {
      this.BlobUser = this.sequelize.define('blobUser', {
        data: Sequelize.BLOB
      });

      return this.BlobUser.sync({ force: true });
    });

    describe('buffers', () => {
      it('should be able to take a buffer as parameter to a BLOB field', async function () {
        const user = await this.BlobUser.create({
          data: new Buffer('Sequelize')
        });

        expect(user).to.be.ok;
      });

      it('should return a buffer when fetching a blob', async function () {
        const user = await this.BlobUser.create({
          data: new Buffer('Sequelize')
        });

        const foundUser = await this.BlobUser.findByPk(user.id);

        expect(foundUser.data).to.be.an.instanceOf(Buffer);
        expect(foundUser.data.toString()).to.have.string('Sequelize');
      });

      it('should work when the database returns null', async function () {
        const user = await this.BlobUser.create({
          // create a null column
        });

        const foundUser = await this.BlobUser.findByPk(user.id);

        expect(foundUser.data).to.be.null;
      });
    });

    // NOTE: someone remember to inform me about the intent of these tests. Are
    //       you saying that data passed in as a string is automatically converted
    //       to binary? i.e. "Sequelize" is CAST as binary, OR that actual binary
    //       data is passed in, in string form? Very unclear, and very different.

    describe('strings', () => {
      it('should be able to take a string as parameter to a BLOB field', async function () {
        const user = await this.BlobUser.create({
          data: 'Sequelize'
        });

        expect(user).to.be.ok;
      });

      it('should return a buffer when fetching a BLOB, even when the BLOB was inserted as a string', async function () {
        const user = await this.BlobUser.create({
          data: 'Sequelize'
        });

        const foundUser = await this.BlobUser.findByPk(user.id);

        expect(foundUser.data).to.be.an.instanceOf(Buffer);
        expect(foundUser.data.toString()).to.have.string('Sequelize');
      });
    });
  });

  describe('paranoid is true and where is an array', () => {
    beforeEach(async function () {
      this.User = this.sequelize.define('User', { username: DataTypes.STRING }, { paranoid: true });
      this.Project = this.sequelize.define('Project', { title: DataTypes.STRING }, { paranoid: true });

      this.Project.belongsToMany(this.User, { through: 'project_user' });
      this.User.belongsToMany(this.Project, { through: 'project_user' });

      await this.sequelize.sync({ force: true });

      await this.User.bulkCreate([
        {
          username: 'leia'
        },
        {
          username: 'luke'
        },
        {
          username: 'vader'
        }
      ]);

      await this.Project.bulkCreate([
        {
          title: 'republic'
        },
        {
          title: 'empire'
        }
      ]);

      const users = await this.User.findAll();
      const projects = await this.Project.findAll();

      const leia = users[0],
        luke = users[1],
        vader = users[2],
        republic = projects[0],
        empire = projects[1];

      await leia.setProjects([republic]);
      await luke.setProjects([republic]);
      await vader.setProjects([empire]);
      await leia.destroy();
    });

    it('should not fail when array contains Sequelize.or / and', async function () {
      const res = await this.User.findAll({
        where: [this.sequelize.or({ username: 'vader' }, { username: 'luke' }), this.sequelize.and({ id: [1, 2, 3] })]
      });

      expect(res).to.have.length(2);
    });

    it('should fail when array contains strings', async function () {
      await expect(
        this.User.findAll({
          where: ['this is a mistake', ['dont do it!']]
        })
      ).to.eventually.be.rejectedWith(
        Error,
        'Support for literal replacements in the `where` object has been removed.'
      );
    });

    it('should not fail with an include', async function () {
      const users = await this.User.findAll({
        where: this.sequelize.literal(
          this.sequelize.queryInterface.QueryGenerator.quoteIdentifiers('Projects.title') +
            ' = ' +
            this.sequelize.queryInterface.QueryGenerator.escape('republic')
        ),
        include: [{ model: this.Project }]
      });

      expect(users.length).to.be.equal(1);
      expect(users[0].username).to.be.equal('luke');
    });

    it('should not overwrite a specified deletedAt by setting paranoid: false', async function () {
      let tableName = '';
      if (this.User.name) {
        tableName = this.sequelize.queryInterface.QueryGenerator.quoteIdentifier(this.User.name) + '.';
      }

      const users = await this.User.findAll({
        paranoid: false,
        where: this.sequelize.literal(
          tableName + this.sequelize.queryInterface.QueryGenerator.quoteIdentifier('deletedAt') + ' IS NOT NULL '
        ),
        include: [{ model: this.Project }]
      });

      expect(users.length).to.be.equal(1);
      expect(users[0].username).to.be.equal('leia');
    });

    it('should not overwrite a specified deletedAt (complex query) by setting paranoid: false', async function () {
      const res = await this.User.findAll({
        paranoid: false,
        where: [
          this.sequelize.or({ username: 'leia' }, { username: 'luke' }),
          this.sequelize.and(
            { id: [1, 2, 3] },
            this.sequelize.or({ deletedAt: null }, { deletedAt: { gt: new Date(0) } })
          )
        ]
      });

      expect(res).to.have.length(2);
    });
  });

  it('supports multiple async transactions', async function () {
    this.timeout(90000);

    const sequelize = await Support.prepareTransactionTest(this.sequelize);
    const User = sequelize.define('User', { username: Sequelize.STRING });

    const testAsync = async function () {
      const t = await sequelize.transaction();

      await User.create(
        {
          username: 'foo'
        },
        {
          transaction: t
        }
      );

      const outsideTransaction = await User.findAll({
        where: {
          username: 'foo'
        }
      });

      expect(outsideTransaction).to.have.length(0);

      const insideTransaction = await User.findAll({
        where: {
          username: 'foo'
        },
        transaction: t
      });

      expect(insideTransaction).to.have.length(1);

      await t.rollback();
    };

    await User.sync({ force: true });

    const tasks = [];
    for (let i = 0; i < 1000; i++) {
      tasks.push(testAsync);
    }

    await mapWithConcurrency(tasks, (entry) => entry(), {
      // Needs to be one less than ??? else the non transaction query won't ever get a connection
      concurrency: ((sequelize.config.pool && sequelize.config.pool.max) || 5) - 1
    });
  });

  describe('Unique', () => {
    it('should set unique when unique is true', function () {
      const uniqueTrue = this.sequelize.define('uniqueTrue', {
        str: { type: Sequelize.STRING, unique: true }
      });

      return uniqueTrue.sync({
        force: true,
        logging: _.after(
          2,
          _.once((s) => {
            expect(s).to.match(/UNIQUE/);
          })
        )
      });
    });

    it('should not set unique when unique is false', function () {
      const uniqueFalse = this.sequelize.define('uniqueFalse', {
        str: { type: Sequelize.STRING, unique: false }
      });

      return uniqueFalse.sync({
        force: true,
        logging: _.after(
          2,
          _.once((s) => {
            expect(s).not.to.match(/UNIQUE/);
          })
        )
      });
    });

    it('should not set unique when unique is unset', function () {
      const uniqueUnset = this.sequelize.define('uniqueUnset', {
        str: { type: Sequelize.STRING }
      });

      return uniqueUnset.sync({
        force: true,
        logging: _.after(
          2,
          _.once((s) => {
            expect(s).not.to.match(/UNIQUE/);
          })
        )
      });
    });
  });

  it('should be possible to use a key named UUID as foreign key', function () {
    this.sequelize.define('project', {
      UserId: {
        type: Sequelize.STRING,
        references: {
          model: 'Users',
          key: 'UUID'
        }
      }
    });

    this.sequelize.define('Users', {
      UUID: {
        type: Sequelize.STRING,
        primaryKey: true,
        unique: true,
        allowNull: false,
        validate: {
          notNull: true,
          notEmpty: true
        }
      }
    });

    return this.sequelize.sync({ force: true });
  });

  describe('bulkCreate errors', () => {
    it('should return array of errors if validate and individualHooks are true', function () {
      const data = [{ username: null }, { username: null }, { username: null }];

      const user = this.sequelize.define('Users', {
        username: {
          type: Sequelize.STRING,
          allowNull: false,
          validate: {
            notNull: true,
            notEmpty: true
          }
        }
      });

      return expect(
        user.bulkCreate(data, {
          validate: true,
          individualHooks: true
        })
      ).to.be.rejectedWith(AggregateError);
    });
  });
});
