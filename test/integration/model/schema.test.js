import * as chai from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const expect = chai.expect;

const current = Support.sequelize;
const SCHEMA_ONE = 'schema_one';
const SCHEMA_TWO = 'schema_two';

let locationId;

describe(Support.getTestDialectTeaser('Model'), () => {
  if (current.dialect.supports.schemas) {
    describe('global schema', () => {
      before(function () {
        current.options.schema = null;
        this.RestaurantOne = current.define('restaurant', {
          foo: DataTypes.STRING,
          bar: DataTypes.STRING
        });
        this.LocationOne = current.define('location', {
          name: DataTypes.STRING
        });
        this.RestaurantOne.belongsTo(this.LocationOne, {
          foreignKey: 'location_id',
          constraints: false
        });
        current.options.schema = SCHEMA_TWO;
        this.RestaurantTwo = current.define('restaurant', {
          foo: DataTypes.STRING,
          bar: DataTypes.STRING
        });
        this.LocationTwo = current.define('location', {
          name: DataTypes.STRING
        });
        this.RestaurantTwo.belongsTo(this.LocationTwo, {
          foreignKey: 'location_id',
          constraints: false
        });
        current.options.schema = null;
      });

      beforeEach('build restaurant tables', async function () {
        await current.createSchema(SCHEMA_TWO);
        await Promise.all([this.RestaurantOne.sync({ force: true }), this.RestaurantTwo.sync({ force: true })]);
      });

      afterEach('drop schemas', () => {
        return current.dropSchema(SCHEMA_TWO);
      });

      describe('Add data via model.create, retrieve via model.findOne', () => {
        it('should be able to sync model without schema option', function () {
          expect(this.RestaurantOne._schema).to.be.null;
          expect(this.RestaurantTwo._schema).to.equal(SCHEMA_TWO);
        });

        it('should be able to insert data into default table using create', async function () {
          await this.RestaurantOne.create({
            foo: 'one'
          });

          const inDefault = await this.RestaurantOne.findOne({
            where: { foo: 'one' }
          });
          expect(inDefault).to.not.be.null;
          expect(inDefault.foo).to.equal('one');

          const inSchema = await this.RestaurantTwo.findOne({
            where: { foo: 'one' }
          });
          expect(inSchema).to.be.null;
        });

        it('should be able to insert data into schema table using create', async function () {
          await this.RestaurantTwo.create({
            foo: 'two'
          });

          const inSchema = await this.RestaurantTwo.findOne({
            where: { foo: 'two' }
          });
          expect(inSchema).to.not.be.null;
          expect(inSchema.foo).to.equal('two');

          const inDefault = await this.RestaurantOne.findOne({
            where: { foo: 'two' }
          });
          expect(inDefault).to.be.null;
        });
      });

      describe('Get associated data in public schema via include', () => {
        beforeEach(async function () {
          await Promise.all([this.LocationOne.sync({ force: true }), this.LocationTwo.sync({ force: true })]);
          await this.LocationTwo.create({ name: 'HQ' });

          const inSchema = await this.LocationTwo.findOne({ where: { name: 'HQ' } });
          expect(inSchema).to.not.be.null;
          expect(inSchema.name).to.equal('HQ');
          locationId = inSchema.id;

          const inDefault = await this.LocationOne.findOne({ where: { name: 'HQ' } });
          expect(inDefault).to.be.null;
        });

        it('should be able to insert and retrieve associated data into the table in schema_two', async function () {
          await this.RestaurantTwo.create({
            foo: 'two',
            location_id: locationId
          });

          const inSchema = await this.RestaurantTwo.findOne({
            where: { foo: 'two' },
            include: [
              {
                model: this.LocationTwo,
                as: 'location'
              }
            ]
          });

          expect(inSchema).to.not.be.null;
          expect(inSchema.foo).to.equal('two');
          expect(inSchema.location).to.not.be.null;
          expect(inSchema.location.name).to.equal('HQ');

          const inDefault = await this.RestaurantOne.findOne({ where: { foo: 'two' } });
          expect(inDefault).to.be.null;
        });
      });
    });

    describe('schemas', () => {
      before(function () {
        this.Restaurant = current.define(
          'restaurant',
          {
            foo: DataTypes.STRING,
            bar: DataTypes.STRING
          },
          { tableName: 'restaurants' }
        );
        this.Location = current.define(
          'location',
          {
            name: DataTypes.STRING
          },
          { tableName: 'locations' }
        );
        this.Employee = current.define(
          'employee',
          {
            first_name: DataTypes.STRING,
            last_name: DataTypes.STRING
          },
          { tableName: 'employees' }
        );
        this.EmployeeOne = this.Employee.schema(SCHEMA_ONE);
        this.Restaurant.belongsTo(this.Location, {
          foreignKey: 'location_id',
          constraints: false
        });
        this.Employee.belongsTo(this.Restaurant, {
          foreignKey: 'restaurant_id',
          constraints: false
        });
        this.Restaurant.hasMany(this.Employee, {
          foreignKey: 'restaurant_id',
          constraints: false
        });
        this.RestaurantOne = this.Restaurant.schema(SCHEMA_ONE);
        this.RestaurantTwo = this.Restaurant.schema(SCHEMA_TWO);
      });

      beforeEach('build restaurant tables', async function () {
        await Promise.all([current.createSchema('schema_one'), current.createSchema('schema_two')]);
        await Promise.all([this.RestaurantOne.sync({ force: true }), this.RestaurantTwo.sync({ force: true })]);
      });

      afterEach('drop schemas', () => {
        return Promise.all([current.dropSchema('schema_one'), current.dropSchema('schema_two')]);
      });

      describe('Add data via model.create, retrieve via model.findOne', () => {
        it('should be able to insert data into the table in schema_one using create', async function () {
          await this.RestaurantOne.create({
            foo: 'one',
            location_id: locationId
          });

          const found = await this.RestaurantOne.findOne({
            where: { foo: 'one' }
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('one');

          const byId = await this.RestaurantOne.findById(found.id);
          expect(byId).to.not.be.null;
          expect(byId.foo).to.equal('one');

          const inOtherSchema = await this.RestaurantTwo.findOne({ where: { foo: 'one' } });
          expect(inOtherSchema).to.be.null;
        });

        it('should be able to insert data into the table in schema_two using create', async function () {
          await this.RestaurantTwo.create({
            foo: 'two',
            location_id: locationId
          });

          const found = await this.RestaurantTwo.findOne({
            where: { foo: 'two' }
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('two');

          const byId = await this.RestaurantTwo.findById(found.id);
          expect(byId).to.not.be.null;
          expect(byId.foo).to.equal('two');

          const inOtherSchema = await this.RestaurantOne.findOne({ where: { foo: 'two' } });
          expect(inOtherSchema).to.be.null;
        });
      });

      describe('Persist and retrieve data', () => {
        it('should be able to insert data into both schemas using instance.save and retrieve/count it', async function () {
          // building and saving in random order to make sure calling
          // .schema doesn't impact model prototype
          await this.RestaurantOne.build({ bar: 'one.1' }).save();
          await this.RestaurantTwo.build({ bar: 'two.1' }).save();
          await this.RestaurantOne.build({ bar: 'one.2' }).save();
          await this.RestaurantTwo.build({ bar: 'two.2' }).save();
          await this.RestaurantTwo.build({ bar: 'two.3' }).save();

          const allOne = await this.RestaurantOne.findAll();
          expect(allOne).to.not.be.null;
          expect(allOne.length).to.equal(2);
          allOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const countedOne = await this.RestaurantOne.findAndCountAll();
          expect(countedOne).to.not.be.null;
          expect(countedOne.rows.length).to.equal(2);
          expect(countedOne.count).to.equal(2);
          countedOne.rows.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const filteredOne = await this.RestaurantOne.findAll({
            where: { bar: { $like: '%.1' } }
          });
          expect(filteredOne).to.not.be.null;
          expect(filteredOne.length).to.equal(1);
          filteredOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const oneCount = await this.RestaurantOne.count();
          expect(oneCount).to.not.be.null;
          expect(oneCount).to.equal(2);

          const allTwo = await this.RestaurantTwo.findAll();
          expect(allTwo).to.not.be.null;
          expect(allTwo.length).to.equal(3);
          allTwo.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });

          const countedTwo = await this.RestaurantTwo.findAndCountAll();
          expect(countedTwo).to.not.be.null;
          expect(countedTwo.rows.length).to.equal(3);
          expect(countedTwo.count).to.equal(3);
          countedTwo.rows.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });

          const filteredTwo = await this.RestaurantTwo.findAll({
            where: { bar: { $like: '%.3' } }
          });
          expect(filteredTwo).to.not.be.null;
          expect(filteredTwo.length).to.equal(1);
          filteredTwo.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });

          const twoCount = await this.RestaurantTwo.count();
          expect(twoCount).to.not.be.null;
          expect(twoCount).to.equal(3);
        });
      });

      describe('Get associated data in public schema via include', () => {
        beforeEach(async function () {
          const Location = this.Location;

          await Location.sync({ force: true });
          await Location.create({ name: 'HQ' });

          const obj = await Location.findOne({ where: { name: 'HQ' } });
          expect(obj).to.not.be.null;
          expect(obj.name).to.equal('HQ');
          locationId = obj.id;
        });

        it('should be able to insert and retrieve associated data into the table in schema_one', async function () {
          await this.RestaurantOne.create({
            foo: 'one',
            location_id: locationId
          });

          const obj = await this.RestaurantOne.findOne({
            where: { foo: 'one' },
            include: [
              {
                model: this.Location,
                as: 'location'
              }
            ]
          });

          expect(obj).to.not.be.null;
          expect(obj.foo).to.equal('one');
          expect(obj.location).to.not.be.null;
          expect(obj.location.name).to.equal('HQ');
        });
      });

      describe('Get schema specific associated data via include', () => {
        beforeEach(function () {
          const Employee = this.Employee;
          return Promise.all([
            Employee.schema(SCHEMA_ONE).sync({ force: true }),
            Employee.schema(SCHEMA_TWO).sync({ force: true })
          ]);
        });

        it('should be able to insert and retrieve associated data into the table in schema_one', async function () {
          await this.RestaurantOne.create({
            foo: 'one'
          });

          const found = await this.RestaurantOne.findOne({
            where: { foo: 'one' }
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('one');

          await this.EmployeeOne.create({
            first_name: 'Restaurant',
            last_name: 'one',
            restaurant_id: found.id
          });

          const withEmployees = await this.RestaurantOne.findOne({
            where: { foo: 'one' },
            include: [
              {
                model: this.EmployeeOne,
                as: 'employees'
              }
            ]
          });

          expect(withEmployees).to.not.be.null;
          expect(withEmployees.employees).to.not.be.null;
          expect(withEmployees.employees.length).to.equal(1);
          expect(withEmployees.employees[0].last_name).to.equal('one');

          const employees = await withEmployees.getEmployees({ schema: SCHEMA_ONE });
          expect(employees.length).to.equal(1);
          expect(employees[0].last_name).to.equal('one');

          const withRestaurant = await this.EmployeeOne.findOne({
            where: { last_name: 'one' },
            include: [
              {
                model: this.RestaurantOne,
                as: 'restaurant'
              }
            ]
          });

          expect(withRestaurant).to.not.be.null;
          expect(withRestaurant.restaurant).to.not.be.null;
          expect(withRestaurant.restaurant.foo).to.equal('one');

          const restaurant = await withRestaurant.getRestaurant({ schema: SCHEMA_ONE });
          expect(restaurant).to.not.be.null;
          expect(restaurant.foo).to.equal('one');
        });

        it('should be able to insert and retrieve associated data into the table in schema_two', async function () {
          await this.RestaurantTwo.create({
            foo: 'two'
          });

          const found = await this.RestaurantTwo.findOne({
            where: { foo: 'two' }
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('two');

          await this.Employee.schema(SCHEMA_TWO).create({
            first_name: 'Restaurant',
            last_name: 'two',
            restaurant_id: found.id
          });

          const withEmployees = await this.RestaurantTwo.findOne({
            where: { foo: 'two' },
            include: [
              {
                model: this.Employee.schema(SCHEMA_TWO),
                as: 'employees'
              }
            ]
          });

          expect(withEmployees).to.not.be.null;
          expect(withEmployees.employees).to.not.be.null;
          expect(withEmployees.employees.length).to.equal(1);
          expect(withEmployees.employees[0].last_name).to.equal('two');

          const employees = await withEmployees.getEmployees({ schema: SCHEMA_TWO });
          expect(employees.length).to.equal(1);
          expect(employees[0].last_name).to.equal('two');

          const withRestaurant = await this.Employee.schema(SCHEMA_TWO).findOne({
            where: { last_name: 'two' },
            include: [
              {
                model: this.RestaurantTwo,
                as: 'restaurant'
              }
            ]
          });

          expect(withRestaurant).to.not.be.null;
          expect(withRestaurant.restaurant).to.not.be.null;
          expect(withRestaurant.restaurant.foo).to.equal('two');

          const restaurant = await withRestaurant.getRestaurant({ schema: SCHEMA_TWO });
          expect(restaurant).to.not.be.null;
          expect(restaurant.foo).to.equal('two');
        });
      });

      describe('concurency tests', () => {
        it('should build and persist instances to 2 schemas concurrently in any order', async function () {
          const Restaurant = this.Restaurant;

          let restaurauntModelSchema1 = Restaurant.schema(SCHEMA_ONE).build({ bar: 'one.1' });
          const restaurauntModelSchema2 = Restaurant.schema(SCHEMA_TWO).build({ bar: 'two.1' });

          await restaurauntModelSchema1.save();

          restaurauntModelSchema1 = Restaurant.schema(SCHEMA_ONE).build({ bar: 'one.2' });
          await restaurauntModelSchema2.save();
          await restaurauntModelSchema1.save();

          const restaurantsOne = await Restaurant.schema(SCHEMA_ONE).findAll();
          expect(restaurantsOne).to.not.be.null;
          expect(restaurantsOne.length).to.equal(2);
          restaurantsOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const restaurantsTwo = await Restaurant.schema(SCHEMA_TWO).findAll();
          expect(restaurantsTwo).to.not.be.null;
          expect(restaurantsTwo.length).to.equal(1);
          restaurantsTwo.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });
        });
      });
    });
  }
});
