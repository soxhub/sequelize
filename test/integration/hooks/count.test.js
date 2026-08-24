import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Hooks'), () => {
  let User;

  beforeEach(() => {
    User = current.define('User', {
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      mood: {
        type: DataTypes.ENUM,
        values: ['happy', 'sad', 'neutral']
      }
    });
    return current.sync({ force: true });
  });

  describe('#count', () => {
    beforeEach(() => {
      return User.bulkCreate([
        { username: 'adam', mood: 'happy' },
        { username: 'joe', mood: 'sad' },
        { username: 'joe', mood: 'happy' }
      ]);
    });

    describe('on success', () => {
      it('hook runs', async () => {
        let beforeHook = false;

        User.beforeCount(() => {
          beforeHook = true;
        });

        const count = await User.count();
        expect(count).to.equal(3);
        expect(beforeHook).to.be.true;
      });

      it('beforeCount hook can change options', () => {
        User.beforeCount((options) => {
          options.where.username = 'adam';
        });

        return expect(User.count({ where: { username: 'joe' } })).to.eventually.equal(1);
      });
    });

    describe('on error', () => {
      it('in beforeCount hook returns error', () => {
        User.beforeCount(() => {
          throw new Error('Oops!');
        });

        return expect(User.count({ where: { username: 'adam' } })).to.be.rejectedWith('Oops!');
      });
    });
  });
});
