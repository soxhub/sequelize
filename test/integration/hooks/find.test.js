import { describe, it, beforeEach, expect } from 'vitest';
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

  describe('#find', () => {
    beforeEach(() => {
      return User.bulkCreate([
        { username: 'adam', mood: 'happy' },
        { username: 'joe', mood: 'sad' }
      ]);
    });

    it('allow changing attributes via beforeFind #5675', () => {
      User.beforeFind((options) => {
        options.attributes = {
          include: ['id']
        };
      });
      return User.findAll({});
    });

    describe('on success', () => {
      it('all hooks run', async () => {
        let beforeHook = false,
          beforeHook2 = false,
          beforeHook3 = false,
          afterHook = false;

        User.beforeFind(() => {
          beforeHook = true;
        });

        User.beforeFindAfterExpandIncludeAll(() => {
          beforeHook2 = true;
        });

        User.beforeFindAfterOptions(() => {
          beforeHook3 = true;
        });

        User.afterFind(() => {
          afterHook = true;
        });

        const user = await User.findOne({ where: { username: 'adam' } });

        expect(user.mood).to.equal('happy');
        expect(beforeHook).to.be.true;
        expect(beforeHook2).to.be.true;
        expect(beforeHook3).to.be.true;
        expect(afterHook).to.be.true;
      });

      it('beforeFind hook can change options', async () => {
        User.beforeFind((options) => {
          options.where.username = 'joe';
        });

        const user = await User.findOne({ where: { username: 'adam' } });
        expect(user.mood).to.equal('sad');
      });

      it('beforeFindAfterExpandIncludeAll hook can change options', async () => {
        User.beforeFindAfterExpandIncludeAll((options) => {
          options.where.username = 'joe';
        });

        const user = await User.findOne({ where: { username: 'adam' } });
        expect(user.mood).to.equal('sad');
      });

      it('beforeFindAfterOptions hook can change options', async () => {
        User.beforeFindAfterOptions((options) => {
          options.where.username = 'joe';
        });

        const user = await User.findOne({ where: { username: 'adam' } });
        expect(user.mood).to.equal('sad');
      });

      it('afterFind hook can change results', async () => {
        User.afterFind((user) => {
          user.mood = 'sad';
        });

        const user = await User.findOne({ where: { username: 'adam' } });
        expect(user.mood).to.equal('sad');
      });
    });

    describe('on error', () => {
      it('in beforeFind hook returns error', async () => {
        User.beforeFind(() => {
          throw new Error('Oops!');
        });

        await expect(User.findOne({ where: { username: 'adam' } })).rejects.toThrow('Oops!');
      });

      it('in beforeFindAfterExpandIncludeAll hook returns error', async () => {
        User.beforeFindAfterExpandIncludeAll(() => {
          throw new Error('Oops!');
        });

        await expect(User.findOne({ where: { username: 'adam' } })).rejects.toThrow('Oops!');
      });

      it('in beforeFindAfterOptions hook returns error', async () => {
        User.beforeFindAfterOptions(() => {
          throw new Error('Oops!');
        });

        await expect(User.findOne({ where: { username: 'adam' } })).rejects.toThrow('Oops!');
      });

      it('in afterFind hook returns error', async () => {
        User.afterFind(() => {
          throw new Error('Oops!');
        });

        await expect(User.findOne({ where: { username: 'adam' } })).rejects.toThrow('Oops!');
      });
    });
  });
});
