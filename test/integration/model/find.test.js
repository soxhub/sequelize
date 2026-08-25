import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import sinon from 'sinon';
import Sequelize from '../../../index.js';
import moment from 'moment';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import config from '../../config/config.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let SharedUser, SharedUserPrimary, seededUser;

  beforeEach(async () => {
    SharedUser = current.define('User', {
      username: DataTypes.STRING,
      secretValue: DataTypes.STRING,
      data: DataTypes.STRING,
      intVal: DataTypes.INTEGER,
      theDate: DataTypes.DATE,
      aBool: DataTypes.BOOLEAN
    });

    await SharedUser.sync({ force: true });
  });

  describe('find', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const user1 = await User.findOne({
          where: { username: 'foo' }
        });
        const user2 = await User.findOne({
          where: { username: 'foo' },
          transaction: t
        });

        expect(user1).to.be.null;
        expect(user2).to.not.be.null;

        await t.rollback();
      });
    }

    describe('general / basic function', () => {
      beforeEach(async () => {
        const user = await SharedUser.create({ username: 'barfooz' });

        SharedUserPrimary = current.define('UserPrimary', {
          specialkey: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        });

        await SharedUserPrimary.sync({ force: true });
        await SharedUserPrimary.create({ specialkey: 'a string' });

        seededUser = user;
      });

      it('treats questionmarks in an array', async () => {
        let test = false;

        await SharedUserPrimary.findOne({
          where: { specialkey: 'awesome' },
          logging(sql) {
            test = true;
            expect(sql).to.match(/WHERE ["|`|[]UserPrimary["|`|\]]\.["|`|[]specialkey["|`|\]] = N?'awesome'/);
          }
        });

        expect(test).to.be.true;
      });

      it("doesn't throw an error when entering in a non integer value for a specified primary field", async () => {
        const user = await SharedUserPrimary.findByPk('a string');

        expect(user.specialkey).to.equal('a string');
      });

      it('returns a single dao', async () => {
        const user = await SharedUser.findByPk(seededUser.id);

        expect(Array.isArray(user)).to.not.be.ok;
        expect(user.id).to.equal(seededUser.id);
        expect(user.id).to.equal(1);
      });

      it('returns a single dao given a string id', async () => {
        const user = await SharedUser.findByPk(String(seededUser.id));

        expect(Array.isArray(user)).to.not.be.ok;
        expect(user.id).to.equal(seededUser.id);
        expect(user.id).to.equal(1);
      });

      it('should make aliased attributes available', async () => {
        const user = await SharedUser.findOne({
          where: { id: 1 },
          attributes: ['id', ['username', 'name']]
        });

        expect(user.dataValues.name).to.equal('barfooz');
      });

      it('should fail with meaningful error message on invalid attributes definition', async () => {
        await expect(
          SharedUser.findOne({
            where: { id: 1 },
            attributes: ['id', ['username']]
          })
        ).to.be.rejectedWith(
          "[\"username\"] is not a valid attribute definition. Please use the following format: ['attribute definition', 'alias']"
        );
      });

      it('should not try to convert boolean values if they are not selected', async () => {
        const UserWithBoolean = current.define('UserBoolean', {
          active: Sequelize.BOOLEAN
        });

        await UserWithBoolean.sync({ force: true });

        const user = await UserWithBoolean.create({ active: true });
        const foundUser = await UserWithBoolean.findOne({ where: { id: user.id }, attributes: ['id'] });

        expect(foundUser.active).not.to.exist;
      });

      it('finds a specific user via where option', async () => {
        const user = await SharedUser.findOne({ where: { username: 'barfooz' } });

        expect(user.username).to.equal('barfooz');
      });

      it("doesn't find a user if conditions are not matching", async () => {
        const user = await SharedUser.findOne({ where: { username: 'foo' } });

        expect(user).to.be.null;
      });

      it('allows sql logging', async () => {
        let test = false;

        await SharedUser.findOne({
          where: { username: 'foo' },
          logging(sql) {
            test = true;
            expect(sql).to.exist;
            expect(sql.toUpperCase().indexOf('SELECT')).to.be.above(-1);
          }
        });

        expect(test).to.be.true;
      });

      it('ignores passed limit option', async () => {
        const user = await SharedUser.findOne({ limit: 10 });

        // it returns an object instead of an array
        expect(Array.isArray(user)).to.not.be.ok;
        expect(Object.hasOwn(user.dataValues, 'username')).to.be.ok;
      });

      it('finds entries via primary keys', async () => {
        const UserPrimary = current.define('UserWithPrimaryKey', {
          identifier: { type: Sequelize.STRING, primaryKey: true },
          name: Sequelize.STRING
        });

        await UserPrimary.sync({ force: true });

        const u = await UserPrimary.create({
          identifier: 'an identifier',
          name: 'John'
        });

        expect(u.id).not.to.exist;

        const u2 = await UserPrimary.findByPk('an identifier');

        expect(u2.identifier).to.equal('an identifier');
        expect(u2.name).to.equal('John');
      });

      it('finds entries via a string primary key called id', async () => {
        const UserPrimary = current.define('UserWithPrimaryKey', {
          id: { type: Sequelize.STRING, primaryKey: true },
          name: Sequelize.STRING
        });

        await UserPrimary.sync({ force: true });
        await UserPrimary.create({
          id: 'a string based id',
          name: 'Johnno'
        });

        const u2 = await UserPrimary.findByPk('a string based id');

        expect(u2.id).to.equal('a string based id');
        expect(u2.name).to.equal('Johnno');
      });

      it('always honors ZERO as primary key', async () => {
        const permutations = [0, '0'];
        let count = 0;

        await SharedUser.bulkCreate([{ username: 'jack' }, { username: 'jack' }]);

        await Promise.all(
          permutations.map(async (perm) => {
            const user = await SharedUser.findByPk(perm, {
              logging(s) {
                expect(s.indexOf(0)).not.to.equal(-1);
                count++;
              }
            });

            expect(user).to.be.null;
          })
        );

        expect(count).to.be.equal(permutations.length);
      });

      it('should allow us to find IDs using capital letters', async () => {
        const User = current.define('User' + config.rand(), {
          ID: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          Login: { type: Sequelize.STRING }
        });

        await User.sync({ force: true });
        await User.create({ Login: 'foo' });

        const user = await User.findByPk(1);

        expect(user).to.exist;
        expect(user.ID).to.equal(1);
      });
    });

    describe('eager loading', () => {
      let Task, Worker, init, seededWorker, seededTask, Group, Contact, Photo, PhoneNumber, Product, Tag;
      let seededProducts, seededTags;

      beforeEach(() => {
        Task = current.define('Task', { title: Sequelize.STRING });
        Worker = current.define('Worker', { name: Sequelize.STRING });

        init = async (callback) => {
          await current.sync({ force: true });

          seededWorker = await Worker.create({ name: 'worker' });
          seededTask = await Task.create({ title: 'homework' });

          return await callback();
        };
      });

      describe('belongsTo', () => {
        describe('generic', () => {
          it('throws an error about unexpected input if include contains a non-object', async () => {
            await expect(Worker.findOne({ include: [1] })).to.be.rejectedWith(
              'Include unexpected. Element has to be either a Model, an Association or an object.'
            );
          });

          it('throws an error if included DaoFactory is not associated', async () => {
            await expect(Worker.findOne({ include: [Task] })).to.be.rejectedWith('Task is not associated to Worker!');
          });

          it('returns the associated worker via task.worker', async () => {
            Task.belongsTo(Worker);

            await init(async () => {
              await seededTask.setWorker(seededWorker);

              const task = await Task.findOne({
                where: { title: 'homework' },
                include: [Worker]
              });

              expect(task).to.exist;
              expect(task.Worker).to.exist;
              expect(task.Worker.name).to.equal('worker');
            });
          });
        });

        it('returns the private and public ip', async () => {
          const Domain = current.define('Domain', { ip: Sequelize.STRING });
          const Environment = current.define('Environment', { name: Sequelize.STRING });

          Environment.belongsTo(Domain, { as: 'PrivateDomain', foreignKey: 'privateDomainId' });
          Environment.belongsTo(Domain, { as: 'PublicDomain', foreignKey: 'publicDomainId' });

          await Domain.sync({ force: true });
          await Environment.sync({ force: true });

          const privateIp = await Domain.create({ ip: '192.168.0.1' });
          const publicIp = await Domain.create({ ip: '91.65.189.19' });
          const env = await Environment.create({ name: 'environment' });

          await env.setPrivateDomain(privateIp);
          await env.setPublicDomain(publicIp);

          const environment = await Environment.findOne({
            where: { name: 'environment' },
            include: [
              { model: Domain, as: 'PrivateDomain' },
              { model: Domain, as: 'PublicDomain' }
            ]
          });

          expect(environment).to.exist;
          expect(environment.PrivateDomain).to.exist;
          expect(environment.PrivateDomain.ip).to.equal('192.168.0.1');
          expect(environment.PublicDomain).to.exist;
          expect(environment.PublicDomain.ip).to.equal('91.65.189.19');
        });

        it('eager loads with non-id primary keys', async () => {
          SharedUser = current.define('UserPKeagerbelong', {
            username: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          Group = current.define('GroupPKeagerbelong', {
            name: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          SharedUser.belongsTo(Group);

          await current.sync({ force: true });
          await Group.create({ name: 'people' });
          await SharedUser.create({ username: 'someone', GroupPKeagerbelongName: 'people' });

          const someUser = await SharedUser.findOne({
            where: {
              username: 'someone'
            },
            include: [Group]
          });

          expect(someUser).to.exist;
          expect(someUser.username).to.equal('someone');
          expect(someUser.GroupPKeagerbelong.name).to.equal('people');
        });

        it('getting parent data in many to one relationship', async () => {
          const User = current.define('User', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            username: { type: Sequelize.STRING }
          });

          const Message = current.define('Message', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            user_id: { type: Sequelize.INTEGER },
            message: { type: Sequelize.STRING }
          });

          User.hasMany(Message);
          Message.belongsTo(User, { foreignKey: 'user_id' });

          await current.sync({ force: true });

          const user = await User.create({ username: 'test_testerson' });

          await Message.create({ user_id: user.id, message: 'hi there!' });
          await Message.create({ user_id: user.id, message: 'a second message' });

          const messages = await Message.findAll({
            where: { user_id: user.id },
            attributes: ['user_id', 'message'],
            include: [{ model: User, attributes: ['username'] }]
          });

          expect(messages.length).to.equal(2);

          expect(messages[0].message).to.equal('hi there!');
          expect(messages[0].User.username).to.equal('test_testerson');

          expect(messages[1].message).to.equal('a second message');
          expect(messages[1].User.username).to.equal('test_testerson');
        });

        it('allows mulitple assocations of the same model with different alias', async () => {
          Worker.belongsTo(Task, { as: 'ToDo' });
          Worker.belongsTo(Task, { as: 'DoTo' });

          await init(async () => {
            await Worker.findOne({
              include: [
                { model: Task, as: 'ToDo' },
                { model: Task, as: 'DoTo' }
              ]
            });
          });
        });
      });

      describe('hasOne', () => {
        beforeEach(async () => {
          Worker.hasOne(Task);

          await init(async () => {
            await seededWorker.setTask(seededTask);
          });
        });

        it('throws an error if included DaoFactory is not associated', async () => {
          await expect(Task.findOne({ include: [Worker] })).to.be.rejectedWith('Worker is not associated to Task!');
        });

        it('returns the associated task via worker.task', async () => {
          const worker = await Worker.findOne({
            where: { name: 'worker' },
            include: [Task]
          });

          expect(worker).to.exist;
          expect(worker.Task).to.exist;
          expect(worker.Task.title).to.equal('homework');
        });

        it('eager loads with non-id primary keys', async () => {
          SharedUser = current.define('UserPKeagerone', {
            username: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          Group = current.define('GroupPKeagerone', {
            name: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          Group.hasOne(SharedUser);

          await current.sync({ force: true });
          await Group.create({ name: 'people' });
          await SharedUser.create({ username: 'someone', GroupPKeageroneName: 'people' });

          const someGroup = await Group.findOne({
            where: {
              name: 'people'
            },
            include: [SharedUser]
          });

          expect(someGroup).to.exist;
          expect(someGroup.name).to.equal('people');
          expect(someGroup.UserPKeagerone.username).to.equal('someone');
        });
      });

      describe('hasOne with alias', () => {
        it('throws an error if included DaoFactory is not referenced by alias', async () => {
          await expect(Worker.findOne({ include: [Task] })).to.be.rejectedWith('Task is not associated to Worker!');
        });

        describe('alias', () => {
          beforeEach(async () => {
            Worker.hasOne(Task, { as: 'ToDo' });

            await init(async () => {
              await seededWorker.setToDo(seededTask);
            });
          });

          it("throws an error indicating an incorrect alias was entered if an association and alias exist but the alias doesn't match", async () => {
            await expect(Worker.findOne({ include: [{ model: Task, as: 'Work' }] })).to.be.rejectedWith(
              "Task is associated to Worker using an alias. You've included an alias (Work), but it does not match the alias defined in your association."
            );
          });

          it('returns the associated task via worker.task', async () => {
            const worker = await Worker.findOne({
              where: { name: 'worker' },
              include: [{ model: Task, as: 'ToDo' }]
            });

            expect(worker).to.exist;
            expect(worker.ToDo).to.exist;
            expect(worker.ToDo.title).to.equal('homework');
          });

          it('returns the associated task via worker.task when daoFactory is aliased with model', async () => {
            const worker = await Worker.findOne({
              where: { name: 'worker' },
              include: [{ model: Task, as: 'ToDo' }]
            });

            expect(worker.ToDo.title).to.equal('homework');
          });

          it('allows mulitple assocations of the same model with different alias', async () => {
            Worker.hasOne(Task, { as: 'DoTo' });

            await init(async () => {
              await Worker.findOne({
                include: [
                  { model: Task, as: 'ToDo' },
                  { model: Task, as: 'DoTo' }
                ]
              });
            });
          });
        });
      });

      describe('hasMany', () => {
        beforeEach(async () => {
          Worker.hasMany(Task);

          await init(async () => {
            await seededWorker.setTasks([seededTask]);
          });
        });

        it('throws an error if included DaoFactory is not associated', async () => {
          await expect(Task.findOne({ include: [Worker] })).to.be.rejectedWith('Worker is not associated to Task!');
        });

        it('returns the associated tasks via worker.tasks', async () => {
          const worker = await Worker.findOne({
            where: { name: 'worker' },
            include: [Task]
          });

          expect(worker).to.exist;
          expect(worker.Tasks).to.exist;
          expect(worker.Tasks[0].title).to.equal('homework');
        });

        it('including two has many relations should not result in duplicate values', async () => {
          Contact = current.define('Contact', { name: DataTypes.STRING });
          Photo = current.define('Photo', { img: DataTypes.TEXT });
          PhoneNumber = current.define('PhoneNumber', { phone: DataTypes.TEXT });

          Contact.hasMany(Photo, { as: 'Photos' });
          Contact.hasMany(PhoneNumber);

          await current.sync({ force: true });

          const someContact = await Contact.create({ name: 'Boris' });
          const somePhoto = await Photo.create({ img: 'img.jpg' });
          const somePhone1 = await PhoneNumber.create({ phone: '000000' });
          const somePhone2 = await PhoneNumber.create({ phone: '111111' });

          await someContact.setPhotos([somePhoto]);
          await someContact.setPhoneNumbers([somePhone1, somePhone2]);

          const fetchedContact = await Contact.findOne({
            where: {
              name: 'Boris'
            },
            include: [PhoneNumber, { model: Photo, as: 'Photos' }]
          });

          expect(fetchedContact).to.exist;
          expect(fetchedContact.Photos.length).to.equal(1);
          expect(fetchedContact.PhoneNumbers.length).to.equal(2);
        });

        it('eager loads with non-id primary keys', async () => {
          SharedUser = current.define('UserPKeagerone', {
            username: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          Group = current.define('GroupPKeagerone', {
            name: {
              type: Sequelize.STRING,
              primaryKey: true
            }
          });
          Group.belongsToMany(SharedUser, { through: 'group_user' });
          SharedUser.belongsToMany(Group, { through: 'group_user' });

          await current.sync({ force: true });

          const someUser = await SharedUser.create({ username: 'someone' });
          const someGroup = await Group.create({ name: 'people' });

          await someUser.setGroupPKeagerones([someGroup]);

          const foundUser = await SharedUser.findOne({
            where: {
              username: 'someone'
            },
            include: [Group]
          });

          expect(foundUser).to.exist;
          expect(foundUser.username).to.equal('someone');
          expect(foundUser.GroupPKeagerones[0].name).to.equal('people');
        });
      });

      describe('hasMany with alias', () => {
        it('throws an error if included DaoFactory is not referenced by alias', async () => {
          await expect(Worker.findOne({ include: [Task] })).to.be.rejectedWith('Task is not associated to Worker!');
        });

        describe('alias', () => {
          beforeEach(async () => {
            Worker.hasMany(Task, { as: 'ToDos' });

            await init(async () => {
              await seededWorker.setToDos([seededTask]);
            });
          });

          it("throws an error indicating an incorrect alias was entered if an association and alias exist but the alias doesn't match", async () => {
            await expect(Worker.findOne({ include: [{ model: Task, as: 'Work' }] })).to.be.rejectedWith(
              "Task is associated to Worker using an alias. You've included an alias (Work), but it does not match the alias defined in your association."
            );
          });

          it('returns the associated task via worker.task', async () => {
            const worker = await Worker.findOne({
              where: { name: 'worker' },
              include: [{ model: Task, as: 'ToDos' }]
            });

            expect(worker).to.exist;
            expect(worker.ToDos).to.exist;
            expect(worker.ToDos[0].title).to.equal('homework');
          });

          it('returns the associated task via worker.task when daoFactory is aliased with model', async () => {
            const worker = await Worker.findOne({
              where: { name: 'worker' },
              include: [{ model: Task, as: 'ToDos' }]
            });

            expect(worker.ToDos[0].title).to.equal('homework');
          });

          it('allows mulitple assocations of the same model with different alias', async () => {
            Worker.hasMany(Task, { as: 'DoTos' });

            await init(async () => {
              await Worker.findOne({
                include: [
                  { model: Task, as: 'ToDos' },
                  { model: Task, as: 'DoTos' }
                ]
              });
            });
          });
        });
      });

      describe('hasMany (N:M) with alias', () => {
        beforeEach(() => {
          Product = current.define('Product', { title: Sequelize.STRING });
          Tag = current.define('Tag', { name: Sequelize.STRING });
        });

        it('returns the associated models when using through as string and alias', async () => {
          Product.belongsToMany(Tag, { as: 'tags', through: 'product_tag' });
          Tag.belongsToMany(Product, { as: 'products', through: 'product_tag' });

          await current.sync();

          await Promise.all([
            Product.bulkCreate([
              { title: 'Chair' },
              { title: 'Desk' },
              { title: 'Handbag' },
              { title: 'Dress' },
              { title: 'Jan' }
            ]),
            Tag.bulkCreate([{ name: 'Furniture' }, { name: 'Clothing' }, { name: 'People' }])
          ]);

          const [products, tags] = await Promise.all([Product.findAll(), Tag.findAll()]);

          seededProducts = products;
          seededTags = tags;

          await Promise.all([
            products[0].setTags([tags[0], tags[1]]),
            products[1].addTag(tags[0]),
            products[2].addTag(tags[1]),
            products[3].setTags([tags[1]]),
            products[4].setTags([tags[2]])
          ]);

          const [tag, tagProducts, product, productTags] = await Promise.all([
            Tag.findOne({
              where: {
                id: tags[0].id
              },
              include: [{ model: Product, as: 'products' }]
            }),
            tags[1].getProducts(),
            Product.findOne({
              where: {
                id: products[0].id
              },
              include: [{ model: Tag, as: 'tags' }]
            }),
            products[1].getTags()
          ]);

          expect(tag).to.exist;
          expect(tag.products.length).to.equal(2);
          expect(tagProducts.length).to.equal(3);
          expect(product).to.exist;
          expect(product.tags.length).to.equal(2);
          expect(productTags.length).to.equal(1);
        });

        it('returns the associated models when using through as model and alias', async () => {
          // Exactly the same code as the previous test, just with a through model instance
          const ProductTag = current.define('product_tag');

          Product.belongsToMany(Tag, { as: 'tags', through: ProductTag });
          Tag.belongsToMany(Product, { as: 'products', through: ProductTag });

          await current.sync();

          await Promise.all([
            Product.bulkCreate([
              { title: 'Chair' },
              { title: 'Desk' },
              { title: 'Handbag' },
              { title: 'Dress' },
              { title: 'Jan' }
            ]),
            Tag.bulkCreate([{ name: 'Furniture' }, { name: 'Clothing' }, { name: 'People' }])
          ]);

          const [products, tags] = await Promise.all([Product.findAll(), Tag.findAll()]);

          seededProducts = products;
          seededTags = tags;

          await Promise.all([
            products[0].setTags([tags[0], tags[1]]),
            products[1].addTag(tags[0]),
            products[2].addTag(tags[1]),
            products[3].setTags([tags[1]]),
            products[4].setTags([tags[2]])
          ]);

          await Promise.all([
            expect(
              Tag.findOne({
                where: {
                  id: seededTags[0].id
                },
                include: [{ model: Product, as: 'products' }]
              })
            )
              .to.eventually.have.property('products')
              .to.have.length(2),
            expect(
              Product.findOne({
                where: {
                  id: seededProducts[0].id
                },
                include: [{ model: Tag, as: 'tags' }]
              })
            )
              .to.eventually.have.property('tags')
              .to.have.length(2),
            expect(seededTags[1].getProducts()).to.eventually.have.length(3),
            expect(seededProducts[1].getTags()).to.eventually.have.length(1)
          ]);
        });
      });
    });

    describe('queryOptions', () => {
      beforeEach(async () => {
        seededUser = await SharedUser.create({ username: 'barfooz' });
      });

      it('should return a DAO when queryOptions are not set', async () => {
        const user = await SharedUser.findOne({ where: { username: 'barfooz' } });

        expect(user).to.be.instanceOf(SharedUser);
      });

      it('should return a DAO when raw is false', async () => {
        const user = await SharedUser.findOne({ where: { username: 'barfooz' }, raw: false });

        expect(user).to.be.instanceOf(SharedUser);
      });

      it('should return raw data when raw is true', async () => {
        const user = await SharedUser.findOne({ where: { username: 'barfooz' }, raw: true });

        expect(user).to.not.be.instanceOf(SharedUser);
        expect(user).to.be.instanceOf(Object);
      });
    });

    it('should support logging', async () => {
      const spy = sinon.spy();

      await SharedUser.findOne({
        where: {},
        logging: spy
      });

      expect(spy.called).to.be.ok;
    });

    describe('rejectOnEmpty mode', () => {
      it('throws error when record not found by findOne', () => {
        return expect(
          SharedUser.findOne({
            where: {
              username: 'ath-kantam-pradakshnami'
            },
            rejectOnEmpty: true
          })
        ).to.eventually.be.rejectedWith(Sequelize.EmptyResultError);
      });

      it('throws error when record not found by findById', () => {
        return expect(
          SharedUser.findByPk(4732322332323333, {
            rejectOnEmpty: true
          })
        ).to.eventually.be.rejectedWith(Sequelize.EmptyResultError);
      });

      it('throws error when record not found by find', () => {
        return expect(
          SharedUser.findOne({
            where: {
              username: 'some-username-that-is-not-used-anywhere'
            },
            rejectOnEmpty: true
          })
        ).to.eventually.be.rejectedWith(Sequelize.EmptyResultError);
      });

      it('works from model options', async () => {
        const Model = current.define(
          'Test',
          {
            username: Sequelize.STRING(100)
          },
          {
            rejectOnEmpty: true
          }
        );

        await Model.sync({ force: true });

        await expect(
          Model.findOne({
            where: {
              username: 'some-username-that-is-not-used-anywhere'
            }
          })
        ).to.eventually.be.rejectedWith(Sequelize.EmptyResultError);
      });

      it('resolve null when disabled', async () => {
        const Model = current.define('Test', {
          username: Sequelize.STRING(100)
        });

        await Model.sync({ force: true });

        await expect(
          Model.findOne({
            where: {
              username: 'some-username-that-is-not-used-anywhere-for-sure-this-time'
            }
          })
        ).to.eventually.be.equal(null);
      });
    });

    it('should find records where deletedAt set to future', async () => {
      const User = current.define(
        'paranoiduser',
        {
          username: Sequelize.STRING
        },
        { paranoid: true }
      );

      await User.sync({ force: true });
      await User.bulkCreate([
        { username: 'Bob' },
        { username: 'Tobi', deletedAt: moment().add(30, 'minutes').format() },
        { username: 'Max', deletedAt: moment().add(30, 'days').format() },
        { username: 'Tony', deletedAt: moment().subtract(30, 'days').format() }
      ]);

      const tobi = await User.findOne({ where: { username: 'Tobi' } });
      expect(tobi).not.to.be.null;

      const users = await User.findAll();
      expect(users.length).to.be.eql(3);
    });
  });
});
