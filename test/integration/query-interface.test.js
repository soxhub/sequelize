import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import _ from 'lodash';

const Sequelize = Support.Sequelize;
const current = Support.sequelize;

describe(Support.getTestDialectTeaser('QueryInterface'), () => {
  beforeEach(function () {
    this.sequelize.options.quoteIdenifiers = true;
    this.queryInterface = this.sequelize.getQueryInterface();
  });

  afterEach(function () {
    return this.sequelize.dropAllSchemas();
  });

  describe('renameTable', () => {
    it('should rename table', async function () {
      await this.queryInterface.createTable('myTestTable', {
        name: DataTypes.STRING
      });
      await this.queryInterface.renameTable('myTestTable', 'myTestTableNew');

      const tableNames = await this.queryInterface.showAllTables();

      expect(tableNames).to.contain('myTestTableNew');
      expect(tableNames).to.not.contain('myTestTable');
    });
  });

  describe('dropAllTables', () => {
    it('should drop all tables', async function () {
      const filterMSSQLDefault = (tableNames) => tableNames.filter((t) => t.tableName !== 'spt_values');

      await this.queryInterface.dropAllTables();

      // MSSQL include spt_values table which is system defined, hence cant be dropped
      const tableNames = await this.queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNames)).to.be.empty;

      await this.queryInterface.createTable('table', { name: DataTypes.STRING });

      const tableNamesAfterCreate = await this.queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNamesAfterCreate)).to.have.length(1);

      await this.queryInterface.dropAllTables();

      // MSSQL include spt_values table which is system defined, hence cant be dropped
      const tableNamesAfterDrop = await this.queryInterface.showAllTables();
      expect(filterMSSQLDefault(tableNamesAfterDrop)).to.be.empty;
    });

    it('should be able to skip given tables', async function () {
      await this.queryInterface.createTable('skipme', {
        name: DataTypes.STRING
      });
      await this.queryInterface.dropAllTables({ skip: ['skipme'] });

      const tableNames = await this.queryInterface.showAllTables();

      expect(tableNames).to.contain('skipme');
    });
  });

  describe('indexes', () => {
    beforeEach(async function () {
      await this.queryInterface.dropTable('Group');
      await this.queryInterface.createTable('Group', {
        username: DataTypes.STRING,
        isAdmin: DataTypes.BOOLEAN,
        from: DataTypes.STRING
      });
    });

    it('adds, reads and removes an index to the table', async function () {
      await this.queryInterface.addIndex('Group', ['username', 'isAdmin']);

      const indexes = await this.queryInterface.showIndex('Group');
      const indexColumns = _.uniq(
        indexes.map((index) => {
          return index.name;
        })
      );
      expect(indexColumns).to.include('group_username_is_admin');

      await this.queryInterface.removeIndex('Group', ['username', 'isAdmin']);

      const remainingIndexes = await this.queryInterface.showIndex('Group');
      const remainingIndexColumns = _.uniq(
        remainingIndexes.map((index) => {
          return index.name;
        })
      );
      expect(remainingIndexColumns).to.be.empty;
    });

    it('works with schemas', async function () {
      await this.sequelize.createSchema('schema');
      await this.queryInterface.createTable(
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
      await this.queryInterface.addIndex(
        {
          schema: 'schema',
          tableName: 'table'
        },
        ['name', 'isAdmin'],
        null,
        'schema_table'
      );

      const indexes = await this.queryInterface.showIndex({
        schema: 'schema',
        tableName: 'table'
      });

      expect(indexes.length).to.eq(1);
      const index = indexes[0];
      expect(index.name).to.eq('table_name_is_admin');
    });

    it('does not fail on reserved keywords', function () {
      return this.queryInterface.addIndex('Group', ['from']);
    });
  });

  describe('describeTable', () => {
    it('reads the metadata of the table', async function () {
      const Users = this.sequelize.define(
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

      const metadata = await this.queryInterface.describeTable('_Users');
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

    it('should correctly determine the primary key columns', async function () {
      const Country = this.sequelize.define(
        '_Country',
        {
          code: { type: DataTypes.STRING, primaryKey: true },
          name: { type: DataTypes.STRING, allowNull: false }
        },
        { freezeTableName: true }
      );
      const Alumni = this.sequelize.define(
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

      const metacountry = await this.queryInterface.describeTable('_Country');
      expect(metacountry.code.primaryKey).to.eql(true);
      expect(metacountry.name.primaryKey).to.eql(false);

      await Alumni.sync({ force: true });

      const metalumni = await this.queryInterface.describeTable('_Alumni');
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
    it('should create a auto increment primary key', async function () {
      await this.queryInterface.createTable('TableWithPK', {
        table_id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });

      const results = await this.queryInterface.insert(
        null,
        'TableWithPK',
        {},
        { raw: true, returning: true, plain: true }
      );
      const response = _.head(results);

      expect(response.table_id || (typeof response !== 'object' && response)).to.be.ok;
    });

    it('should work with enums (1)', function () {
      return this.queryInterface.createTable('SomeTable', {
        someEnum: DataTypes.ENUM('value1', 'value2', 'value3')
      });
    });

    it('should work with enums (2)', function () {
      return this.queryInterface.createTable('SomeTable', {
        someEnum: {
          type: DataTypes.ENUM,
          values: ['value1', 'value2', 'value3']
        }
      });
    });

    it('should work with enums (3)', function () {
      return this.queryInterface.createTable('SomeTable', {
        someEnum: {
          type: DataTypes.ENUM,
          values: ['value1', 'value2', 'value3'],
          field: 'otherName'
        }
      });
    });

    it('should work with enums (4)', async function () {
      await this.queryInterface.createSchema('archive');
      await this.queryInterface.createTable(
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

    it('should work with schemas', async function () {
      await this.sequelize.createSchema('hero');
      await this.queryInterface.createTable(
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
    it('rename a simple column', async function () {
      const Users = this.sequelize.define(
        '_Users',
        {
          username: DataTypes.STRING
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });
      await this.queryInterface.renameColumn('_Users', 'username', 'pseudo');

      const table = await this.queryInterface.describeTable('_Users');

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('works with schemas', async function () {
      await this.sequelize.createSchema('archive');

      const Users = this.sequelize.define(
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
      await this.queryInterface.renameColumn(
        {
          schema: 'archive',
          tableName: 'Users'
        },
        'username',
        'pseudo'
      );

      const table = await this.queryInterface.describeTable({
        schema: 'archive',
        tableName: 'Users'
      });

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('rename a column non-null without default value', async function () {
      const Users = this.sequelize.define(
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
      await this.queryInterface.renameColumn('_Users', 'username', 'pseudo');

      const table = await this.queryInterface.describeTable('_Users');

      expect(table).to.have.property('pseudo');
      expect(table).to.not.have.property('username');
    });

    it('rename a boolean column non-null without default value', async function () {
      const Users = this.sequelize.define(
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
      await this.queryInterface.renameColumn('_Users', 'active', 'enabled');

      const table = await this.queryInterface.describeTable('_Users');

      expect(table).to.have.property('enabled');
      expect(table).to.not.have.property('active');
    });

    it('renames a column primary key autoIncrement column', async function () {
      const Fruits = this.sequelize.define(
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
      await this.queryInterface.renameColumn('Fruit', 'fruitId', 'fruit_id');

      const table = await this.queryInterface.describeTable('Fruit');

      expect(table).to.have.property('fruit_id');
      expect(table).to.not.have.property('fruitId');
    });

    it('shows a reasonable error message when column is missing', async function () {
      const Users = this.sequelize.define(
        '_Users',
        {
          username: DataTypes.STRING
        },
        { freezeTableName: true }
      );

      await Users.sync({ force: true });

      await expect(this.queryInterface.renameColumn('_Users', 'email', 'pseudo')).to.be.rejectedWith(
        "Table _Users doesn't have the column email"
      );
    });
  });

  describe('addColumn', () => {
    beforeEach(async function () {
      await this.sequelize.createSchema('archive');
      await this.queryInterface.createTable('users', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
    });

    it('should be able to add a foreign key reference', async function () {
      await this.queryInterface.createTable('level', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
      await this.queryInterface.addColumn('users', 'level_id', {
        type: DataTypes.INTEGER,
        references: {
          model: 'level',
          key: 'id'
        },
        onUpdate: 'cascade',
        onDelete: 'set null'
      });

      const table = await this.queryInterface.describeTable('users');

      expect(table).to.have.property('level_id');
    });

    it('should work with schemas', async function () {
      await this.queryInterface.createTable(
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
      await this.queryInterface.addColumn(
        {
          tableName: 'users',
          schema: 'archive'
        },
        'level_id',
        {
          type: DataTypes.INTEGER
        }
      );

      const table = await this.queryInterface.describeTable({
        tableName: 'users',
        schema: 'archive'
      });

      expect(table).to.have.property('level_id');
    });

    it('should work with enums (1)', function () {
      return this.queryInterface.addColumn('users', 'someEnum', DataTypes.ENUM('value1', 'value2', 'value3'));
    });

    it('should work with enums (2)', function () {
      return this.queryInterface.addColumn('users', 'someOtherEnum', {
        type: DataTypes.ENUM,
        values: ['value1', 'value2', 'value3']
      });
    });
  });

  describe('describeForeignKeys', () => {
    beforeEach(async function () {
      await this.queryInterface.createTable('users', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        }
      });
      await this.queryInterface.createTable('hosts', {
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

    it('should get a list of foreign keys for the table', async function () {
      const sql = this.queryInterface.QueryGenerator.getForeignKeysQuery('hosts', this.sequelize.config.database);
      const fks = await this.sequelize.query(sql, { type: this.sequelize.QueryTypes.FOREIGNKEYS });

      expect(fks).to.have.length(3);
      const keys = Object.keys(fks[0]),
        keys2 = Object.keys(fks[1]),
        keys3 = Object.keys(fks[2]);

      expect(keys).to.have.length(6);
      expect(keys2).to.have.length(7);
      expect(keys3).to.have.length(7);
    });

    it('should get a list of foreign key references details for the table', async function () {
      const references = await this.queryInterface.getForeignKeyReferencesForTable('hosts', this.sequelize.options);

      expect(references).to.have.length(3);
      const keys = [];
      _.each(references, (reference) => {
        expect(reference.tableName).to.eql('hosts');
        expect(reference.referencedColumnName).to.eql('id');
        expect(reference.referencedTableName).to.eql('users');
        keys.push(reference.columnName);
      });
      expect(keys).to.have.same.members(['owner', 'operator', 'admin']);
    });
  });

  describe('constraints', () => {
    beforeEach(function () {
      this.User = this.sequelize.define('users', {
        username: DataTypes.STRING,
        email: DataTypes.STRING,
        roles: DataTypes.STRING
      });

      this.Post = this.sequelize.define('posts', {
        username: DataTypes.STRING
      });
      return this.sequelize.sync({ force: true });
    });

    describe('unique', () => {
      it('should add, read & remove unique constraint', async function () {
        await this.queryInterface.addConstraint('users', ['email'], {
          type: 'unique'
        });

        const constraints = (await this.queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('users_email_uk');

        await this.queryInterface.removeConstraint('users', 'users_email_uk');

        const remainingConstraints = (await this.queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('users_email_uk');
      });
    });

    if (current.dialect.supports.constraints.check) {
      describe('check', () => {
        it('should add, read & remove check constraint', async function () {
          await this.queryInterface.addConstraint('users', ['roles'], {
            type: 'check',
            where: {
              roles: ['user', 'admin', 'guest', 'moderator']
            },
            name: 'check_user_roles'
          });

          const constraints = (await this.queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(constraints).to.include('check_user_roles');

          await this.queryInterface.removeConstraint('users', 'check_user_roles');

          const remainingConstraints = (await this.queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(remainingConstraints).to.not.include('check_user_roles');
        });
      });
    }

    if (current.dialect.supports.constraints.default) {
      describe('default', () => {
        it('should add, read & remove default constraint', async function () {
          await this.queryInterface.addConstraint('users', ['roles'], {
            type: 'default',
            defaultValue: 'guest'
          });

          const constraints = (await this.queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(constraints).to.include('users_roles_df');

          await this.queryInterface.removeConstraint('users', 'users_roles_df');

          const remainingConstraints = (await this.queryInterface.showConstraint('users')).map(
            (constraint) => constraint.constraintName
          );
          expect(remainingConstraints).to.not.include('users_roles_df');
        });
      });
    }

    describe('primary key', () => {
      it('should add, read & remove primary key constraint', async function () {
        await this.queryInterface.removeColumn('users', 'id');
        await this.queryInterface.changeColumn('users', 'username', {
          type: DataTypes.STRING,
          allowNull: false
        });
        await this.queryInterface.addConstraint('users', ['username'], {
          type: 'PRIMARY KEY'
        });

        const constraints = (await this.queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('users_username_pk');

        await this.queryInterface.removeConstraint('users', 'users_username_pk');

        const remainingConstraints = (await this.queryInterface.showConstraint('users')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('users_username_pk');
      });
    });

    describe('foreign key', () => {
      it('should add, read & remove foreign key constraint', async function () {
        await this.queryInterface.removeColumn('users', 'id');
        await this.queryInterface.changeColumn('users', 'username', {
          type: DataTypes.STRING,
          allowNull: false
        });
        await this.queryInterface.addConstraint('users', {
          type: 'PRIMARY KEY',
          fields: ['username']
        });
        await this.queryInterface.addConstraint('posts', ['username'], {
          references: {
            table: 'users',
            field: 'username'
          },
          onDelete: 'cascade',
          onUpdate: 'cascade',
          type: 'foreign key'
        });

        const constraints = (await this.queryInterface.showConstraint('posts')).map(
          (constraint) => constraint.constraintName
        );
        expect(constraints).to.include('posts_username_users_fk');

        await this.queryInterface.removeConstraint('posts', 'posts_username_users_fk');

        const remainingConstraints = (await this.queryInterface.showConstraint('posts')).map(
          (constraint) => constraint.constraintName
        );
        expect(remainingConstraints).to.not.include('posts_username_users_fk');
      });
    });

    describe('error handling', () => {
      it('should throw non existent constraints as UnknownConstraintError', function () {
        return expect(
          this.queryInterface.removeConstraint('users', 'unknown__contraint__name', {
            type: 'unique'
          })
        ).to.eventually.be.rejectedWith(Sequelize.UnknownConstraintError);
      });
    });
  });
});
