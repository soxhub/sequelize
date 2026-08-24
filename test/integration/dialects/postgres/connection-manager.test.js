import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../../support.js';
import DataTypes from '../../../../lib/data-types.js';
import _ from 'lodash';

const current = Support.sequelize;

describe('[POSTGRES] Sequelize', () => {
  async function checkTimezoneParsing(baseOptions) {
    const options = _.extend({}, baseOptions, { timezone: 'Asia/Kolkata', timestamps: true });
    const sequelize = Support.createSequelizeInstance(options);

    const tzTable = sequelize.define('tz_table', { foo: DataTypes.STRING });
    await tzTable.sync({ force: true });

    const row = await tzTable.create({ foo: 'test' });
    expect(row).to.be.not.null;
  }

  it('should correctly parse the moment based timezone', () => {
    return checkTimezoneParsing(current.options);
  });

  it('should correctly parse the moment based timezone while fetching hstore oids', () => {
    // reset oids so we need to refetch them
    DataTypes.HSTORE.types.postgres.oids = [];
    DataTypes.HSTORE.types.postgres.array_oids = [];
    return checkTimezoneParsing(current.options);
  });
});
