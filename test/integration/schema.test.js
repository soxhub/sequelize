import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Schema'), () => {
  let User;

  beforeEach(() => {
    return current.createSchema('testschema');
  });

  afterEach(() => {
    return current.dropSchema('testschema');
  });

  beforeEach(() => {
    User = current.define(
      'User',
      {
        aNumber: { type: DataTypes.INTEGER }
      },
      {
        schema: 'testschema'
      }
    );

    return User.sync({ force: true });
  });

  it('supports increment', async () => {
    const user = await User.create({ aNumber: 1 });
    const incremented = await user.increment('aNumber', { by: 3 });
    const reloaded = await incremented.reload();

    expect(reloaded).to.be.ok;
    expect(reloaded.aNumber).to.be.equal(4);
  });

  it('supports decrement', async () => {
    const user = await User.create({ aNumber: 10 });
    const decremented = await user.decrement('aNumber', { by: 3 });
    const reloaded = await decremented.reload();

    expect(reloaded).to.be.ok;
    expect(reloaded.aNumber).to.be.equal(7);
  });
});
