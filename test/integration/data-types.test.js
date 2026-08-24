import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';
import sinon from 'sinon';
import moment from 'moment';
import * as uuid from 'uuid';
import DataTypes from '../../lib/data-types.js';
import * as Timezone from '../../lib/utils/timezone.js';
import BigInt from 'big-integer';
import semver from 'semver';

const current = Support.sequelize;

const dialect = Support.getTestDialect();

describe(Support.getTestDialectTeaser('DataTypes'), () => {
  afterEach(function () {
    // Restore some sanity by resetting all parsers
    this.sequelize.connectionManager._clearTypeParser();
    this.sequelize.connectionManager.refreshTypeParser(DataTypes[dialect]); // Reload custom parsers
  });

  it('allows me to return values from a custom parse function', async function () {
    const parse = (Sequelize.DATE.parse = sinon.spy((value) => {
      return moment(value, 'YYYY-MM-DD HH:mm:ss');
    }));

    const stringify = (Sequelize.DATE.prototype.stringify = sinon.spy(function (value, options) {
      // `_sanitize` has already turned the moment handed to `create` into a Date.
      // `_applyTimezone` reports the configured offset in minutes east of UTC.
      return Timezone.formatWithOffset(value, this._applyTimezone(value, options)).slice(0, 19);
    }));

    current.refreshTypes();

    const User = current.define(
      'user',
      {
        dateField: Sequelize.DATE
      },
      {
        timestamps: false
      }
    );

    await current.sync({ force: true });

    await User.create({
      dateField: moment('2011 10 31', 'YYYY MM DD')
    });

    const rows = await User.findAll();

    expect(parse.called, 'parse should have been called').to.be.true;
    expect(stringify.called, 'stringify should have been called').to.be.true;

    expect(moment.isMoment(rows[0].dateField)).to.be.ok;

    delete Sequelize.DATE.parse;
  });

  const testSuccess = async function (Type, value) {
    const parse = (Type.constructor.parse = sinon.spy((parsedValue) => {
      return parsedValue;
    }));

    const stringify = (Type.constructor.prototype.stringify = sinon.spy(function () {
      return Sequelize.ABSTRACT.prototype.stringify.apply(this, arguments);
    }));

    const User = current.define(
      'user',
      {
        field: Type
      },
      {
        timestamps: false
      }
    );

    await current.sync({ force: true });

    current.refreshTypes();

    await User.create({
      field: value
    });

    await User.findAll();

    expect(parse.called, 'parse should have been called').to.be.true;
    expect(stringify.called, 'stringify should have been called').to.be.true;

    delete Type.constructor.parse;
    delete Type.constructor.prototype.stringify;
  };

  const testFailure = function (Type) {
    Type.constructor.parse = () => {};

    expect(() => {
      current.refreshTypes();
    }).to.throw('Parse function not supported for type ' + Type.key + ' in dialect ' + dialect);

    delete Type.constructor.parse;
  };

  if (current.dialect.supports.JSON) {
    it('calls parse and stringify for JSON', () => {
      const Type = new Sequelize.JSON();

      return testSuccess(Type, { test: 42, nested: { foo: 'bar' } });
    });
  }

  if (current.dialect.supports.JSONB) {
    it('calls parse and stringify for JSONB', () => {
      const Type = new Sequelize.JSONB();

      return testSuccess(Type, { test: 42, nested: { foo: 'bar' } });
    });
  }

  if (current.dialect.supports.HSTORE) {
    it('calls parse and stringify for HSTORE', () => {
      const Type = new Sequelize.HSTORE();

      return testSuccess(Type, { test: 42, nested: false });
    });
  }

  if (current.dialect.supports.RANGE) {
    it('calls parse and stringify for RANGE', () => {
      const Type = new Sequelize.RANGE(new Sequelize.INTEGER());

      return testSuccess(Type, [1, 2]);
    });
  }

  it('calls parse and stringify for DATE', () => {
    const Type = new Sequelize.DATE();

    return testSuccess(Type, new Date());
  });

  it('calls parse and stringify for DATEONLY', () => {
    const Type = new Sequelize.DATEONLY();

    return testSuccess(Type, moment(new Date()).format('YYYY-MM-DD'));
  });

  it('calls parse and stringify for TIME', () => {
    const Type = new Sequelize.TIME();

    return testSuccess(Type, new Date());
  });

  it('calls parse and stringify for BLOB', () => {
    const Type = new Sequelize.BLOB();

    return testSuccess(Type, 'foobar');
  });

  it('calls parse and stringify for CHAR', () => {
    const Type = new Sequelize.CHAR();

    return testSuccess(Type, 'foobar');
  });

  it('calls parse and stringify for STRING', () => {
    const Type = new Sequelize.STRING();

    return testSuccess(Type, 'foobar');
  });

  it('calls parse and stringify for TEXT', () => {
    const Type = new Sequelize.TEXT();

    return testSuccess(Type, 'foobar');
  });

  it('calls parse and stringify for BOOLEAN', () => {
    const Type = new Sequelize.BOOLEAN();

    return testSuccess(Type, true);
  });

  it('calls parse and stringify for INTEGER', () => {
    const Type = new Sequelize.INTEGER();

    return testSuccess(Type, 1);
  });

  it('calls parse and stringify for DECIMAL', () => {
    const Type = new Sequelize.DECIMAL();

    return testSuccess(Type, 1.5);
  });

  it('calls parse and stringify for BIGINT', () => {
    const Type = new Sequelize.BIGINT();

    return testSuccess(Type, 1);
  });

  it('should handle JS BigInt type', async function () {
    const User = this.sequelize.define('user', {
      age: Sequelize.BIGINT
    });

    const age = BigInt(Number.MAX_SAFE_INTEGER).add(Number.MAX_SAFE_INTEGER);

    await User.sync({ force: true });

    const user = await User.create({ age });
    expect(BigInt(user.age).toString()).to.equal(age.toString());

    const users = await User.findAll({
      where: { age }
    });

    expect(users).to.have.lengthOf(1);
    expect(BigInt(users[0].age).toString()).to.equal(age.toString());
  });

  it('calls parse and stringify for DOUBLE', () => {
    const Type = new Sequelize.DOUBLE();

    return testSuccess(Type, 1.5);
  });

  it('calls parse and stringify for FLOAT', () => {
    const Type = new Sequelize.FLOAT();

    // Postgres doesn't have float, maps to either decimal or double
    testFailure(Type);
  });

  it('calls parse and stringify for REAL', () => {
    const Type = new Sequelize.REAL();

    return testSuccess(Type, 1.5);
  });

  it('calls parse and stringify for UUID', () => {
    const Type = new Sequelize.UUID();

    // there is no dialect.supports.UUID yet

    return testSuccess(Type, uuid.v4());
  });

  it('calls parse and stringify for CIDR', () => {
    const Type = new Sequelize.CIDR();

    return testSuccess(Type, '10.1.2.3/32');
  });

  it('calls parse and stringify for INET', () => {
    const Type = new Sequelize.INET();

    return testSuccess(Type, '127.0.0.1');
  });

  it('calls parse and stringify for MACADDR', () => {
    const Type = new Sequelize.MACADDR();

    return testSuccess(Type, '01:23:45:67:89:ab');
  });

  it('calls parse and stringify for ENUM', () => {
    const Type = new Sequelize.ENUM('hat', 'cat');

    return testSuccess(Type, 'hat');
  });

  if (current.dialect.supports.GEOMETRY) {
    it('calls parse and stringify for GEOMETRY', () => {
      const Type = new Sequelize.GEOMETRY();

      return testSuccess(Type, { type: 'Point', coordinates: [125.6, 10.1] });
    });

    it('should parse an empty GEOMETRY field', async () => {
      const Type = new Sequelize.GEOMETRY();

      // MySQL 5.7 or above doesn't support POINT EMPTY

      const result = await current.query('SELECT PostGIS_Lib_Version();');
      const runTests = Boolean(result[0][0] && semver.lte(result[0][0].postgis_lib_version, '2.1.7'));

      if (current.dialect.supports.GEOMETRY && runTests) {
        current.refreshTypes();

        const User = current.define('user', { field: Type }, { timestamps: false });
        const point = { type: 'Point', coordinates: [] };

        await current.sync({ force: true });

        await User.create({
          // insert a empty GEOMETRY type
          field: point
        });

        // This case throw unhandled exception
        const users = await User.findAll();

        // Empty Geometry data [0,0] as per https://trac.osgeo.org/postgis/ticket/1996
        expect(users[0].field).to.be.deep.eql({ type: 'Point', coordinates: [0, 0] });
      }
    });

    it('should parse null GEOMETRY field', async () => {
      const Type = new Sequelize.GEOMETRY();

      current.refreshTypes();

      const User = current.define('user', { field: Type }, { timestamps: false });
      const point = null;

      await current.sync({ force: true });

      await User.create({
        // insert a null GEOMETRY type
        field: point
      });

      // This case throw unhandled exception
      const users = await User.findAll();
      expect(users[0].field).to.be.eql(null);
    });
  }

  // postgres actively supports IEEE floating point literals, and sqlite doesn't care what we throw at it
  it('should store and parse IEEE floating point literals (NaN and Infinity)', async function () {
    const Model = this.sequelize.define('model', {
      float: Sequelize.FLOAT,
      double: Sequelize.DOUBLE,
      real: Sequelize.REAL
    });

    await Model.sync({ force: true });

    await Model.create({
      id: 1,
      float: NaN,
      double: Infinity,
      real: -Infinity
    });

    const user = await Model.findOne({ where: { id: 1 } });
    expect(user.get('float')).to.be.NaN;
    expect(user.get('double')).to.eq(Infinity);
    expect(user.get('real')).to.eq(-Infinity);
  });

  it('should parse DECIMAL as string', async function () {
    const Model = this.sequelize.define('model', {
      decimal: Sequelize.DECIMAL,
      decimalPre: Sequelize.DECIMAL(10, 4),
      decimalWithParser: Sequelize.DECIMAL(32, 15),
      decimalWithIntParser: Sequelize.DECIMAL(10, 4),
      decimalWithFloatParser: Sequelize.DECIMAL(10, 8)
    });

    const sampleData = {
      id: 1,
      decimal: 12345678.12345678,
      decimalPre: 123456.1234,
      decimalWithParser: '12345678123456781.123456781234567',
      decimalWithIntParser: 1.234,
      decimalWithFloatParser: 0.12345678
    };

    await Model.sync({ force: true });
    await Model.create(sampleData);

    const user = await Model.findByPk(1);

    /**
     * MYSQL default precision is 10 and scale is 0
     * Thus test case below will return number without any fraction values
     */

    expect(user.get('decimal')).to.be.eql('12345678.12345678');

    expect(user.get('decimalPre')).to.be.eql('123456.1234');
    expect(user.get('decimalWithParser')).to.be.eql('12345678123456781.123456781234567');
    expect(user.get('decimalWithIntParser')).to.be.eql('1.2340');
    expect(user.get('decimalWithFloatParser')).to.be.eql('0.12345678');
  });

  it('should parse BIGINT as string', async function () {
    const Model = this.sequelize.define('model', {
      jewelPurity: Sequelize.BIGINT
    });

    const sampleData = {
      id: 1,
      jewelPurity: '9223372036854775807'
    };

    await Model.sync({ force: true });
    await Model.create(sampleData);

    const user = await Model.findByPk(1);
    expect(user.get('jewelPurity')).to.be.eql(sampleData.jewelPurity);
    expect(user.get('jewelPurity')).to.be.string;
  });

  it('should return Int4 range properly #5747', async function () {
    const Model = this.sequelize.define('M', {
      interval: {
        type: Sequelize.RANGE(Sequelize.INTEGER),
        allowNull: false,
        unique: true
      }
    });

    await Model.sync({ force: true });
    await Model.create({ interval: [1, 4] });

    const [m] = await Model.findAll();
    expect(m.interval[0]).to.be.eql(1);
    expect(m.interval[1]).to.be.eql(4);
  });

  it('should allow spaces in ENUM', async function () {
    const Model = this.sequelize.define('user', {
      name: Sequelize.STRING,
      type: Sequelize.ENUM(['action', 'mecha', 'canon', 'class s'])
    });

    await Model.sync({ force: true });

    const record = await Model.create({ name: 'sakura', type: 'class s' });
    expect(record.type).to.be.eql('class s');
  });

  it('should return YYYY-MM-DD format string for DATEONLY', async function () {
    const Model = this.sequelize.define('user', {
      stamp: Sequelize.DATEONLY
    });
    const testDate = moment().format('YYYY-MM-DD');
    const newDate = new Date();

    await Model.sync({ force: true });

    const created = await Model.create({ stamp: testDate });
    expect(typeof created.stamp).to.be.eql('string');
    expect(created.stamp).to.be.eql(testDate);

    const found = await Model.findByPk(created.id);
    expect(typeof found.stamp).to.be.eql('string');
    expect(found.stamp).to.be.eql(testDate);

    const updated = await found.update({
      stamp: testDate
    });
    await updated.reload();

    expect(typeof updated.stamp).to.be.eql('string');
    expect(updated.stamp).to.be.eql(testDate);

    const redated = await updated.update({
      stamp: newDate
    });
    await redated.reload();

    expect(typeof redated.stamp).to.be.eql('string');
    expect(redated.stamp).to.be.eql(moment(newDate).format('YYYY-MM-DD'));
  });

  it('should return set DATEONLY field to NULL correctly', async function () {
    const Model = this.sequelize.define('user', {
      stamp: Sequelize.DATEONLY
    });
    const testDate = moment().format('YYYY-MM-DD');

    await Model.sync({ force: true });

    const created = await Model.create({ stamp: testDate });
    expect(typeof created.stamp).to.be.eql('string');
    expect(created.stamp).to.be.eql(testDate);

    const found = await Model.findByPk(created.id);
    expect(typeof found.stamp).to.be.eql('string');
    expect(found.stamp).to.be.eql(testDate);

    const nulled = await found.update({
      stamp: null
    });
    await nulled.reload();

    expect(nulled.stamp).to.be.eql(null);
  });

  it('should be able to cast buffer as boolean', async function () {
    const ByteModel = this.sequelize.define(
      'Model',
      {
        byteToBool: this.sequelize.Sequelize.BLOB
      },
      {
        timestamps: false
      }
    );

    const BoolModel = this.sequelize.define(
      'Model',
      {
        byteToBool: this.sequelize.Sequelize.BOOLEAN
      },
      {
        timestamps: false
      }
    );

    await ByteModel.sync({
      force: true
    });

    const byte = await ByteModel.create({
      byteToBool: Buffer.from([true])
    });
    expect(byte.byteToBool).to.be.ok;

    const bool = await BoolModel.findByPk(byte.id);
    expect(bool.byteToBool).to.be.true;
  });
});
