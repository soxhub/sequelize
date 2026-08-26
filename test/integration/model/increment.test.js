import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let clock, SharedUser;

  beforeAll(() => {
    clock = sinon.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(() => {
    clock.restore();
  });

  beforeEach(async () => {
    SharedUser = current.define('User', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      aNumber: { type: DataTypes.INTEGER },
      bNumber: { type: DataTypes.INTEGER },
      cNumber: { type: DataTypes.INTEGER, field: 'c_number' }
    });

    await SharedUser.sync({ force: true });

    await SharedUser.bulkCreate([
      {
        id: 1,
        aNumber: 0,
        bNumber: 0
      },
      {
        id: 2,
        aNumber: 0,
        bNumber: 0
      },
      {
        id: 3,
        aNumber: 0,
        bNumber: 0
      },
      {
        id: 4,
        aNumber: 0,
        bNumber: 0,
        cNumber: 0
      }
    ]);
  });

  ['increment', 'decrement'].forEach((method) => {
    describe(method, () => {
      let assert;

      beforeAll(() => {
        assert = (increment, decrement) => {
          return method === 'increment' ? increment : decrement;
        };
      });

      it('supports where conditions', async () => {
        await SharedUser.findByPk(1);
        await SharedUser[method](['aNumber'], { by: 2, where: { id: 1 } });

        const user3 = await SharedUser.findByPk(2);
        expect(user3.aNumber).to.be.equal(assert(0, 0));
      });

      it('uses correct column names for where conditions', async () => {
        await SharedUser[method](['aNumber'], { by: 2, where: { cNumber: 0 } });

        const user4 = await SharedUser.findByPk(4);
        expect(user4.aNumber).to.be.equal(assert(2, -2));
      });

      it('should still work right with other concurrent increments', async () => {
        const aUsers = await SharedUser.findAll();

        await Promise.all([
          SharedUser[method](['aNumber'], { by: 2, where: {} }),
          SharedUser[method](['aNumber'], { by: 2, where: {} }),
          SharedUser[method](['aNumber'], { by: 2, where: {} })
        ]);

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 6, aUsers[i].aNumber - 6));
        }
      });

      it('with array', async () => {
        const aUsers = await SharedUser.findAll();
        await SharedUser[method](['aNumber'], { by: 2, where: {} });

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 2, aUsers[i].aNumber - 2));
        }
      });

      it('with single field', async () => {
        const aUsers = await SharedUser.findAll();
        await SharedUser[method]('aNumber', { by: 2, where: {} });

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 2, aUsers[i].aNumber - 2));
        }
      });

      it('with single field and no value', async () => {
        const aUsers = await SharedUser.findAll();
        await SharedUser[method]('aNumber', { where: {} });

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 1, aUsers[i].aNumber - 1));
        }
      });

      it('with key value pair', async () => {
        const aUsers = await SharedUser.findAll();
        await SharedUser[method]({ aNumber: 1, bNumber: 2 }, { where: {} });

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 1, aUsers[i].aNumber - 1));
          expect(bUsers[i].bNumber).to.equal(assert(aUsers[i].bNumber + 2, aUsers[i].bNumber - 2));
        }
      });

      it('should still work right with other concurrent updates', async () => {
        const aUsers = await SharedUser.findAll();
        await SharedUser.update({ aNumber: 2 }, { where: {} });
        await SharedUser[method](['aNumber'], { by: 2, where: {} });

        const bUsers = await SharedUser.findAll();
        for (let i = 0; i < bUsers.length; i++) {
          // for decrement 2 - 2 = 0
          expect(bUsers[i].aNumber).to.equal(assert(aUsers[i].aNumber + 4, aUsers[i].aNumber));
        }
      });

      it('with timestamps set to true', async () => {
        const User = current.define(
          'IncrementUser',
          {
            aNumber: DataTypes.INTEGER
          },
          { timestamps: true }
        );
        await User.sync({ force: true });

        const user = await User.create({ aNumber: 1 });
        const oldDate = user.updatedAt;

        clock.tick(1000);
        await User[method]('aNumber', { by: 1, where: {} });

        const updated = await User.findByPk(1);
        expect(updated).to.have.property('updatedAt').afterTime(oldDate);
      });

      it('with timestamps set to true and options.silent set to true', async () => {
        const User = current.define(
          'IncrementUser',
          {
            aNumber: DataTypes.INTEGER
          },
          { timestamps: true }
        );
        await User.sync({ force: true });

        const user = await User.create({ aNumber: 1 });
        const oldDate = user.updatedAt;

        clock.tick(1000);
        await User[method]('aNumber', { by: 1, silent: true, where: {} });

        const updated = await User.findByPk(1);
        expect(updated).to.have.property('updatedAt').equalTime(oldDate);
      });

      it('should work with scopes', async () => {
        const User = current.define(
          'User',
          {
            aNumber: DataTypes.INTEGER,
            name: DataTypes.STRING
          },
          {
            scopes: {
              jeff: {
                where: {
                  name: 'Jeff'
                }
              }
            }
          }
        );

        await User.sync({ force: true });

        await User.bulkCreate([
          {
            aNumber: 1,
            name: 'Jeff'
          },
          {
            aNumber: 3,
            name: 'Not Jeff'
          }
        ]);

        await User.scope('jeff')[method]('aNumber', {});

        const jeff = await User.scope('jeff').findOne();
        expect(jeff.aNumber).to.equal(assert(2, 0));

        const notJeff = await User.findOne({
          where: {
            name: 'Not Jeff'
          }
        });
        expect(notJeff.aNumber).to.equal(assert(3, 3));
      });
    });
  });
});
