import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const SEARCH_PATH_ONE = 'schema_one,public';
const SEARCH_PATH_TWO = 'schema_two,public';

const current = Support.createSequelizeInstance({
  dialectOptions: {
    prependSearchPath: true
  }
});

let locationId;

describe(Support.getTestDialectTeaser('Model'), () => {
  if (current.dialect.supports.searchPath) {
    describe('SEARCH PATH', () => {
      let Restaurant, Location, Employee;

      beforeAll(() => {
        Restaurant = current.define(
          'restaurant',
          {
            foo: DataTypes.STRING,
            bar: DataTypes.STRING
          },
          { tableName: 'restaurants' }
        );
        Location = current.define(
          'location',
          {
            name: DataTypes.STRING,
            type: DataTypes.ENUM('a', 'b')
          },
          { tableName: 'locations' }
        );
        Employee = current.define(
          'employee',
          {
            first_name: DataTypes.STRING,
            last_name: DataTypes.STRING
          },
          { tableName: 'employees' }
        );
        Restaurant.belongsTo(Location, {
          foreignKey: 'location_id',
          constraints: false
        });
        Employee.belongsTo(Restaurant, {
          foreignKey: 'restaurant_id',
          constraints: false
        });
        Restaurant.hasMany(Employee, {
          foreignKey: 'restaurant_id',
          constraints: false
        });
      });

      beforeEach(async () => {
        await current.createSchema('schema_one');
        await current.createSchema('schema_two');
        await Restaurant.sync({ force: true, searchPath: SEARCH_PATH_ONE });
        await Restaurant.sync({ force: true, searchPath: SEARCH_PATH_TWO });
      });

      afterEach(async () => {
        await current.dropSchema('schema_one');
        await current.dropSchema('schema_two');
      });

      describe('enum case', () => {
        it('able to refresh enum when searchPath is used', () => {
          return Location.sync({ force: true });
        });
      });

      describe('Add data via model.create, retrieve via model.findOne', () => {
        it('should be able to insert data into the table in schema_one using create', async () => {
          await Restaurant.create(
            {
              foo: 'one',
              location_id: locationId
            },
            { searchPath: SEARCH_PATH_ONE }
          );

          const found = await Restaurant.findOne({
            where: { foo: 'one' },
            searchPath: SEARCH_PATH_ONE
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('one');

          const byId = await Restaurant.findByPk(found.id, { searchPath: SEARCH_PATH_ONE });
          expect(byId).to.not.be.null;
          expect(byId.foo).to.equal('one');
        });

        it('should be able to insert data into the table in schema_two using create', async () => {
          await Restaurant.create(
            {
              foo: 'two',
              location_id: locationId
            },
            { searchPath: SEARCH_PATH_TWO }
          );

          const found = await Restaurant.findOne({
            where: { foo: 'two' },
            searchPath: SEARCH_PATH_TWO
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('two');

          const byId = await Restaurant.findByPk(found.id, { searchPath: SEARCH_PATH_TWO });
          expect(byId).to.not.be.null;
          expect(byId.foo).to.equal('two');
        });

        it('should fail to find schema_one object in schema_two', async () => {
          const RestaurantObj = await Restaurant.findOne({ where: { foo: 'one' }, searchPath: SEARCH_PATH_TWO });
          expect(RestaurantObj).to.be.null;
        });

        it('should fail to find schema_two object in schema_one', async () => {
          const RestaurantObj = await Restaurant.findOne({ where: { foo: 'two' }, searchPath: SEARCH_PATH_ONE });
          expect(RestaurantObj).to.be.null;
        });
      });

      describe('Add data via instance.save, retrieve via model.findAll', () => {
        it('should be able to insert data into both schemas using instance.save and retrieve it via findAll', async () => {
          await Restaurant.build({ bar: 'one.1' }).save({ searchPath: SEARCH_PATH_ONE });
          await Restaurant.build({ bar: 'one.2' }).save({ searchPath: SEARCH_PATH_ONE });
          await Restaurant.build({ bar: 'two.1' }).save({ searchPath: SEARCH_PATH_TWO });
          await Restaurant.build({ bar: 'two.2' }).save({ searchPath: SEARCH_PATH_TWO });
          await Restaurant.build({ bar: 'two.3' }).save({ searchPath: SEARCH_PATH_TWO });

          const allOne = await Restaurant.findAll({ searchPath: SEARCH_PATH_ONE });
          expect(allOne).to.not.be.null;
          expect(allOne.length).to.equal(2);
          allOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const countedOne = await Restaurant.findAndCountAll({ searchPath: SEARCH_PATH_ONE });
          expect(countedOne).to.not.be.null;
          expect(countedOne.rows.length).to.equal(2);
          expect(countedOne.count).to.equal(2);
          countedOne.rows.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const allTwo = await Restaurant.findAll({ searchPath: SEARCH_PATH_TWO });
          expect(allTwo).to.not.be.null;
          expect(allTwo.length).to.equal(3);
          allTwo.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });

          const countedTwo = await Restaurant.findAndCountAll({ searchPath: SEARCH_PATH_TWO });
          expect(countedTwo).to.not.be.null;
          expect(countedTwo.rows.length).to.equal(3);
          expect(countedTwo.count).to.equal(3);
          countedTwo.rows.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });
        });
      });

      describe('Add data via instance.save, retrieve via model.count and model.find', () => {
        it('should be able to insert data into both schemas using instance.save count it and retrieve it via findAll with where', async () => {
          await Restaurant.build({ bar: 'one.1' }).save({ searchPath: SEARCH_PATH_ONE });
          await Restaurant.build({ bar: 'one.2' }).save({ searchPath: SEARCH_PATH_ONE });
          await Restaurant.build({ bar: 'two.1' }).save({ searchPath: SEARCH_PATH_TWO });
          await Restaurant.build({ bar: 'two.2' }).save({ searchPath: SEARCH_PATH_TWO });
          await Restaurant.build({ bar: 'two.3' }).save({ searchPath: SEARCH_PATH_TWO });

          const restaurantsOne = await Restaurant.findAll({
            where: { bar: { $like: 'one%' } },
            searchPath: SEARCH_PATH_ONE
          });
          expect(restaurantsOne).to.not.be.null;
          expect(restaurantsOne.length).to.equal(2);
          restaurantsOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const oneCount = await Restaurant.count({ searchPath: SEARCH_PATH_ONE });
          expect(oneCount).to.not.be.null;
          expect(oneCount).to.equal(2);

          const restaurantsTwo = await Restaurant.findAll({
            where: { bar: { $like: 'two%' } },
            searchPath: SEARCH_PATH_TWO
          });
          expect(restaurantsTwo).to.not.be.null;
          expect(restaurantsTwo.length).to.equal(3);
          restaurantsTwo.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('two');
          });

          const twoCount = await Restaurant.count({ searchPath: SEARCH_PATH_TWO });
          expect(twoCount).to.not.be.null;
          expect(twoCount).to.equal(3);
        });
      });

      describe('Get associated data in public schema via include', () => {
        beforeEach(async () => {
          await Location.sync({ force: true });
          await Location.create({ name: 'HQ' });

          const obj = await Location.findOne({ where: { name: 'HQ' } });
          expect(obj).to.not.be.null;
          expect(obj.name).to.equal('HQ');
          locationId = obj.id;
        });

        it('should be able to insert and retrieve associated data into the table in schema_one', async () => {
          await Restaurant.create(
            {
              foo: 'one',
              location_id: locationId
            },
            { searchPath: SEARCH_PATH_ONE }
          );

          const obj = await Restaurant.findOne({
            where: { foo: 'one' },
            include: [
              {
                model: Location,
                as: 'location'
              }
            ],
            searchPath: SEARCH_PATH_ONE
          });

          expect(obj).to.not.be.null;
          expect(obj.foo).to.equal('one');
          expect(obj.location).to.not.be.null;
          expect(obj.location.name).to.equal('HQ');
        });

        it('should be able to insert and retrieve associated data into the table in schema_two', async () => {
          await Restaurant.create(
            {
              foo: 'two',
              location_id: locationId
            },
            { searchPath: SEARCH_PATH_TWO }
          );

          const obj = await Restaurant.findOne({
            where: { foo: 'two' },
            include: [
              {
                model: Location,
                as: 'location'
              }
            ],
            searchPath: SEARCH_PATH_TWO
          });

          expect(obj).to.not.be.null;
          expect(obj.foo).to.equal('two');
          expect(obj.location).to.not.be.null;
          expect(obj.location.name).to.equal('HQ');
        });
      });

      describe('Get schema specific associated data via include', () => {
        beforeEach(async () => {
          await Employee.sync({ force: true, searchPath: SEARCH_PATH_ONE });
          await Employee.sync({ force: true, searchPath: SEARCH_PATH_TWO });
        });

        it('should be able to insert and retrieve associated data into the table in schema_one', async () => {
          await Restaurant.create(
            {
              foo: 'one'
            },
            { searchPath: SEARCH_PATH_ONE }
          );

          const found = await Restaurant.findOne({
            where: { foo: 'one' },
            searchPath: SEARCH_PATH_ONE
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('one');

          await Employee.create(
            {
              first_name: 'Restaurant',
              last_name: 'one',
              restaurant_id: found.id
            },
            { searchPath: SEARCH_PATH_ONE }
          );

          const withEmployees = await Restaurant.findOne({
            where: { foo: 'one' },
            searchPath: SEARCH_PATH_ONE,
            include: [
              {
                model: Employee,
                as: 'employees'
              }
            ]
          });

          expect(withEmployees).to.not.be.null;
          expect(withEmployees.employees).to.not.be.null;
          expect(withEmployees.employees.length).to.equal(1);
          expect(withEmployees.employees[0].last_name).to.equal('one');

          const employees = await withEmployees.getEmployees({ searchPath: SEARCH_PATH_ONE });
          expect(employees.length).to.equal(1);
          expect(employees[0].last_name).to.equal('one');

          const withRestaurant = await Employee.findOne({
            where: { last_name: 'one' },
            searchPath: SEARCH_PATH_ONE,
            include: [
              {
                model: Restaurant,
                as: 'restaurant'
              }
            ]
          });

          expect(withRestaurant).to.not.be.null;
          expect(withRestaurant.restaurant).to.not.be.null;
          expect(withRestaurant.restaurant.foo).to.equal('one');

          const restaurant = await withRestaurant.getRestaurant({ searchPath: SEARCH_PATH_ONE });
          expect(restaurant).to.not.be.null;
          expect(restaurant.foo).to.equal('one');
        });

        it('should be able to insert and retrieve associated data into the table in schema_two', async () => {
          await Restaurant.create(
            {
              foo: 'two'
            },
            { searchPath: SEARCH_PATH_TWO }
          );

          const found = await Restaurant.findOne({
            where: { foo: 'two' },
            searchPath: SEARCH_PATH_TWO
          });
          expect(found).to.not.be.null;
          expect(found.foo).to.equal('two');

          await Employee.create(
            {
              first_name: 'Restaurant',
              last_name: 'two',
              restaurant_id: found.id
            },
            { searchPath: SEARCH_PATH_TWO }
          );

          const withEmployees = await Restaurant.findOne({
            where: { foo: 'two' },
            searchPath: SEARCH_PATH_TWO,
            include: [
              {
                model: Employee,
                as: 'employees'
              }
            ]
          });

          expect(withEmployees).to.not.be.null;
          expect(withEmployees.employees).to.not.be.null;
          expect(withEmployees.employees.length).to.equal(1);
          expect(withEmployees.employees[0].last_name).to.equal('two');

          const employees = await withEmployees.getEmployees({ searchPath: SEARCH_PATH_TWO });
          expect(employees.length).to.equal(1);
          expect(employees[0].last_name).to.equal('two');

          const withRestaurant = await Employee.findOne({
            where: { last_name: 'two' },
            searchPath: SEARCH_PATH_TWO,
            include: [
              {
                model: Restaurant,
                as: 'restaurant'
              }
            ]
          });

          expect(withRestaurant).to.not.be.null;
          expect(withRestaurant.restaurant).to.not.be.null;
          expect(withRestaurant.restaurant.foo).to.equal('two');

          const restaurant = await withRestaurant.getRestaurant({ searchPath: SEARCH_PATH_TWO });
          expect(restaurant).to.not.be.null;
          expect(restaurant.foo).to.equal('two');
        });
      });

      describe('concurency tests', () => {
        it('should build and persist instances to 2 schemas concurrently in any order', async () => {
          let restaurauntModelSchema1 = Restaurant.build({ bar: 'one.1' });
          const restaurauntModelSchema2 = Restaurant.build({ bar: 'two.1' });

          await restaurauntModelSchema1.save({ searchPath: SEARCH_PATH_ONE });

          restaurauntModelSchema1 = Restaurant.build({ bar: 'one.2' });
          await restaurauntModelSchema2.save({ searchPath: SEARCH_PATH_TWO });
          await restaurauntModelSchema1.save({ searchPath: SEARCH_PATH_ONE });

          const restaurantsOne = await Restaurant.findAll({ searchPath: SEARCH_PATH_ONE });
          expect(restaurantsOne).to.not.be.null;
          expect(restaurantsOne.length).to.equal(2);
          restaurantsOne.forEach((restaurant) => {
            expect(restaurant.bar).to.contain('one');
          });

          const restaurantsTwo = await Restaurant.findAll({ searchPath: SEARCH_PATH_TWO });
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
