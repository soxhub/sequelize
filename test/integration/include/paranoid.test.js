import * as chai from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const expect = chai.expect;

describe(Support.getTestDialectTeaser('Paranoid'), () => {
  beforeEach(function () {
    const S = this.sequelize,
      DT = DataTypes,
      A = (this.A = S.define('A', { name: DT.STRING }, { paranoid: true })),
      B = (this.B = S.define('B', { name: DT.STRING }, { paranoid: true })),
      C = (this.C = S.define('C', { name: DT.STRING }, { paranoid: true })),
      D = (this.D = S.define('D', { name: DT.STRING }, { paranoid: true }));

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

  before(function () {
    this.clock = sinon.useFakeTimers();
  });

  after(function () {
    this.clock.restore();
  });

  it('paranoid with timestamps: false should be ignored / not crash', async function () {
    const S = this.sequelize,
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
    await Test.findById(1);
  });

  it('test if non required is marked as false', async function () {
    const A = this.A,
      B = this.B,
      options = {
        include: [
          {
            model: B,
            required: false
          }
        ]
      };

    await A.find(options);
    expect(options.include[0].required).to.be.equal(false);
  });

  it('test if required is marked as true', async function () {
    const A = this.A,
      B = this.B,
      options = {
        include: [
          {
            model: B,
            required: true
          }
        ]
      };

    await A.find(options);
    expect(options.include[0].required).to.be.equal(true);
  });

  it('should not load paranoid, destroyed instances, with a non-paranoid parent', async function () {
    const X = this.sequelize.define(
      'x',
      {
        name: DataTypes.STRING
      },
      {
        paranoid: false
      }
    );

    const Y = this.sequelize.define(
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

    await this.sequelize.sync({ force: true });

    const [x, y] = await Promise.all([X.create(), Y.create()]);
    this.x = x;
    this.y = y;

    await x.addY(y);
    await this.y.destroy();

    // prevent CURRENT_TIMESTAMP to be same
    this.clock.tick(1000);

    const rows = await X.findAll({
      include: [Y]
    });

    expect(rows[0].ys).to.have.length(0);
  });
});
