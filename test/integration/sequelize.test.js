import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert, expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import _ from 'lodash';
import Sequelize from '../../index.js';
import config from '../config/config.js';
import moment from 'moment';
import Transaction from '../../lib/transaction.js';
import * as Utils from '../../lib/utils.js';
import sinon from 'sinon';

const dialect = Support.getTestDialect();

const current = Support.sequelize;

const qq = function (str) {
  return '"' + str + '"';
};

describe(Support.getTestDialectTeaser('Sequelize'), () => {
  describe('constructor', () => {
    afterEach(() => {
      Utils.deprecate.restore && Utils.deprecate.restore();
    });

    it.skip('should work with min connections', () => {
      const ConnectionManager = current.dialect.connectionManager,
        connectionSpy = (ConnectionManager.connect = sinon.spy(ConnectionManager.connect));

      Support.createSequelizeInstance({
        pool: {
          min: 2
        }
      });
      expect(connectionSpy.calledTwice).to.be.true;
    });

    it('should pass the global options correctly', () => {
      const sequelize = Support.createSequelizeInstance({ logging: false, define: { underscored: true } }),
        DAO = sequelize.define('dao', { name: DataTypes.STRING });

      expect(DAO.options.underscored).to.be.ok;
    });

    it('should correctly set the host and the port', () => {
      const sequelize = Support.createSequelizeInstance({ host: '127.0.0.1', port: 1234 });
      expect(sequelize.config.port).to.equal(1234);
      expect(sequelize.config.host).to.equal('127.0.0.1');
    });

    it('should log deprecated warning if operators aliases were not set', () => {
      // Deliberately not createSequelizeInstance() — that helper passes the aliases
      // explicitly to keep the warning out of every test process, which is the exact
      // behaviour under test here.
      const deprecate = sinon.stub(Utils.getLogger(), 'deprecate');
      try {
        Support.getSequelizeInstance('db', 'user', 'pass', { logging: false });
        expect(deprecate.calledOnce).to.be.true;
        expect(deprecate.args[0][0]).to.be.equal(
          'String based operators are now deprecated. Please use Symbol based operators for better security, read more at http://docs.sequelizejs.com/manual/tutorial/querying.html#operators'
        );
        deprecate.resetHistory();
        Support.getSequelizeInstance('db', 'user', 'pass', { logging: false, operatorsAliases: {} });
        expect(deprecate.called).to.be.false;
      } finally {
        deprecate.restore();
      }
    });

    it('should set operators aliases on dialect QueryGenerator', () => {
      const operatorsAliases = { fake: true };
      const sequelize = Support.createSequelizeInstance({ operatorsAliases });

      expect(sequelize).to.have.property('dialect');
      expect(sequelize.dialect).to.have.property('QueryGenerator');
      expect(sequelize.dialect.QueryGenerator).to.have.property('OperatorsAliasMap');
      expect(sequelize.dialect.QueryGenerator.OperatorsAliasMap).to.be.eql(operatorsAliases);
    });

    const getConnectionUri = _.template(
      '<%= protocol %>://<%= username %>:<%= password %>@<%= host %><% if(port) { %>:<%= port %><% } %>/<%= database %>'
    );
    it('should work with connection strings (postgres protocol)', () => {
      const connectionUri = getConnectionUri(_.extend(config[dialect], { protocol: 'postgres' }));
      // postgres://...
      // oxlint-disable-next-line no-unused-vars -- the assertion is that constructing does not throw
      const sequelize = new Sequelize(connectionUri);
    });
    it('should work with connection strings (postgresql protocol)', () => {
      const connectionUri = getConnectionUri(_.extend(config[dialect], { protocol: 'postgresql' }));
      // postgresql://...
      // oxlint-disable-next-line no-unused-vars -- the assertion is that constructing does not throw
      const sequelize = new Sequelize(connectionUri);
    });
  });

  describe('authenticate', () => {
    describe('with valid credentials', () => {
      it('triggers the success event', () => {
        return current.authenticate();
      });
    });

    describe('with an invalid connection', () => {
      let sequelizeWithInvalidConnection;

      beforeEach(() => {
        const options = _.extend({}, current.options, { port: '99999' });
        sequelizeWithInvalidConnection = new Sequelize('wat', 'trololo', 'wow', options);
      });

      it('triggers the error event', async () => {
        const err = await expect(sequelizeWithInvalidConnection.authenticate()).to.be.rejected;

        expect(err).to.not.be.null;
      });

      it('triggers an actual RangeError or ConnectionError', async () => {
        const err = await expect(sequelizeWithInvalidConnection.authenticate()).to.be.rejected;

        expect(err instanceof RangeError || err instanceof Sequelize.ConnectionError).to.be.ok;
      });

      it('triggers the actual adapter error', async () => {
        const err = await expect(sequelizeWithInvalidConnection.authenticate()).to.be.rejected;

        expect(
          err.message.match(/connect ECONNREFUSED/) ||
            err.message.match(/invalid port number/) ||
            err.message.match(/should be >=? 0 and < 65536/) ||
            err.message.match(/Login failed for user/)
        ).to.be.ok;
      });
    });

    describe('with invalid credentials', () => {
      let sequelizeWithInvalidCredentials;

      beforeEach(() => {
        sequelizeWithInvalidCredentials = new Sequelize('localhost', 'wtf', 'lol', current.options);
      });

      it('triggers the error event', async () => {
        const err = await expect(sequelizeWithInvalidCredentials.authenticate()).to.be.rejected;

        expect(err).to.not.be.null;
      });

      it('triggers an actual sequlize error', async () => {
        const err = await expect(sequelizeWithInvalidCredentials.authenticate()).to.be.rejected;

        expect(err).to.be.instanceof(Sequelize.Error);
      });

      it('triggers the error event when using replication', async () => {
        const err = await expect(
          new Sequelize('sequelize', null, null, {
            dialect,
            replication: {
              read: {
                host: 'localhost',
                username: 'omg',
                password: 'lol'
              }
            }
          }).authenticate()
        ).to.be.rejected;

        expect(err).to.not.be.null;
      });
    });
  });

  describe('validate', () => {
    it('is an alias for .authenticate()', () => {
      expect(current.validate).to.equal(current.authenticate);
    });
  });

  describe('getDialect', () => {
    it('returns the defined dialect', () => {
      expect(current.getDialect()).to.equal(dialect);
    });
  });

  describe('isDefined', () => {
    it("returns false if the dao wasn't defined before", () => {
      expect(current.isDefined('Project')).to.be.false;
    });

    it('returns true if the dao was defined before', () => {
      current.define('Project', {
        name: DataTypes.STRING
      });
      expect(current.isDefined('Project')).to.be.true;
    });
  });

  describe('model', () => {
    it('throws an error if the dao being accessed is undefined', () => {
      expect(() => {
        current.model('Project');
      }).to.throw(/project has not been defined/i);
    });

    it('returns the dao factory defined by daoName', () => {
      const project = current.define('Project', {
        name: DataTypes.STRING
      });

      expect(current.model('Project')).to.equal(project);
    });
  });

  describe('query', () => {
    afterEach(() => {
      current.options.quoteIdentifiers = true;

      console.log.restore && console.log.restore();
    });

    let User, insertQuery;

    beforeEach(() => {
      User = current.define('User', {
        username: DataTypes.STRING,
        emailAddress: {
          type: DataTypes.STRING,
          field: 'email_address'
        }
      });

      insertQuery =
        'INSERT INTO ' +
        qq(User.tableName) +
        ' (username, email_address, ' +
        qq('createdAt') +
        ', ' +
        qq('updatedAt') +
        ") VALUES ('john', 'john@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10')";

      return User.sync({ force: true });
    });

    it('executes a query the internal way', () => {
      return current.query(insertQuery, { raw: true });
    });

    it('executes a query if only the sql is passed', () => {
      return current.query(insertQuery);
    });

    it('executes a query if a placeholder value is an array', async () => {
      await current.query(
        `INSERT INTO ${qq(User.tableName)} (username, email_address, ` +
          `${qq('createdAt')}, ${qq('updatedAt')}) VALUES ?;`,
        {
          replacements: [
            [
              ['john', 'john@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10'],
              ['michael', 'michael@gmail.com', '2012-01-01 10:10:10', '2012-01-01 10:10:10']
            ]
          ]
        }
      );

      const rows = await current.query(`SELECT * FROM ${qq(User.tableName)};`, {
        type: current.QueryTypes.SELECT
      });

      expect(rows).to.be.lengthOf(2);
      expect(rows[0].username).to.be.equal('john');
      expect(rows[1].username).to.be.equal('michael');
    });

    describe('logging', () => {
      it('executes a query with global benchmarking option and default logger', async () => {
        const logger = sinon.spy(console, 'log');
        const sequelize = Support.createSequelizeInstance({
          logging: logger,
          benchmark: true
        });

        await sequelize.query('select 1;');

        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.match(/Executed \(default\): select 1; Elapsed time: \d+ms/);
      });

      // We can only test MySQL warnings when using MySQL.

      it('executes a query with global benchmarking option and custom logger', async () => {
        const logger = sinon.spy();
        const sequelize = Support.createSequelizeInstance({
          logging: logger,
          benchmark: true
        });

        await sequelize.query('select 1;');

        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.equal('Executed (default): select 1;');
        expect(typeof logger.args[0][1] === 'number').to.be.true;
      });

      it('executes a query with benchmarking option and default logger', async () => {
        const logger = sinon.spy(console, 'log');

        await current.query('select 1;', {
          logging: logger,
          benchmark: true
        });

        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.match(/Executed \(default\): select 1; Elapsed time: \d+ms/);
      });

      it('executes a query with benchmarking option and custom logger', async () => {
        const logger = sinon.spy();

        await current.query('select 1;', {
          logging: logger,
          benchmark: true
        });

        expect(logger.calledOnce).to.be.true;
        expect(logger.args[0][0]).to.be.equal('Executed (default): select 1;');
        expect(typeof logger.args[0][1] === 'number').to.be.true;
      });
    });

    it('executes select queries correctly', async () => {
      await current.query(insertQuery);

      const [users] = await current.query('select * from ' + qq(User.tableName) + '');

      expect(
        users.map((u) => {
          return u.username;
        })
      ).to.include('john');
    });

    it('executes select queries correctly when quoteIdentifiers is false', async () => {
      const seq = Object.create(current);

      seq.options.quoteIdentifiers = false;

      await seq.query(insertQuery);

      const [users] = await seq.query('select * from ' + qq(User.tableName) + '');

      expect(
        users.map((u) => {
          return u.username;
        })
      ).to.include('john');
    });

    it('executes select query with dot notation results', async () => {
      await current.query('DELETE FROM ' + qq(User.tableName));
      await current.query(insertQuery);

      const [users] = await current.query(
        'select username as ' + qq('user.username') + ' from ' + qq(User.tableName) + ''
      );

      expect(users).to.deep.equal([{ 'user.username': 'john' }]);
    });

    it('executes select query with dot notation results and nest it', async () => {
      await current.query('DELETE FROM ' + qq(User.tableName));
      await current.query(insertQuery);

      const users = await current.query(
        'select username as ' + qq('user.username') + ' from ' + qq(User.tableName) + '',
        { raw: true, nest: true }
      );

      expect(
        users.map((u) => {
          return u.user;
        })
      ).to.deep.equal([{ username: 'john' }]);
    });

    it('uses the passed model', async () => {
      await current.query(insertQuery);

      const users = await current.query('SELECT * FROM ' + qq(User.tableName) + ';', {
        model: User
      });

      expect(users[0]).to.be.instanceof(User);
    });

    it('maps the field names to attributes based on the passed model', async () => {
      await current.query(insertQuery);

      const users = await current.query('SELECT * FROM ' + qq(User.tableName) + ';', {
        model: User,
        mapToModel: true
      });

      expect(users[0].emailAddress).to.be.equal('john@gmail.com');
    });

    it('arbitrarily map the field names', async () => {
      await current.query(insertQuery);

      const users = await current.query('SELECT * FROM ' + qq(User.tableName) + ';', {
        type: 'SELECT',
        fieldMap: { username: 'userName', email_address: 'email' }
      });

      expect(users[0].userName).to.be.equal('john');
      expect(users[0].email).to.be.equal('john@gmail.com');
    });

    it('reject if `values` and `options.replacements` are both passed', () => {
      return current
        .query({ query: 'select ? as foo, ? as bar', values: [1, 2] }, { raw: true, replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `sql.values` and `options.replacements` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `options.bind` are both passed', () => {
      return current
        .query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2] }, { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `sql.bind` and `options.bind` cannot be set at the same time');
    });

    it('reject if `options.replacements` and `options.bind` are both passed', () => {
      return current
        .query('select $1 + ? as foo, $2 + ? as bar', { raw: true, bind: [1, 2], replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `sql.values` are both passed', () => {
      return current
        .query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2], values: [1, 2] }, { raw: true })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `sql.bind` and `options.replacements`` are both passed', () => {
      return current
        .query({ query: 'select $1 + ? as foo, $2 + ? as bar', bind: [1, 2] }, { raw: true, replacements: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('reject if `options.bind` and `sql.replacements` are both passed', () => {
      return current
        .query({ query: 'select $1 + ? as foo, $1 _ ? as bar', values: [1, 2] }, { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, 'Both `replacements` and `bind` cannot be set at the same time');
    });

    it('properly adds and escapes replacement value', async () => {
      let logSql;
      const number = 1,
        date = new Date(),
        string = 't\'e"st',
        boolean = true,
        buffer = Buffer.from('t\'e"st');

      date.setMilliseconds(0);

      const result = await current.query(
        {
          query: 'select ? as number, ? as date,? as string,? as boolean,? as buffer',
          values: [number, date, string, boolean, buffer]
        },
        {
          type: current.QueryTypes.SELECT,
          logging(s) {
            logSql = s;
          }
        }
      );

      const res = result[0] || {};
      res.date = res.date && new Date(res.date);
      res.boolean = res.boolean && true;
      if (typeof res.buffer === 'string' && res.buffer.indexOf('\\x') === 0) {
        res.buffer = Buffer.from(res.buffer.substring(2), 'hex');
      }
      expect(res).to.deep.equal({
        number,
        date,
        string,
        boolean,
        buffer
      });
      expect(logSql.indexOf('?')).to.equal(-1);
    });

    it('it allows to pass custom class instances', async () => {
      let logSql;
      class SQLStatement {
        constructor() {
          this.values = [1, 2];
        }
        get query() {
          return 'select ? as foo, ? as bar';
        }
      }

      const result = await current.query(new SQLStatement(), {
        type: current.QueryTypes.SELECT,
        logging: (s) => (logSql = s)
      });

      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      expect(logSql.indexOf('?')).to.equal(-1);
    });

    it('uses properties `query` and `values` if query is tagged', async () => {
      let logSql;

      const result = await current.query(
        { query: 'select ? as foo, ? as bar', values: [1, 2] },
        {
          type: current.QueryTypes.SELECT,
          logging(s) {
            logSql = s;
          }
        }
      );

      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      expect(logSql.indexOf('?')).to.equal(-1);
    });

    it('uses properties `query` and `bind` if query is tagged', async () => {
      const typeCast = '::int';
      let logSql;

      const result = await current.query(
        { query: 'select $1' + typeCast + ' as foo, $2' + typeCast + ' as bar', bind: [1, 2] },
        {
          type: current.QueryTypes.SELECT,
          logging(s) {
            logSql = s;
          }
        }
      );

      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
      expect(logSql.indexOf('$1')).to.be.above(-1);
      expect(logSql.indexOf('$2')).to.be.above(-1);
    });

    it('dot separated attributes when doing a raw query without nest', async () => {
      const tickChar = '"',
        sql = 'select 1 as ' + Sequelize.Utils.addTicks('foo.bar.baz', tickChar);

      const rows = await current.query(sql, { raw: true, nest: false });

      expect(rows[0]).to.deep.equal([{ 'foo.bar.baz': 1 }]);
    });

    it('destructs dot separated attributes when doing a raw query using nest', async () => {
      const tickChar = '"',
        sql = 'select 1 as ' + Sequelize.Utils.addTicks('foo.bar.baz', tickChar);

      const result = await current.query(sql, { raw: true, nest: true });

      expect(result).to.deep.equal([{ foo: { bar: { baz: 1 } } }]);
    });

    it('replaces token with the passed array', async () => {
      const result = await current.query('select ? as foo, ? as bar', {
        type: current.QueryTypes.SELECT,
        replacements: [1, 2]
      });

      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);
    });

    it('replaces named parameters with the passed object', async () => {
      const rows = await current.query('select :one as foo, :two as bar', {
        raw: true,
        replacements: { one: 1, two: 2 }
      });

      expect(rows[0]).to.deep.equal([{ foo: 1, bar: 2 }]);
    });

    it('replaces named parameters with the passed object and ignore those which does not qualify', async () => {
      const rows = await current.query("select :one as foo, :two as bar, '00:00' as baz", {
        raw: true,
        replacements: { one: 1, two: 2 }
      });

      expect(rows[0]).to.deep.equal([{ foo: 1, bar: 2, baz: '00:00' }]);
    });

    it('replaces named parameters with the passed object using the same key twice', async () => {
      const rows = await current.query('select :one as foo, :two as bar, :one as baz', {
        raw: true,
        replacements: { one: 1, two: 2 }
      });

      expect(rows[0]).to.deep.equal([{ foo: 1, bar: 2, baz: 1 }]);
    });

    it('replaces named parameters with the passed object having a null property', async () => {
      const rows = await current.query('select :one as foo, :two as bar', {
        raw: true,
        replacements: { one: 1, two: null }
      });

      expect(rows[0]).to.deep.equal([{ foo: 1, bar: null }]);
    });

    it('reject when key is missing in the passed object', () => {
      return current
        .query('select :one as foo, :two as bar, :three as baz', { raw: true, replacements: { one: 1, two: 2 } })
        .should.be.rejectedWith(Error, 'Named replacement ":three" has no entry in the replacement map.');
    });

    it('reject with the passed number', () => {
      return current
        .query('select :one as foo, :two as bar', { raw: true, replacements: 2 })
        .should.be.rejectedWith(Error, '"replacements" must be an array or a plain object, but received 2 instead');
    });

    it('reject with the passed empty object', () => {
      return current
        .query('select :one as foo, :two as bar', { raw: true, replacements: {} })
        .should.be.rejectedWith(Error, 'Named replacement ":one" has no entry in the replacement map.');
    });

    it('reject with the passed string', () => {
      return current
        .query('select :one as foo, :two as bar', { raw: true, replacements: 'foobar' })
        .should.be.rejectedWith(
          Error,
          '"replacements" must be an array or a plain object, but received "foobar" instead.'
        );
    });

    it('reject with the passed date', () => {
      return current
        .query('select :one as foo, :two as bar', { raw: true, replacements: new Date() })
        .should.be.rejectedWith(Error, '"replacements" must be an array or a plain object');
    });

    it('binds token with the passed array', async () => {
      const typeCast = '::int';
      let logSql;

      const result = await current.query('select $1' + typeCast + ' as foo, $2' + typeCast + ' as bar', {
        type: current.QueryTypes.SELECT,
        bind: [1, 2],
        logging(s) {
          logSql = s;
        }
      });

      expect(result).to.deep.equal([{ foo: 1, bar: 2 }]);

      expect(logSql.indexOf('$1')).to.be.above(-1);
    });

    it('binds named parameters with the passed object', async () => {
      const typeCast = '::int';
      let logSql;

      const result = await current.query('select $one' + typeCast + ' as foo, $two' + typeCast + ' as bar', {
        raw: true,
        bind: { one: 1, two: 2 },
        logging(s) {
          logSql = s;
        }
      });

      expect(result[0]).to.deep.equal([{ foo: 1, bar: 2 }]);

      expect(logSql.indexOf('$1')).to.be.above(-1);
    });

    it('binds named parameters with the passed object using the same key twice', async () => {
      const typeCast = '::int';
      let logSql;

      const result = await current.query(
        'select $one' + typeCast + ' as foo, $two' + typeCast + ' as bar, $one' + typeCast + ' as baz',
        {
          raw: true,
          bind: { one: 1, two: 2 },
          logging(s) {
            logSql = s;
          }
        }
      );

      expect(result[0]).to.deep.equal([{ foo: 1, bar: 2, baz: 1 }]);

      expect(logSql.indexOf('$1')).to.be.above(-1);
      expect(logSql.indexOf('$2')).to.be.above(-1);
      expect(logSql.indexOf('$3')).to.equal(-1);
    });

    it('binds named parameters with the passed object having a null property', async () => {
      const typeCast = '::int';

      const result = await current.query('select $one' + typeCast + ' as foo, $two' + typeCast + ' as bar', {
        raw: true,
        bind: { one: 1, two: null }
      });

      expect(result[0]).to.deep.equal([{ foo: 1, bar: null }]);
    });

    it('binds named parameters array handles escaped $$', async () => {
      const typeCast = '::int';
      let logSql;

      const result = await current.query('select $1' + typeCast + " as foo, '$$ / $$1' as bar", {
        raw: true,
        bind: [1],
        logging(s) {
          logSql = s;
        }
      });

      expect(result[0]).to.deep.equal([{ foo: 1, bar: '$ / $1' }]);

      expect(logSql.indexOf('$1')).to.be.above(-1);
    });

    it('binds named parameters object handles escaped $$', async () => {
      const typeCast = '::int';

      const result = await current.query('select $one' + typeCast + " as foo, '$$ / $$one' as bar", {
        raw: true,
        bind: { one: 1 }
      });

      expect(result[0]).to.deep.equal([{ foo: 1, bar: '$ / $one' }]);
    });

    it('does not improperly escape arrays of strings bound to named parameters', async () => {
      const result = await current.query('select :stringArray as foo', {
        raw: true,
        replacements: { stringArray: ['"string"'] }
      });

      expect(result[0]).to.deep.equal([{ foo: '"string"' }]);
    });

    it('reject when binds passed with object and numeric $1 is also present', () => {
      const typeCast = '::int';
      return current
        .query('select $one' + typeCast + ' as foo, $two' + typeCast + " as bar, '$1' as baz", {
          raw: true,
          bind: { one: 1, two: 2 }
        })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when binds passed as array and $alpha is also present', () => {
      const typeCast = '::int';
      return current
        .query('select $1' + typeCast + ' as foo, $2' + typeCast + " as bar, '$foo' as baz", {
          raw: true,
          bind: [1, 2]
        })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is $0 with the passed array', () => {
      return current
        .query('select $1 as foo, $0 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is $01 with the passed array', () => {
      return current
        .query('select $1 as foo, $01 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is missing in the passed array', () => {
      return current
        .query('select $1 as foo, $2 as bar, $3 as baz', { raw: true, bind: [1, 2] })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject when bind key is missing in the passed object', () => {
      return current
        .query('select $one as foo, $two as bar, $three as baz', { raw: true, bind: { one: 1, two: 2 } })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed number for bind', () => {
      return current
        .query('select $one as foo, $two as bar', { raw: true, bind: 2 })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed empty object for bind', () => {
      return current
        .query('select $one as foo, $two as bar', { raw: true, bind: {} })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed string for bind', () => {
      return current
        .query('select $one as foo, $two as bar', { raw: true, bind: 'foobar' })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('reject with the passed date for bind', () => {
      return current
        .query('select $one as foo, $two as bar', { raw: true, bind: new Date() })
        .should.be.rejectedWith(Error, /Named bind parameter "\$\w+" has no value in the given object\./g);
    });

    it('handles AS in conjunction with functions just fine', async () => {
      const datetime = 'NOW()';

      const [result] = await current.query('SELECT ' + datetime + ' AS t');

      expect(moment(result[0].t).isValid()).to.be.true;
    });

    if (Support.getTestDialect() === 'postgres') {
      it('replaces named parameters with the passed object and ignores casts', async () => {
        const rows = await current.query("select :one as foo, :two as bar, '1000'::integer as baz", {
          raw: true,
          replacements: { one: 1, two: 2 }
        });

        expect(rows[0]).to.deep.equal([{ foo: 1, bar: 2, baz: 1000 }]);
      });

      it('supports WITH queries', async () => {
        const rows = await current.query(
          'WITH RECURSIVE t(n) AS ( VALUES (1) UNION ALL SELECT n+1 FROM t WHERE n < 100) SELECT sum(n) FROM t'
        );

        expect(rows[0]).to.deep.equal([{ sum: '5050' }]);
      });
    }

    if (Support.getTestDialect() === 'sqlite') {
      it('binds array parameters for upsert are replaced. $$ unescapes only once', async () => {
        let logSql;

        await current.query("select $1 as foo, $2 as bar, '$$$$' as baz", {
          type: current.QueryTypes.UPSERT,
          bind: [1, 2],
          logging(s) {
            logSql = s;
          }
        });

        // sqlite.exec does not return a result
        expect(logSql.indexOf('$one')).to.equal(-1);
        expect(logSql.indexOf("'$$'")).to.be.above(-1);
      });

      it('binds named parameters for upsert are replaced. $$ unescapes only once', async () => {
        let logSql;

        await current.query("select $one as foo, $two as bar, '$$$$' as baz", {
          type: current.QueryTypes.UPSERT,
          bind: { one: 1, two: 2 },
          logging(s) {
            logSql = s;
          }
        });

        // sqlite.exec does not return a result
        expect(logSql.indexOf('$one')).to.equal(-1);
        expect(logSql.indexOf("'$$'")).to.be.above(-1);
      });
    }
  });

  describe('set', () => {
    it('should be configurable with global functions', () => {
      const defaultSetterMethod = sinon.spy(),
        overrideSetterMethod = sinon.spy(),
        defaultGetterMethod = sinon.spy(),
        overrideGetterMethod = sinon.spy(),
        customSetterMethod = sinon.spy(),
        customOverrideSetterMethod = sinon.spy(),
        customGetterMethod = sinon.spy(),
        customOverrideGetterMethod = sinon.spy();

      current.options.define = {
        setterMethods: {
          default: defaultSetterMethod,
          override: overrideSetterMethod
        },
        getterMethods: {
          default: defaultGetterMethod,
          override: overrideGetterMethod
        }
      };
      const testEntity = current.define(
        'TestEntity',
        {},
        {
          setterMethods: {
            custom: customSetterMethod,
            override: customOverrideSetterMethod
          },
          getterMethods: {
            custom: customGetterMethod,
            override: customOverrideGetterMethod
          }
        }
      );

      // Create Instance to test
      const instance = testEntity.build();

      // Call Getters
      instance.default;
      instance.custom;
      instance.override;

      expect(defaultGetterMethod.calledOnce).to.be.true;
      expect(customGetterMethod.calledOnce).to.be.true;
      expect(overrideGetterMethod.callCount).to.be.eql(0);
      expect(customOverrideGetterMethod.calledOnce).to.be.true;

      // Call Setters
      instance.default = 'test';
      instance.custom = 'test';
      instance.override = 'test';

      expect(defaultSetterMethod.calledOnce).to.be.true;
      expect(customSetterMethod.calledOnce).to.be.true;
      expect(overrideSetterMethod.callCount).to.be.eql(0);
      expect(customOverrideSetterMethod.calledOnce).to.be.true;
    });
  });

  describe('define', () => {
    it('adds a new dao to the dao manager', () => {
      const count = current.modelManager.all.length;
      current.define('foo', { title: DataTypes.STRING });
      expect(current.modelManager.all.length).to.equal(count + 1);
    });

    it('adds a new dao to sequelize.models', () => {
      expect(current.models.bar).to.equal(undefined);
      const Bar = current.define('bar', { title: DataTypes.STRING });
      expect(current.models.bar).to.equal(Bar);
    });

    it('overwrites global options', () => {
      const sequelize = Support.createSequelizeInstance({ define: { collate: 'utf8_general_ci' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING }, { collate: 'utf8_bin' });
      expect(DAO.options.collate).to.equal('utf8_bin');
    });

    it('overwrites global rowFormat options', () => {
      const sequelize = Support.createSequelizeInstance({ define: { rowFormat: 'compact' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING }, { rowFormat: 'default' });
      expect(DAO.options.rowFormat).to.equal('default');
    });

    it('inherits global collate option', () => {
      const sequelize = Support.createSequelizeInstance({ define: { collate: 'utf8_general_ci' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING });
      expect(DAO.options.collate).to.equal('utf8_general_ci');
    });

    it('inherits global rowFormat option', () => {
      const sequelize = Support.createSequelizeInstance({ define: { rowFormat: 'default' } });
      const DAO = sequelize.define('foo', { bar: DataTypes.STRING });
      expect(DAO.options.rowFormat).to.equal('default');
    });

    it('uses the passed tableName', async () => {
      const Photo = current.define('Foto', { name: DataTypes.STRING }, { tableName: 'photos' });

      await Photo.sync({ force: true });

      const tableNames = await current.getQueryInterface().showAllTables();

      expect(tableNames).to.include('photos');
    });
  });

  describe('truncate', () => {
    it('truncates all models', async () => {
      const Project = current.define('project' + config.rand(), {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        title: DataTypes.STRING
      });

      await current.sync({ force: true });

      const project = await Project.create({ title: 'bla' });

      expect(project).to.exist;
      expect(project.title).to.equal('bla');
      expect(project.id).to.equal(1);

      await current.truncate();

      const projects = await Project.findAll({});

      expect(projects).to.exist;
      expect(projects).to.have.length(0);
    });
  });

  describe('sync', () => {
    it('synchronizes all models', async () => {
      const Project = current.define('project' + config.rand(), { title: DataTypes.STRING });
      const Task = current.define('task' + config.rand(), { title: DataTypes.STRING });

      await Project.sync({ force: true });
      await Task.sync({ force: true });
      await Project.create({ title: 'bla' });

      const task = await Task.create({ title: 'bla' });

      expect(task).to.exist;
      expect(task.title).to.equal('bla');
    });

    it('works with correct database credentials', async () => {
      const User = current.define('User', { username: DataTypes.STRING });

      await User.sync();

      expect(true).to.be.true;
    });

    it('fails with incorrect match condition', () => {
      const sequelize = new Sequelize('cyber_bird', 'user', 'pass', {
        dialect: current.options.dialect
      });

      sequelize.define('Project', { title: Sequelize.STRING });
      sequelize.define('Task', { title: Sequelize.STRING });

      return expect(sequelize.sync({ force: true, match: /$phoenix/ })).to.be.rejectedWith(
        'Database "cyber_bird" does not match sync match parameter "/$phoenix/"'
      );
    });

    it('fails with incorrect database credentials (1)', async () => {
      const sequelizeWithInvalidCredentials = new Sequelize(
        'omg',
        'bar',
        null,
        _.defaults({ host: 'localhost' }, _.omit(current.options, ['host']))
      );

      const User2 = sequelizeWithInvalidCredentials.define('User', {
        name: DataTypes.STRING,
        bio: DataTypes.TEXT
      });

      const err = await expect(User2.sync()).to.be.rejected;

      const validMessages = [
        'fe_sendauth: no password supplied',
        'role "bar" does not exist',
        'FATAL:  role "bar" does not exist',
        'password authentication failed for user "bar"'
      ];
      const isValid =
        validMessages.indexOf(err.message.trim()) !== -1 ||
        err.name === 'SequelizeConnectionRefusedError' ||
        err.message.includes('client password must be a string');
      assert(isValid, `Unexpected error: ${err.name}: ${JSON.stringify(err.message)}`);
    });

    it('fails with incorrect database credentials (2)', async () => {
      const sequelize = new Sequelize('db', 'user', 'pass', {
        dialect: current.options.dialect
      });

      sequelize.define('Project', { title: Sequelize.STRING });
      sequelize.define('Task', { title: Sequelize.STRING });

      const err = await expect(sequelize.sync({ force: true })).to.be.rejected;

      expect(err).to.be.ok;
    });

    it('fails with incorrect database credentials (3)', async () => {
      const sequelize = new Sequelize('db', 'user', 'pass', {
        dialect: current.options.dialect,
        port: 99999
      });

      sequelize.define('Project', { title: Sequelize.STRING });
      sequelize.define('Task', { title: Sequelize.STRING });

      const err = await expect(sequelize.sync({ force: true })).to.be.rejected;

      expect(err).to.be.ok;
    });

    it('fails with incorrect database credentials (4)', async () => {
      const sequelize = new Sequelize('db', 'user', 'pass', {
        dialect: current.options.dialect,
        port: 99999,
        pool: {}
      });

      sequelize.define('Project', { title: Sequelize.STRING });
      sequelize.define('Task', { title: Sequelize.STRING });

      const err = await expect(sequelize.sync({ force: true })).to.be.rejected;

      expect(err).to.be.ok;
    });

    it('returns an error correctly if unable to sync a foreign key referenced model', async () => {
      current.define('Application', {
        authorID: { type: Sequelize.BIGINT, allowNull: false, references: { model: 'User', key: 'id' } }
      });

      const error = await expect(current.sync()).to.be.rejected;

      assert.ok(error);
    });

    it('handles self dependant foreign key constraints', () => {
      const block = current.define(
        'block',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true },
          name: DataTypes.STRING
        },
        {
          tableName: 'block',
          timestamps: false,
          paranoid: false
        }
      );

      block.hasMany(block, {
        as: 'childBlocks',
        foreignKey: 'parent',
        joinTableName: 'link_block_block',
        useJunctionTable: true,
        foreignKeyConstraint: true
      });
      block.belongsTo(block, {
        as: 'parentBlocks',
        foreignKey: 'child',
        joinTableName: 'link_block_block',
        useJunctionTable: true,
        foreignKeyConstraint: true
      });

      return current.sync();
    });

    it('return the sequelize instance after syncing', async () => {
      const sequelize = await current.sync();

      expect(sequelize).to.deep.equal(current);
    });

    it('return the single dao after syncing', async () => {
      const block = current.define(
        'block',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true },
          name: DataTypes.STRING
        },
        {
          tableName: 'block',
          timestamps: false,
          paranoid: false
        }
      );

      const result = await block.sync();

      expect(result).to.deep.equal(block);
    });

    describe("doesn't emit logging when explicitly saying not to", () => {
      afterEach(() => {
        current.options.logging = false;
      });

      let spy, User;

      beforeEach(() => {
        spy = sinon.spy();
        current.options.logging = () => {
          spy();
        };
        User = current.define('UserTest', { username: DataTypes.STRING });
      });

      it('through Sequelize.sync()', async () => {
        spy.resetHistory();

        await current.sync({ force: true, logging: false });

        expect(spy.notCalled).to.be.true;
      });

      it('through DAOFactory.sync()', async () => {
        spy.resetHistory();

        await User.sync({ force: true, logging: false });

        expect(spy.notCalled).to.be.true;
      });
    });

    describe('match', () => {
      it('will return an error not matching', async () => {
        await expect(
          current.sync({
            force: true,
            match: /alibabaizshaek/
          })
        ).to.be.rejected;
      });
    });
  });

  describe('drop should work', () => {
    it('correctly succeeds', async () => {
      const User = current.define('Users', { username: DataTypes.STRING });

      await User.sync({ force: true });
      await User.drop();
    });
  });

  describe('import', () => {
    it('imports a dao definition from a file absolute path', () => {
      const Project = current.import(import.meta.dirname + '/assets/project');
      expect(Project).to.exist;
    });

    it('imports a dao definition with a default export', () => {
      const Project = current.import(import.meta.dirname + '/assets/es6project');
      expect(Project).to.exist;
    });

    it('imports a dao definition from a function', () => {
      const Project = current.import('Project', (sequelize, dataTypes) => {
        return sequelize.define('Project' + parseInt(Math.random() * 999999999999999, 10), {
          name: dataTypes.STRING
        });
      });

      expect(Project).to.exist;
    });
  });

  describe('define', () => {
    [
      { type: DataTypes.ENUM, values: ['scheduled', 'active', 'finished'] },
      DataTypes.ENUM('scheduled', 'active', 'finished')
    ].forEach((status) => {
      describe('enum', () => {
        let enumSequelize, Review;

        beforeEach(() => {
          enumSequelize = Support.createSequelizeInstance({
            typeValidation: true
          });

          Review = enumSequelize.define('review', { status });
          return Review.sync({ force: true });
        });

        it('raises an error if no values are defined', () => {
          expect(() => {
            enumSequelize.define('omnomnom', {
              bla: { type: DataTypes.ENUM }
            });
          }).to.throw(Error, 'Values for ENUM have not been defined.');
        });

        it('correctly stores values', async () => {
          const review = await Review.create({ status: 'active' });

          expect(review.status).to.equal('active');
        });

        it('correctly loads values', async () => {
          await Review.create({ status: 'active' });

          const reviews = await Review.findAll();

          expect(reviews[0].status).to.equal('active');
        });

        it("doesn't save an instance if value is not in the range of enums", async () => {
          const err = await expect(Review.create({ status: 'fnord' })).to.be.rejected;

          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('"fnord" is not a valid choice in ["scheduled","active","finished"]');
        });
      });
    });

    describe('table', () => {
      [
        { id: { type: DataTypes.BIGINT, primaryKey: true } },
        { id: { type: DataTypes.STRING, allowNull: true, primaryKey: true } },
        { id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true } }
      ].forEach((customAttributes) => {
        it('should be able to override options on the default attributes', async () => {
          const Picture = current.define('picture', _.cloneDeep(customAttributes));

          await Picture.sync({ force: true });

          Object.keys(customAttributes).forEach((attribute) => {
            Object.keys(customAttributes[attribute]).forEach((option) => {
              const optionValue = customAttributes[attribute][option];
              if (typeof optionValue === 'function' && optionValue() instanceof DataTypes.ABSTRACT) {
                expect(Picture.rawAttributes[attribute][option] instanceof optionValue).to.be.ok;
              } else {
                expect(Picture.rawAttributes[attribute][option]).to.be.equal(optionValue);
              }
            });
          });
        });
      });
    });

    if (current.dialect.supports.transactions) {
      describe('transaction', () => {
        let sequelizeWithTransaction;

        beforeEach(async () => {
          sequelizeWithTransaction = await Support.prepareTransactionTest(current);
        });

        it('is a transaction method available', () => {
          expect(Support.Sequelize).to.respondTo('transaction');
        });

        it('passes a transaction object to the callback', async () => {
          const t = await sequelizeWithTransaction.transaction();

          expect(t).to.be.instanceOf(Transaction);
        });

        it('allows me to define a callback on the result', async () => {
          const t = await sequelizeWithTransaction.transaction();

          await t.commit();
        });

        it('correctly handles multiple transactions', async () => {
          const TransactionTest = sequelizeWithTransaction.define(
            'TransactionTest',
            { name: DataTypes.STRING },
            { timestamps: false }
          );

          const count = async (transaction) => {
            const sql = sequelizeWithTransaction.getQueryInterface().QueryGenerator.selectQuery('TransactionTests', {
              attributes: [[Sequelize.literal('count(*)'), 'cnt']]
            });

            const result = await sequelizeWithTransaction.query(sql, { plain: true, transaction });

            return parseInt(result.cnt, 10);
          };

          await TransactionTest.sync({ force: true });

          const t1 = await sequelizeWithTransaction.transaction();
          await sequelizeWithTransaction.query(
            'INSERT INTO ' + qq('TransactionTests') + ' (' + qq('name') + ") VALUES ('foo');",
            { transaction: t1 }
          );

          const t2 = await sequelizeWithTransaction.transaction();
          await sequelizeWithTransaction.query(
            'INSERT INTO ' + qq('TransactionTests') + ' (' + qq('name') + ") VALUES ('bar');",
            { transaction: t2 }
          );

          await expect(count()).to.eventually.equal(0);
          await expect(count(t1)).to.eventually.equal(1);
          await expect(count(t2)).to.eventually.equal(1);

          await t2.rollback();
          await expect(count()).to.eventually.equal(0);

          await t1.commit();
          await expect(count()).to.eventually.equal(1);
        });

        it('supports nested transactions using savepoints', async () => {
          const User = sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });

          const t1 = await sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await sequelizeWithTransaction.transaction({ transaction: t1 });

          await user.update({ username: 'bar' }, { transaction: t2 });
          await t2.commit();

          const newUser = await user.reload({ transaction: t1 });

          expect(newUser.username).to.equal('bar');

          await t1.commit();
        });

        describe('supports rolling back to savepoints', () => {
          let User;

          beforeEach(async () => {
            User = sequelizeWithTransaction.define('user', {});

            await sequelizeWithTransaction.sync({ force: true });
          });

          it('rolls back to the first savepoint, undoing everything', async () => {
            const transaction = await sequelizeWithTransaction.transaction();

            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            await User.create({}, { transaction });

            // sp2 is never rolled back directly; rolling back sp1 discards it too.
            await sequelizeWithTransaction.transaction({ transaction });
            await User.create({}, { transaction });

            expect(await User.findAll({ transaction })).to.have.length(2);

            await sp1.rollback();

            expect(await User.findAll({ transaction })).to.have.length(0);

            await transaction.rollback();
          });

          it('rolls back to the most recent savepoint, only undoing recent changes', async () => {
            const transaction = await sequelizeWithTransaction.transaction();

            await sequelizeWithTransaction.transaction({ transaction });
            await User.create({}, { transaction });

            const sp2 = await sequelizeWithTransaction.transaction({ transaction });
            await User.create({}, { transaction });

            expect(await User.findAll({ transaction })).to.have.length(2);

            await sp2.rollback();

            expect(await User.findAll({ transaction })).to.have.length(1);

            await transaction.rollback();
          });
        });

        describe('rejects overlapping savepoints', () => {
          // The guard only applies when savepoints are actually released on commit.
          beforeEach(() => {
            sequelizeWithTransaction.options.releaseSavepointsOnCommit = true;
          });

          afterEach(() => {
            delete sequelizeWithTransaction.options.releaseSavepointsOnCommit;
          });

          it('names the cause when a sibling savepoint is closed after an outer one released it', async () => {
            const transaction = await sequelizeWithTransaction.transaction();
            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            const sp2 = await sequelizeWithTransaction.transaction({ transaction });

            // Releasing sp1 discards sp2 along with it, so closing sp2 afterwards is invalid.
            await sp1.commit();

            await expect(sp2.commit()).to.be.rejectedWith(/was already discarded/);
            await transaction.rollback();
          });

          it('reports the error without leaving the parent transaction unusable', async () => {
            const transaction = await sequelizeWithTransaction.transaction();
            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            const sp2 = await sequelizeWithTransaction.transaction({ transaction });

            await sp1.commit();
            await expect(sp2.rollback()).to.be.rejectedWith(/was already discarded/);

            // The guard throws before issuing SQL, so the parent is still good.
            const [rows] = await sequelizeWithTransaction.query('SELECT 1 AS ok', { transaction });
            expect(rows[0].ok).to.equal(1);

            await transaction.rollback();
          });

          it('exposes the root transaction from any depth', async () => {
            const transaction = await sequelizeWithTransaction.transaction();
            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            const sp2 = await sequelizeWithTransaction.transaction({ transaction: sp1 });

            expect(transaction.rootTransaction).to.equal(transaction);
            expect(sp1.rootTransaction).to.equal(transaction);
            expect(sp2.rootTransaction).to.equal(transaction);

            await sp2.commit();
            await sp1.commit();
            await transaction.rollback();
          });

          it('allows sequential nesting, which never overlaps', async () => {
            const transaction = await sequelizeWithTransaction.transaction();

            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            await sp1.commit();

            const sp2 = await sequelizeWithTransaction.transaction({ transaction });
            await sp2.commit();

            await transaction.rollback();
          });

          it('allows rolling back to an outer savepoint while an inner one is open', async () => {
            const transaction = await sequelizeWithTransaction.transaction();
            const sp1 = await sequelizeWithTransaction.transaction({ transaction });
            const sp2 = await sequelizeWithTransaction.transaction({ transaction: sp1 });

            // Postgres permits ROLLBACK TO on a non-innermost savepoint; sp2 goes with it.
            await sp1.rollback();
            await expect(sp2.commit()).to.be.rejectedWith(/was already discarded/);

            await transaction.rollback();
          });
        });

        it('supports rolling back a nested transaction', async () => {
          const User = sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });

          const t1 = await sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await sequelizeWithTransaction.transaction({ transaction: t1 });

          await user.update({ username: 'bar' }, { transaction: t2 });
          await t2.rollback();

          const newUser = await user.reload({ transaction: t1 });

          expect(newUser.username).to.equal('foo');

          await t1.commit();
        });

        it('supports rolling back outermost transaction', async () => {
          const User = sequelizeWithTransaction.define('Users', { username: DataTypes.STRING });

          await User.sync({ force: true });

          const t1 = await sequelizeWithTransaction.transaction();
          const user = await User.create({ username: 'foo' }, { transaction: t1 });
          const t2 = await sequelizeWithTransaction.transaction({ transaction: t1 });

          await user.update({ username: 'bar' }, { transaction: t2 });
          await t1.rollback();

          const users = await User.findAll();

          expect(users.length).to.equal(0);
        });
      });
    }
  });

  describe('databaseVersion', () => {
    it('should database/dialect version', async () => {
      const version = await current.databaseVersion();

      expect(typeof version).to.equal('string');
      expect(version).to.be.ok;
    });
  });

  describe('paranoid deletedAt non-null default value', () => {
    it('should use defaultValue of deletedAt in paranoid clause and restore', async () => {
      const epochObj = new Date(0),
        epoch = Number(epochObj);
      const User = current.define(
        'user',
        {
          username: DataTypes.STRING,
          deletedAt: {
            type: DataTypes.DATE,
            defaultValue: epochObj
          }
        },
        {
          paranoid: true
        }
      );

      await current.sync({ force: true });

      const user = await User.create({ username: 'user1' });
      expect(Number(user.deletedAt)).to.equal(epoch);

      const foundUser = await User.findOne({
        where: {
          username: 'user1'
        }
      });
      expect(foundUser).to.exist;
      expect(Number(foundUser.deletedAt)).to.equal(epoch);

      const destroyedUser = await foundUser.destroy();
      expect(destroyedUser.deletedAt).to.exist;
      expect(Number(destroyedUser.deletedAt)).not.to.equal(epoch);

      const fetchedDestroyedUser = await User.findByPk(destroyedUser.id, { paranoid: false });
      expect(fetchedDestroyedUser.deletedAt).to.exist;
      expect(Number(fetchedDestroyedUser.deletedAt)).not.to.equal(epoch);

      const restoredUser = await fetchedDestroyedUser.restore();
      expect(Number(restoredUser.deletedAt)).to.equal(epoch);

      await User.destroy({
        where: {
          username: 'user1'
        }
      });

      expect(await User.count()).to.equal(0);

      await User.restore();

      const nonDeletedUsers = await User.findAll();
      expect(nonDeletedUsers.length).to.equal(1);
      nonDeletedUsers.forEach((u) => {
        expect(Number(u.deletedAt)).to.equal(epoch);
      });
    });
  });
});
