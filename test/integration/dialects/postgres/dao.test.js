import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'chai';
import DataTypes from '../../../../lib/data-types.js';
import sequelize from '../../../../lib/sequelize.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe('[POSTGRES Specific] DAO', () => {
  let SharedUser;

  beforeEach(async () => {
    current.options.quoteIdentifiers = true;
    SharedUser = current.define('User', {
      username: DataTypes.STRING,
      email: { type: DataTypes.ARRAY(DataTypes.TEXT) },
      settings: DataTypes.HSTORE,
      document: { type: DataTypes.HSTORE, defaultValue: { default: "'value'" } },
      phones: DataTypes.ARRAY(DataTypes.HSTORE),
      emergency_contact: DataTypes.JSON,
      emergencyContact: DataTypes.JSON,
      friends: {
        type: DataTypes.ARRAY(DataTypes.JSON),
        defaultValue: []
      },
      magic_numbers: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        defaultValue: []
      },
      course_period: DataTypes.RANGE(DataTypes.DATE),
      acceptable_marks: { type: DataTypes.RANGE(DataTypes.DECIMAL), defaultValue: [0.65, 1] },
      available_amount: DataTypes.RANGE,
      holidays: DataTypes.ARRAY(DataTypes.RANGE(DataTypes.DATE)),
      location: DataTypes.GEOMETRY()
    });
    await SharedUser.sync({ force: true });
  });

  afterEach(() => {
    current.options.quoteIdentifiers = true;
  });

  it('should be able to search within an array', () => {
    return SharedUser.findAll({
      where: {
        email: ['hello', 'world']
      },
      attributes: ['id', 'username', 'email', 'settings', 'document', 'phones', 'emergency_contact', 'friends'],
      logging(sql) {
        expect(sql).to.equal(
          'Executing (default): SELECT "id", "username", "email", "settings", "document", "phones", "emergency_contact", "friends" FROM "Users" AS "User" WHERE "User"."email" = ARRAY[\'hello\',\'world\']::TEXT[];'
        );
      }
    });
  });

  it('should be able to update a field with type ARRAY(JSON)', async () => {
    const userInstance = await SharedUser.create({
      username: 'bob',
      email: ['myemail@email.com'],
      friends: [
        {
          name: 'John Smith'
        }
      ]
    });

    expect(userInstance.friends).to.have.length(1);
    expect(userInstance.friends[0].name).to.equal('John Smith');

    const user = await userInstance.update({
      friends: [
        {
          name: 'John Smythe'
        }
      ]
    });

    const friends = user.get('friends');

    expect(friends).to.have.length(1);
    expect(friends[0].name).to.equal('John Smythe');
  });

  it('should be able to find a record while searching in an array', async () => {
    await SharedUser.bulkCreate([
      { username: 'bob', email: ['myemail@email.com'] },
      { username: 'tony', email: ['wrongemail@email.com'] }
    ]);

    const user = await SharedUser.findAll({ where: { email: ['myemail@email.com'] } });

    expect(user).to.be.instanceof(Array);
    expect(user).to.have.length(1);
    expect(user[0].username).to.equal('bob');
  });

  describe('json', () => {
    it('should be able to retrieve a row with ->> operator', async () => {
      await Promise.all([
        SharedUser.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
        SharedUser.create({ username: 'anna', emergency_contact: { name: 'joe' } })
      ]);

      const user = await SharedUser.findOne({
        where: sequelize.json("emergency_contact->>'name'", 'kate'),
        attributes: ['username', 'emergency_contact']
      });

      expect(user.emergency_contact.name).to.equal('kate');
    });

    it('should be able to query using the nested query language', async () => {
      await Promise.all([
        SharedUser.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
        SharedUser.create({ username: 'anna', emergency_contact: { name: 'joe' } })
      ]);

      const user = await SharedUser.findOne({
        where: sequelize.json({ emergency_contact: { name: 'kate' } })
      });

      expect(user.emergency_contact.name).to.equal('kate');
    });

    it('should be able to query using dot syntax', async () => {
      await Promise.all([
        SharedUser.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
        SharedUser.create({ username: 'anna', emergency_contact: { name: 'joe' } })
      ]);

      const user = await SharedUser.findOne({ where: sequelize.json('emergency_contact.name', 'joe') });

      expect(user.emergency_contact.name).to.equal('joe');
    });

    it('should be able to query using dot syntax with uppercase name', async () => {
      await Promise.all([
        SharedUser.create({ username: 'swen', emergencyContact: { name: 'kate' } }),
        SharedUser.create({ username: 'anna', emergencyContact: { name: 'joe' } })
      ]);

      const user = await SharedUser.findOne({
        attributes: [[sequelize.json('emergencyContact.name'), 'contactName']],
        where: sequelize.json('emergencyContact.name', 'joe')
      });

      expect(user.get('contactName')).to.equal('joe');
    });

    it('should be able to store values that require JSON escaping', async () => {
      const text = 'Multi-line \'$string\' needing "escaping" for $$ and $1 type values';

      const created = await SharedUser.create({ username: 'swen', emergency_contact: { value: text } });
      expect(created.isNewRecord).to.equal(false);

      await SharedUser.findOne({ where: { username: 'swen' } });

      const user = await SharedUser.findOne({ where: sequelize.json('emergency_contact.value', text) });

      expect(user.username).to.equal('swen');
    });

    it('should be able to findOrCreate with values that require JSON escaping', async () => {
      const text = 'Multi-line \'$string\' needing "escaping" for $$ and $1 type values';

      const [created] = await SharedUser.findOrCreate({
        where: { username: 'swen' },
        defaults: { emergency_contact: { value: text } }
      });
      expect(created.isNewRecord).to.equal(false);

      await SharedUser.findOne({ where: { username: 'swen' } });

      const user = await SharedUser.findOne({ where: sequelize.json('emergency_contact.value', text) });

      expect(user.username).to.equal('swen');
    });
  });

  describe('hstore', () => {
    it('should tell me that a column is hstore and not USER-DEFINED', async () => {
      const table = await current.queryInterface.describeTable('Users');

      expect(table.settings.type).to.equal('HSTORE');
      expect(table.document.type).to.equal('HSTORE');
    });

    it('should stringify hstore with insert', () => {
      return SharedUser.create(
        {
          username: 'bob',
          email: ['myemail@email.com'],
          settings: { mailing: false, push: 'facebook', frequency: 3 }
        },
        {
          logging(sql) {
            const expected =
              '\'"mailing"=>"false","push"=>"facebook","frequency"=>"3"\',\'"default"=>"\'\'value\'\'"\'';
            expect(sql.indexOf(expected)).not.to.equal(-1);
          }
        }
      );
    });

    it('should not rename hstore fields', async () => {
      const Equipment = current.define('Equipment', {
        grapplingHook: {
          type: DataTypes.STRING,
          field: 'grappling_hook'
        },
        utilityBelt: {
          type: DataTypes.HSTORE
        }
      });

      await Equipment.sync({ force: true });
      await Equipment.findAll({
        where: {
          utilityBelt: {
            grapplingHook: true
          }
        },
        logging(sql) {
          expect(sql).to.equal(
            'Executing (default): SELECT "id", "grappling_hook" AS "grapplingHook", "utilityBelt", "createdAt", "updatedAt" FROM "Equipment" AS "Equipment" WHERE "Equipment"."utilityBelt" = \'"grapplingHook"=>"true"\';'
          );
        }
      });
    });

    it('should not rename json fields', async () => {
      const Equipment = current.define('Equipment', {
        grapplingHook: {
          type: DataTypes.STRING,
          field: 'grappling_hook'
        },
        utilityBelt: {
          type: DataTypes.JSON
        }
      });

      await Equipment.sync({ force: true });
      await Equipment.findAll({
        where: {
          utilityBelt: {
            grapplingHook: true
          }
        },
        logging(sql) {
          expect(sql).to.equal(
            'Executing (default): SELECT "id", "grappling_hook" AS "grapplingHook", "utilityBelt", "createdAt", "updatedAt" FROM "Equipment" AS "Equipment" WHERE CAST(("Equipment"."utilityBelt"#>>\'{grapplingHook}\') AS BOOLEAN) = true;'
          );
        }
      });
    });
  });

  describe('range', () => {
    it('should tell me that a column is range and not USER-DEFINED', async () => {
      const table = await current.queryInterface.describeTable('Users');

      expect(table.course_period.type).to.equal('TSTZRANGE');
      expect(table.available_amount.type).to.equal('INT4RANGE');
    });
  });

  describe('enums', () => {
    it('should be able to ignore enum types that already exist', async () => {
      const User = current.define('UserEnums', {
        mood: DataTypes.ENUM('happy', 'sad', 'meh')
      });

      await User.sync({ force: true });
      await User.sync();
    });

    it('should be able to create/drop enums multiple times', async () => {
      const User = current.define('UserEnums', {
        mood: DataTypes.ENUM('happy', 'sad', 'meh')
      });

      await User.sync({ force: true });
      await User.sync({ force: true });
    });

    it('should be able to create/drop multiple enums multiple times', async () => {
      const DummyModel = current.define('Dummy-pg', {
        username: DataTypes.STRING,
        theEnumOne: {
          type: DataTypes.ENUM,
          values: ['one', 'two', 'three']
        },
        theEnumTwo: {
          type: DataTypes.ENUM,
          values: ['four', 'five', 'six']
        }
      });

      await DummyModel.sync({ force: true });
      // now sync one more time:
      await DummyModel.sync({ force: true });
      // sync without dropping
      await DummyModel.sync();
    });

    it('should be able to create/drop multiple enums multiple times with field name (#7812)', async () => {
      const DummyModel = current.define('Dummy-pg', {
        username: DataTypes.STRING,
        theEnumOne: {
          field: 'oh_my_this_enum_one',
          type: DataTypes.ENUM,
          values: ['one', 'two', 'three']
        },
        theEnumTwo: {
          field: 'oh_my_this_enum_two',
          type: DataTypes.ENUM,
          values: ['four', 'five', 'six']
        }
      });

      await DummyModel.sync({ force: true });
      // now sync one more time:
      await DummyModel.sync({ force: true });
      // sync without dropping
      await DummyModel.sync();
    });

    it('should be able to add values to enum types', async () => {
      let User = current.define('UserEnums', {
        mood: DataTypes.ENUM('happy', 'sad', 'meh')
      });

      await User.sync({ force: true });

      User = current.define('UserEnums', {
        mood: DataTypes.ENUM('neutral', 'happy', 'sad', 'ecstatic', 'meh', 'joyful')
      });

      await User.sync();

      const enums = await current.getQueryInterface().pgListEnums(User.getTableName());

      expect(enums).to.have.length(1);
      expect(enums[0].enum_value).to.equal('{neutral,happy,sad,ecstatic,meh,joyful}');
    });

    describe('ARRAY(ENUM)', () => {
      it('should be able to ignore enum types that already exist', async () => {
        const User = current.define('UserEnums', {
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });
        await User.sync();
      });

      it('should be able to create/drop enums multiple times', async () => {
        const User = current.define('UserEnums', {
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });
        await User.sync({ force: true });
      });

      it('should be able to add values to enum types', async () => {
        let User = current.define('UserEnums', {
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });

        User = current.define('UserEnums', {
          permissions: DataTypes.ARRAY(DataTypes.ENUM('view', 'access', 'edit', 'write', 'check', 'delete'))
        });

        await User.sync();

        const enums = await current.getQueryInterface().pgListEnums(User.getTableName());

        expect(enums).to.have.length(1);
        expect(enums[0].enum_value).to.equal('{view,access,edit,write,check,delete}');
      });

      it('should be able to insert new record', async () => {
        const User = current.define('UserEnums', {
          name: DataTypes.STRING,
          type: DataTypes.ENUM('A', 'B', 'C'),
          owners: DataTypes.ARRAY(DataTypes.STRING),
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });

        const user = await User.create({
          name: 'file.exe',
          type: 'C',
          owners: ['userA', 'userB'],
          permissions: ['access', 'write']
        });

        expect(user.name).to.equal('file.exe');
        expect(user.type).to.equal('C');
        expect(user.owners).to.deep.equal(['userA', 'userB']);
        expect(user.permissions).to.deep.equal(['access', 'write']);
      });

      it('should fail when trying to insert foreign element on ARRAY(ENUM)', async () => {
        const User = current.define('UserEnums', {
          name: DataTypes.STRING,
          type: DataTypes.ENUM('A', 'B', 'C'),
          owners: DataTypes.ARRAY(DataTypes.STRING),
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });

        await expect(
          User.create({
            name: 'file.exe',
            type: 'C',
            owners: ['userA', 'userB'],
            permissions: ['cosmic_ray_disk_access']
          })
        ).to.be.rejectedWith(/invalid input value for enum "enum_UserEnums_permissions": "cosmic_ray_disk_access"/);
      });

      it('should be able to find records', async () => {
        const User = current.define('UserEnums', {
          name: DataTypes.STRING,
          type: DataTypes.ENUM('A', 'B', 'C'),
          permissions: DataTypes.ARRAY(DataTypes.ENUM(['access', 'write', 'check', 'delete']))
        });

        await User.sync({ force: true });
        await User.bulkCreate([
          {
            name: 'file1.exe',
            type: 'C',
            permissions: ['access', 'write']
          },
          {
            name: 'file2.exe',
            type: 'A',
            permissions: ['access', 'check']
          },
          {
            name: 'file3.exe',
            type: 'B',
            permissions: ['access', 'write', 'delete']
          }
        ]);

        const users = await User.findAll({
          where: {
            type: {
              $in: ['A', 'C']
            },
            permissions: {
              $contains: ['write']
            }
          }
        });

        expect(users.length).to.equal(1);
        expect(users[0].name).to.equal('file1.exe');
        expect(users[0].type).to.equal('C');
        expect(users[0].permissions).to.deep.equal(['access', 'write']);
      });
    });
  });

  describe('integers', () => {
    describe('integer', () => {
      beforeEach(async () => {
        SharedUser = current.define('User', {
          aNumber: DataTypes.INTEGER
        });

        await SharedUser.sync({ force: true });
      });

      it('positive', async () => {
        const user = await SharedUser.create({ aNumber: 2147483647 });
        expect(user.aNumber).to.equal(2147483647);

        const _user = await SharedUser.findOne({ where: { aNumber: 2147483647 } });
        expect(_user.aNumber).to.equal(2147483647);
      });

      it('negative', async () => {
        const user = await SharedUser.create({ aNumber: -2147483647 });
        expect(user.aNumber).to.equal(-2147483647);

        const _user = await SharedUser.findOne({ where: { aNumber: -2147483647 } });
        expect(_user.aNumber).to.equal(-2147483647);
      });
    });

    describe('bigint', () => {
      beforeEach(async () => {
        SharedUser = current.define('User', {
          aNumber: DataTypes.BIGINT
        });

        await SharedUser.sync({ force: true });
      });

      it('positive', async () => {
        const user = await SharedUser.create({ aNumber: '9223372036854775807' });
        expect(user.aNumber).to.equal('9223372036854775807');

        const _user = await SharedUser.findOne({ where: { aNumber: '9223372036854775807' } });
        expect(_user.aNumber).to.equal('9223372036854775807');
      });

      it('negative', async () => {
        const user = await SharedUser.create({ aNumber: '-9223372036854775807' });
        expect(user.aNumber).to.equal('-9223372036854775807');

        const _user = await SharedUser.findOne({ where: { aNumber: '-9223372036854775807' } });
        expect(_user.aNumber).to.equal('-9223372036854775807');
      });
    });
  });

  describe('timestamps', () => {
    beforeEach(async () => {
      SharedUser = current.define('User', {
        dates: DataTypes.ARRAY(DataTypes.DATE)
      });
      await SharedUser.sync({ force: true });
    });

    it('should use postgres "TIMESTAMP WITH TIME ZONE" instead of "DATETIME"', () => {
      return SharedUser.create(
        {
          dates: []
        },
        {
          logging(sql) {
            expect(sql.indexOf('TIMESTAMP WITH TIME ZONE')).to.be.greaterThan(0);
          }
        }
      );
    });
  });

  describe('model', () => {
    it('create handles array correctly', async () => {
      const oldUser = await SharedUser.create({ username: 'user', email: ['foo@bar.com', 'bar@baz.com'] });

      expect(oldUser.email).to.contain.members(['foo@bar.com', 'bar@baz.com']);
    });

    it('should save hstore correctly', async () => {
      const newUser = await SharedUser.create({
        username: 'user',
        email: ['foo@bar.com'],
        settings: { created: '"value"' }
      });

      // Check to see if the default value for an hstore field works
      expect(newUser.document).to.deep.equal({ default: "'value'" });
      expect(newUser.settings).to.deep.equal({ created: '"value"' });

      // Check to see if updating an hstore field works
      const oldUser = await newUser.update({ settings: { should: 'update', to: 'this', first: 'place' } });

      // Postgres always returns keys in alphabetical order (ascending)
      expect(oldUser.settings).to.deep.equal({ first: 'place', should: 'update', to: 'this' });
    });

    it('should save hstore array correctly', async () => {
      await SharedUser.create({
        username: 'bob',
        email: ['myemail@email.com'],
        phones: [
          { number: '123456789', type: 'mobile' },
          { number: '987654321', type: 'landline' },
          { number: '8675309', type: "Jenny's" },
          { number: '5555554321', type: '"home\n"' }
        ]
      });

      const user = await SharedUser.findByPk(1);

      expect(user.phones.length).to.equal(4);
      expect(user.phones[1].number).to.equal('987654321');
      expect(user.phones[2].type).to.equal("Jenny's");
      expect(user.phones[3].type).to.equal('"home\n"');
    });

    it('should bulkCreate with hstore property', async () => {
      await SharedUser.bulkCreate([
        {
          username: 'bob',
          email: ['myemail@email.com'],
          settings: { mailing: true, push: 'facebook', frequency: 3 }
        }
      ]);

      const user = await SharedUser.findByPk(1);

      expect(user.settings.mailing).to.equal('true');
    });

    it('should update hstore correctly', async () => {
      const newUser = await SharedUser.create({
        username: 'user',
        email: ['foo@bar.com'],
        settings: { test: '"value"' }
      });

      // Check to see if the default value for an hstore field works
      expect(newUser.document).to.deep.equal({ default: "'value'" });
      expect(newUser.settings).to.deep.equal({ test: '"value"' });

      // Check to see if updating an hstore field works
      await SharedUser.update(
        { settings: { should: 'update', to: 'this', first: 'place' } },
        { where: newUser.where() }
      );
      await newUser.reload();

      // Postgres always returns keys in alphabetical order (ascending)
      expect(newUser.settings).to.deep.equal({ first: 'place', should: 'update', to: 'this' });
    });

    it('should update hstore correctly and return the affected rows', async () => {
      const oldUser = await SharedUser.create({
        username: 'user',
        email: ['foo@bar.com'],
        settings: { test: '"value"' }
      });

      // Update the user and check that the returned object's fields have been parsed by the hstore library
      const [count, users] = await SharedUser.update(
        { settings: { should: 'update', to: 'this', first: 'place' } },
        { where: oldUser.where(), returning: true }
      );

      expect(count).to.equal(1);
      expect(users[0].settings).to.deep.equal({ should: 'update', to: 'this', first: 'place' });
    });

    it('should read hstore correctly', async () => {
      const data = { username: 'user', email: ['foo@bar.com'], settings: { test: '"value"' } };

      await SharedUser.create(data);

      const user = await SharedUser.findOne({ where: { username: 'user' } });

      // Check that the hstore fields are the same when retrieving the user
      expect(user.settings).to.deep.equal(data.settings);
    });

    it('should read an hstore array correctly', async () => {
      const data = {
        username: 'user',
        email: ['foo@bar.com'],
        phones: [
          { number: '123456789', type: 'mobile' },
          { number: '987654321', type: 'landline' }
        ]
      };

      await SharedUser.create(data);

      // Check that the hstore fields are the same when retrieving the user
      const user = await SharedUser.findOne({ where: { username: 'user' } });

      expect(user.phones).to.deep.equal(data.phones);
    });

    it('should read hstore correctly from multiple rows', async () => {
      await SharedUser.create({ username: 'user1', email: ['foo@bar.com'], settings: { test: '"value"' } });
      await SharedUser.create({ username: 'user2', email: ['foo2@bar.com'], settings: { another: '"example"' } });

      // Check that the hstore fields are the same when retrieving the user
      const users = await SharedUser.findAll({ order: ['username'] });

      expect(users[0].settings).to.deep.equal({ test: '"value"' });
      expect(users[1].settings).to.deep.equal({ another: '"example"' });
    });

    it('should read hstore correctly from included models as well', async () => {
      const HstoreSubmodel = current.define('hstoreSubmodel', {
        someValue: DataTypes.HSTORE
      });
      const submodelValue = { testing: '"hstore"' };

      SharedUser.hasMany(HstoreSubmodel);

      await current.sync({ force: true });

      const created = await SharedUser.create({ username: 'user1' });
      const submodel = await HstoreSubmodel.create({ someValue: submodelValue });

      await created.setHstoreSubmodels([submodel]);

      const user = await SharedUser.findOne({ where: { username: 'user1' }, include: [HstoreSubmodel] });

      expect(Object.hasOwn(user, 'hstoreSubmodels')).to.be.ok;
      expect(user.hstoreSubmodels.length).to.equal(1);
      expect(user.hstoreSubmodels[0].someValue).to.deep.equal(submodelValue);
    });

    it('should save range correctly', async () => {
      const period = [new Date(2015, 0, 1), new Date(2015, 11, 31)];
      const newUser = await SharedUser.create({ username: 'user', email: ['foo@bar.com'], course_period: period });

      // Check to see if the default value for a range field works

      expect(newUser.acceptable_marks.length).to.equal(2);
      expect(newUser.acceptable_marks[0]).to.equal('0.65'); // lower bound
      expect(newUser.acceptable_marks[1]).to.equal('1'); // upper bound
      expect(newUser.acceptable_marks.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
      expect(newUser.course_period[0] instanceof Date).to.be.ok; // lower bound
      expect(newUser.course_period[1] instanceof Date).to.be.ok; // upper bound
      expect(newUser.course_period[0]).to.equalTime(period[0]); // lower bound
      expect(newUser.course_period[1]).to.equalTime(period[1]); // upper bound
      expect(newUser.course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive

      // Check to see if updating a range field works
      await newUser.update({ acceptable_marks: [0.8, 0.9] });

      expect(newUser.acceptable_marks.length).to.equal(2);
      expect(newUser.acceptable_marks[0]).to.equal(0.8); // lower bound
      expect(newUser.acceptable_marks[1]).to.equal(0.9); // upper bound
    });

    it('should save range array correctly', async () => {
      const holidays = [
        [new Date(2015, 3, 1), new Date(2015, 3, 15)],
        [new Date(2015, 8, 1), new Date(2015, 9, 15)]
      ];

      await SharedUser.create({
        username: 'bob',
        email: ['myemail@email.com'],
        holidays
      });

      const user = await SharedUser.findByPk(1);

      expect(user.holidays.length).to.equal(2);
      expect(user.holidays[0].length).to.equal(2);
      expect(user.holidays[0][0] instanceof Date).to.be.ok;
      expect(user.holidays[0][1] instanceof Date).to.be.ok;
      expect(user.holidays[0][0]).to.equalTime(holidays[0][0]);
      expect(user.holidays[0][1]).to.equalTime(holidays[0][1]);
      expect(user.holidays[1].length).to.equal(2);
      expect(user.holidays[1][0] instanceof Date).to.be.ok;
      expect(user.holidays[1][1] instanceof Date).to.be.ok;
      expect(user.holidays[1][0]).to.equalTime(holidays[1][0]);
      expect(user.holidays[1][1]).to.equalTime(holidays[1][1]);
    });

    it('should bulkCreate with range property', async () => {
      const period = [new Date(2015, 0, 1), new Date(2015, 11, 31)];

      await SharedUser.bulkCreate([
        {
          username: 'bob',
          email: ['myemail@email.com'],
          course_period: period
        }
      ]);

      const user = await SharedUser.findByPk(1);

      expect(user.course_period[0] instanceof Date).to.be.ok;
      expect(user.course_period[1] instanceof Date).to.be.ok;
      expect(user.course_period[0]).to.equalTime(period[0]); // lower bound
      expect(user.course_period[1]).to.equalTime(period[1]); // upper bound
      expect(user.course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
    });

    it('should update range correctly', async () => {
      const period = [new Date(2015, 0, 1), new Date(2015, 11, 31)];

      const newUser = await SharedUser.create({ username: 'user', email: ['foo@bar.com'], course_period: period });

      // Check to see if the default value for a range field works
      expect(newUser.acceptable_marks.length).to.equal(2);
      expect(newUser.acceptable_marks[0]).to.equal('0.65'); // lower bound
      expect(newUser.acceptable_marks[1]).to.equal('1'); // upper bound
      expect(newUser.acceptable_marks.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
      expect(newUser.course_period[0] instanceof Date).to.be.ok;
      expect(newUser.course_period[1] instanceof Date).to.be.ok;
      expect(newUser.course_period[0]).to.equalTime(period[0]); // lower bound
      expect(newUser.course_period[1]).to.equalTime(period[1]); // upper bound
      expect(newUser.course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive

      const period2 = [new Date(2015, 1, 1), new Date(2015, 10, 30)];

      // Check to see if updating a range field works
      await SharedUser.update({ course_period: period2 }, { where: newUser.where() });
      await newUser.reload();

      expect(newUser.course_period[0] instanceof Date).to.be.ok;
      expect(newUser.course_period[1] instanceof Date).to.be.ok;
      expect(newUser.course_period[0]).to.equalTime(period2[0]); // lower bound
      expect(newUser.course_period[1]).to.equalTime(period2[1]); // upper bound
      expect(newUser.course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
    });

    it('should update range correctly and return the affected rows', async () => {
      const period = [new Date(2015, 1, 1), new Date(2015, 10, 30)];

      const oldUser = await SharedUser.create({
        username: 'user',
        email: ['foo@bar.com'],
        course_period: [new Date(2015, 0, 1), new Date(2015, 11, 31)]
      });

      // Update the user and check that the returned object's fields have been parsed by the range parser
      const [count, users] = await SharedUser.update(
        { course_period: period },
        { where: oldUser.where(), returning: true }
      );

      expect(count).to.equal(1);
      expect(users[0].course_period[0] instanceof Date).to.be.ok;
      expect(users[0].course_period[1] instanceof Date).to.be.ok;
      expect(users[0].course_period[0]).to.equalTime(period[0]); // lower bound
      expect(users[0].course_period[1]).to.equalTime(period[1]); // upper bound
      expect(users[0].course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
    });

    it('should read range correctly', async () => {
      const course_period = [new Date(2015, 1, 1), new Date(2015, 10, 30)];
      course_period.inclusive = [false, false];

      const data = { username: 'user', email: ['foo@bar.com'], course_period };

      await SharedUser.create(data);

      const user = await SharedUser.findOne({ where: { username: 'user' } });

      // Check that the range fields are the same when retrieving the user
      expect(user.course_period).to.deep.equal(data.course_period);
    });

    it('should read range array correctly', async () => {
      const holidays = [
        [new Date(2015, 3, 1, 10), new Date(2015, 3, 15)],
        [new Date(2015, 8, 1), new Date(2015, 9, 15)]
      ];

      holidays[0].inclusive = [true, true];
      holidays[1].inclusive = [true, true];

      const data = { username: 'user', email: ['foo@bar.com'], holidays };

      await SharedUser.create(data);

      // Check that the range fields are the same when retrieving the user
      const user = await SharedUser.findOne({ where: { username: 'user' } });

      expect(user.holidays).to.deep.equal(data.holidays);
    });

    it('should read range correctly from multiple rows', async () => {
      const periods = [
        [new Date(2015, 0, 1), new Date(2015, 11, 31)],
        [new Date(2016, 0, 1), new Date(2016, 11, 31)]
      ];

      await SharedUser.create({ username: 'user1', email: ['foo@bar.com'], course_period: periods[0] });
      await SharedUser.create({ username: 'user2', email: ['foo2@bar.com'], course_period: periods[1] });

      // Check that the range fields are the same when retrieving the user
      const users = await SharedUser.findAll({ order: ['username'] });

      expect(users[0].course_period[0]).to.equalTime(periods[0][0]); // lower bound
      expect(users[0].course_period[1]).to.equalTime(periods[0][1]); // upper bound
      expect(users[0].course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
      expect(users[1].course_period[0]).to.equalTime(periods[1][0]); // lower bound
      expect(users[1].course_period[1]).to.equalTime(periods[1][1]); // upper bound
      expect(users[1].course_period.inclusive).to.deep.equal([true, false]); // inclusive, exclusive
    });

    it('should read range correctly from included models as well', async () => {
      const period = [new Date(2016, 0, 1), new Date(2016, 11, 31)];
      const HolidayDate = current.define('holidayDate', {
        period: DataTypes.RANGE(DataTypes.DATE)
      });

      SharedUser.hasMany(HolidayDate);

      await current.sync({ force: true });

      const created = await SharedUser.create({ username: 'user', email: ['foo@bar.com'] });
      const holidayDate = await HolidayDate.create({ period });

      await created.setHolidayDates([holidayDate]);

      const user = await SharedUser.findOne({ where: { username: 'user' }, include: [HolidayDate] });

      expect(Object.hasOwn(user, 'holidayDates')).to.be.ok;
      expect(user.holidayDates.length).to.equal(1);
      expect(user.holidayDates[0].period.length).to.equal(2);
      expect(user.holidayDates[0].period[0]).to.equalTime(period[0]);
      expect(user.holidayDates[0].period[1]).to.equalTime(period[1]);
    });
  });

  it('should save geometry correctly', async () => {
    const point = { type: 'Point', coordinates: [39.807222, -76.984722] };
    const newUser = await SharedUser.create({ username: 'user', email: ['foo@bar.com'], location: point });

    expect(newUser.location).to.deep.eql(point);
  });

  it('should update geometry correctly', async () => {
    const point1 = { type: 'Point', coordinates: [39.807222, -76.984722] };
    const point2 = { type: 'Point', coordinates: [39.828333, -77.232222] };

    const oldUser = await SharedUser.create({ username: 'user', email: ['foo@bar.com'], location: point1 });
    const [, updatedUsers] = await SharedUser.update(
      { location: point2 },
      { where: { username: oldUser.username }, returning: true }
    );

    expect(updatedUsers[0].location).to.deep.eql(point2);
  });

  it('should read geometry correctly', async () => {
    const point = { type: 'Point', coordinates: [39.807222, -76.984722] };

    const created = await SharedUser.create({ username: 'user', email: ['foo@bar.com'], location: point });
    const user = await SharedUser.findOne({ where: { username: created.username } });

    expect(user.location).to.deep.eql(point);
  });

  describe('[POSTGRES] Unquoted identifiers', () => {
    it('can insert and select', async () => {
      current.options.quoteIdentifiers = false;
      current.getQueryInterface().QueryGenerator.options.quoteIdentifiers = false;

      SharedUser = current.define(
        'Userxs',
        {
          username: DataTypes.STRING,
          fullName: DataTypes.STRING // Note mixed case
        },
        {
          quoteIdentifiers: false
        }
      );

      try {
        await SharedUser.sync({ force: true });

        const user = await SharedUser.create({ username: 'user', fullName: 'John Smith' });

        // We can insert into a table with non-quoted identifiers
        expect(user.id).to.exist;
        expect(user.id).not.to.be.null;
        expect(user.username).to.equal('user');
        expect(user.fullName).to.equal('John Smith');

        // We can query by non-quoted identifiers
        const user2 = await SharedUser.findOne({
          where: { fullName: 'John Smith' }
        });

        // We can map values back to non-quoted identifiers
        expect(user2.id).to.equal(user.id);
        expect(user2.username).to.equal('user');
        expect(user2.fullName).to.equal('John Smith');

        // We can query and aggregate by non-quoted identifiers
        const count = await SharedUser.count({
          where: { fullName: 'John Smith' }
        });

        expect(count).to.equal(1);
      } finally {
        current.options.quoteIdentifiers = true;
        current.getQueryInterface().QueryGenerator.options.quoteIdentifiers = true;
        current.options.logging = false;
      }
    });

    it('can select nested include', async () => {
      current.options.quoteIdentifiers = false;
      current.getQueryInterface().QueryGenerator.options.quoteIdentifiers = false;
      const Professor = current.define(
        'Professor',
        {
          fullName: DataTypes.STRING
        },
        {
          quoteIdentifiers: false
        }
      );
      const Class = current.define(
        'Class',
        {
          name: DataTypes.STRING
        },
        {
          quoteIdentifiers: false
        }
      );
      const Student = current.define(
        'Student',
        {
          fullName: DataTypes.STRING
        },
        {
          quoteIdentifiers: false
        }
      );
      const ClassStudent = current.define(
        'ClassStudent',
        {},
        {
          quoteIdentifiers: false,
          tableName: 'class_student'
        }
      );
      Professor.hasMany(Class);
      Class.belongsTo(Professor);
      Class.belongsToMany(Student, { through: ClassStudent });
      Student.belongsToMany(Class, { through: ClassStudent });
      try {
        await Professor.sync({ force: true });
        await Student.sync({ force: true });
        await Class.sync({ force: true });
        await ClassStudent.sync({ force: true });

        await Professor.bulkCreate([
          {
            id: 1,
            fullName: 'Albus Dumbledore'
          },
          {
            id: 2,
            fullName: 'Severus Snape'
          }
        ]);

        await Class.bulkCreate([
          {
            id: 1,
            name: 'Transfiguration',
            ProfessorId: 1
          },
          {
            id: 2,
            name: 'Potions',
            ProfessorId: 2
          },
          {
            id: 3,
            name: 'Defence Against the Dark Arts',
            ProfessorId: 2
          }
        ]);

        await Student.bulkCreate([
          {
            id: 1,
            fullName: 'Harry Potter'
          },
          {
            id: 2,
            fullName: 'Ron Weasley'
          },
          {
            id: 3,
            fullName: 'Ginny Weasley'
          },
          {
            id: 4,
            fullName: 'Hermione Granger'
          }
        ]);

        await Promise.all([
          (async () => {
            const Harry = await Student.findByPk(1);
            return await Harry.setClasses([1, 2, 3]);
          })(),
          (async () => {
            const Ron = await Student.findByPk(2);
            return await Ron.setClasses([1, 2]);
          })(),
          (async () => {
            const Ginny = await Student.findByPk(3);
            return await Ginny.setClasses([2, 3]);
          })(),
          (async () => {
            const Hermione = await Student.findByPk(4);
            return await Hermione.setClasses([1, 2, 3]);
          })()
        ]);

        const professors = await Professor.findAll({
          include: [
            {
              model: Class,
              include: [
                {
                  model: Student
                }
              ]
            }
          ],
          order: [['id'], [Class, 'id'], [Class, Student, 'id']]
        });

        expect(professors.length).to.eql(2);
        expect(professors[0].fullName).to.eql('Albus Dumbledore');
        expect(professors[0].Classes.length).to.eql(1);
        expect(professors[0].Classes[0].Students.length).to.eql(3);
      } finally {
        current.getQueryInterface().QueryGenerator.options.quoteIdentifiers = true;
      }
    });
  });
});
