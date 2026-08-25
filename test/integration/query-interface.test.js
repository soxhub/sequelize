import { describe, it, beforeEach, afterEach } from 'vitest';
import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import _ from 'lodash';

const Sequelize = Support.Sequelize;
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

  describe('renameTable', () => {
    it('should rename table', async () => {
      await queryInterface.createTable('myTestTable', {
        name: DataTypes.STRING
      });
      await queryInterface.renameTable('myTestTable', 'myTestTableNew');

      const tableNames = await queryInterface.showAllTables();

      expect(tableNames).to.contain('myTestTableNew');
      expect(tableNames).to.not.contain('myTestTable');
    });
  });

  describe('dropAllTables', () => {
    it('should drop all tables', async () => {
      const filterMSSQLDefault = (tableNames) => tableNames.filter((t) => t.tableName !== 'spt_values');

      await queryInterface.dropAllTables();

      // MSSQL include spt_values table which is system defined, hence cant be dropped
      const tableNames = await queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNames)).to.be.empty;

      await queryInterface.createTable('table', { name: DataTypes.STRING });

      const tableNamesAfterCreate = await queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNamesAfterCreate)).to.have.length(1);

      await queryInterface.dropAllTables();

      // MSSQL include spt_values table which is system defined, hence cant be dropped
      const tableNamesAfterDrop = await queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNamesAfterDrop)).to.be.empty;
    });

    it('should be able to skip given tables', async () => {
      await queryInterface.createTable('skipme', {
        name: DataTypes.STRING
      });
      await queryInterface.dropAllTables({ skip: ['skipme'] });

      const tableNames = await queryInterface.showAllTables();

      expect(tableNames).to.contain('skipme');
    });
  });

  describe('indexes', () => {
    beforeEach(async () => {
      await queryInterface.dropTable('Group');
      await queryInterface.createTable('Group', {
        username: DataTypes.STRING,
        isAdmin: DataTypes.BOOLEAN,
        from: DataTypes.STRING
      });
    });

    it('adds, reads and removes an index to the table', async () => {
      await queryInterface.addIndex('Group', ['username', 'isAdmin']);

      const indexes = await queryInterface.showIndex('Group');
      const indexColumns = _.uniq(
        indexes.map((index) => {
          return index.name;
        })
      );
      expect(indexColumns).to.include('group_username_is_admin');

      await queryInterface.removeIndex('Group', ['username', 'isAdmin']);

      const remainingIndexes = await queryInterface.showIndex('Group');
      const remainingIndexColumns = _.uniq(
        remainingIndexes.map((index) => {
          return index.name;
        })
      );
      expect(remainingIndexColumns).to.be.empty;
    });

    it('works with schemas', async () => {
      await current.createSchema('schema');
      await queryInterface.createTable(
        'table',
        {
          name: {
            type: DataTypes.STRING
          },
          isAdmin: {
            type: DataTypes.STRING
          }
        },
        {
          schema: 'schema'
        }
      );
      await queryInterface.addIndex(
        {
          schema: 'schema',
          tableName: 'table'
        },
        ['name', 'isAdmin'],
        null,
        'schema_table'
      );

      const indexes = await queryInterface.showIndex({
        schema: 'schema',
        tableName: 'table'
      });

      expect(indexes.length).to.eq(1);
      const index = indexes[0];
      expect(index.name).to.eq('table_name_is_admin');
    });

    it('does not fail on reserved keywords', () => {
      return queryInterface.addIndex('Group', ['from']);
    });
  });

  describe('describeTable', () => {
    it('reads the metadata of the table', async () => {
      const Users = current.define(
        '_Users',
        {
          username: DataTypes.STRING,
          city: {
            type: DataTypes.STRING,
            defaultValue: null
          },
          isAdmin: DataTypes.BOOLEAN,
          enumVals: DataTypes.ENUM('hello', 'world')
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });

      const metadata = await queryInterface.describeTable('_Users');
      const id = metadata.id;
      const username = metadata.username;
      const isAdmin = metadata.isAdmin;
      const enumVals = metadata.enumVals;

      expect(id.primaryKey).to.be.ok;

      expect(username.type).to.equal('CHARACTER VARYING(255)');
      expect(username.allowNull).to.be.true;
      expect(username.defaultValue).to.be.null;

      expect(isAdmin.type).to.equal('BOOLEAN');
      expect(isAdmin.allowNull).to.be.true;
      expect(isAdmin.defaultValue).to.be.null;

      expect(enumVals.special).to.be.instanceof(Array);
      expect(enumVals.special).to.have.length(2);
    });

    it('should correctly determine the primary key columns', async () => {
      const Country = current.define(
        '_Country',
        {
          code: { type: DataTypes.STRING, primaryKey: true },
          name: { type: DataTypes.STRING, allowNull: false }
        },
        { freezeTableName: true }
      );
      const Alumni = current.define(
        '_Alumni',
        {
          year: { type: DataTypes.INTEGER, primaryKey: true },
          num: { type: DataTypes.INTEGER, primaryKey: true },
          username: { type: DataTypes.STRING, allowNull: false, unique: true },
          dob: { type: DataTypes.DATEONLY, allowNull: false },
          dod: { type: DataTypes.DATEONLY, allowNull: true },
          city: { type: DataTypes.STRING, allowNull: false },
          ctrycod: { type: DataTypes.STRING, allowNull: false, references: { model: Country, key: 'code' } }
        },
        { freezeTableName: true }
      );

      await Country.sync({ force: true });

      const metacountry = await queryInterface.describeTable('_Country');
      expect(metacountry.code.primaryKey).to.eql(true);
      expect(metacountry.name.primaryKey).to.eql(false);

      await Alumni.sync({ force: true });

      const metalumni = await queryInterface.describeTable('_Alumni');
      expect(metalumni.year.primaryKey).to.eql(true);
      expect(metalumni.num.primaryKey).to.eql(true);
      expect(metalumni.username.primaryKey).to.eql(false);
      expect(metalumni.dob.primaryKey).to.eql(false);
      expect(metalumni.dod.primaryKey).to.eql(false);
      expect(metalumni.ctrycod.primaryKey).to.eql(false);
      expect(metalumni.city.primaryKey).to.eql(false);
    });
  });

  // FIXME: These tests should make assertions against the created table using describeTable
  describe('createTable', () => {
    it('should create a auto increment primary key', async () => {
      await queryInterface.createTable('TableWithPK', {
        table_id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });

      const results = await queryInterface.insert(null, 'TableWithPK', {}, { raw: true, returning: true, plain: true });
      const response = _.head(results);

      expect(response.table_id || (typeof response !== 'object' && response)).to.be.ok;
    });

    it('should work with enums (1)', () => {
      return queryInterface.createTable('SomeTable', {
        someEnum: DataTypes.ENUM('value1', 'value2', 'value3')
      });
    });

    it('should work with enums (2)', () => {
      return queryInterface.createTable('SomeTable', {
        someEnum: {
          type: DataTypes.ENUM,
          values: ['value1', 'value2', 'value3']
        }
      });
    });

    it('should work with enums (3)', () => {
      return queryInterface.createTable('SomeTable', {
        someEnum: {
          type: DataTypes.ENUM,
          values: ['value1', 'value2', 'value3'],
          field: 'otherName'
        }
      });
    });

    it('should work with enums (4)', async () => {
      await queryInterface.createSchema('archive');
      await queryInterface.createTable(
        'SomeTable',
        {
          someEnum: {
            type: DataTypes.ENUM,
            values: ['value1', 'value2', 'value3'],
            field: 'otherName'
          }
        },
        { schema: 'archive' }
      );
    });

    it('should work with schemas', async () => {
      await current.createSchema('hero');
      await queryInterface.createTable(
        'User',
        {
          name: {
            type: DataTypes.STRING
          }
        },
        {
          schema: 'hero'
        }
      );
    });
  });

  describe('renameColumn', () => {
    it('rename a simple column', async () => {
      const Users = current.define(
        '_Users',
        {
          username: DataTypes.STRING
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });
      await queryInterface.renameColumn('_Users', 'username', 'pseudo');

      const table = await queryInterface.describeTable('_Users');

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('works with schemas', async () => {
      await current.createSchema('archive');

      const Users = current.define(
        'User',
        {
          username: DataTypes.STRING
        },
        {
          tableName: 'Users',
          schema: 'archive'
        }
      );

      await Users.sync({ force: true });
      await queryInterface.renameColumn(
        {
          schema: 'archive',
          tableName: 'Users'
        },
        'username',
        'pseudo'
      );

      const table = await queryInterface.describeTable({
        schema: 'archive',
        tableName: 'Users'
      });

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('rename a column non-null without default value', async () => {
      const Users = current.define(
        '_Users',
        {
          username: {
            type: DataTypes.STRING,
            allowNull: false
          }
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });
      await queryInterface.renameColumn('_Users', 'username', 'pseudo');

      const table = await queryInterface.describeTable('_Users');

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('rename a boolean column non-null without default value', async () => {
      const Users = current.define(
        '_Users',
        {
          active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
          }
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });
      await queryInterface.renameColumn('_Users', 'active', 'enabled');

      const table = await queryInterface.describeTable('_Users');

      expect(table).to.have.property('enabled');
      expect(table).to.not.have.property('active');
    });

    it('renames a column primary key autoIncrement column', async () => {
      const Fruits = current.define(
        'Fruit',
        {
          fruitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
          }
        },
        { freezeTableName: true }
      );

      await Fruits.sync({ force: true });
      await queryInterface.renameColumn('Fruit', 'fruitId', 'fruit_id');

      const table = await queryInterface.describeTable('Fruit');

      expect(table).to.have.property('fruit_id');
      expect(table).to.not.have.property('fruitId');
    });

    it('shows a reasonable error message when column is missing', async () => {
      const Users = current.define(
        '_Users',
        {
          username: DataTypes.STRING
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });

      await expect(queryInterface.renameColumn('_Users', 'email', 'pseudo')).to.be.rejectedWith(
        "Table _Users doesn't have the column email"
      );
    });
  });

  describe('addColumn', () => {
    beforeEach(async () => {
      await current.createSchema('archive');
      await queryInterface.createTable('users', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
    });

    it('should be able to add a foreign key reference', async () => {
      await queryInterface.createTable('level', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
      await queryInterface.addColumn('users', 'level_id', {
        type: DataTypes.INTEGER,
        references: {
          model: 'level',
          key: 'id'
        },
        onUpdate: 'cascade',
        onDelete: 'set null'
      });

      const table = await queryInterface.describeTable('users');

      expect(table).to.have.property('level_id');
    });

    it('should work with schemas', async () => {
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
          }
        }
      );
      await queryInterface.addColumn(
        {
          tableName: 'users',
          schema: 'archive'
        },
        'level_id',
        {
          type: DataTypes.INTEGER
        }
      );

      const table = await queryInterface.describeTable({
        tableName: 'users',
        schema: 'archive'
      });

      expect(table).to.have.property('level_id');
    });

    it('should work with enums (1)', () => {
      return queryInterface.addColumn('users', 'someEnum', DataTypes.ENUM('value1', 'value2', 'value3'));
    });

    it('should work with enums (2)', () => {
      return queryInterface.addColumn('users', 'someOtherEnum', {
        type: DataTypes.ENUM,
        values: ['value1', 'value2', 'value3']
      });
    });
  });

  describe('describeForeignKeys', () => {
    beforeEach(async () => {
      await queryInterface.createTable('users', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
      await queryInterface.createTable('hosts', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        admin: {
          type: DataTypes.INTEGER,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        operator: {
          type: DataTypes.INTEGER,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'cascade'
        },
        owner: {
          type: DataTypes.INTEGER,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'cascade',
          onDelete: 'set null'
        }
      });
    });

    it('should get a list of foreign keys for the table', async () => {
      const sql = queryInterface.QueryGenerator.getForeignKeysQuery('hosts', current.config.database);
      const fks = await current.query(sql, { type: current.QueryTypes.FOREIGNKEYS });

      expect(fks).to.have.length(3);
      const keys = Object.keys(fks[0]),
        keys2 = Object.keys(fks[1]),
        keys3 = Object.keys(fks[2]);

      expect(keys).to.have.length(6);
      expect(keys2).to.have.length(7);
      expect(keys3).to.have.length(7);
    });

    it('should get a list of foreign key references details for the table', async () => {
      const references = await queryInterface.getForeignKeyReferencesForTable('hosts', current.options);

      expect(references).to.have.length(3);
      const keys = [];
      for (const reference of references) {
        expect(reference.tableName).to.eql('hosts');
        expect(reference.referencedColumnName).to.eql('id');
        expect(reference.referencedTableName).to.eql('users');
        keys.push(reference.columnName);
      }
      expect(keys).to.have.same.members(['owner', 'operator', 'admin']);
    });
  });

  describe('constraints', () => {
    beforeEach(() => {
      // Registered only so sync() creates their tables; the constraint tests use raw table names.
      current.define('users', {
        username: DataTypes.STRING,
        email: DataTypes.STRING,
        roles: DataTypes.STRING
      });

      current.define('posts', {
        username: DataTypes.STRING
      });
      return current.sync({ force: true });
    });

    describe('unique', () => {
      it('should add, read & remove unique constraint', async () => {
        await queryInterface.addConstraint('users', ['email'], {
          type: 'unique'
        });

        const constraints = (await queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('users_email_uk');

        await queryInterface.removeConstraint('users', 'users_email_uk');

        const remainingConstraints = (await queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('users_email_uk');
      });
    });

    if (current.dialect.supports.constraints.check) {
      describe('check', () => {
        it('should add, read & remove check constraint', async () => {
          await queryInterface.addConstraint('users', ['roles'], {
            type: 'check',
            where: {
              roles: ['user', 'admin', 'guest', 'moderator']
            },
            name: 'check_user_roles'
          });

          const constraints = (await queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(constraints).to.include('check_user_roles');

          await queryInterface.removeConstraint('users', 'check_user_roles');

          const remainingConstraints = (await queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(remainingConstraints).to.not.include('check_user_roles');
        });
      });
    }

    if (current.dialect.supports.constraints.default) {
      describe('default', () => {
        it('should add, read & remove default constraint', async () => {
          await queryInterface.addConstraint('users', ['roles'], {
            type: 'default',
            defaultValue: 'guest'
          });

          const constraints = (await queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(constraints).to.include('users_roles_df');

          await queryInterface.removeConstraint('users', 'users_roles_df');

          const remainingConstraints = (await queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(remainingConstraints).to.not.include('users_roles_df');
        });
      });
    }

    describe('primary key', () => {
      it('should add, read & remove primary key constraint', async () => {
        await queryInterface.removeColumn('users', 'id');
        await queryInterface.changeColumn('users', 'username', {
          type: DataTypes.STRING,
          allowNull: false
        });
        await queryInterface.addConstraint('users', ['username'], {
          type: 'PRIMARY KEY'
        });

        const constraints = (await queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('users_username_pk');

        await queryInterface.removeConstraint('users', 'users_username_pk');

        const remainingConstraints = (await queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('users_username_pk');
      });
    });

    describe('foreign key', () => {
      it('should add, read & remove foreign key constraint', async () => {
        await queryInterface.removeColumn('users', 'id');
        await queryInterface.changeColumn('users', 'username', {
          type: DataTypes.STRING,
          allowNull: false
        });
        await queryInterface.addConstraint('users', {
          type: 'PRIMARY KEY',
          fields: ['username']
        });
        await queryInterface.addConstraint('posts', ['username'], {
          references: {
            table: 'users',
            field: 'username'
          },
          onDelete: 'cascade',
          onUpdate: 'cascade',
          type: 'foreign key'
        });

        const constraints = (await queryInterface.showConstraint('posts')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('posts_username_users_fk');

        await queryInterface.removeConstraint('posts', 'posts_username_users_fk');

        const remainingConstraints = (await queryInterface.showConstraint('posts')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('posts_username_users_fk');
      });
    });

    describe('error handling', () => {
      it('should throw non existent constraints as UnknownConstraintError', () => {
        return expect(
          queryInterface.removeConstraint('users', 'unknown__contraint__name', {
            type: 'unique'
          })
        ).to.eventually.be.rejectedWith(Sequelize.UnknownConstraintError);
      });
    });
  });
});
