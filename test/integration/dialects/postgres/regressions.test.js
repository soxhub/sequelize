import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../../support.js';

const Sequelize = Support.Sequelize;
const current = Support.sequelize;

describe('[POSTGRES Specific] Regressions', () => {
  it('properly fetch OIDs after sync, #8749', async () => {
    const User = current.define('User', {
      active: Sequelize.BOOLEAN
    });

    /**
     * This Model is important, sync will try to fetch OIDs after each ENUM model sync
     * Having ENUM in this model will force OIDs re-fetch
     * We are testing that OID refresh keep base type intact
     */
    const Media = current.define('Media', {
      type: Sequelize.ENUM(['image', 'video', 'audio'])
    });

    User.hasMany(Media);
    Media.belongsTo(User);

    await current.sync({ force: true });

    const created = await User.create({ active: true });
    expect(created.active).to.be.true;
    expect(created.get('active')).to.be.true;

    const found = await User.findOne();
    expect(found.active).to.be.true;
    expect(found.get('active')).to.be.true;

    const raw = await User.findOne({ raw: true });
    expect(raw.active).to.be.true;
  });
});
