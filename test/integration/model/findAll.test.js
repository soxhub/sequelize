import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import sinon from 'sinon';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import config from '../../config/config.js';
import moment from 'moment';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let SharedUser;

  beforeEach(async () => {
    SharedUser = current.define('User', {
      username: DataTypes.STRING,
      secretValue: DataTypes.STRING,
      data: DataTypes.STRING,
      intVal: DataTypes.INTEGER,
      theDate: DataTypes.DATE,
      aBool: DataTypes.BOOLEAN,
      binary: DataTypes.STRING(16, true)
    });

    await SharedUser.sync({ force: true });
  });

  describe('findAll', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const users1 = await User.findAll({ where: { username: 'foo' } });
        const users2 = await User.findAll({ transaction: t });
        const users3 = await User.findAll({ where: { username: 'foo' }, transaction: t });

        expect(users1.length).to.equal(0);
        expect(users2.length).to.equal(1);
        expect(users3.length).to.equal(1);

        await t.rollback();
      });
    }

    it('should not crash on an empty where array', () => {
      return SharedUser.findAll({
        where: []
      });
    });

    describe('special where conditions/smartWhere object', () => {
      let buf;

      beforeEach(() => {
        buf = Buffer.alloc(16, '\x01');
        return SharedUser.bulkCreate([
          { username: 'boo', intVal: 5, theDate: '2013-01-01 12:00' },
          { username: 'boo2', intVal: 10, theDate: '2013-01-10 12:00', binary: buf }
        ]);
      });

      it('should be able to find rows where attribute is in a list of values', async () => {
        const users = await SharedUser.findAll({
          where: {
            username: ['boo', 'boo2']
          }
        });

        expect(users).to.have.length(2);
      });

      it('should not break when trying to find rows using an array of primary keys', () => {
        return SharedUser.findAll({
          where: {
            id: [1, 2, 3]
          }
        });
      });

      it('should not break when using smart syntax on binary fields', async () => {
        const users = await SharedUser.findAll({
          where: {
            binary: [buf, buf]
          }
        });

        expect(users).to.have.length(1);
        expect(users[0].binary.toString()).to.equal(buf.toString());
        expect(users[0].username).to.equal('boo2');
      });

      it('should be able to find a row using like', async () => {
        const users = await SharedUser.findAll({
          where: {
            username: {
              like: '%2'
            }
          }
        });

        expect(users).to.be.an.instanceof(Array);
        expect(users).to.have.length(1);
        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row using not like', async () => {
        const users = await SharedUser.findAll({
          where: {
            username: {
              nlike: '%2'
            }
          }
        });

        expect(users).to.be.an.instanceof(Array);
        expect(users).to.have.length(1);
        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row using ilike', async () => {
        const users = await SharedUser.findAll({
          where: {
            username: {
              ilike: '%2'
            }
          }
        });

        expect(users).to.be.an.instanceof(Array);
        expect(users).to.have.length(1);
        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row using not ilike', async () => {
        const users = await SharedUser.findAll({
          where: {
            username: {
              notilike: '%2'
            }
          }
        });

        expect(users).to.be.an.instanceof(Array);
        expect(users).to.have.length(1);
        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row between a certain date using the between shortcut', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              '..': ['2013-01-02', '2013-01-11']
            }
          }
        });

        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row not between a certain integer using the not between shortcut', async () => {
        const users = await SharedUser.findAll({
          where: {
            intVal: {
              '!..': [8, 10]
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to handle false/true values just fine...', async () => {
        await SharedUser.bulkCreate([
          { username: 'boo5', aBool: false },
          { username: 'boo6', aBool: true }
        ]);

        const users = await SharedUser.findAll({ where: { aBool: false } });
        expect(users).to.have.length(1);
        expect(users[0].username).to.equal('boo5');

        const _users = await SharedUser.findAll({ where: { aBool: true } });
        expect(_users).to.have.length(1);
        expect(_users[0].username).to.equal('boo6');
      });

      it('should be able to handle false/true values through associations as well...', async () => {
        const Passports = current.define('Passports', {
          isActive: Sequelize.BOOLEAN
        });

        SharedUser.hasMany(Passports);
        Passports.belongsTo(SharedUser);

        await SharedUser.sync({ force: true });
        await Passports.sync({ force: true });
        await SharedUser.bulkCreate([
          { username: 'boo5', aBool: false },
          { username: 'boo6', aBool: true }
        ]);
        await Passports.bulkCreate([{ isActive: true }, { isActive: false }]);

        const user = await SharedUser.findByPk(1);
        const passport = await Passports.findByPk(1);

        await user.setPassports([passport]);

        const _user = await SharedUser.findByPk(2);
        const _passport = await Passports.findByPk(2);

        await _user.setPassports([_passport]);

        const theFalsePassport = await _user.getPassports({ where: { isActive: false } });
        const theTruePassport = await user.getPassports({ where: { isActive: true } });

        expect(theFalsePassport).to.have.length(1);
        expect(theFalsePassport[0].isActive).to.be.false;
        expect(theTruePassport).to.have.length(1);
        expect(theTruePassport[0].isActive).to.be.true;
      });

      it('should be able to handle binary values through associations as well...', async () => {
        const Binary = current.define('Binary', {
          id: {
            type: DataTypes.STRING(16, true),
            primaryKey: true
          }
        });

        const buf1 = buf;
        const buf2 = Buffer.alloc(16, '\x02');

        SharedUser.belongsTo(Binary, { foreignKey: 'binary' });

        await current.sync({ force: true });
        await SharedUser.bulkCreate([
          { username: 'boo5', aBool: false },
          { username: 'boo6', aBool: true }
        ]);
        await Binary.bulkCreate([{ id: buf1 }, { id: buf2 }]);

        const user = await SharedUser.findByPk(1);
        const binary = await Binary.findByPk(buf1);

        await user.setBinary(binary);

        const _user = await SharedUser.findByPk(2);
        const _binary = await Binary.findByPk(buf2);

        await _user.setBinary(_binary);

        const _binaryRetrieved = await _user.getBinary();
        const binaryRetrieved = await user.getBinary();

        expect(binaryRetrieved.id).to.have.length(16);
        expect(_binaryRetrieved.id).to.have.length(16);
        expect(binaryRetrieved.id.toString()).to.be.equal(buf1.toString());
        expect(_binaryRetrieved.id.toString()).to.be.equal(buf2.toString());
      });

      it('should be able to find a row between a certain date', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              between: ['2013-01-02', '2013-01-11']
            }
          }
        });

        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row between a certain date and an additional where clause', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              between: ['2013-01-02', '2013-01-11']
            },
            intVal: 10
          }
        });

        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row not between a certain integer', async () => {
        const users = await SharedUser.findAll({
          where: {
            intVal: {
              nbetween: [8, 10]
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row using not between and between logic', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              between: ['2012-12-10', '2013-01-02'],
              nbetween: ['2013-01-04', '2013-01-20']
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row using not between and between logic with dates', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              between: [new Date('2012-12-10'), new Date('2013-01-02')],
              nbetween: [new Date('2013-01-04'), new Date('2013-01-20')]
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row using greater than or equal to logic with dates', async () => {
        const users = await SharedUser.findAll({
          where: {
            theDate: {
              gte: new Date('2013-01-09')
            }
          }
        });

        expect(users[0].username).to.equal('boo2');
        expect(users[0].intVal).to.equal(10);
      });

      it('should be able to find a row using greater than or equal to', async () => {
        const user = await SharedUser.findOne({
          where: {
            intVal: {
              gte: 6
            }
          }
        });

        expect(user.username).to.equal('boo2');
        expect(user.intVal).to.equal(10);
      });

      it('should be able to find a row using greater than', async () => {
        const user = await SharedUser.findOne({
          where: {
            intVal: {
              gt: 5
            }
          }
        });

        expect(user.username).to.equal('boo2');
        expect(user.intVal).to.equal(10);
      });

      it('should be able to find a row using lesser than or equal to', async () => {
        const user = await SharedUser.findOne({
          where: {
            intVal: {
              lte: 5
            }
          }
        });

        expect(user.username).to.equal('boo');
        expect(user.intVal).to.equal(5);
      });

      it('should be able to find a row using lesser than', async () => {
        const user = await SharedUser.findOne({
          where: {
            intVal: {
              lt: 6
            }
          }
        });

        expect(user.username).to.equal('boo');
        expect(user.intVal).to.equal(5);
      });

      it('should have no problem finding a row using lesser and greater than', async () => {
        const users = await SharedUser.findAll({
          where: {
            intVal: {
              lt: 6,
              gt: 4
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
      });

      it('should be able to find a row using not equal to logic', async () => {
        const user = await SharedUser.findOne({
          where: {
            intVal: {
              ne: 10
            }
          }
        });

        expect(user.username).to.equal('boo');
        expect(user.intVal).to.equal(5);
      });

      it('should be able to find multiple users with any of the special where logic properties', async () => {
        const users = await SharedUser.findAll({
          where: {
            intVal: {
              lte: 10
            }
          }
        });

        expect(users[0].username).to.equal('boo');
        expect(users[0].intVal).to.equal(5);
        expect(users[1].username).to.equal('boo2');
        expect(users[1].intVal).to.equal(10);
      });
    });

    describe('eager loading', () => {
      let Task;
      let Worker;
      let worker;
      let task;

      it('should not ignore where condition with empty includes, #8771', async () => {
        await SharedUser.bulkCreate([
          { username: 'D.E.N.N.I.S', intVal: 6 },
          { username: 'F.R.A.N.K', intVal: 5 },
          { username: 'W.I.L.D C.A.R.D', intVal: 8 }
        ]);

        const users = await SharedUser.findAll({
          where: {
            intVal: 8
          },
          include: []
        });

        expect(users).to.have.length(1);
        expect(users[0].get('username')).to.be.equal('W.I.L.D C.A.R.D');
      });

      describe('belongsTo', () => {
        beforeEach(async () => {
          Task = current.define('TaskBelongsTo', { title: Sequelize.STRING });
          Worker = current.define('Worker', { name: Sequelize.STRING });
          Task.belongsTo(Worker);

          await Worker.sync({ force: true });
          await Task.sync({ force: true });

          worker = await Worker.create({ name: 'worker' });
          task = await Task.create({ title: 'homework' });

          await task.setWorker(worker);
        });

        it('throws an error about unexpected input if include contains a non-object', async () => {
          await expect(Worker.findAll({ include: [1] })).to.be.rejectedWith(
            'Include unexpected. Element has to be either a Model, an Association or an object.'
          );
        });

        it('throws an error if included DaoFactory is not associated', async () => {
          await expect(Worker.findAll({ include: [Task] })).to.be.rejectedWith(
            'TaskBelongsTo is not associated to Worker!'
          );
        });

        it('returns the associated worker via task.worker', async () => {
          const tasks = await Task.findAll({
            where: { title: 'homework' },
            include: [Worker]
          });

          expect(tasks).to.exist;
          expect(tasks[0].Worker).to.exist;
          expect(tasks[0].Worker.name).to.equal('worker');
        });

        it('returns the associated worker via task.worker, using limit and sort', async () => {
          const tasks = await Task.findAll({
            where: { title: 'homework' },
            include: [Worker],
            limit: 1,
            order: [['title', 'DESC']]
          });

          expect(tasks).to.exist;
          expect(tasks[0].Worker).to.exist;
          expect(tasks[0].Worker.name).to.equal('worker');
        });
      });

      describe('hasOne', () => {
        beforeEach(async () => {
          Task = current.define('TaskHasOne', { title: Sequelize.STRING });
          Worker = current.define('Worker', { name: Sequelize.STRING });
          Worker.hasOne(Task);

          await Worker.sync({ force: true });
          await Task.sync({ force: true });

          worker = await Worker.create({ name: 'worker' });
          task = await Task.create({ title: 'homework' });

          await worker.setTaskHasOne(task);
        });

        it('throws an error if included DaoFactory is not associated', async () => {
          await expect(Task.findAll({ include: [Worker] })).to.be.rejectedWith(
            'Worker is not associated to TaskHasOne!'
          );
        });

        it('returns the associated task via worker.task', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [Task]
          });

          expect(workers).to.exist;
          expect(workers[0].TaskHasOne).to.exist;
          expect(workers[0].TaskHasOne.title).to.equal('homework');
        });
      });

      describe('hasOne with alias', () => {
        beforeEach(async () => {
          Task = current.define('Task', { title: Sequelize.STRING });
          Worker = current.define('Worker', { name: Sequelize.STRING });
          Worker.hasOne(Task, { as: 'ToDo' });

          await Worker.sync({ force: true });
          await Task.sync({ force: true });

          worker = await Worker.create({ name: 'worker' });
          task = await Task.create({ title: 'homework' });

          await worker.setToDo(task);
        });

        it('throws an error if included DaoFactory is not referenced by alias', async () => {
          await expect(Worker.findAll({ include: [Task] })).to.be.rejectedWith(
            'Task is associated to Worker using an alias. ' +
              "You must use the 'as' keyword to specify the alias within your include statement."
          );
        });

        it('throws an error if alias is not associated', async () => {
          await expect(Worker.findAll({ include: [{ model: Task, as: 'Work' }] })).to.be.rejectedWith(
            'Task is associated to Worker using an alias. ' +
              "You've included an alias (Work), but it does not match the alias defined in your association."
          );
        });

        it('returns the associated task via worker.task', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [{ model: Task, as: 'ToDo' }]
          });

          expect(workers).to.exist;
          expect(workers[0].ToDo).to.exist;
          expect(workers[0].ToDo.title).to.equal('homework');
        });

        it('returns the associated task via worker.task when daoFactory is aliased with model', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [{ model: Task, as: 'ToDo' }]
          });

          expect(workers[0].ToDo.title).to.equal('homework');
        });
      });

      describe('hasMany', () => {
        beforeEach(async () => {
          Task = current.define('task', { title: Sequelize.STRING });
          Worker = current.define('worker', { name: Sequelize.STRING });
          Worker.hasMany(Task);

          await Worker.sync({ force: true });
          await Task.sync({ force: true });

          worker = await Worker.create({ name: 'worker' });
          task = await Task.create({ title: 'homework' });

          await worker.setTasks([task]);
        });

        it('throws an error if included DaoFactory is not associated', async () => {
          await expect(Task.findAll({ include: [Worker] })).to.be.rejectedWith('worker is not associated to task!');
        });

        it('returns the associated tasks via worker.tasks', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [Task]
          });

          expect(workers).to.exist;
          expect(workers[0].tasks).to.exist;
          expect(workers[0].tasks[0].title).to.equal('homework');
        });

        // https://github.com/sequelize/sequelize/issues/8739
        it('supports sorting on renamed sub-query attribute', async () => {
          const User = current.define('user', {
            name: {
              type: Sequelize.STRING,
              field: 'some_other_name'
            }
          });
          const Project = current.define('project', { title: Sequelize.STRING });
          User.hasMany(Project);

          await User.sync({ force: true });
          await Project.sync({ force: true });
          await User.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);

          const users = await User.findAll({
            order: ['name'],
            limit: 2, // to force use of a sub-query
            include: [Project]
          });

          expect(users).to.have.lengthOf(2);
          expect(users[0].name).to.equal('a');
          expect(users[1].name).to.equal('b');
        });

        it('supports sorting DESC on renamed sub-query attribute', async () => {
          const User = current.define('user', {
            name: {
              type: Sequelize.STRING,
              field: 'some_other_name'
            }
          });
          const Project = current.define('project', { title: Sequelize.STRING });
          User.hasMany(Project);

          await User.sync({ force: true });
          await Project.sync({ force: true });
          await User.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);

          const users = await User.findAll({
            order: [['name', 'DESC']],
            limit: 2,
            include: [Project]
          });

          expect(users).to.have.lengthOf(2);
          expect(users[0].name).to.equal('c');
          expect(users[1].name).to.equal('b');
        });

        it('supports sorting on multiple renamed sub-query attributes', async () => {
          const User = current.define('user', {
            name: {
              type: Sequelize.STRING,
              field: 'some_other_name'
            },
            age: {
              type: Sequelize.INTEGER,
              field: 'a_g_e'
            }
          });
          const Project = current.define('project', { title: Sequelize.STRING });
          User.hasMany(Project);

          await User.sync({ force: true });
          await Project.sync({ force: true });
          await User.bulkCreate([
            { name: 'a', age: 1 },
            { name: 'a', age: 2 },
            { name: 'b', age: 3 }
          ]);

          const byNameThenAgeDesc = await User.findAll({
            order: [
              ['name', 'ASC'],
              ['age', 'DESC']
            ],
            limit: 2,
            include: [Project]
          });

          expect(byNameThenAgeDesc).to.have.lengthOf(2);
          expect(byNameThenAgeDesc[0].name).to.equal('a');
          expect(byNameThenAgeDesc[0].age).to.equal(2);
          expect(byNameThenAgeDesc[1].name).to.equal('a');
          expect(byNameThenAgeDesc[1].age).to.equal(1);

          const byNameDescThenAge = await User.findAll({
            order: [['name', 'DESC'], 'age'],
            limit: 2,
            include: [Project]
          });

          expect(byNameDescThenAge).to.have.lengthOf(2);
          expect(byNameDescThenAge[0].name).to.equal('b');
          expect(byNameDescThenAge[1].name).to.equal('a');
          expect(byNameDescThenAge[1].age).to.equal(1);
        });
      });

      describe('hasMany with alias', () => {
        beforeEach(async () => {
          Task = current.define('Task', { title: Sequelize.STRING });
          Worker = current.define('Worker', { name: Sequelize.STRING });
          Worker.hasMany(Task, { as: 'ToDos' });

          await Worker.sync({ force: true });
          await Task.sync({ force: true });

          worker = await Worker.create({ name: 'worker' });
          task = await Task.create({ title: 'homework' });

          await worker.setToDos([task]);
        });

        it('throws an error if included DaoFactory is not referenced by alias', async () => {
          await expect(Worker.findAll({ include: [Task] })).to.be.rejectedWith(
            'Task is associated to Worker using an alias. ' +
              "You must use the 'as' keyword to specify the alias within your include statement."
          );
        });

        it('throws an error if alias is not associated', async () => {
          await expect(Worker.findAll({ include: [{ model: Task, as: 'Work' }] })).to.be.rejectedWith(
            'Task is associated to Worker using an alias. ' +
              "You've included an alias (Work), but it does not match the alias defined in your association."
          );
        });

        it('returns the associated task via worker.task', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [{ model: Task, as: 'ToDos' }]
          });

          expect(workers).to.exist;
          expect(workers[0].ToDos).to.exist;
          expect(workers[0].ToDos[0].title).to.equal('homework');
        });

        it('returns the associated task via worker.task when daoFactory is aliased with model', async () => {
          const workers = await Worker.findAll({
            where: { name: 'worker' },
            include: [{ model: Task, as: 'ToDos' }]
          });

          expect(workers[0].ToDos[0].title).to.equal('homework');
        });
      });

      describe('queryOptions', () => {
        beforeEach(async () => {
          await SharedUser.create({ username: 'barfooz' });
        });

        it('should return a DAO when queryOptions are not set', async () => {
          const users = await SharedUser.findAll({ where: { username: 'barfooz' } });

          users.forEach((user) => {
            expect(user).to.be.instanceOf(SharedUser);
          });
        });

        it('should return a DAO when raw is false', async () => {
          const users = await SharedUser.findAll({ where: { username: 'barfooz' }, raw: false });

          users.forEach((user) => {
            expect(user).to.be.instanceOf(SharedUser);
          });
        });

        it('should return raw data when raw is true', async () => {
          const users = await SharedUser.findAll({ where: { username: 'barfooz' }, raw: true });

          users.forEach((user) => {
            expect(user).to.not.be.instanceOf(SharedUser);
            expect(users[0]).to.be.instanceOf(Object);
          });
        });
      });

      describe('include all', () => {
        let Continent;
        let Country;
        let Industry;
        let Person;
        let europe;
        let england;
        let coal;
        let bob;

        beforeEach(async () => {
          Continent = current.define('continent', { name: Sequelize.STRING });
          Country = current.define('country', { name: Sequelize.STRING });
          Industry = current.define('industry', { name: Sequelize.STRING });
          Person = current.define('person', { name: Sequelize.STRING, lastName: Sequelize.STRING });

          Continent.hasMany(Country);
          Country.belongsTo(Continent);
          Country.belongsToMany(Industry, { through: 'country_industry' });
          Industry.belongsToMany(Country, { through: 'country_industry' });
          Country.hasMany(Person);
          Person.belongsTo(Country);
          Country.hasMany(Person, { as: 'residents', foreignKey: 'CountryResidentId' });
          Person.belongsTo(Country, { as: 'CountryResident', foreignKey: 'CountryResidentId' });

          await current.sync({ force: true });

          [europe, england, coal, bob] = await Promise.all([
            Continent.create({ name: 'Europe' }),
            Country.create({ name: 'England' }),
            Industry.create({ name: 'Coal' }),
            Person.create({ name: 'Bob', lastName: 'Becket' })
          ]);

          await Promise.all([
            england.setContinent(europe),
            england.addIndustry(coal),
            bob.setCountry(england),
            bob.setCountryResident(england)
          ]);
        });

        it('includes all associations', async () => {
          const countries = await Country.findAll({ include: [{ all: true }] });

          expect(countries).to.exist;
          expect(countries[0]).to.exist;
          expect(countries[0].continent).to.exist;
          expect(countries[0].industries).to.exist;
          expect(countries[0].people).to.exist;
          expect(countries[0].residents).to.exist;
        });

        it('includes specific type of association', async () => {
          const countries = await Country.findAll({ include: [{ all: 'BelongsTo' }] });

          expect(countries).to.exist;
          expect(countries[0]).to.exist;
          expect(countries[0].continent).to.exist;
          expect(countries[0].industries).not.to.exist;
          expect(countries[0].people).not.to.exist;
          expect(countries[0].residents).not.to.exist;
        });

        it('utilises specified attributes', async () => {
          const countries = await Country.findAll({ include: [{ all: 'HasMany', attributes: ['name'] }] });

          expect(countries).to.exist;
          expect(countries[0]).to.exist;
          expect(countries[0].people).to.exist;
          expect(countries[0].people[0]).to.exist;
          expect(countries[0].people[0].name).not.to.be.undefined;
          expect(countries[0].people[0].lastName).to.be.undefined;
          expect(countries[0].residents).to.exist;
          expect(countries[0].residents[0]).to.exist;
          expect(countries[0].residents[0].name).not.to.be.undefined;
          expect(countries[0].residents[0].lastName).to.be.undefined;
        });

        it('is over-ruled by specified include', async () => {
          const countries = await Country.findAll({
            include: [{ all: true }, { model: Continent, attributes: ['id'] }]
          });

          expect(countries).to.exist;
          expect(countries[0]).to.exist;
          expect(countries[0].continent).to.exist;
          expect(countries[0].continent.name).to.be.undefined;
        });

        it('includes all nested associations', async () => {
          const continents = await Continent.findAll({ include: [{ all: true, nested: true }] });

          expect(continents).to.exist;
          expect(continents[0]).to.exist;
          expect(continents[0].countries).to.exist;
          expect(continents[0].countries[0]).to.exist;
          expect(continents[0].countries[0].industries).to.exist;
          expect(continents[0].countries[0].people).to.exist;
          expect(continents[0].countries[0].residents).to.exist;
          expect(continents[0].countries[0].continent).not.to.exist;
        });
      });

      describe('properly handles attributes:[] cases', () => {
        let Animal;
        let Kingdom;
        let AnimalKingdom;

        beforeEach(async () => {
          Animal = current.define('Animal', {
            name: Sequelize.STRING,
            age: Sequelize.INTEGER
          });
          Kingdom = current.define('Kingdom', {
            name: Sequelize.STRING
          });
          AnimalKingdom = current.define('AnimalKingdom', {
            relation: Sequelize.STRING,
            mutation: Sequelize.BOOLEAN
          });

          Kingdom.belongsToMany(Animal, { through: AnimalKingdom });

          await current.sync({ force: true });

          const [a1, a2, a3, a4] = await Promise.all([
            Animal.create({ name: 'Dog', age: 20 }),
            Animal.create({ name: 'Cat', age: 30 }),
            Animal.create({ name: 'Peacock', age: 25 }),
            Animal.create({ name: 'Fish', age: 100 })
          ]);

          const [k1, k2, k3] = await Promise.all([
            Kingdom.create({ name: 'Earth' }),
            Kingdom.create({ name: 'Water' }),
            Kingdom.create({ name: 'Wind' })
          ]);

          await Promise.all([k1.addAnimals([a1, a2]), k2.addAnimals([a4]), k3.addAnimals([a3])]);
        });

        it('N:M with ignoring include.attributes only', async () => {
          const kingdoms = await Kingdom.findAll({
            include: [
              {
                model: Animal,
                where: { age: { $gte: 29 } },
                attributes: []
              }
            ]
          });

          expect(kingdoms.length).to.be.eql(2);
          kingdoms.forEach((kingdom) => {
            // include.attributes:[] , model doesn't exists
            expect(kingdom.Animals).to.not.exist;
          });
        });

        it('N:M with ignoring through.attributes only', async () => {
          const kingdoms = await Kingdom.findAll({
            include: [
              {
                model: Animal,
                where: { age: { $gte: 29 } },
                through: {
                  attributes: []
                }
              }
            ]
          });

          expect(kingdoms.length).to.be.eql(2);
          kingdoms.forEach((kingdom) => {
            expect(kingdom.Animals).to.exist; // include model exists
            expect(kingdom.Animals[0].AnimalKingdom).to.not.exist; // through doesn't exists
          });
        });

        it('N:M with ignoring include.attributes but having through.attributes', async () => {
          const kingdoms = await Kingdom.findAll({
            include: [
              {
                model: Animal,
                where: { age: { $gte: 29 } },
                attributes: [],
                through: {
                  attributes: ['mutation']
                }
              }
            ]
          });

          expect(kingdoms.length).to.be.eql(2);
          kingdoms.forEach((kingdom) => {
            // include.attributes: [], model doesn't exists
            expect(kingdom.Animals).to.not.exist;
          });
        });
      });
    });

    describe('order by eager loaded tables', () => {
      (describe('HasMany', () => {
        let Continent;
        let Country;
        let Person;
        let europe;
        let asia;
        let england;
        let france;
        let korea;
        let bob;
        let fred;
        let pierre;
        let kim;

        beforeEach(async () => {
          Continent = current.define('continent', { name: Sequelize.STRING });
          Country = current.define('country', { name: Sequelize.STRING });
          Person = current.define('person', { name: Sequelize.STRING, lastName: Sequelize.STRING });

          Continent.hasMany(Country);
          Country.belongsTo(Continent);
          Country.hasMany(Person);
          Person.belongsTo(Country);
          Country.hasMany(Person, { as: 'residents', foreignKey: 'CountryResidentId' });
          Person.belongsTo(Country, { as: 'CountryResident', foreignKey: 'CountryResidentId' });

          await current.sync({ force: true });

          [europe, asia, england, france, korea, bob, fred, pierre, kim] = await Promise.all([
            Continent.create({ name: 'Europe' }),
            Continent.create({ name: 'Asia' }),
            Country.create({ name: 'England' }),
            Country.create({ name: 'France' }),
            Country.create({ name: 'Korea' }),
            Person.create({ name: 'Bob', lastName: 'Becket' }),
            Person.create({ name: 'Fred', lastName: 'Able' }),
            Person.create({ name: 'Pierre', lastName: 'Paris' }),
            Person.create({ name: 'Kim', lastName: 'Z' })
          ]);

          await Promise.all([
            england.setContinent(europe),
            france.setContinent(europe),
            korea.setContinent(asia),

            bob.setCountry(england),
            fred.setCountry(england),
            pierre.setCountry(france),
            kim.setCountry(korea),

            bob.setCountryResident(england),
            fred.setCountryResident(france),
            pierre.setCountryResident(korea),
            kim.setCountryResident(england)
          ]);
        });

        it('sorts simply', async () => {
          await Promise.all(
            [
              ['ASC', 'Asia'],
              ['DESC', 'Europe']
            ].map(async (params) => {
              const continents = await Continent.findAll({
                order: [['name', params[0]]]
              });

              expect(continents).to.exist;
              expect(continents[0]).to.exist;
              expect(continents[0].name).to.equal(params[1]);
            })
          );
        });

        it('sorts by 1st degree association', async () => {
          await Promise.all(
            [
              ['ASC', 'Europe', 'England'],
              ['DESC', 'Asia', 'Korea']
            ].map(async (params) => {
              const continents = await Continent.findAll({
                include: [Country],
                order: [[Country, 'name', params[0]]]
              });

              expect(continents).to.exist;
              expect(continents[0]).to.exist;
              expect(continents[0].name).to.equal(params[1]);
              expect(continents[0].countries).to.exist;
              expect(continents[0].countries[0]).to.exist;
              expect(continents[0].countries[0].name).to.equal(params[2]);
            })
          );
        });

        it('sorts simply and by 1st degree association with limit where 1st degree associated instances returned for second one and not the first', async () => {
          await Promise.all(
            [['ASC', 'Asia', 'Europe', 'England']].map(async (params) => {
              const continents = await Continent.findAll({
                include: [
                  {
                    model: Country,
                    required: false,
                    where: {
                      name: params[3]
                    }
                  }
                ],
                limit: 2,
                order: [
                  ['name', params[0]],
                  [Country, 'name', params[0]]
                ]
              });

              expect(continents).to.exist;
              expect(continents[0]).to.exist;
              expect(continents[0].name).to.equal(params[1]);
              expect(continents[0].countries).to.exist;
              expect(continents[0].countries.length).to.equal(0);
              expect(continents[1]).to.exist;
              expect(continents[1].name).to.equal(params[2]);
              expect(continents[1].countries).to.exist;
              expect(continents[1].countries.length).to.equal(1);
              expect(continents[1].countries[0]).to.exist;
              expect(continents[1].countries[0].name).to.equal(params[3]);
            })
          );
        });

        (it('sorts by 2nd degree association', async () => {
          await Promise.all(
            [
              ['ASC', 'Europe', 'England', 'Fred'],
              ['DESC', 'Asia', 'Korea', 'Kim']
            ].map(async (params) => {
              const continents = await Continent.findAll({
                include: [{ model: Country, include: [Person] }],
                order: [[Country, Person, 'lastName', params[0]]]
              });

              expect(continents).to.exist;
              expect(continents[0]).to.exist;
              expect(continents[0].name).to.equal(params[1]);
              expect(continents[0].countries).to.exist;
              expect(continents[0].countries[0]).to.exist;
              expect(continents[0].countries[0].name).to.equal(params[2]);
              expect(continents[0].countries[0].people).to.exist;
              expect(continents[0].countries[0].people[0]).to.exist;
              expect(continents[0].countries[0].people[0].name).to.equal(params[3]);
            })
          );
        }),
          it('sorts by 2nd degree association with alias', async () => {
            await Promise.all(
              [
                ['ASC', 'Europe', 'France', 'Fred'],
                ['DESC', 'Europe', 'England', 'Kim']
              ].map(async (params) => {
                const continents = await Continent.findAll({
                  include: [{ model: Country, include: [Person, { model: Person, as: 'residents' }] }],
                  order: [[Country, { model: Person, as: 'residents' }, 'lastName', params[0]]]
                });

                expect(continents).to.exist;
                expect(continents[0]).to.exist;
                expect(continents[0].name).to.equal(params[1]);
                expect(continents[0].countries).to.exist;
                expect(continents[0].countries[0]).to.exist;
                expect(continents[0].countries[0].name).to.equal(params[2]);
                expect(continents[0].countries[0].residents).to.exist;
                expect(continents[0].countries[0].residents[0]).to.exist;
                expect(continents[0].countries[0].residents[0].name).to.equal(params[3]);
              })
            );
          }));

        it('sorts by 2nd degree association with alias while using limit', async () => {
          await Promise.all(
            [
              ['ASC', 'Europe', 'France', 'Fred'],
              ['DESC', 'Europe', 'England', 'Kim']
            ].map(async (params) => {
              const continents = await Continent.findAll({
                include: [{ model: Country, include: [Person, { model: Person, as: 'residents' }] }],
                order: [[{ model: Country }, { model: Person, as: 'residents' }, 'lastName', params[0]]],
                limit: 3
              });

              expect(continents).to.exist;
              expect(continents[0]).to.exist;
              expect(continents[0].name).to.equal(params[1]);
              expect(continents[0].countries).to.exist;
              expect(continents[0].countries[0]).to.exist;
              expect(continents[0].countries[0].name).to.equal(params[2]);
              expect(continents[0].countries[0].residents).to.exist;
              expect(continents[0].countries[0].residents[0]).to.exist;
              expect(continents[0].countries[0].residents[0].name).to.equal(params[3]);
            })
          );
        });
      }),
        describe('ManyToMany', () => {
          let Country;
          let Industry;
          let IndustryCountry;
          let england;
          let france;
          let korea;
          let energy;
          let media;
          let tech;

          beforeEach(async () => {
            Country = current.define('country', { name: Sequelize.STRING });
            Industry = current.define('industry', { name: Sequelize.STRING });
            IndustryCountry = current.define('IndustryCountry', { numYears: Sequelize.INTEGER });

            Country.belongsToMany(Industry, { through: IndustryCountry });
            Industry.belongsToMany(Country, { through: IndustryCountry });

            await current.sync({ force: true });

            [england, france, korea, energy, media, tech] = await Promise.all([
              Country.create({ name: 'England' }),
              Country.create({ name: 'France' }),
              Country.create({ name: 'Korea' }),
              Industry.create({ name: 'Energy' }),
              Industry.create({ name: 'Media' }),
              Industry.create({ name: 'Tech' })
            ]);

            await Promise.all([
              england.addIndustry(energy, { through: { numYears: 20 } }),
              england.addIndustry(media, { through: { numYears: 40 } }),
              france.addIndustry(media, { through: { numYears: 80 } }),
              korea.addIndustry(tech, { through: { numYears: 30 } })
            ]);
          });

          it('sorts by 1st degree association', async () => {
            await Promise.all(
              [
                ['ASC', 'England', 'Energy'],
                ['DESC', 'Korea', 'Tech']
              ].map(async (params) => {
                const countries = await Country.findAll({
                  include: [Industry],
                  order: [[Industry, 'name', params[0]]]
                });

                expect(countries).to.exist;
                expect(countries[0]).to.exist;
                expect(countries[0].name).to.equal(params[1]);
                expect(countries[0].industries).to.exist;
                expect(countries[0].industries[0]).to.exist;
                expect(countries[0].industries[0].name).to.equal(params[2]);
              })
            );
          });

          it('sorts by 1st degree association while using limit', async () => {
            await Promise.all(
              [
                ['ASC', 'England', 'Energy'],
                ['DESC', 'Korea', 'Tech']
              ].map(async (params) => {
                const countries = await Country.findAll({
                  include: [Industry],
                  order: [[Industry, 'name', params[0]]],
                  limit: 3
                });

                expect(countries).to.exist;
                expect(countries[0]).to.exist;
                expect(countries[0].name).to.equal(params[1]);
                expect(countries[0].industries).to.exist;
                expect(countries[0].industries[0]).to.exist;
                expect(countries[0].industries[0].name).to.equal(params[2]);
              })
            );
          });

          it('sorts by through table attribute', async () => {
            await Promise.all(
              [
                ['ASC', 'England', 'Energy'],
                ['DESC', 'France', 'Media']
              ].map(async (params) => {
                const countries = await Country.findAll({
                  include: [Industry],
                  order: [[Industry, IndustryCountry, 'numYears', params[0]]]
                });

                expect(countries).to.exist;
                expect(countries[0]).to.exist;
                expect(countries[0].name).to.equal(params[1]);
                expect(countries[0].industries).to.exist;
                expect(countries[0].industries[0]).to.exist;
                expect(countries[0].industries[0].name).to.equal(params[2]);
              })
            );
          });
        }));
    });

    describe('normal findAll', () => {
      let seededUsers;

      beforeEach(async () => {
        const user = await SharedUser.create({ username: 'user', data: 'foobar', theDate: moment().toDate() });
        const user2 = await SharedUser.create({ username: 'user2', data: 'bar', theDate: moment().toDate() });

        seededUsers = [user].concat(user2);
      });

      it('finds all entries', async () => {
        const users = await SharedUser.findAll();

        expect(users.length).to.equal(2);
      });

      it('can also handle object notation', async () => {
        const users = await SharedUser.findAll({ where: { id: seededUsers[1].id } });

        expect(users.length).to.equal(1);
        expect(users[0].id).to.equal(seededUsers[1].id);
      });

      it('sorts the results via id in ascending order', async () => {
        const users = await SharedUser.findAll();

        expect(users.length).to.equal(2);
        expect(users[0].id).to.be.below(users[1].id);
      });

      it('sorts the results via id in descending order', async () => {
        const users = await SharedUser.findAll({ order: [['id', 'DESC']] });

        expect(users[0].id).to.be.above(users[1].id);
      });

      it('sorts the results via a date column', async () => {
        await SharedUser.create({ username: 'user3', data: 'bar', theDate: moment().add(2, 'hours').toDate() });

        const users = await SharedUser.findAll({ order: [['theDate', 'DESC']] });

        expect(users[0].id).to.be.above(users[2].id);
      });

      it('handles offset and limit', async () => {
        await SharedUser.bulkCreate([{ username: 'bobby' }, { username: 'tables' }]);

        const users = await SharedUser.findAll({ limit: 2, offset: 2 });

        expect(users.length).to.equal(2);
        expect(users[0].id).to.equal(3);
      });

      it('should allow us to find IDs using capital letters', async () => {
        const User = current.define('User' + config.rand(), {
          ID: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          Login: { type: Sequelize.STRING }
        });

        await User.sync({ force: true });
        await User.create({ Login: 'foo' });

        const user = await User.findAll({ where: { ID: 1 } });

        expect(user).to.be.instanceof(Array);
        expect(user).to.have.length(1);
      });

      it('should be possible to order by sequelize.col()', async () => {
        const Company = current.define('Company', {
          name: Sequelize.STRING
        });

        await Company.sync();

        await Company.findAll({
          order: [current.col('name')]
        });
      });

      it('should pull in dependent fields for a VIRTUAL', async () => {
        const User = current.define(
          'User',
          {
            active: {
              type: new Sequelize.VIRTUAL(Sequelize.BOOLEAN, ['createdAt']),
              get() {
                return this.get('createdAt') > Date.now() - 7 * 24 * 60 * 60 * 1000;
              }
            }
          },
          {
            timestamps: true
          }
        );

        await User.create();

        const users = await User.findAll({
          attributes: ['active']
        });

        users.forEach((user) => {
          expect(user.get('createdAt')).to.be.ok;
          expect(user.get('active')).to.equal(true);
        });
      });
    });
  });

  describe('findAndCountAll', () => {
    let seededUsers;

    beforeEach(async () => {
      await SharedUser.bulkCreate([
        { username: 'user', data: 'foobar' },
        { username: 'user2', data: 'bar' },
        { username: 'bobby', data: 'foo' }
      ]);

      seededUsers = await SharedUser.findAll();
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const info1 = await User.findAndCountAll();
        const info2 = await User.findAndCountAll({ transaction: t });

        expect(info1.count).to.equal(0);
        expect(info2.count).to.equal(1);

        await t.rollback();
      });
    }

    it('handles where clause {only}', async () => {
      const info = await SharedUser.findAndCountAll({ where: { id: { $ne: seededUsers[0].id } } });

      expect(info.count).to.equal(2);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(2);
    });

    it('handles where clause with ordering {only}', async () => {
      const info = await SharedUser.findAndCountAll({
        where: { id: { $ne: seededUsers[0].id } },
        order: [['id', 'ASC']]
      });

      expect(info.count).to.equal(2);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(2);
    });

    it('handles offset', async () => {
      const info = await SharedUser.findAndCountAll({ offset: 1 });

      expect(info.count).to.equal(3);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(2);
    });

    it('handles limit', async () => {
      const info = await SharedUser.findAndCountAll({ limit: 1 });

      expect(info.count).to.equal(3);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(1);
    });

    it('handles offset and limit', async () => {
      const info = await SharedUser.findAndCountAll({ offset: 1, limit: 1 });

      expect(info.count).to.equal(3);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(1);
    });

    it('handles offset with includes', async () => {
      const Election = current.define('Election', {
        name: Sequelize.STRING
      });
      const Citizen = current.define('Citizen', {
        name: Sequelize.STRING
      });

      // Associations
      Election.belongsTo(Citizen);
      Election.belongsToMany(Citizen, { as: 'Voters', through: 'ElectionsVotes' });
      Citizen.hasMany(Election);
      Citizen.belongsToMany(Election, { as: 'Votes', through: 'ElectionsVotes' });

      await current.sync();

      // Add some data
      const alice = await Citizen.create({ name: 'Alice' });
      const bob = await Citizen.create({ name: 'Bob' });

      await Election.create({ name: 'Some election' });

      const election = await Election.create({ name: 'Some other election' });

      await election.setCitizen(alice);
      await election.setVoters([alice, bob]);

      const criteria = {
        offset: 5,
        limit: 1,
        where: {
          name: 'Some election'
        },
        include: [
          Citizen, // Election creator
          { model: Citizen, as: 'Voters' } // Election voters
        ]
      };

      const elections = await Election.findAndCountAll(criteria);

      expect(elections.count).to.equal(1);
      expect(elections.rows.length).to.equal(0);
    });

    it('handles attributes', async () => {
      const info = await SharedUser.findAndCountAll({
        where: { id: { $ne: seededUsers[0].id } },
        attributes: ['data']
      });

      expect(info.count).to.equal(2);
      expect(Array.isArray(info.rows)).to.be.ok;
      expect(info.rows.length).to.equal(2);
      expect(info.rows[0].dataValues).to.not.have.property('username');
      expect(info.rows[1].dataValues).to.not.have.property('username');
    });
  });

  describe('all', () => {
    beforeEach(() => {
      return SharedUser.bulkCreate([
        { username: 'user', data: 'foobar' },
        { username: 'user2', data: 'bar' }
      ]);
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.create({ username: 'foo' }, { transaction: t });

        const users1 = await User.findAll();
        const users2 = await User.findAll({ transaction: t });

        expect(users1.length).to.equal(0);
        expect(users2.length).to.equal(1);

        await t.rollback();
      });
    }

    it('should return all users', async () => {
      const users = await SharedUser.findAll();

      expect(users.length).to.equal(2);
    });
  });

  it('should support logging', async () => {
    const spy = sinon.spy();

    await SharedUser.findAll({
      where: {},
      logging: spy
    });

    expect(spy.called).to.be.ok;
  });

  describe('rejectOnEmpty mode', () => {
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
        Model.findAll({
          where: {
            username: 'some-username-that-is-not-used-anywhere'
          }
        })
      ).to.eventually.be.rejectedWith(Sequelize.EmptyResultError);
    });

    it('throws custom error with initialized', async () => {
      const Model = current.define(
        'Test',
        {
          username: Sequelize.STRING(100)
        },
        {
          rejectOnEmpty: new Sequelize.ConnectionError('Some Error') //using custom error instance
        }
      );

      await Model.sync({ force: true });

      await expect(
        Model.findAll({
          where: {
            username: 'some-username-that-is-not-used-anywhere-for-sure-this-time'
          }
        })
      ).to.eventually.be.rejectedWith(Sequelize.ConnectionError);
    });

    it('throws custom error with instance', async () => {
      const Model = current.define(
        'Test',
        {
          username: Sequelize.STRING(100)
        },
        {
          rejectOnEmpty: Sequelize.ConnectionError //using custom error instance
        }
      );

      await Model.sync({ force: true });

      await expect(
        Model.findAll({
          where: {
            username: 'some-username-that-is-not-used-anywhere-for-sure-this-time'
          }
        })
      ).to.eventually.be.rejectedWith(Sequelize.ConnectionError);
    });
  });
});
