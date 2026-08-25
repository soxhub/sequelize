import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';

const current = Support.sequelize;

// Postgres has no temp-table triggers, so nothing here runs today. It stays a declared-but-skipped
// suite rather than an `if` around the whole file, because vitest fails a file that registers no
// suite at all.
const describeTrigger = current.dialect.supports.tmpTableTrigger ? describe : describe.skip;

describeTrigger(Support.getTestDialectTeaser('Model'), () => {
  describe('trigger', () => {
    let User;
    const triggerQuery =
      'create trigger User_ChangeTracking on [users] for insert,update, delete \n' +
      'as\n' +
      'SET NOCOUNT ON\n' +
      'if exists(select 1 from inserted)\n' +
      'begin\n' +
      'select * from inserted\n' +
      'end\n' +
      'if exists(select 1 from deleted)\n' +
      'begin\n' +
      'select * from deleted\n' +
      'end\n';

    beforeEach(async () => {
      User = current.define(
        'user',
        {
          username: {
            type: Sequelize.STRING,
            field: 'user_name'
          }
        },
        {
          hasTrigger: true
        }
      );

      await User.sync({ force: true });
      await current.query(triggerQuery, { type: current.QueryTypes.RAW });
    });

    it('should return output rows after insert', async () => {
      await User.create({
        username: 'triggertest'
      });

      await expect(User.findOne({ username: 'triggertest' }))
        .to.eventually.have.property('username')
        .which.equals('triggertest');
    });

    it('should return output rows after instance update', async () => {
      const user = await User.create({
        username: 'triggertest'
      });

      user.username = 'usernamechanged';
      await user.save();

      await expect(User.findOne({ username: 'usernamechanged' }))
        .to.eventually.have.property('username')
        .which.equals('usernamechanged');
    });

    it('should return output rows after Model update', async () => {
      const user = await User.create({
        username: 'triggertest'
      });

      await User.update(
        {
          username: 'usernamechanged'
        },
        {
          where: {
            id: user.get('id')
          }
        }
      );

      await expect(User.findOne({ username: 'usernamechanged' }))
        .to.eventually.have.property('username')
        .which.equals('usernamechanged');
    });

    it('should successfully delete with a trigger on the table', async () => {
      const user = await User.create({
        username: 'triggertest'
      });

      await user.destroy();

      await expect(User.findOne({ username: 'triggertest' })).to.eventually.be.null;
    });
  });
});
