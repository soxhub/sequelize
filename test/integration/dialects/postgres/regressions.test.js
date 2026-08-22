import * as chai from 'chai';
import Support from '../../support.js';

const expect = chai.expect;

const Sequelize = Support.Sequelize;

describe('[POSTGRES Specific] Regressions', () => {
  it('properly fetch OIDs after sync, #8749', async function () {
    const User = this.sequelize.define('User', {
      active: Sequelize.BOOLEAN
    });

    /**
     * This Model is important, sync will try to fetch OIDs after each ENUM model sync
     * Having ENUM in this model will force OIDs re-fetch
     * We are testing that OID refresh keep base type intact
     */
    const Media = this.sequelize.define('Media', {
      type: Sequelize.ENUM(['image', 'video', 'audio'])
    });

    User.hasMany(Media);
    Media.belongsTo(User);

    await this.sequelize.sync({ force: true });

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
