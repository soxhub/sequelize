import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import sinon from 'sinon';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let clock, SharedUser, ModelWithFieldPK;

  beforeAll(() => {
    clock = sinon.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(() => {
    clock.restore();
  });

  beforeEach(() => {
    clock.reset();
  });

  beforeEach(() => {
    SharedUser = current.define('user', {
      username: DataTypes.STRING,
      foo: {
        unique: 'foobar',
        type: DataTypes.STRING
      },
      bar: {
        unique: 'foobar',
        type: DataTypes.INTEGER
      },
      baz: {
        type: DataTypes.STRING,
        field: 'zab',
        defaultValue: 'BAZ_DEFAULT_VALUE'
      },
      blob: DataTypes.BLOB
    });

    ModelWithFieldPK = current.define('ModelWithFieldPK', {
      userId: {
        field: 'user_id',
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      foo: {
        type: DataTypes.STRING,
        unique: true
      }
    });

    return current.sync({ force: true });
  });

  if (current.dialect.supports.upserts) {
    describe('upsert', () => {
      it('works with upsert on id', async () => {
        const created = await SharedUser.upsert({ id: 42, username: 'john' });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await SharedUser.upsert({ id: 42, username: 'doe' });
        expect(updated).not.to.be.ok;

        const user = await SharedUser.findByPk(42);
        expect(user.createdAt).to.be.ok;
        expect(user.username).to.equal('doe');
        expect(user.updatedAt).to.be.afterTime(user.createdAt);
      });

      it('works with upsert on a composite key', async () => {
        const created = await SharedUser.upsert({ foo: 'baz', bar: 19, username: 'john' });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await SharedUser.upsert({ foo: 'baz', bar: 19, username: 'doe' });
        expect(updated).not.to.be.ok;

        const user = await SharedUser.findOne({ where: { foo: 'baz', bar: 19 } });
        expect(user.createdAt).to.be.ok;
        expect(user.username).to.equal('doe');
        expect(user.updatedAt).to.be.afterTime(user.createdAt);
      });

      it('should work with UUIDs wth default values', async () => {
        const User = current.define('User', {
          id: {
            primaryKey: true,
            allowNull: false,
            unique: true,
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4
          },

          name: {
            type: Sequelize.STRING
          }
        });

        await User.sync({ force: true });
        await User.upsert({ name: 'John Doe' });
      });

      it('works with upsert on a composite primary key', async () => {
        const User = current.define('user', {
          a: {
            type: Sequelize.STRING,
            primaryKey: true
          },
          b: {
            type: Sequelize.STRING,
            primaryKey: true
          },
          username: DataTypes.STRING
        });

        await User.sync({ force: true });

        const [created1, created2] = await Promise.all([
          // Create two users
          User.upsert({ a: 'a', b: 'b', username: 'john' }),
          User.upsert({ a: 'a', b: 'a', username: 'curt' })
        ]);

        expect(created1).to.be.ok;
        expect(created2).to.be.ok;

        clock.tick(1000);

        // Update the first one
        const updated = await User.upsert({ a: 'a', b: 'b', username: 'doe' });
        expect(updated).not.to.be.ok;

        const user1 = await User.findOne({ where: { a: 'a', b: 'b' } });
        expect(user1.createdAt).to.be.ok;
        expect(user1.username).to.equal('doe');
        expect(user1.updatedAt).to.be.afterTime(user1.createdAt);

        const user2 = await User.findOne({ where: { a: 'a', b: 'a' } });
        // The second one should not be updated
        expect(user2.createdAt).to.be.ok;
        expect(user2.username).to.equal('curt');
        expect(user2.updatedAt).to.equalTime(user2.createdAt);
      });

      it('supports validations', () => {
        const User = current.define('user', {
          email: {
            type: Sequelize.STRING,
            validate: {
              isEmail: true
            }
          }
        });

        return expect(User.upsert({ email: 'notanemail' })).rejects.toThrow(current.ValidationError);
      });

      it('supports skipping validations', async () => {
        const User = current.define('user', {
          email: {
            type: Sequelize.STRING,
            validate: {
              isEmail: true
            }
          }
        });

        const options = { validate: false };

        await User.sync({ force: true });

        const created = await User.upsert({ id: 1, email: 'notanemail' }, options);
        expect(created).to.be.ok;
      });

      it('works with BLOBs', async () => {
        const created = await SharedUser.upsert({ id: 42, username: 'john', blob: Buffer.from('kaj') });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await SharedUser.upsert({ id: 42, username: 'doe', blob: Buffer.from('andrea') });
        expect(updated).not.to.be.ok;

        const user = await SharedUser.findByPk(42);
        expect(user.createdAt).to.be.ok;
        expect(user.username).to.equal('doe');
        expect(user.blob.toString()).to.equal('andrea');
        expect(user.updatedAt).to.be.afterTime(user.createdAt);
      });

      it('works with .field', async () => {
        const created = await SharedUser.upsert({ id: 42, baz: 'foo' });
        expect(created).to.be.ok;

        const updated = await SharedUser.upsert({ id: 42, baz: 'oof' });
        expect(updated).not.to.be.ok;

        const user = await SharedUser.findByPk(42);
        expect(user.baz).to.equal('oof');
      });

      it('works with primary key using .field', async () => {
        const created = await ModelWithFieldPK.upsert({ userId: 42, foo: 'first' });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await ModelWithFieldPK.upsert({ userId: 42, foo: 'second' });
        expect(updated).not.to.be.ok;

        const instance = await ModelWithFieldPK.findOne({ where: { userId: 42 } });
        expect(instance.foo).to.equal('second');
      });

      it('works with database functions', async () => {
        const created = await SharedUser.upsert({
          id: 42,
          username: 'john',
          foo: current.fn('upper', 'mixedCase1')
        });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await SharedUser.upsert({
          id: 42,
          username: 'doe',
          foo: current.fn('upper', 'mixedCase2')
        });
        expect(updated).not.to.be.ok;

        const user = await SharedUser.findByPk(42);
        expect(user.createdAt).to.be.ok;
        expect(user.username).to.equal('doe');
        expect(user.foo).to.equal('MIXEDCASE2');
      });

      it('does not overwrite createdAt time on update', async () => {
        await SharedUser.create({ id: 42, username: 'john' });

        const original = await SharedUser.findByPk(42);
        const originalCreatedAt = original.createdAt;
        const originalUpdatedAt = original.updatedAt;

        clock.tick(5000);
        await SharedUser.upsert({ id: 42, username: 'doe' });

        const user = await SharedUser.findByPk(42);
        expect(user.updatedAt).to.be.gt(originalUpdatedAt);
        expect(user.createdAt).to.deep.equal(originalCreatedAt);
      });

      it('does not overwrite createdAt when supplied as an explicit insert value when using fields', async () => {
        const originalCreatedAt = new Date('2010-01-01T12:00:00.000Z');

        await SharedUser.upsert(
          { id: 42, username: 'john', createdAt: originalCreatedAt },
          { fields: ['id', 'username'] }
        );

        const user = await SharedUser.findByPk(42);
        expect(user.createdAt).to.deep.equal(originalCreatedAt);
      });

      it('falls back to a noop if no update values are found in the upsert data', async () => {
        const User = current.define(
          'user',
          {
            username: DataTypes.STRING,
            email: {
              type: DataTypes.STRING,
              field: 'email_address',
              defaultValue: 'xxx@yyy.zzz'
            }
          },
          { timestamps: false }
        );

        await User.sync({ force: true });

        await User.upsert({ id: 42, username: 'jack' }, { fields: ['email'] });
        await User.upsert({ id: 42, username: 'jill' }, { fields: ['email'] });

        const user = await User.findByPk(42);
        expect(user).to.be.ok;
        // 'username' is outside `fields`, so the conflicting second upsert must not carry it over.
        expect(user.username).to.equal('jack');
      });

      it('does not update using default values', async () => {
        await SharedUser.create({ id: 42, username: 'john', baz: 'new baz value' });

        const original = await SharedUser.findByPk(42);
        // 'username' should be 'john' since it was set
        expect(original.username).to.equal('john');
        // 'baz' should be 'new baz value' since it was set
        expect(original.baz).to.equal('new baz value');

        await SharedUser.upsert({ id: 42, username: 'doe' });

        const user = await SharedUser.findByPk(42);
        // 'username' was updated
        expect(user.username).to.equal('doe');
        // 'baz' should still be 'new baz value' since it was not updated
        expect(user.baz).to.equal('new baz value');
      });

      it('does not update when setting current values', async () => {
        await SharedUser.create({ id: 42, username: 'john' });

        const user = await SharedUser.findByPk(42);
        const created = await SharedUser.upsert({ id: user.id, username: user.username });

        // After set node-mysql flags = '-FOUND_ROWS' in connection of mysql,
        // result from upsert should be false when upsert a row to its current value
        // https://dev.mysql.com/doc/refman/5.7/en/insert-on-duplicate.html
        expect(created).to.equal(false);
      });

      it('Works when two separate uniqueKeys are passed', async () => {
        const User = current.define('User', {
          username: {
            type: Sequelize.STRING,
            unique: true
          },
          email: {
            type: Sequelize.STRING,
            unique: true
          },
          city: {
            type: Sequelize.STRING
          }
        });
        await User.sync({ force: true });

        const created = await User.upsert({ username: 'user1', email: 'user1@domain.ext', city: 'City' });
        expect(created).to.be.ok;

        clock.tick(1000);

        const updated = await User.upsert({ username: 'user1', email: 'user1@domain.ext', city: 'New City' });
        expect(updated).not.to.be.ok;

        clock.tick(1000);

        const user = await User.findOne({ where: { username: 'user1', email: 'user1@domain.ext' } });
        expect(user.createdAt).to.be.ok;
        expect(user.city).to.equal('New City');
        expect(user.updatedAt).to.be.afterTime(user.createdAt);
      });

      it('works when indexes are created via indexes array', async () => {
        const User = current.define(
          'User',
          {
            username: Sequelize.STRING,
            email: Sequelize.STRING,
            city: Sequelize.STRING
          },
          {
            indexes: [
              {
                unique: true,
                fields: ['username']
              },
              {
                unique: true,
                fields: ['email']
              }
            ]
          }
        );

        await User.sync({ force: true });

        const created = await User.upsert({ username: 'user1', email: 'user1@domain.ext', city: 'City' });
        expect(created).to.be.ok;

        const updated = await User.upsert({ username: 'user1', email: 'user1@domain.ext', city: 'New City' });
        expect(updated).not.to.be.ok;

        const user = await User.findOne({ where: { username: 'user1', email: 'user1@domain.ext' } });
        expect(user.createdAt).to.be.ok;
        expect(user.city).to.equal('New City');
      });

      it('works when composite indexes are created via indexes array', async () => {
        const User = current.define(
          'User',
          {
            name: DataTypes.STRING,
            address: DataTypes.STRING,
            city: DataTypes.STRING
          },
          {
            indexes: [
              {
                unique: 'users_name_address',
                fields: ['name', 'address']
              }
            ]
          }
        );

        await User.sync({ force: true });

        const created = await User.upsert({ name: 'user1', address: 'address', city: 'City' });
        expect(created).to.be.ok;

        const updated = await User.upsert({ name: 'user1', address: 'address', city: 'New City' });
        expect(updated).not.to.be.ok;

        const user = await User.findOne({ where: { name: 'user1', address: 'address' } });
        expect(user.createdAt).to.be.ok;
        expect(user.city).to.equal('New City');
      });

      it('works when deletedAt is Infinity and part of primary key', async () => {
        const User = current.define(
          'User',
          {
            name: {
              type: DataTypes.STRING,
              primaryKey: true
            },
            address: DataTypes.STRING,
            deletedAt: {
              type: DataTypes.DATE,
              primaryKey: true,
              allowNull: false,
              defaultValue: Infinity
            }
          },
          {
            paranoid: true
          }
        );

        await User.sync({ force: true });

        await Promise.all([
          User.create({ name: 'user1' }),
          User.create({ name: 'user2', deletedAt: Infinity }),

          // this record is soft deleted
          User.create({ name: 'user3', deletedAt: -Infinity })
        ]);

        await User.upsert({ name: 'user1', address: 'address' });

        const users = await User.findAll({
          where: { address: null }
        });

        expect(users).to.have.lengthOf(2);
      });

      describe('conflictFields', () => {
        let Memberships;

        beforeEach(async () => {
          Memberships = current.define('memberships', {
            user_id: DataTypes.INTEGER,
            group_id: DataTypes.INTEGER,
            permissions: DataTypes.ENUM('admin', 'member')
          });

          await Memberships.sync({ force: true });

          await current.getQueryInterface().addConstraint('memberships', ['user_id', 'group_id'], { type: 'unique' });
        });

        it('should insert with no other rows', async () => {
          const [newRow] = await Memberships.upsert(
            { user_id: 1, group_id: 1, permissions: 'member' },
            { returning: true, conflictFields: ['user_id', 'group_id'] }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.permissions).to.eq('member');
        });

        it('should use conflictFields as upsertKeys', async () => {
          const [originalMembership] = await Memberships.upsert(
            { user_id: 1, group_id: 1, permissions: 'member' },
            { returning: true, conflictFields: ['user_id', 'group_id'] }
          );

          expect(originalMembership).to.not.eq(null);
          expect(originalMembership.permissions).to.eq('member');

          const [updatedMembership] = await Memberships.upsert(
            { user_id: 1, group_id: 1, permissions: 'admin' },
            { returning: true, conflictFields: ['user_id', 'group_id'] }
          );

          expect(updatedMembership).to.not.eq(null);
          expect(updatedMembership.permissions).to.eq('admin');
          expect(updatedMembership.id).to.eq(originalMembership.id);

          const [otherMembership] = await Memberships.upsert(
            { user_id: 2, group_id: 1, permissions: 'member' },
            { returning: true, conflictFields: ['user_id', 'group_id'] }
          );

          expect(otherMembership).to.not.eq(null);
          expect(otherMembership.permissions).to.eq('member');
          expect(otherMembership.id).to.not.eq(originalMembership.id);
        });

        it('should map conflictFields to column names', async () => {
          const Employees = current.define('employees', {
            employeeId: {
              type: DataTypes.INTEGER,
              field: 'Employee_ID'
            },
            departmentId: {
              type: DataTypes.INTEGER,
              field: 'Department_ID'
            },
            position: DataTypes.ENUM('junior', 'senior')
          });

          await Employees.sync({ force: true });

          await current
            .getQueryInterface()
            .addConstraint('employees', ['Employee_ID', 'Department_ID'], { type: 'unique' });

          const [originalEmployee] = await Employees.upsert(
            { employeeId: 1, departmentId: 1, position: 'junior' },
            { returning: true, conflictFields: ['employeeId', 'departmentId'] }
          );

          expect(originalEmployee).to.not.eq(null);
          expect(originalEmployee.position).to.eq('junior');

          const [updatedEmployee] = await Employees.upsert(
            { employeeId: 1, departmentId: 1, position: 'senior' },
            { returning: true, conflictFields: ['employeeId', 'departmentId'] }
          );

          expect(updatedEmployee).to.not.eq(null);
          expect(updatedEmployee.position).to.eq('senior');
          expect(updatedEmployee.id).to.eq(originalEmployee.id);

          const [otherEmployee] = await Employees.upsert(
            { employeeId: 2, departmentId: 1, position: 'senior' },
            { returning: true, conflictFields: ['employeeId', 'departmentId'] }
          );

          expect(otherEmployee).to.not.eq(null);
          expect(otherEmployee.position).to.eq('senior');
          expect(otherEmployee.id).to.not.eq(originalEmployee.id);
        });
      });

      describe('conflictWhere', () => {
        let PartiallyUniqueUser;

        beforeEach(async () => {
          PartiallyUniqueUser = current.define(
            'users',
            {
              name: DataTypes.STRING,
              bio: DataTypes.STRING,
              isUnique: DataTypes.BOOLEAN
            },
            {
              indexes: [
                {
                  unique: true,
                  fields: ['name'],
                  where: { isUnique: true }
                }
              ]
            }
          );

          await PartiallyUniqueUser.sync({ force: true });
        });

        it('should insert with no other rows', async () => {
          const [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: true },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
        });

        it('should update with another unique user', async () => {
          let [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: true, bio: 'before' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
          expect(newRow.bio).to.eq('before');

          [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: true, bio: 'after' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
          expect(newRow.bio).to.eq('after');

          expect(await PartiallyUniqueUser.count()).to.eq(1);
        });

        it('allows both unique and non-unique users with the same name', async () => {
          let [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: true, bio: 'first' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
          expect(newRow.bio).to.eq('first');

          [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: false, bio: 'second' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
          expect(newRow.bio).to.eq('second');

          expect(await PartiallyUniqueUser.count()).to.eq(2);
        });

        it('allows for multiple unique users with different names', async () => {
          let [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'John', isUnique: true, bio: 'first' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('John');
          expect(newRow.bio).to.eq('first');

          [newRow] = await PartiallyUniqueUser.upsert(
            { name: 'Bob', isUnique: false, bio: 'second' },
            { returning: true, conflictWhere: { isUnique: true } }
          );

          expect(newRow).to.not.eq(null);
          expect(newRow.name).to.eq('Bob');
          expect(newRow.bio).to.eq('second');

          expect(await PartiallyUniqueUser.count()).to.eq(2);
        });
      });

      if (current.dialect.supports.returnValues) {
        describe('with returning option', () => {
          it('works with upsert on id', async () => {
            const [inserted, wasCreated] = await SharedUser.upsert({ id: 42, username: 'john' }, { returning: true });
            expect(inserted.get('id')).to.equal(42);
            expect(inserted.get('username')).to.equal('john');
            expect(wasCreated).to.be.true;

            const [user, created] = await SharedUser.upsert({ id: 42, username: 'doe' }, { returning: true });
            expect(user.get('id')).to.equal(42);
            expect(user.get('username')).to.equal('doe');
            expect(created).to.be.false;
          });

          it('works for table with custom primary key field', async () => {
            const User = current.define('User', {
              id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                field: 'id_the_primary'
              },
              username: {
                type: DataTypes.STRING
              }
            });

            await User.sync({ force: true });

            const [inserted, wasCreated] = await User.upsert({ id: 42, username: 'john' }, { returning: true });
            expect(inserted.get('id')).to.equal(42);
            expect(inserted.get('username')).to.equal('john');
            expect(wasCreated).to.be.true;

            const [user, created] = await User.upsert({ id: 42, username: 'doe' }, { returning: true });
            expect(user.get('id')).to.equal(42);
            expect(user.get('username')).to.equal('doe');
            expect(created).to.be.false;
          });

          it('should return default value set by the database', async () => {
            const User = current.define('User', {
              name: { type: DataTypes.STRING, primaryKey: true },
              code: { type: DataTypes.INTEGER, defaultValue: Sequelize.literal(2020) }
            });

            await User.sync({ force: true });

            const [user, created] = await User.upsert({ name: 'Test default value' }, { returning: true });

            expect(user.name).to.equal('Test default value');
            expect(user.code).to.equal(2020);
            // Upstream reports null here for postgres; the RETURNING clause carries `xmax = 0`, so
            // this fork can answer it properly.
            expect(created).to.be.true;
          });

          it('works for non incrementing primaryKey', async () => {
            const User = current.define('User', {
              id: {
                type: DataTypes.STRING,
                primaryKey: true,
                field: 'id_the_primary'
              },
              username: {
                type: DataTypes.STRING
              }
            });

            await User.sync({ force: true });

            const [inserted, wasCreated] = await User.upsert({ id: 'surya', username: 'john' }, { returning: true });
            expect(inserted.get('id')).to.equal('surya');
            expect(inserted.get('username')).to.equal('john');
            expect(wasCreated).to.be.true;

            const [user, created] = await User.upsert({ id: 'surya', username: 'doe' }, { returning: true });
            expect(user.get('id')).to.equal('surya');
            expect(user.get('username')).to.equal('doe');
            expect(created).to.be.false;
          });
        });
      }
    });
  }
});
