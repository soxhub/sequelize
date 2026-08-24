import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from './support.js';

const Sequelize = Support.Sequelize;
const current = Support.sequelize;
const DataTypes = Sequelize.DataTypes;

describe('model', () => {
  if (current.dialect.supports.JSON) {
    describe('json', () => {
      let User, UserFields;

      beforeEach(() => {
        User = current.define('User', {
          username: DataTypes.STRING,
          emergency_contact: DataTypes.JSON,
          emergencyContact: DataTypes.JSON
        });
        return current.sync({ force: true });
      });

      it('should tell me that a column is json', async () => {
        const table = await current.queryInterface.describeTable('Users');
        expect(table.emergency_contact.type).to.equal('JSON');
      });

      it('should stringify json with insert', () => {
        return User.create(
          {
            username: 'bob',
            emergency_contact: { name: 'joe', phones: [1337, 42] }
          },
          {
            fields: ['id', 'username', 'document', 'emergency_contact'],
            logging: (sql) => {
              const expected = '\'{"name":"joe","phones":[1337,42]}\'';
              const expectedEscaped = '\'{\\"name\\":\\"joe\\",\\"phones\\":[1337,42]}\'';
              if (sql.indexOf(expected) === -1) {
                expect(sql.indexOf(expectedEscaped)).not.to.equal(-1);
              } else {
                expect(sql.indexOf(expected)).not.to.equal(-1);
              }
            }
          }
        );
      });

      it('should insert json using a custom field name', async () => {
        UserFields = current.define('UserFields', {
          emergencyContact: { type: DataTypes.JSON, field: 'emergy_contact' }
        });

        await UserFields.sync({ force: true });

        const user = await UserFields.create({
          emergencyContact: { name: 'joe', phones: [1337, 42] }
        });

        expect(user.emergencyContact.name).to.equal('joe');
      });

      it('should update json using a custom field name', async () => {
        UserFields = current.define('UserFields', {
          emergencyContact: { type: DataTypes.JSON, field: 'emergy_contact' }
        });

        await UserFields.sync({ force: true });

        const created = await UserFields.create({
          emergencyContact: { name: 'joe', phones: [1337, 42] }
        });

        created.emergencyContact = { name: 'larry' };

        const user = await created.save();
        expect(user.emergencyContact.name).to.equal('larry');
      });

      it('should be able retrieve json value as object', async () => {
        const emergencyContact = { name: 'kate', phone: 1337 };

        const created = await User.create({ username: 'swen', emergency_contact: emergencyContact });
        expect(created.emergency_contact).to.eql(emergencyContact);

        const user = await User.findOne({ where: { username: 'swen' }, attributes: ['emergency_contact'] });
        expect(user.emergency_contact).to.eql(emergencyContact);
      });

      it('should be able to retrieve element of array by index', async () => {
        const emergencyContact = { name: 'kate', phones: [1337, 42] };

        const created = await User.create({ username: 'swen', emergency_contact: emergencyContact });
        expect(created.emergency_contact).to.eql(emergencyContact);

        const user = await User.findOne({
          where: { username: 'swen' },
          attributes: [[Sequelize.json('emergency_contact.phones[1]'), 'firstEmergencyNumber']]
        });

        expect(parseInt(user.getDataValue('firstEmergencyNumber'), 10)).to.equal(42);
      });

      it('should be able to retrieve root level value of an object by key', async () => {
        const emergencyContact = { kate: 1337 };

        const created = await User.create({ username: 'swen', emergency_contact: emergencyContact });
        expect(created.emergency_contact).to.eql(emergencyContact);

        const user = await User.findOne({
          where: { username: 'swen' },
          attributes: [[Sequelize.json('emergency_contact.kate'), 'katesNumber']]
        });

        expect(parseInt(user.getDataValue('katesNumber'), 10)).to.equal(1337);
      });

      it('should be able to retrieve nested value of an object by path', async () => {
        const emergencyContact = { kate: { email: 'kate@kate.com', phones: [1337, 42] } };

        const created = await User.create({ username: 'swen', emergency_contact: emergencyContact });
        expect(created.emergency_contact).to.eql(emergencyContact);

        const byEmail = await User.findOne({
          where: { username: 'swen' },
          attributes: [[Sequelize.json('emergency_contact.kate.email'), 'katesEmail']]
        });
        expect(byEmail.getDataValue('katesEmail')).to.equal('kate@kate.com');

        const byPhone = await User.findOne({
          where: { username: 'swen' },
          attributes: [[Sequelize.json('emergency_contact.kate.phones[1]'), 'katesFirstPhone']]
        });
        expect(parseInt(byPhone.getDataValue('katesFirstPhone'), 10)).to.equal(42);
      });

      it('should be able to retrieve a row based on the values of the json document', async () => {
        await Promise.all([
          User.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
          User.create({ username: 'anna', emergency_contact: { name: 'joe' } })
        ]);

        const user = await User.findOne({
          where: Sequelize.json('emergency_contact.name', 'kate'),
          attributes: ['username', 'emergency_contact']
        });

        expect(user.emergency_contact.name).to.equal('kate');
      });

      it('should be able to query using the nested query language', async () => {
        await Promise.all([
          User.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
          User.create({ username: 'anna', emergency_contact: { name: 'joe' } })
        ]);

        const user = await User.findOne({
          where: Sequelize.json({ emergency_contact: { name: 'kate' } })
        });

        expect(user.emergency_contact.name).to.equal('kate');
      });

      it('should be able to query using dot notation', async () => {
        await Promise.all([
          User.create({ username: 'swen', emergency_contact: { name: 'kate' } }),
          User.create({ username: 'anna', emergency_contact: { name: 'joe' } })
        ]);

        const user = await User.findOne({ where: Sequelize.json('emergency_contact.name', 'joe') });
        expect(user.emergency_contact.name).to.equal('joe');
      });

      it('should be able to query using dot notation with uppercase name', async () => {
        await Promise.all([
          User.create({ username: 'swen', emergencyContact: { name: 'kate' } }),
          User.create({ username: 'anna', emergencyContact: { name: 'joe' } })
        ]);

        const user = await User.findOne({
          attributes: [[Sequelize.json('emergencyContact.name'), 'contactName']],
          where: Sequelize.json('emergencyContact.name', 'joe')
        });

        expect(user.get('contactName')).to.equal('joe');
      });

      it('should be able to query array using property accessor', async () => {
        await Promise.all([
          User.create({ username: 'swen', emergency_contact: ['kate', 'joe'] }),
          User.create({ username: 'anna', emergency_contact: [{ name: 'joe' }] })
        ]);

        const byIndex = await User.findOne({ where: Sequelize.json('emergency_contact.0', 'kate') });
        expect(byIndex.username).to.equal('swen');

        const byPath = await User.findOne({ where: Sequelize.json('emergency_contact[0].name', 'joe') });
        expect(byPath.username).to.equal('anna');
      });

      it('should be able to store values that require JSON escaping', async () => {
        const text = 'Multi-line \'$string\' needing "escaping" for $$ and $1 type values';

        const created = await User.create({
          username: 'swen',
          emergency_contact: { value: text }
        });
        expect(created.isNewRecord).to.equal(false);

        await User.findOne({ where: { username: 'swen' } });

        const user = await User.findOne({ where: Sequelize.json('emergency_contact.value', text) });
        expect(user.username).to.equal('swen');
      });

      it('should be able to findOrCreate with values that require JSON escaping', async () => {
        const text = 'Multi-line \'$string\' needing "escaping" for $$ and $1 type values';

        const created = await User.findOrCreate({
          where: { username: 'swen' },
          defaults: { emergency_contact: { value: text } }
        });
        expect(!created.isNewRecord).to.equal(true);

        await User.findOne({ where: { username: 'swen' } });

        const user = await User.findOne({ where: Sequelize.json('emergency_contact.value', text) });
        expect(user.username).to.equal('swen');
      });

      // JSONB Supports this, but not JSON in postgres/mysql
    });
  }
});
