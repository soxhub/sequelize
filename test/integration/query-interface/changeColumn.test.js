import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

let count = 0;
function log() {
  // sqlite fires a lot more querys than the other dbs. this is just a simple hack, since i'm lazy

  count++;
}

describe(Support.getTestDialectTeaser('QueryInterface'), () => {
  let queryInterface;

  beforeEach(() => {
    current.options.quoteIdenifiers = true;
    queryInterface = current.getQueryInterface();
  });

  afterEach(() => {
    return current.dropAllSchemas();
  });

  describe('changeColumn', () => {
    it('should support schemas', async () => {
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
          currency: DataTypes.INTEGER
        }
      );

      await queryInterface.changeColumn(
        {
          tableName: 'users',
          schema: 'archive'
        },
        'currency',
        {
          type: DataTypes.FLOAT
        }
      );

      const table = await queryInterface.describeTable({
        tableName: 'users',
        schema: 'archive'
      });

      expect(table.currency.type).to.equal('DOUBLE PRECISION');
    });

    it('should change columns', async () => {
      await queryInterface.createTable(
        {
          tableName: 'users'
        },
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          currency: DataTypes.INTEGER
        }
      );

      await queryInterface.changeColumn('users', 'currency', {
        type: DataTypes.FLOAT,
        allowNull: true
      });

      const table = await queryInterface.describeTable({
        tableName: 'users'
      });

      expect(table.currency.type).to.equal('DOUBLE PRECISION');
    });

    // MSSQL doesn't support using a modified column in a check constraint.
    // https://docs.microsoft.com/en-us/sql/t-sql/statements/alter-table-transact-sql

    it('should work with enums', async () => {
      await queryInterface.createTable(
        {
          tableName: 'users'
        },
        {
          firstName: DataTypes.STRING
        }
      );

      await queryInterface.changeColumn('users', 'firstName', {
        type: DataTypes.ENUM(['value1', 'value2', 'value3'])
      });
    });

    it('should work with enums with schemas', async () => {
      await current.createSchema('archive');

      await queryInterface.createTable(
        {
          tableName: 'users',
          schema: 'archive'
        },
        {
          firstName: DataTypes.STRING
        }
      );

      await queryInterface.changeColumn(
        {
          tableName: 'users',
          schema: 'archive'
        },
        'firstName',
        {
          type: DataTypes.ENUM(['value1', 'value2', 'value3'])
        }
      );
    });

    //SQlite navitely doesnt support ALTER Foreign key

    describe('should support foreign keys', () => {
      beforeEach(async () => {
        await queryInterface.createTable('users', {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          level_id: {
            type: DataTypes.INTEGER,
            allowNull: false
          }
        });

        await queryInterface.createTable('level', {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          }
        });
      });

      it('able to change column to foreign key', async () => {
        await queryInterface.changeColumn(
          'users',
          'level_id',
          {
            type: DataTypes.INTEGER,
            references: {
              model: 'level',
              key: 'id'
            },
            onUpdate: 'cascade',
            onDelete: 'cascade'
          },
          { logging: log }
        );

        expect(count).to.be.equal(1);
        count = 0;
      });
    });
  });
});
