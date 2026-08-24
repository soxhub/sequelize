import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('QueryInterface'), () => {
  let queryInterface;

  beforeEach(() => {
    current.options.quoteIdenifiers = true;
    queryInterface = current.getQueryInterface();
  });

  afterEach(() => {
    return current.dropAllSchemas();
  });

  describe('removeColumn', () => {
    describe('(without a schema)', () => {
      beforeEach(() => {
        return queryInterface.createTable('users', {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          firstName: {
            type: DataTypes.STRING,
            defaultValue: 'Someone'
          },
          lastName: {
            type: DataTypes.STRING
          },
          manager: {
            type: DataTypes.INTEGER,
            references: {
              model: 'users',
              key: 'id'
            }
          },
          email: {
            type: DataTypes.STRING,
            unique: true
          }
        });
      });

      it('should be able to remove a column with a default value', async () => {
        await queryInterface.removeColumn('users', 'firstName');

        const table = await queryInterface.describeTable('users');
        expect(table).to.not.have.property('firstName');
      });

      it('should be able to remove a column without default value', async () => {
        await queryInterface.removeColumn('users', 'lastName');

        const table = await queryInterface.describeTable('users');
        expect(table).to.not.have.property('lastName');
      });

      it('should be able to remove a column with a foreign key constraint', async () => {
        await queryInterface.removeColumn('users', 'manager');

        const table = await queryInterface.describeTable('users');
        expect(table).to.not.have.property('manager');
      });

      it('should be able to remove a column with primaryKey', async () => {
        await queryInterface.removeColumn('users', 'manager');

        const withoutManager = await queryInterface.describeTable('users');
        expect(withoutManager).to.not.have.property('manager');

        await queryInterface.removeColumn('users', 'id');

        const withoutId = await queryInterface.describeTable('users');
        expect(withoutId).to.not.have.property('id');
      });

      // From MSSQL documentation on ALTER COLUMN:
      //    The modified column cannot be any one of the following:
      //      - Used in a CHECK or UNIQUE constraint.
      // https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-table-transact-sql#arguments

      it('should be able to remove a column with unique contraint', async () => {
        await queryInterface.removeColumn('users', 'email');

        const table = await queryInterface.describeTable('users');
        expect(table).to.not.have.property('email');
      });
    });

    describe('(with a schema)', () => {
      beforeEach(async () => {
        await current.createSchema('archive');

        await queryInterface.createTable(
          {
            tableName: 'users',
            schema: 'archive'
          },
          {
            id: {
              type: DataTypes.INTEGER,
              primaryKey: true,
              autoIncrement: true
            },
            firstName: {
              type: DataTypes.STRING,
              defaultValue: 'Someone'
            },
            lastName: {
              type: DataTypes.STRING
            },
            email: {
              type: DataTypes.STRING,
              unique: true
            }
          }
        );
      });

      it('should be able to remove a column with a default value', async () => {
        await queryInterface.removeColumn(
          {
            tableName: 'users',
            schema: 'archive'
          },
          'firstName'
        );

        const table = await queryInterface.describeTable({
          tableName: 'users',
          schema: 'archive'
        });

        expect(table).to.not.have.property('firstName');
      });

      it('should be able to remove a column without default value', async () => {
        await queryInterface.removeColumn(
          {
            tableName: 'users',
            schema: 'archive'
          },
          'lastName'
        );

        const table = await queryInterface.describeTable({
          tableName: 'users',
          schema: 'archive'
        });

        expect(table).to.not.have.property('lastName');
      });

      it('should be able to remove a column with primaryKey', async () => {
        await queryInterface.removeColumn(
          {
            tableName: 'users',
            schema: 'archive'
          },
          'id'
        );

        const table = await queryInterface.describeTable({
          tableName: 'users',
          schema: 'archive'
        });

        expect(table).to.not.have.property('id');
      });

      // From MSSQL documentation on ALTER COLUMN:
      //    The modified column cannot be any one of the following:
      //      - Used in a CHECK or UNIQUE constraint.
      // https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-table-transact-sql#arguments

      it('should be able to remove a column with unique contraint', async () => {
        await queryInterface.removeColumn(
          {
            tableName: 'users',
            schema: 'archive'
          },
          'email'
        );

        const table = await queryInterface.describeTable({
          tableName: 'users',
          schema: 'archive'
        });

        expect(table).to.not.have.property('email');
      });
    });
  });
});
