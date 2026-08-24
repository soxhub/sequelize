import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Paranoid'), () => {
  let clock;
  let A, B, C, D;

  beforeEach(() => {
    const S = current,
      DT = DataTypes;

    A = S.define('A', { name: DT.STRING }, { paranoid: true });
    B = S.define('B', { name: DT.STRING }, { paranoid: true });
    C = S.define('C', { name: DT.STRING }, { paranoid: true });
    D = S.define('D', { name: DT.STRING }, { paranoid: true });

    A.belongsTo(B);
    A.belongsToMany(D, { through: 'a_d' });
    A.hasMany(C);

    B.hasMany(A);
    B.hasMany(C);

    C.belongsTo(A);
    C.belongsTo(B);

    D.belongsToMany(A, { through: 'a_d' });

    return S.sync({ force: true });
  });

  before(() => {
    clock = sinon.useFakeTimers();
  });

  after(() => {
    clock.restore();
  });

  it('paranoid with timestamps: false should be ignored / not crash', async () => {
    const S = current,
      Test = S.define(
        'Test',
        {
          name: DataTypes.STRING
        },
        {
          timestamps: false,
          paranoid: true
        }
      );

    await S.sync({ force: true });
    await Test.findByPk(1);
  });

  it('test if non required is marked as false', async () => {
    const options = {
      include: [
        {
          model: B,
          required: false
        }
      ]
    };

    await A.findOne(options);
    expect(options.include[0].required).to.be.equal(false);
  });

  it('test if required is marked as true', async () => {
    const options = {
      include: [
        {
          model: B,
          required: true
        }
      ]
    };

    await A.findOne(options);
    expect(options.include[0].required).to.be.equal(true);
  });

  it('should not load paranoid, destroyed instances, with a non-paranoid parent', async () => {
    const X = current.define(
      'x',
      {
        name: DataTypes.STRING
      },
      {
        paranoid: false
      }
    );

    const Y = current.define(
      'y',
      {
        name: DataTypes.STRING
      },
      {
        timestamps: true,
        paranoid: true
      }
    );

    X.hasMany(Y);

    await current.sync({ force: true });

    const [x, y] = await Promise.all([X.create(), Y.create()]);

    await x.addY(y);
    await y.destroy();

    // prevent CURRENT_TIMESTAMP to be same
    clock.tick(1000);

    const rows = await X.findAll({
      include: [Y]
    });

    expect(rows[0].ys).to.have.length(0);
  });
});
