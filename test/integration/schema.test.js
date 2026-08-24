import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';

describe(Support.getTestDialectTeaser('Schema'), () => {
  beforeEach(function () {
    return this.sequelize.createSchema('testschema');
  });

  afterEach(function () {
    return this.sequelize.dropSchema('testschema');
  });

  beforeEach(function () {
    this.User = this.sequelize.define(
      'User',
      {
        aNumber: { type: DataTypes.INTEGER }
      },
      {
        schema: 'testschema'
      }
    );

    return this.User.sync({ force: true });
  });

  it('supports increment', async function () {
    const user = await this.User.create({ aNumber: 1 });
    const incremented = await user.increment('aNumber', { by: 3 });
    const reloaded = await incremented.reload();

    expect(reloaded).to.be.ok;
    expect(reloaded.aNumber).to.be.equal(4);
  });

  it('supports decrement', async function () {
    const user = await this.User.create({ aNumber: 10 });
    const decremented = await user.decrement('aNumber', { by: 3 });
    const reloaded = await decremented.reload();

    expect(reloaded).to.be.ok;
    expect(reloaded.aNumber).to.be.equal(7);
  });
});
