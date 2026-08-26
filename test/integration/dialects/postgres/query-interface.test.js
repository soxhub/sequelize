import { describe, it, afterAll, beforeEach, expect } from 'vitest';
import DataTypes from '../../../../lib/data-types.js';
import _ from 'lodash';
import Support from '../../support.js';

const current = Support.sequelize;

describe('[POSTGRES Specific] QueryInterface', () => {
  let queryInterface;

  beforeEach(() => {
    current.options.quoteIdenifiers = true;
    queryInterface = current.getQueryInterface();
  });

  describe('createSchema', () => {
    beforeEach(async () => {
      // make sure we don't have a pre-existing schema called testSchema.
      try {
        await queryInterface.dropSchema('testschema');
      } catch {
        // suppress errors here. if testschema doesn't exist thats ok.
      }
    });

    it('creates a schema', async () => {
      await queryInterface.createSchema('testschema');

      const res = await current.query(
        `
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `,
        { type: current.QueryTypes.SELECT }
      );

      expect(res, 'query results').to.not.be.empty;
      expect(res[0].schema_name).to.be.equal('testschema');
    });

    it('works even when schema exists', async () => {
      await queryInterface.createSchema('testschema');
      await queryInterface.createSchema('testschema');

      const res = await current.query(
        `
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `,
        { type: current.QueryTypes.SELECT }
      );

      expect(res, 'query results').to.not.be.empty;
      expect(res[0].schema_name).to.be.equal('testschema');
    });
  });

  describe('databaseVersion', () => {
    it('reports version', async () => {
      const res = await queryInterface.databaseVersion();
      // check that result matches expected version number format. example 9.5.4
      expect(res).to.match(/[0-9.[0-9]\.[0-9]/);
    });
  });

  describe('renameFunction', () => {
    beforeEach(async () => {
      // ensure the function names we'll use don't exist before we start.
      // then setup our function to rename
      try {
        await queryInterface.dropFunction('rftest1', []);
      } catch {
        // suppress errors here. if rftest1 doesn't exist thats ok.
      }

      try {
        await queryInterface.dropFunction('rftest2', []);
      } catch {
        // suppress errors here. if rftest2 doesn't exist thats ok.
      }

      await queryInterface.createFunction('rftest1', [], 'varchar', 'plpgsql', "return 'testreturn';", {});
    });

    it('renames a function', async () => {
      await queryInterface.renameFunction('rftest1', [], 'rftest2');

      const res = await current.query('select rftest2();', { type: current.QueryTypes.SELECT });
      expect(res[0].rftest2).to.be.eql('testreturn');
    });
  });

  describe('createFunction', () => {
    beforeEach(async () => {
      // make sure we don't have a pre-existing function called create_job
      // this is needed to cover the edge case of afterEach not getting called because of an unexpected issue or stopage with the
      // test suite causing a failure of afterEach's cleanup to be called.
      try {
        await queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]);
      } catch {
        // suppress errors here. if create_job doesn't exist thats ok.
      }
    });

    afterAll(async () => {
      // cleanup
      try {
        await queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]);
      } catch {
        // suppress errors here. if create_job doesn't exist thats ok.
      }
    });

    it('creates a stored procedure', async () => {
      const body = 'return test;';
      const options = {};

      // make our call to create a function
      await queryInterface.createFunction(
        'create_job',
        [{ type: 'varchar', name: 'test' }],
        'varchar',
        'plpgsql',
        body,
        options
      );

      // validate
      const res = await current.query("select create_job('test');", { type: current.QueryTypes.SELECT });
      expect(res[0].create_job).to.be.eql('test');
    });

    it('treats options as optional', async () => {
      const body = 'return test;';

      // run with null options parameter
      await queryInterface.createFunction(
        'create_job',
        [{ type: 'varchar', name: 'test' }],
        'varchar',
        'plpgsql',
        body,
        null
      );

      // validate
      const res = await current.query("select create_job('test');", { type: current.QueryTypes.SELECT });
      expect(res[0].create_job).to.be.eql('test');
    });

    it('produces an error when missing expected parameters', () => {
      const body = 'return 1;';
      const options = {};

      return Promise.all([
        // requires functionName
        expect(() => {
          return queryInterface.createFunction(null, [{ name: 'test' }], 'integer', 'plpgsql', body, options);
        }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

        // requires Parameters array
        expect(() => {
          return queryInterface.createFunction('create_job', null, 'integer', 'plpgsql', body, options);
        }).to.throw(/function parameters array required/),

        // requires returnType
        expect(() => {
          return queryInterface.createFunction(
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
          return queryInterface.createFunction('create_job', [{ name: 'test' }], 'integer', 'plpgsql', body, options);
        }).to.throw(/function or trigger used with a parameter without any type/),

        // requires language
        expect(() => {
          return queryInterface.createFunction(
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
          return queryInterface.createFunction(
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
    beforeEach(async () => {
      const body = 'return test;';
      const options = {};

      // make sure we have a droptest function in place.
      try {
        await queryInterface.createFunction(
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

    it('can drop a function', async () => {
      const dropAndCall = async () => {
        await queryInterface.dropFunction('droptest', [{ type: 'varchar', name: 'test' }]);

        // call the function we attempted to drop.. if it is still there then throw an error informing that the expected behavior is not met.
        return current.query("select droptest('test');", { type: current.QueryTypes.SELECT });
      };

      // test that we did get the expected error indicating that droptest was properly removed.
      await expect(dropAndCall()).rejects.toThrow(/.*function droptest.* does not exist/);
    });

    it('produces an error when missing expected parameters', () => {
      return Promise.all([
        expect(() => {
          return queryInterface.dropFunction();
        }).to.throw(/.*requires functionName/),

        expect(() => {
          return queryInterface.dropFunction('droptest');
        }).to.throw(/.*function parameters array required/),

        expect(() => {
          return queryInterface.dropFunction('droptest', [{ name: 'test' }]);
        }).to.be.throw(/.*function or trigger used with a parameter without any type/)
      ]);
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

    it('supports newlines', async () => {
      await queryInterface.addIndex(
        'Group',
        [
          current.literal(`(
            CASE "username"
              WHEN 'foo' THEN 'bar'
              ELSE 'baz'
            END
          )`)
        ],
        { name: 'group_username_case' }
      );

      const indexes = await queryInterface.showIndex('Group');
      const indexColumns = _.uniq(indexes.map((index) => index.name));

      expect(indexColumns).to.include('group_username_case');
    });

    it('adds, reads and removes a named functional index to the table', async () => {
      await queryInterface.addIndex('Group', [current.fn('lower', current.col('username'))], {
        name: 'group_username_lower'
      });

      const indexes = await queryInterface.showIndex('Group');
      expect(_.uniq(indexes.map((index) => index.name))).to.include('group_username_lower');

      await queryInterface.removeIndex('Group', 'group_username_lower');

      const remaining = await queryInterface.showIndex('Group');
      expect(_.uniq(remaining.map((index) => index.name))).to.be.empty;
    });
  });
});
