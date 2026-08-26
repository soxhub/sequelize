import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import _ from 'lodash';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let sequelize, SharedUser;

  beforeEach(async () => {
    sequelize = await Support.prepareTransactionTest(current);

    SharedUser = sequelize.define('User', {
      username: DataTypes.STRING,
      secretValue: {
        type: DataTypes.STRING,
        field: 'secret_value'
      },
      data: DataTypes.STRING,
      intVal: DataTypes.INTEGER,
      theDate: DataTypes.DATE,
      aBool: DataTypes.BOOLEAN,
      uniqueName: { type: DataTypes.STRING, unique: true }
    });
    // Registered only so sync() creates their tables; no test references them directly.
    sequelize.define('Account', {
      accountName: DataTypes.STRING
    });
    sequelize.define('Student', {
      no: { type: DataTypes.INTEGER, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false }
    });

    await sequelize.sync({ force: true });
  });

  describe('bulkCreate', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const User = sequelize.define('User', {
          username: DataTypes.STRING
        });

        await User.sync({ force: true });

        const transaction = await sequelize.transaction();
        await User.bulkCreate([{ username: 'foo' }, { username: 'bar' }], { transaction });

        const count1 = await User.count();
        const count2 = await User.count({ transaction });

        expect(count1).to.equal(0);
        expect(count2).to.equal(2);

        await transaction.rollback();
      });
    }

    it('should be able to set createdAt and updatedAt if using silent: true', async () => {
      const User = sequelize.define(
        'user',
        {
          name: DataTypes.STRING
        },
        {
          timestamps: true
        }
      );

      const createdAt = new Date(2012, 10, 10, 10, 10, 10);
      const updatedAt = new Date(2011, 11, 11, 11, 11, 11);
      const values = Array.from({ length: 10 }, () => {
        return {
          createdAt,
          updatedAt
        };
      });

      await User.sync({ force: true });

      await User.bulkCreate(values, {
        silent: true
      });

      const users = await User.findAll({
        where: {
          updatedAt: {
            ne: null
          }
        }
      });

      users.forEach((user) => {
        expect(createdAt.getTime()).to.equal(user.get('createdAt').getTime());
        expect(updatedAt.getTime()).to.equal(user.get('updatedAt').getTime());
      });
    });

    it('should not fail on validate: true and individualHooks: true', async () => {
      const User = sequelize.define('user', {
        name: Sequelize.STRING
      });

      await User.sync({ force: true });
      await User.bulkCreate([{ name: 'James' }], { validate: true, individualHooks: true });
    });

    it('should not insert NULL for unused fields', async () => {
      const Beer = sequelize.define('Beer', {
        style: Sequelize.STRING,
        size: Sequelize.INTEGER
      });

      await Beer.sync({ force: true });

      let sql;

      await Beer.bulkCreate(
        [
          {
            style: 'ipa'
          }
        ],
        {
          logging(logged) {
            sql = logged;
          }
        }
      );

      expect(sql.indexOf('INSERT INTO "Beers" ("id","style","createdAt","updatedAt") VALUES (DEFAULT')).not.be.equal(
        -1
      );
    });

    it('properly handles disparate field lists', async () => {
      const data = [
        { username: 'Peter', secretValue: '42', uniqueName: '1' },
        { username: 'Paul', uniqueName: '2' },
        { username: 'Steve', uniqueName: '3' }
      ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ where: { username: 'Paul' } });
      expect(users.length).to.equal(1);
      expect(users[0].username).to.equal('Paul');
      expect(users[0].secretValue).to.be.null;
    });

    it('inserts multiple values respecting the white list', async () => {
      const data = [
        { username: 'Peter', secretValue: '42', uniqueName: '1' },
        { username: 'Paul', secretValue: '23', uniqueName: '2' }
      ];

      await SharedUser.bulkCreate(data, { fields: ['username', 'uniqueName'] });

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(users[0].secretValue).to.be.null;
      expect(users[1].username).to.equal('Paul');
      expect(users[1].secretValue).to.be.null;
    });

    it('should store all values if no whitelist is specified', async () => {
      const data = [
        { username: 'Peter', secretValue: '42', uniqueName: '1' },
        { username: 'Paul', secretValue: '23', uniqueName: '2' }
      ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(users[0].secretValue).to.equal('42');
      expect(users[1].username).to.equal('Paul');
      expect(users[1].secretValue).to.equal('23');
    });

    it('should set isNewRecord = false', async () => {
      const data = [
        { username: 'Peter', secretValue: '42', uniqueName: '1' },
        { username: 'Paul', secretValue: '23', uniqueName: '2' }
      ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      users.forEach((user) => {
        expect(user.isNewRecord).to.equal(false);
      });
    });

    it('saves data with single quote', async () => {
      const quote = "Single'Quote",
        data = [
          { username: 'Peter', data: quote, uniqueName: '1' },
          { username: 'Paul', data: quote, uniqueName: '2' }
        ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(users[0].data).to.equal(quote);
      expect(users[1].username).to.equal('Paul');
      expect(users[1].data).to.equal(quote);
    });

    it('saves data with double quote', async () => {
      const quote = 'Double"Quote',
        data = [
          { username: 'Peter', data: quote, uniqueName: '1' },
          { username: 'Paul', data: quote, uniqueName: '2' }
        ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(users[0].data).to.equal(quote);
      expect(users[1].username).to.equal('Paul');
      expect(users[1].data).to.equal(quote);
    });

    it('saves stringified JSON data', async () => {
      const json = JSON.stringify({ key: 'value' }),
        data = [
          { username: 'Peter', data: json, uniqueName: '1' },
          { username: 'Paul', data: json, uniqueName: '2' }
        ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(users[0].data).to.equal(json);
      expect(users[1].username).to.equal('Paul');
      expect(users[1].data).to.equal(json);
    });

    it('properly handles a model with a length column', async () => {
      const UserWithLength = sequelize.define('UserWithLength', {
        length: Sequelize.INTEGER
      });

      await UserWithLength.sync({ force: true });
      await UserWithLength.bulkCreate([{ length: 42 }, { length: 11 }]);
    });

    it('stores the current date in createdAt', async () => {
      const data = [
        { username: 'Peter', uniqueName: '1' },
        { username: 'Paul', uniqueName: '2' }
      ];

      await SharedUser.bulkCreate(data);

      const users = await SharedUser.findAll({ order: ['id'] });
      expect(users.length).to.equal(2);
      expect(users[0].username).to.equal('Peter');
      expect(parseInt(+users[0].createdAt / 5000, 10)).to.be.closeTo(parseInt(+new Date() / 5000, 10), 1.5);
      expect(users[1].username).to.equal('Paul');
      expect(parseInt(+users[1].createdAt / 5000, 10)).to.be.closeTo(parseInt(+new Date() / 5000, 10), 1.5);
    });

    it('emits an error when validate is set to true', async () => {
      const Tasks = sequelize.define('Task', {
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        code: {
          type: Sequelize.STRING,
          validate: {
            len: [3, 10]
          }
        }
      });

      await Tasks.sync({ force: true });

      const aggregate = await Support.expectRejection(
        Tasks.bulkCreate([{ name: 'foo', code: '123' }, { code: '1234' }, { name: 'bar', code: '1' }], {
          validate: true
        })
      );

      const expectedValidationError = 'Validation len on code failed';
      const expectedNotNullError = 'notNull Violation: Task.name cannot be null';

      expect(aggregate).to.be.instanceof(AggregateError);
      const messages = aggregate.errors.map((err) => err.message).join('\n');
      expect(messages).to.include(expectedValidationError).and.to.include(expectedNotNullError);
      expect(aggregate.errors).to.have.length(2);

      const e0name0 = aggregate.errors[0].errors.get('name')[0];

      expect(aggregate.errors[0].record.code).to.equal('1234');
      expect(e0name0.type || e0name0.origin).to.equal('notNull Violation');

      expect(aggregate.errors[1].record.name).to.equal('bar');
      expect(aggregate.errors[1].record.code).to.equal('1');
      expect(aggregate.errors[1].errors.get('code')[0].message).to.equal(expectedValidationError);
    });

    it("doesn't emit an error when validate is set to true but our selectedValues are fine", async () => {
      const Tasks = sequelize.define('Task', {
        name: {
          type: Sequelize.STRING,
          validate: {
            notEmpty: true
          }
        },
        code: {
          type: Sequelize.STRING,
          validate: {
            len: [3, 10]
          }
        }
      });

      await Tasks.sync({ force: true });
      await Tasks.bulkCreate([{ name: 'foo', code: '123' }, { code: '1234' }], { fields: ['code'], validate: true });
    });

    it('should allow blank arrays (return immediatly)', async () => {
      const Worker = sequelize.define('Worker', {});

      await Worker.sync();

      const workers = await Worker.bulkCreate([]);
      expect(workers).to.be.ok;
      expect(workers.length).to.equal(0);
    });

    it('should allow blank creates (with timestamps: false)', async () => {
      const Worker = sequelize.define('Worker', {}, { timestamps: false });

      await Worker.sync();

      const workers = await Worker.bulkCreate([{}, {}]);
      expect(workers).to.be.ok;
    });

    it('should allow autoincremented attributes to be set', async () => {
      const Worker = sequelize.define('Worker', {}, { timestamps: false });

      await Worker.sync();
      await Worker.bulkCreate([{ id: 5 }, { id: 10 }]);

      const workers = await Worker.findAll({ order: [['id', 'ASC']] });
      expect(workers[0].id).to.equal(5);
      expect(workers[1].id).to.equal(10);
    });

    it('should support schemas', async () => {
      const Dummy = sequelize.define(
        'Dummy',
        {
          foo: DataTypes.STRING,
          bar: DataTypes.STRING
        },
        {
          schema: 'space1',
          tableName: 'Dummy'
        }
      );

      await sequelize.dropAllSchemas();
      await sequelize.createSchema('space1');
      await Dummy.sync({ force: true });

      await Dummy.bulkCreate([
        { foo: 'a', bar: 'b' },
        { foo: 'c', bar: 'd' }
      ]);
    });

    if (current.dialect.supports.ignoreDuplicates || current.dialect.supports.onConflictDoNothing) {
      it('should support the ignoreDuplicates option', async () => {
        const data = [
          { uniqueName: 'Peter', secretValue: '42' },
          { uniqueName: 'Paul', secretValue: '23' }
        ];

        await SharedUser.bulkCreate(data, { fields: ['uniqueName', 'secretValue'] });

        data.push({ uniqueName: 'Michael', secretValue: '26' });

        await SharedUser.bulkCreate(data, { fields: ['uniqueName', 'secretValue'], ignoreDuplicates: true });

        const users = await SharedUser.findAll({ order: ['id'] });
        expect(users.length).to.equal(3);
        expect(users[0].uniqueName).to.equal('Peter');
        expect(users[0].secretValue).to.equal('42');
        expect(users[1].uniqueName).to.equal('Paul');
        expect(users[1].secretValue).to.equal('23');
        expect(users[2].uniqueName).to.equal('Michael');
        expect(users[2].secretValue).to.equal('26');
      });
    }

    if (current.dialect.supports.updateOnDuplicate) {
      it('should support the updateOnDuplicate option', async () => {
        const data = [
          { uniqueName: 'Peter', secretValue: '42' },
          { uniqueName: 'Paul', secretValue: '23' }
        ];

        await SharedUser.bulkCreate(data, {
          fields: ['uniqueName', 'secretValue'],
          updateOnDuplicate: ['secretValue']
        });

        const new_data = [
          { uniqueName: 'Peter', secretValue: '43' },
          { uniqueName: 'Paul', secretValue: '24' },
          { uniqueName: 'Michael', secretValue: '26' }
        ];

        await SharedUser.bulkCreate(new_data, {
          fields: ['uniqueName', 'secretValue'],
          updateOnDuplicate: ['secretValue']
        });

        const users = await SharedUser.findAll({ order: ['id'] });
        expect(users.length).to.equal(3);
        expect(users[0].uniqueName).to.equal('Peter');
        expect(users[0].secretValue).to.equal('43');
        expect(users[1].uniqueName).to.equal('Paul');
        expect(users[1].secretValue).to.equal('24');
        expect(users[2].uniqueName).to.equal('Michael');
        expect(users[2].secretValue).to.equal('26');
      });
    }

    if (current.dialect.supports.returnValues) {
      describe('return values', () => {
        it('should make the auto incremented values available on the returned instances', async () => {
          const User = sequelize.define('user', {});

          await User.sync({ force: true });

          const users = await User.bulkCreate([{}, {}, {}], {
            returning: true
          });

          const actualUsers = await User.findAll({ order: ['id'] });

          expect(users.length).to.eql(actualUsers.length);
          users.forEach((user, i) => {
            expect(user.get('id')).to.be.ok;
            expect(user.get('id'))
              .to.equal(actualUsers[i].get('id'))
              .and.to.equal(i + 1);
          });
        });

        it('should make the auto incremented values available on the returned instances with custom fields', async () => {
          const User = sequelize.define('user', {
            maId: {
              type: DataTypes.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              field: 'yo_id'
            }
          });

          await User.sync({ force: true });

          const users = await User.bulkCreate([{}, {}, {}], {
            returning: true
          });

          const actualUsers = await User.findAll({ order: ['maId'] });

          expect(users.length).to.eql(actualUsers.length);
          users.forEach((user, i) => {
            expect(user.get('maId')).to.be.ok;
            expect(user.get('maId'))
              .to.equal(actualUsers[i].get('maId'))
              .and.to.equal(i + 1);
          });
        });
      });
    }

    describe('enums', () => {
      it('correctly restores enum values', async () => {
        const Item = sequelize.define('Item', {
          state: { type: Sequelize.ENUM, values: ['available', 'in_cart', 'shipped'] },
          name: Sequelize.STRING
        });

        await Item.sync({ force: true });

        await Item.bulkCreate([
          { state: 'in_cart', name: 'A' },
          { state: 'available', name: 'B' }
        ]);

        const item = await Item.findOne({ where: { state: 'available' } });
        expect(item.name).to.equal('B');
      });
    });

    it('should properly map field names to attribute names', async () => {
      const Maya = sequelize.define('Maya', {
        name: Sequelize.STRING,
        secret: {
          field: 'secret_given',
          type: Sequelize.STRING
        },
        createdAt: {
          field: 'created_at',
          type: Sequelize.DATE
        },
        updatedAt: {
          field: 'updated_at',
          type: Sequelize.DATE
        }
      });

      const M1 = { id: 1, name: 'Prathma Maya', secret: 'You are on list #1' };
      const M2 = { id: 2, name: 'Dwitiya Maya', secret: 'You are on list #2' };

      await Maya.sync({ force: true });

      const created = await Maya.create(M1);
      expect(created.createdAt).to.be.ok;
      expect(created.id).to.be.eql(M1.id);
      expect(created.name).to.be.eql(M1.name);
      expect(created.secret).to.be.eql(M1.secret);

      const [m] = await Maya.bulkCreate([M2]);

      // only attributes are returned, no fields are mixed
      expect(m.createdAt).to.be.ok;
      expect(m.created_at).to.not.exist;
      expect(m.secret_given).to.not.exist;
      expect(m.get('secret_given')).to.be.undefined;
      expect(m.get('created_at')).to.be.undefined;

      // values look fine
      expect(m.id).to.be.eql(M2.id);
      expect(m.name).to.be.eql(M2.name);
      expect(m.secret).to.be.eql(M2.secret);
    });

    describe('handles auto increment values', () => {
      it('should return auto increment primary key values', async () => {
        const Maya = sequelize.define('Maya', {});

        const M1 = {};
        const M2 = {};

        await Maya.sync({ force: true });

        const ms = await Maya.bulkCreate([M1, M2], { returning: true });
        expect(ms[0].id).to.be.eql(1);
        expect(ms[1].id).to.be.eql(2);
      });

      it('should return supplied values on primary keys', async () => {
        const User = sequelize.define('user', {});

        await User.sync({ force: true });

        const users = await User.bulkCreate([{ id: 1 }, { id: 2 }, { id: 3 }], { returning: true });
        const actualUsers = await User.findAll({ order: [['id', 'ASC']] });

        expect(users.length).to.eql(actualUsers.length);

        expect(users[0].get('id')).to.equal(1).and.to.equal(actualUsers[0].get('id'));
        expect(users[1].get('id')).to.equal(2).and.to.equal(actualUsers[1].get('id'));
        expect(users[2].get('id')).to.equal(3).and.to.equal(actualUsers[2].get('id'));
      });

      it('should return supplied values on primary keys when some instances already exists', async () => {
        const User = sequelize.define('user', {});

        await User.sync({ force: true });
        await User.bulkCreate([{ id: 1 }, { id: 3 }]);

        const users = await User.bulkCreate([{ id: 2 }, { id: 4 }, { id: 5 }], { returning: true });
        expect(users.length).to.eql(3);

        expect(users[0].get('id')).to.equal(2);
        expect(users[1].get('id')).to.equal(4);
        expect(users[2].get('id')).to.equal(5);
      });
    });
  });
});
