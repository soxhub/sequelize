import { expect } from 'chai';
import DataTypes from '../../../../lib/data-types.js';
import _ from 'lodash';

describe('[POSTGRES Specific] QueryInterface', () => {
  beforeEach(function () {
    this.sequelize.options.quoteIdenifiers = true;
    this.queryInterface = this.sequelize.getQueryInterface();
  });

  describe('createSchema', () => {
    beforeEach(async function () {
      // make sure we don't have a pre-existing schema called testSchema.
      try {
        await this.queryInterface.dropSchema('testschema');
      } catch {
        // suppress errors here. if testschema doesn't exist thats ok.
      }
    });

    it('creates a schema', async function () {
      await this.queryInterface.createSchema('testschema');

      const res = await this.sequelize.query(
        `
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `,
        { type: this.sequelize.QueryTypes.SELECT }
      );

      expect(res, 'query results').to.not.be.empty;
      expect(res[0].schema_name).to.be.equal('testschema');
    });

    it('works even when schema exists', async function () {
      await this.queryInterface.createSchema('testschema');
      await this.queryInterface.createSchema('testschema');

      const res = await this.sequelize.query(
        `
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `,
        { type: this.sequelize.QueryTypes.SELECT }
      );

      expect(res, 'query results').to.not.be.empty;
      expect(res[0].schema_name).to.be.equal('testschema');
    });
  });

  describe('databaseVersion', () => {
    it('reports version', async function () {
      const res = await this.queryInterface.databaseVersion();
      // check that result matches expected version number format. example 9.5.4
      expect(res).to.match(/[0-9.[0-9]\.[0-9]/);
    });
  });

  describe('renameFunction', () => {
    beforeEach(async function () {
      // ensure the function names we'll use don't exist before we start.
      // then setup our function to rename
      try {
        await this.queryInterface.dropFunction('rftest1', []);
      } catch {
        // suppress errors here. if rftest1 doesn't exist thats ok.
      }

      try {
        await this.queryInterface.dropFunction('rftest2', []);
      } catch {
        // suppress errors here. if rftest2 doesn't exist thats ok.
      }

      await this.queryInterface.createFunction('rftest1', [], 'varchar', 'plpgsql', "return 'testreturn';", {});
    });

    it('renames a function', async function () {
      await this.queryInterface.renameFunction('rftest1', [], 'rftest2');

      const res = await this.sequelize.query('select rftest2();', { type: this.sequelize.QueryTypes.SELECT });
      expect(res[0].rftest2).to.be.eql('testreturn');
    });
  });

  describe('createFunction', () => {
    beforeEach(async function () {
      // make sure we don't have a pre-existing function called create_job
      // this is needed to cover the edge case of afterEach not getting called because of an unexpected issue or stopage with the
      // test suite causing a failure of afterEach's cleanup to be called.
      try {
        await this.queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]);
      } catch {
        // suppress errors here. if create_job doesn't exist thats ok.
      }
    });

    after(async function () {
      // cleanup
      try {
        await this.queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]);
      } catch {
        // suppress errors here. if create_job doesn't exist thats ok.
      }
    });

    it('creates a stored procedure', async function () {
      const body = 'return test;';
      const options = {};

      // make our call to create a function
      await this.queryInterface.createFunction(
        'create_job',
        [{ type: 'varchar', name: 'test' }],
        'varchar',
        'plpgsql',
        body,
        options
      );

      // validate
      const res = await this.sequelize.query("select create_job('test');", { type: this.sequelize.QueryTypes.SELECT });
      expect(res[0].create_job).to.be.eql('test');
    });

    it('treats options as optional', async function () {
      const body = 'return test;';

      // run with null options parameter
      await this.queryInterface.createFunction(
        'create_job',
        [{ type: 'varchar', name: 'test' }],
        'varchar',
        'plpgsql',
        body,
        null
      );

      // validate
      const res = await this.sequelize.query("select create_job('test');", { type: this.sequelize.QueryTypes.SELECT });
      expect(res[0].create_job).to.be.eql('test');
    });

    it('produces an error when missing expected parameters', function () {
      const body = 'return 1;';
      const options = {};

      return Promise.all([
        // requires functionName
        expect(() => {
          return this.queryInterface.createFunction(null, [{ name: 'test' }], 'integer', 'plpgsql', body, options);
        }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

        // requires Parameters array
        expect(() => {
          return this.queryInterface.createFunction('create_job', null, 'integer', 'plpgsql', body, options);
        }).to.throw(/function parameters array required/),

        // requires returnType
        expect(() => {
          return this.queryInterface.createFunction(
            'create_job',
            [{ type: 'varchar', name: 'test' }],
            null,
            'plpgsql',
            body,
            options
          );
        }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

        // requires type in parameter array
        expect(() => {
          return this.queryInterface.createFunction(
            'create_job',
            [{ name: 'test' }],
            'integer',
            'plpgsql',
            body,
            options
          );
        }).to.throw(/function or trigger used with a parameter without any type/),

        // requires language
        expect(() => {
          return this.queryInterface.createFunction(
            'create_job',
            [{ type: 'varchar', name: 'test' }],
            'varchar',
            null,
            body,
            options
          );
        }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

        // requires body
        expect(() => {
          return this.queryInterface.createFunction(
            'create_job',
            [{ type: 'varchar', name: 'test' }],
            'varchar',
            'plpgsql',
            null,
            options
          );
        }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/)
      ]);
    });
  });

  describe('dropFunction', () => {
    beforeEach(async function () {
      const body = 'return test;';
      const options = {};

      // make sure we have a droptest function in place.
      try {
        await this.queryInterface.createFunction(
          'droptest',
          [{ type: 'varchar', name: 'test' }],
          'varchar',
          'plpgsql',
          body,
          options
        );
      } catch {
        // suppress errors.. this could fail if the function is already there.. thats ok.
      }
    });

    it('can drop a function', async function () {
      const dropAndCall = async () => {
        await this.queryInterface.dropFunction('droptest', [{ type: 'varchar', name: 'test' }]);

        // call the function we attempted to drop.. if it is still there then throw an error informing that the expected behavior is not met.
        return this.sequelize.query("select droptest('test');", { type: this.sequelize.QueryTypes.SELECT });
      };

      // test that we did get the expected error indicating that droptest was properly removed.
      await expect(dropAndCall()).to.be.rejectedWith(/.*function droptest.* does not exist/);
    });

    it('produces an error when missing expected parameters', function () {
      return Promise.all([
        expect(() => {
          return this.queryInterface.dropFunction();
        }).to.throw(/.*requires functionName/),

        expect(() => {
          return this.queryInterface.dropFunction('droptest');
        }).to.throw(/.*function parameters array required/),

        expect(() => {
          return this.queryInterface.dropFunction('droptest', [{ name: 'test' }]);
        }).to.be.throw(/.*function or trigger used with a parameter without any type/)
      ]);
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

    it('supports newlines', async function () {
      await this.queryInterface.addIndex(
        'Group',
        [
          this.sequelize.literal(`(
            CASE "username"
              WHEN 'foo' THEN 'bar'
              ELSE 'baz'
            END
          )`)
        ],
        { name: 'group_username_case' }
      );

      const indexes = await this.queryInterface.showIndex('Group');
      const indexColumns = _.uniq(indexes.map((index) => index.name));

      expect(indexColumns).to.include('group_username_case');
    });

    it('adds, reads and removes a named functional index to the table', async function () {
      await this.queryInterface.addIndex('Group', [this.sequelize.fn('lower', this.sequelize.col('username'))], {
        name: 'group_username_lower'
      });

      const indexes = await this.queryInterface.showIndex('Group');
      expect(_.uniq(indexes.map((index) => index.name))).to.include('group_username_lower');

      await this.queryInterface.removeIndex('Group', 'group_username_lower');

      const remaining = await this.queryInterface.showIndex('Group');
      expect(_.uniq(remaining.map((index) => index.name))).to.be.empty;
    });
  });
});
