import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import DataTypes from '../../../../lib/data-types.js';
import Support from '../../support.js';

const Sequelize = Support.Sequelize;
const current = Support.sequelize;

const constraintName = 'overlap_period';
let Booking;

beforeEach(async () => {
  Booking = current.define('Booking', {
    roomNo: DataTypes.INTEGER,
    period: DataTypes.RANGE(DataTypes.DATE)
  });
  await Booking.sync({ force: true });

  await current.query(
    'ALTER TABLE "' +
      Booking.tableName +
      '" ADD CONSTRAINT ' +
      constraintName +
      ' EXCLUDE USING gist ("roomNo" WITH =, period WITH &&)'
  );
});

describe('[POSTGRES Specific] ExclusionConstraintError', () => {
  it('should contain error specific properties', () => {
    const errDetails = {
      message: 'Exclusion constraint error',
      constraint: 'constraint_name',
      fields: { field1: 1, field2: [123, 321] },
      table: 'table_name',
      parent: new Error('Test error')
    };
    const err = new Sequelize.ExclusionConstraintError(errDetails);

    for (const [key, value] of Object.entries(errDetails)) {
      expect(value).to.be.deep.equal(err[key]);
    }
  });

  it('should throw ExclusionConstraintError when "period" value overlaps existing', async () => {
    await Booking.create({
      roomNo: 1,
      guestName: 'Incognito Visitor',
      period: [new Date(2015, 0, 1), new Date(2015, 0, 3)]
    });

    await expect(
      Booking.create({
        roomNo: 1,
        guestName: 'Frequent Visitor',
        period: [new Date(2015, 0, 2), new Date(2015, 0, 5)]
      })
    ).to.eventually.be.rejectedWith(Sequelize.ExclusionConstraintError);
  });
});
