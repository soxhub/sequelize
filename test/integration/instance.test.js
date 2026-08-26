import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import Sequelize from '../../index.js';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';
import config from '../config/config.js';
import sinon from 'sinon';
import { validate as validateUUID, version as uuidVersion } from 'uuid';

const dialect = Support.getTestDialect();

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Instance'), () => {
  let clock;
  let SharedUser;

  beforeAll(() => {
    clock = sinon.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    clock.reset();
  });

  afterAll(() => {
    clock.restore();
  });

  beforeEach(async () => {
    SharedUser = current.define('User', {
      username: { type: DataTypes.STRING },
      uuidv1: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV1 },
      uuidv4: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4 },
      touchedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      aNumber: { type: DataTypes.INTEGER },
      bNumber: { type: DataTypes.INTEGER },
      aDate: { type: DataTypes.DATE },

      validateTest: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { isInt: true }
      },
      validateCustom: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { len: { msg: 'Length failed.', args: [1, 20] } }
      },

      dateAllowNullTrue: {
        type: DataTypes.DATE,
        allowNull: true
      },

      isSuperUser: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    });

    await SharedUser.sync({ force: true });
  });

  describe('Escaping', () => {
    it('is done properly for special characters', async () => {
      // Ideally we should test more: "\0\n\r\b\t\\\'\"\x1a"
      // But this causes sqlite to fail and exits the entire test suite immediately
      const bio = dialect + '\'"\n'; // Need to add the dialect here so in case of failure I know what DB it failed for

      const u1 = await SharedUser.create({ username: bio });
      const u2 = await SharedUser.findByPk(u1.id);

      expect(u2.username).to.equal(bio);
    });
  });

  describe('isNewRecord', () => {
    it('returns true for non-saved objects', () => {
      const user = SharedUser.build({ username: 'user' });
      expect(user.id).to.be.null;
      expect(user.isNewRecord).to.be.ok;
    });

    it('returns false for saved objects', async () => {
      const user = await SharedUser.build({ username: 'user' }).save();

      expect(user.isNewRecord).to.not.be.ok;
    });

    it('returns false for created objects', async () => {
      const user = await SharedUser.create({ username: 'user' });

      expect(user.isNewRecord).to.not.be.ok;
    });

    it('returns false for objects found by find method', async () => {
      await SharedUser.create({ username: 'user' });

      const user = await SharedUser.create({ username: 'user' });
      const foundUser = await SharedUser.findByPk(user.id);

      expect(foundUser.isNewRecord).to.not.be.ok;
    });

    it('returns false for objects found by findAll method', async () => {
      const users = [];

      for (let i = 0; i < 10; i++) {
        users[users.length] = { username: 'user' };
      }

      await SharedUser.bulkCreate(users);

      const foundUsers = await SharedUser.findAll();

      foundUsers.forEach((u) => {
        expect(u.isNewRecord).to.not.be.ok;
      });
    });
  });

  describe('increment', () => {
    beforeEach(() => {
      return SharedUser.create({ id: 1, aNumber: 0, bNumber: 0 });
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { number: Support.Sequelize.INTEGER });

        await User.sync({ force: true });

        const user = await User.create({ number: 1 });
        const t = await sequelize.transaction();

        await user.increment('number', { by: 2, transaction: t });

        const users1 = await User.findAll();
        const users2 = await User.findAll({ transaction: t });

        expect(users1[0].number).to.equal(1);
        expect(users2[0].number).to.equal(3);

        await t.rollback();
      });
    }

    if (current.dialect.supports.returnValues.returning) {
      it('supports returning', async () => {
        const user1 = await SharedUser.findByPk(1);

        await user1.increment('aNumber', { by: 2 });

        expect(user1.aNumber).to.be.equal(2);

        const user3 = await user1.increment('bNumber', { by: 2, returning: false });

        expect(user3.bNumber).to.be.equal(0);
      });
    }

    it('supports where conditions', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.increment(['aNumber'], { by: 2, where: { bNumber: 1 } });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(0);
    });

    it('with array', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.increment(['aNumber'], { by: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(2);
    });

    it('with single field', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.increment('aNumber', { by: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(2);
    });

    it('with single field and no value', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.increment('aNumber');

      const user2 = await SharedUser.findByPk(1);

      expect(user2.aNumber).to.be.equal(1);
    });

    it('should still work right with other concurrent updates', async () => {
      const user1 = await SharedUser.findByPk(1);

      // Select the user again (simulating a concurrent query)
      const user2 = await SharedUser.findByPk(1);

      await user2.update({
        aNumber: user2.aNumber + 1
      });

      await user1.increment(['aNumber'], { by: 2 });

      const user5 = await SharedUser.findByPk(1);

      expect(user5.aNumber).to.be.equal(3);
    });

    it('should still work right with other concurrent increments', async () => {
      const user1 = await SharedUser.findByPk(1);

      // The three increments must overlap: this asserts they don't clobber each other.
      await Promise.all([
        user1.increment(['aNumber'], { by: 2 }),
        user1.increment(['aNumber'], { by: 2 }),
        user1.increment(['aNumber'], { by: 2 })
      ]);

      const user2 = await SharedUser.findByPk(1);

      expect(user2.aNumber).to.equal(6);
    });

    it('with key value pair', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.increment({ aNumber: 1, bNumber: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(1);
      expect(user3.bNumber).to.be.equal(2);
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

      const created = await User.create({ aNumber: 1 });
      const oldDate = created.get('updatedAt');

      clock.tick(1000);

      const incremented = await created.increment('aNumber', { by: 1 });
      const user = await incremented.reload();

      expect(user).to.have.property('updatedAt').afterTime(oldDate);
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

      await user.increment('aNumber', { by: 1, silent: true });

      const updated = await User.findByPk(1);
      expect(updated).to.have.property('updatedAt').equalTime(oldDate);
    });
  });

  describe('decrement', () => {
    beforeEach(() => {
      return SharedUser.create({ id: 1, aNumber: 0, bNumber: 0 });
    });

    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { number: Support.Sequelize.INTEGER });

        await User.sync({ force: true });

        const user = await User.create({ number: 3 });
        const t = await sequelize.transaction();

        await user.decrement('number', { by: 2, transaction: t });

        const users1 = await User.findAll();
        const users2 = await User.findAll({ transaction: t });

        expect(users1[0].number).to.equal(3);
        expect(users2[0].number).to.equal(1);

        await t.rollback();
      });
    }

    if (current.dialect.supports.returnValues.returning) {
      it('supports returning', async () => {
        const user1 = await SharedUser.findByPk(1);

        await user1.decrement('aNumber', { by: 2 });

        expect(user1.aNumber).to.be.equal(-2);

        const user3 = await user1.decrement('bNumber', { by: 2, returning: false });

        expect(user3.bNumber).to.be.equal(0);
      });
    }

    it('with array', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.decrement(['aNumber'], { by: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(-2);
    });

    it('with single field', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.decrement('aNumber', { by: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(-2);
    });

    it('with single field and no value', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.decrement('aNumber');

      const user2 = await SharedUser.findByPk(1);

      expect(user2.aNumber).to.be.equal(-1);
    });

    it('should still work right with other concurrent updates', async () => {
      const user1 = await SharedUser.findByPk(1);

      // Select the user again (simulating a concurrent query)
      const user2 = await SharedUser.findByPk(1);

      await user2.update({
        aNumber: user2.aNumber + 1
      });

      await user1.decrement(['aNumber'], { by: 2 });

      const user5 = await SharedUser.findByPk(1);

      expect(user5.aNumber).to.be.equal(-1);
    });

    it('should still work right with other concurrent increments', async () => {
      const user1 = await SharedUser.findByPk(1);

      // The three decrements must overlap: this asserts they don't clobber each other.
      await Promise.all([
        user1.decrement(['aNumber'], { by: 2 }),
        user1.decrement(['aNumber'], { by: 2 }),
        user1.decrement(['aNumber'], { by: 2 })
      ]);

      const user2 = await SharedUser.findByPk(1);

      expect(user2.aNumber).to.equal(-6);
    });

    it('with key value pair', async () => {
      const user1 = await SharedUser.findByPk(1);

      await user1.decrement({ aNumber: 1, bNumber: 2 });

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(-1);
      expect(user3.bNumber).to.be.equal(-2);
    });

    it('with negative value', async () => {
      const user1 = await SharedUser.findByPk(1);

      // Concurrent by design, as in the sibling concurrency test above.
      await Promise.all([
        user1.decrement('aNumber', { by: -2 }),
        user1.decrement(['aNumber', 'bNumber'], { by: -2 }),
        user1.decrement({ aNumber: -1, bNumber: -2 })
      ]);

      const user3 = await SharedUser.findByPk(1);

      expect(user3.aNumber).to.be.equal(+5);
      expect(user3.bNumber).to.be.equal(+4);
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

      await user.decrement('aNumber', { by: 1 });

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

      await user.decrement('aNumber', { by: 1, silent: true });

      const updated = await User.findByPk(1);
      expect(updated).to.have.property('updatedAt').equalTime(oldDate);
    });
  });

  describe('reload', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING });

        await User.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const t = await sequelize.transaction();

        await User.update({ username: 'bar' }, { where: { username: 'foo' }, transaction: t });

        const reloadedUser = await user.reload();

        expect(reloadedUser.username).to.equal('foo');

        const transactionalUser = await reloadedUser.reload({ transaction: t });

        expect(transactionalUser.username).to.equal('bar');

        await t.rollback();
      });
    }

    it('should return a reference to the same DAO instead of creating a new one', async () => {
      const originalUser = await SharedUser.create({ username: 'John Doe' });

      await originalUser.update({ username: 'Doe John' });

      const updatedUser = await originalUser.reload();

      expect(originalUser === updatedUser).to.be.true;
    });

    it('should update the values on all references to the DAO', async () => {
      const originalUser = await SharedUser.create({ username: 'John Doe' });
      const updater = await SharedUser.findByPk(originalUser.id);

      await updater.update({ username: 'Doe John' });

      // We used a different reference when calling updateAttributes, so originalUser is now out of sync
      expect(originalUser.username).to.equal('John Doe');

      const updatedUser = await originalUser.reload();

      expect(originalUser.username).to.equal('Doe John');
      expect(updatedUser.username).to.equal('Doe John');
    });

    it('should support updating a subset of attributes', async () => {
      const created = await SharedUser.create({
        aNumber: 1,
        bNumber: 1
      });

      await SharedUser.update(
        {
          bNumber: 2
        },
        {
          where: {
            id: created.get('id')
          }
        }
      );

      const user = await created.reload({
        attributes: ['bNumber']
      });

      expect(user.get('aNumber')).to.equal(1);
      expect(user.get('bNumber')).to.equal(2);
    });

    it('should update read only attributes as well (updatedAt)', async () => {
      const originalUser = await SharedUser.create({ username: 'John Doe' });
      const originallyUpdatedAt = originalUser.updatedAt;

      // Wait for a second, so updatedAt will actually be different
      clock.tick(1000);

      const updater = await SharedUser.findByPk(originalUser.id);

      const updatedUser = await updater.update({ username: 'Doe John' });

      await originalUser.reload();

      expect(originalUser.updatedAt).to.be.above(originallyUpdatedAt);
      expect(updatedUser.updatedAt).to.be.above(originallyUpdatedAt);
    });

    it('should update the associations as well', async () => {
      const Book = current.define('Book', { title: DataTypes.STRING }),
        Page = current.define('Page', { content: DataTypes.TEXT });

      Book.hasMany(Page);
      Page.belongsTo(Book);

      await Book.sync({ force: true });
      await Page.sync({ force: true });

      const book = await Book.create({ title: 'A very old book' });
      const page = await Page.create({ content: 'om nom nom' });

      await book.setPages([page]);

      const leBook = await Book.findOne({
        where: { id: book.id },
        include: [Page]
      });

      const updatedPage = await page.update({ content: 'something totally different' });

      expect(leBook.Pages.length).to.equal(1);
      expect(leBook.Pages[0].content).to.equal('om nom nom');
      expect(updatedPage.content).to.equal('something totally different');

      const reloadedBook = await leBook.reload();

      expect(reloadedBook.Pages.length).to.equal(1);
      expect(reloadedBook.Pages[0].content).to.equal('something totally different');
      expect(updatedPage.content).to.equal('something totally different');
    });

    it('should update internal options of the instance', async () => {
      const Book = current.define('Book', { title: DataTypes.STRING }),
        Page = current.define('Page', { content: DataTypes.TEXT });

      Book.hasMany(Page);
      Page.belongsTo(Book);

      await Book.sync({ force: true });
      await Page.sync({ force: true });

      const book = await Book.create({ title: 'A very old book' });
      const page = await Page.create();

      await book.setPages([page]);

      const leBook = await Book.findOne({
        where: { id: book.id }
      });

      const oldOptions = leBook._options;

      const reloadedBook = await leBook.reload({
        include: [Page]
      });

      expect(oldOptions).not.to.equal(reloadedBook._options);
      expect(reloadedBook._options.include.length).to.equal(1);
      expect(reloadedBook.Pages.length).to.equal(1);
      expect(reloadedBook.get({ plain: true }).Pages.length).to.equal(1);
    });

    it('should return an error when reload fails', async () => {
      const user = await SharedUser.create({ username: 'John Doe' });

      await user.destroy();

      await expect(user.reload()).rejects.toThrow(
        'Instance could not be reloaded because it does not exist anymore (find call returned null)'
      );
    });

    it('should set an association to null after deletion, 1-1', async () => {
      const Shoe = current.define('Shoe', { brand: DataTypes.STRING }),
        Player = current.define('Player', { name: DataTypes.STRING });

      Player.hasOne(Shoe);
      Shoe.belongsTo(Player);

      await current.sync({ force: true });

      const shoe = await Shoe.create(
        {
          brand: 'the brand',
          Player: {
            name: 'the player'
          }
        },
        { include: [Player] }
      );

      const lePlayer = await Player.findOne({
        where: { id: shoe.Player.id },
        include: [Shoe]
      });

      expect(lePlayer.Shoe).not.to.be.null;

      await lePlayer.Shoe.destroy();
      await lePlayer.reload();

      expect(lePlayer.Shoe).to.be.null;
    });

    it('should set an association to empty after all deletion, 1-N', async () => {
      const Team = current.define('Team', { name: DataTypes.STRING }),
        Player = current.define('Player', { name: DataTypes.STRING });

      Team.hasMany(Player);
      Player.belongsTo(Team);

      await current.sync({ force: true });

      const team = await Team.create(
        {
          name: 'the team',
          Players: [
            {
              name: 'the player1'
            },
            {
              name: 'the player2'
            }
          ]
        },
        { include: [Player] }
      );

      const leTeam = await Team.findOne({
        where: { id: team.id },
        include: [Player]
      });

      expect(leTeam.Players).not.to.be.empty;

      await leTeam.Players[1].destroy();
      await leTeam.Players[0].destroy();

      await leTeam.reload();

      expect(leTeam.Players).to.be.empty;
    });

    it('should update the associations after one element deleted', async () => {
      const Team = current.define('Team', { name: DataTypes.STRING }),
        Player = current.define('Player', { name: DataTypes.STRING });

      Team.hasMany(Player);
      Player.belongsTo(Team);

      await current.sync({ force: true });

      const team = await Team.create(
        {
          name: 'the team',
          Players: [
            {
              name: 'the player1'
            },
            {
              name: 'the player2'
            }
          ]
        },
        { include: [Player] }
      );

      const leTeam = await Team.findOne({
        where: { id: team.id },
        include: [Player]
      });

      expect(leTeam.Players).to.have.length(2);

      await leTeam.Players[0].destroy();
      await leTeam.reload();

      expect(leTeam.Players).to.have.length(1);
    });
  });

  describe('default values', () => {
    describe('uuid', () => {
      it('should store a string in uuidv1 and uuidv4', () => {
        const user = SharedUser.build({ username: 'a user' });
        expect(user.uuidv1).to.be.a('string');
        expect(user.uuidv4).to.be.a('string');
      });

      it('should store a string of length 36 in uuidv1 and uuidv4', () => {
        const user = SharedUser.build({ username: 'a user' });
        expect(user.uuidv1).to.have.length(36);
        expect(user.uuidv4).to.have.length(36);
      });

      it('should store a valid uuid in uuidv1 and uuidv4 that conforms to the UUID v1 and v4 specifications', () => {
        const user = SharedUser.build({ username: 'a user' });
        expect(validateUUID(user.uuidv1) && uuidVersion(user.uuidv1) === 1).to.be.true;
        expect(validateUUID(user.uuidv4) && uuidVersion(user.uuidv4) === 4).to.be.true;
      });

      it('should store a valid uuid if the field is a primary key named id', () => {
        const Person = current.define('Person', {
          id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV1,
            primaryKey: true
          }
        });

        const person = Person.build({});
        expect(person.id).to.be.ok;
        expect(person.id).to.have.length(36);
      });
    });
    describe('current date', () => {
      it('should store a date in touchedAt', () => {
        const user = SharedUser.build({ username: 'a user' });
        expect(user.touchedAt).to.be.instanceof(Date);
      });

      it('should store the current date in touchedAt', () => {
        clock.tick(5000);
        const user = SharedUser.build({ username: 'a user' });
        expect(+user.touchedAt).to.be.equal(5000);
      });
    });

    describe('allowNull date', () => {
      it('should be just "null" and not Date with Invalid Date', async () => {
        await SharedUser.build({ username: 'a user' }).save();

        const user = await SharedUser.findOne({ where: { username: 'a user' } });

        expect(user.dateAllowNullTrue).to.be.null;
      });

      it('should be the same valid date when saving the date', async () => {
        const date = new Date();

        await SharedUser.build({ username: 'a user', dateAllowNullTrue: date }).save();

        const user = await SharedUser.findOne({ where: { username: 'a user' } });

        expect(user.dateAllowNullTrue.toString()).to.equal(date.toString());
      });
    });

    describe('super user boolean', () => {
      it('should default to false', async () => {
        await SharedUser.build({
          username: 'a user'
        }).save();

        const user = await SharedUser.findOne({
          where: {
            username: 'a user'
          }
        });

        expect(user.isSuperUser).to.be.false;
      });

      it('should override default when given truthy boolean', async () => {
        await SharedUser.build({
          username: 'a user',
          isSuperUser: true
        }).save();

        const user = await SharedUser.findOne({
          where: {
            username: 'a user'
          }
        });

        expect(user.isSuperUser).to.be.true;
      });

      it('should override default when given truthy boolean-string ("true")', async () => {
        await SharedUser.build({
          username: 'a user',
          isSuperUser: 'true'
        }).save();

        const user = await SharedUser.findOne({
          where: {
            username: 'a user'
          }
        });

        expect(user.isSuperUser).to.be.true;
      });

      it('should override default when given truthy boolean-int (1)', async () => {
        await SharedUser.build({
          username: 'a user',
          isSuperUser: 1
        }).save();

        const user = await SharedUser.findOne({
          where: {
            username: 'a user'
          }
        });

        expect(user.isSuperUser).to.be.true;
      });

      it('should throw error when given value of incorrect type', async () => {
        const err = await Support.expectRejection(
          SharedUser.build({
            username: 'a user',
            isSuperUser: 'INCORRECT_VALUE_TYPE'
          }).save()
        );

        expect(err.message).to.exist;
      });
    });
  });

  describe('complete', () => {
    it('gets triggered if an error occurs', async () => {
      const err = await Support.expectRejection(SharedUser.findOne({ where: ['asdasdasd'] }));

      expect(err.message).to.exist;
    });

    it('gets triggered if everything was ok', async () => {
      const result = await SharedUser.count();

      expect(result).to.exist;
    });
  });

  describe('save', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING });

        await User.sync({ force: true });

        const t = await sequelize.transaction();

        await User.build({ username: 'foo' }).save({ transaction: t });

        const count1 = await User.count();
        const count2 = await User.count({ transaction: t });

        expect(count1).to.equal(0);
        expect(count2).to.equal(1);

        await t.rollback();
      });
    }

    it('only updates fields in passed array', async () => {
      const date = new Date(1990, 1, 1);

      const user = await SharedUser.create({
        username: 'foo',
        touchedAt: new Date()
      });

      user.username = 'fizz';
      user.touchedAt = date;

      await user.save({ fields: ['username'] });

      // re-select user
      const user2 = await SharedUser.findByPk(user.id);

      // name should have changed
      expect(user2.username).to.equal('fizz');
      // bio should be unchanged
      expect(user2.birthDate).not.to.equal(date);
    });

    it('should work on a model with an attribute named length', async () => {
      const Box = current.define('box', {
        length: DataTypes.INTEGER,
        width: DataTypes.INTEGER,
        height: DataTypes.INTEGER
      });

      await Box.sync({ force: true });

      const created = await Box.create({
        length: 1,
        width: 2,
        height: 3
      });

      await created.update({
        length: 4,
        width: 5,
        height: 6
      });

      const box = await Box.findOne({});

      expect(box.get('length')).to.equal(4);
      expect(box.get('width')).to.equal(5);
      expect(box.get('height')).to.equal(6);
    });

    it('only validates fields in passed array', () => {
      return SharedUser.build({
        validateTest: 'cake', // invalid, but not saved
        validateCustom: '1'
      }).save({
        fields: ['validateCustom']
      });
    });

    describe('hooks', () => {
      it('should update attributes added in hooks when default fields are used', async () => {
        const User = current.define('User' + config.rand(), {
          name: DataTypes.STRING,
          bio: DataTypes.TEXT,
          email: DataTypes.STRING
        });

        User.beforeUpdate((instance) => {
          instance.set('email', 'B');
        });

        await User.sync({ force: true });

        const created = await User.create({
          name: 'A',
          bio: 'A',
          email: 'A'
        });

        await created
          .set({
            name: 'B',
            bio: 'B'
          })
          .save();

        const user = await User.findOne({});

        expect(user.get('name')).to.equal('B');
        expect(user.get('bio')).to.equal('B');
        expect(user.get('email')).to.equal('B');
      });

      it('should update attributes changed in hooks when default fields are used', async () => {
        const User = current.define('User' + config.rand(), {
          name: DataTypes.STRING,
          bio: DataTypes.TEXT,
          email: DataTypes.STRING
        });

        User.beforeUpdate((instance) => {
          instance.set('email', 'C');
        });

        await User.sync({ force: true });

        const created = await User.create({
          name: 'A',
          bio: 'A',
          email: 'A'
        });

        await created
          .set({
            name: 'B',
            bio: 'B',
            email: 'B'
          })
          .save();

        const user = await User.findOne({});

        expect(user.get('name')).to.equal('B');
        expect(user.get('bio')).to.equal('B');
        expect(user.get('email')).to.equal('C');
      });

      it('should validate attributes added in hooks when default fields are used', async () => {
        const User = current.define('User' + config.rand(), {
          name: DataTypes.STRING,
          bio: DataTypes.TEXT,
          email: {
            type: DataTypes.STRING,
            validate: {
              isEmail: true
            }
          }
        });

        User.beforeUpdate((instance) => {
          instance.set('email', 'B');
        });

        await User.sync({ force: true });

        const created = await User.create({
          name: 'A',
          bio: 'A',
          email: 'valid.email@gmail.com'
        });

        await expect(
          created
            .set({
              name: 'B'
            })
            .save()
        ).rejects.toThrow(Sequelize.ValidationError);

        const user = await User.findOne({});

        expect(user.get('email')).to.equal('valid.email@gmail.com');
      });

      it('should validate attributes changed in hooks when default fields are used', async () => {
        const User = current.define('User' + config.rand(), {
          name: DataTypes.STRING,
          bio: DataTypes.TEXT,
          email: {
            type: DataTypes.STRING,
            validate: {
              isEmail: true
            }
          }
        });

        User.beforeUpdate((instance) => {
          instance.set('email', 'B');
        });

        await User.sync({ force: true });

        const created = await User.create({
          name: 'A',
          bio: 'A',
          email: 'valid.email@gmail.com'
        });

        await expect(
          created
            .set({
              name: 'B',
              email: 'still.valid.email@gmail.com'
            })
            .save()
        ).rejects.toThrow(Sequelize.ValidationError);

        const user = await User.findOne({});

        expect(user.get('email')).to.equal('valid.email@gmail.com');
      });
    });

    it('stores an entry in the database', async () => {
      const username = 'user',
        user = SharedUser.build({
          username,
          touchedAt: new Date(1984, 8, 23)
        });

      const users = await SharedUser.findAll();

      expect(users).to.have.length(0);

      await user.save();

      const savedUsers = await SharedUser.findAll();

      expect(savedUsers).to.have.length(1);
      expect(savedUsers[0].username).to.equal(username);
      expect(savedUsers[0].touchedAt).to.be.instanceof(Date);
      expect(savedUsers[0].touchedAt).to.equalDate(new Date(1984, 8, 23));
    });

    it('handles an entry with primaryKey of zero', async () => {
      const username = 'user',
        newUsername = 'newUser',
        User2 = current.define('User2', {
          id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: false,
            primaryKey: true
          },
          username: { type: DataTypes.STRING }
        });

      await User2.sync();

      const user = await User2.create({ id: 0, username });

      expect(user).to.be.ok;
      expect(user.id).to.equal(0);
      expect(user.username).to.equal(username);

      const foundUser = await User2.findByPk(0);

      expect(foundUser).to.be.ok;
      expect(foundUser.id).to.equal(0);
      expect(foundUser.username).to.equal(username);

      const updatedUser = await foundUser.update({ username: newUsername });

      expect(updatedUser).to.be.ok;
      expect(updatedUser.id).to.equal(0);
      expect(updatedUser.username).to.equal(newUsername);
    });

    it('updates the timestamps', async () => {
      const now = new Date();
      now.setMilliseconds(0);

      const user = SharedUser.build({ username: 'user' });
      clock.tick(1000);

      const savedUser = await user.save();

      expect(savedUser).have.property('updatedAt').afterTime(now);

      clock.tick(1000);

      const updatedUser = await savedUser.save();

      expect(updatedUser).have.property('updatedAt').afterTime(now);
    });

    it('does not update timestamps when passing silent=true', async () => {
      const user = await SharedUser.create({ username: 'user' });
      const updatedAt = user.updatedAt;

      clock.tick(1000);

      const updated = await user.update(
        {
          username: 'userman'
        },
        {
          silent: true
        }
      );

      expect(updated).to.have.property('updatedAt').equalTime(updatedAt);
    });

    it('does not update timestamps when passing silent=true in a bulk update', async () => {
      const data = [{ username: 'Paul' }, { username: 'Peter' }];

      await SharedUser.bulkCreate(data);

      const created = await SharedUser.findAll({ order: ['id'] });
      const updatedAtPaul = created[0].updatedAt;
      const updatedAtPeter = created[1].updatedAt;

      clock.tick(150);

      await SharedUser.update({ aNumber: 1 }, { where: {}, silent: true });

      const users = await SharedUser.findAll({ order: ['id'] });

      expect(users[0].updatedAt).to.equalTime(updatedAtPaul);
      expect(users[1].updatedAt).to.equalTime(updatedAtPeter);
    });

    describe('when nothing changed', () => {
      it('does not update timestamps', async () => {
        await SharedUser.create({ username: 'John' });

        const user = await SharedUser.findOne({ where: { username: 'John' } });
        const updatedAt = user.updatedAt;

        clock.tick(2000);

        const newlySavedUser = await user.save();

        expect(newlySavedUser.updatedAt).to.equalTime(updatedAt);

        const refetchedUser = await SharedUser.findOne({ where: { username: 'John' } });

        expect(refetchedUser.updatedAt).to.equalTime(updatedAt);
      });

      it('should not throw ER_EMPTY_QUERY if changed only virtual fields', async () => {
        const User = current.define(
          'User' + config.rand(),
          {
            name: DataTypes.STRING,
            bio: {
              type: DataTypes.VIRTUAL,
              get: () => 'swag'
            }
          },
          {
            timestamps: false
          }
        );
        await User.sync({ force: true });

        const user = await User.create({ name: 'John', bio: 'swag 1' });

        await expect(user.update({ bio: 'swag 2' })).resolves.toBeDefined();
      });
    });

    it('updates with function and column value', async () => {
      const user = await SharedUser.create({
        aNumber: 42
      });

      user.bNumber = current.col('aNumber');
      user.username = current.fn('upper', 'sequelize');

      await user.save();

      const user2 = await SharedUser.findByPk(user.id);

      expect(user2.username).to.equal('SEQUELIZE');
      expect(user2.bNumber).to.equal(42);
    });

    describe('without timestamps option', () => {
      it("doesn't update the updatedAt column", async () => {
        const User2 = current.define(
          'User2',
          {
            username: DataTypes.STRING,
            updatedAt: DataTypes.DATE
          },
          { timestamps: false }
        );

        await User2.sync();

        const johnDoe = await User2.create({ username: 'john doe' });

        // sqlite and mysql return undefined, whereas postgres returns null
        expect([undefined, null].indexOf(johnDoe.updatedAt)).not.to.be.equal(-1);
      });
    });

    describe('with custom timestamp options', () => {
      it('updates the createdAt column if updatedAt is disabled', async () => {
        const now = new Date();
        clock.tick(1000);

        const User2 = current.define(
          'User2',
          {
            username: DataTypes.STRING
          },
          { updatedAt: false }
        );

        await User2.sync();

        const johnDoe = await User2.create({ username: 'john doe' });

        expect(johnDoe.updatedAt).to.be.undefined;
        expect(now).to.be.beforeTime(johnDoe.createdAt);
      });

      it('updates the updatedAt column if createdAt is disabled', async () => {
        const now = new Date();
        clock.tick(1000);

        const User2 = current.define(
          'User2',
          {
            username: DataTypes.STRING
          },
          { createdAt: false }
        );

        await User2.sync();

        const johnDoe = await User2.create({ username: 'john doe' });

        expect(johnDoe.createdAt).to.be.undefined;
        expect(now).to.be.beforeTime(johnDoe.updatedAt);
      });

      it('works with `allowNull: false` on createdAt and updatedAt columns', async () => {
        const User2 = current.define(
          'User2',
          {
            username: DataTypes.STRING,
            createdAt: {
              type: DataTypes.DATE,
              allowNull: false
            },
            updatedAt: {
              type: DataTypes.DATE,
              allowNull: false
            }
          },
          { timestamps: true }
        );

        await User2.sync();

        const johnDoe = await User2.create({ username: 'john doe' });

        expect(johnDoe.createdAt).to.be.an.instanceof(Date);
        expect(!isNaN(johnDoe.createdAt.valueOf())).to.be.ok;
        expect(johnDoe.createdAt).to.equalTime(johnDoe.updatedAt);
      });
    });

    it('should fail a validation upon creating', async () => {
      const err = await Support.expectRejection(SharedUser.create({ aNumber: 0, validateTest: 'hello' }));

      expect(err).to.be.instanceof(Object);
      expect(err.get('validateTest')).to.be.instanceof(Array);
      expect(err.get('validateTest')[0]).to.exist;
      expect(err.get('validateTest')[0].message).to.equal('Validation isInt on validateTest failed');
    });

    it('should fail a validation upon creating with hooks false', async () => {
      const err = await Support.expectRejection(
        SharedUser.create({ aNumber: 0, validateTest: 'hello' }, { hooks: false })
      );

      expect(err).to.be.instanceof(Object);
      expect(err.get('validateTest')).to.be.instanceof(Array);
      expect(err.get('validateTest')[0]).to.exist;
      expect(err.get('validateTest')[0].message).to.equal('Validation isInt on validateTest failed');
    });

    it('should fail a validation upon building', async () => {
      const err = await Support.expectRejection(
        SharedUser.build({ aNumber: 0, validateCustom: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' }).save()
      );

      expect(err).to.be.instanceof(Object);
      expect(err.get('validateCustom')).to.exist;
      expect(err.get('validateCustom')).to.be.instanceof(Array);
      expect(err.get('validateCustom')[0]).to.exist;
      expect(err.get('validateCustom')[0].message).to.equal('Length failed.');
    });

    it('should fail a validation when updating', async () => {
      const user = await SharedUser.create({ aNumber: 0 });

      const err = await Support.expectRejection(user.update({ validateTest: 'hello' }));

      expect(err).to.be.instanceof(Object);
      expect(err.get('validateTest')).to.exist;
      expect(err.get('validateTest')).to.be.instanceof(Array);
      expect(err.get('validateTest')[0]).to.exist;
      expect(err.get('validateTest')[0].message).to.equal('Validation isInt on validateTest failed');
    });

    it('takes zero into account', async () => {
      const user = await SharedUser.build({ aNumber: 0 }).save({
        fields: ['aNumber']
      });

      expect(user.aNumber).to.equal(0);
    });

    it('saves a record with no primary key', async () => {
      const HistoryLog = current.define('HistoryLog', {
        someText: { type: DataTypes.STRING },
        aNumber: { type: DataTypes.INTEGER },
        aRandomId: { type: DataTypes.INTEGER }
      });

      await HistoryLog.sync();

      const log = await HistoryLog.create({ someText: 'Some random text', aNumber: 3, aRandomId: 5 });
      const newLog = await log.update({ aNumber: 5 });

      expect(newLog.aNumber).to.equal(5);
    });

    describe('eagerly loaded objects', () => {
      let UserEager;
      let ProjectEager;

      beforeEach(async () => {
        UserEager = current.define(
          'UserEagerLoadingSaves',
          {
            username: DataTypes.STRING,
            age: DataTypes.INTEGER
          },
          { timestamps: false }
        );

        ProjectEager = current.define(
          'ProjectEagerLoadingSaves',
          {
            title: DataTypes.STRING,
            overdue_days: DataTypes.INTEGER
          },
          { timestamps: false }
        );

        UserEager.hasMany(ProjectEager, { as: 'Projects', foreignKey: 'PoobahId' });
        ProjectEager.belongsTo(UserEager, { as: 'Poobah', foreignKey: 'PoobahId' });

        await UserEager.sync({ force: true });
        await ProjectEager.sync({ force: true });
      });

      it('saves one object that has a collection of eagerly loaded objects', async () => {
        const user = await UserEager.create({ username: 'joe', age: 1 });
        const project1 = await ProjectEager.create({ title: 'project-joe1', overdue_days: 0 });
        const project2 = await ProjectEager.create({ title: 'project-joe2', overdue_days: 0 });

        await user.setProjects([project1, project2]);

        const eagerUser = await UserEager.findOne({
          where: { age: 1 },
          include: [{ model: ProjectEager, as: 'Projects' }]
        });

        expect(eagerUser.username).to.equal('joe');
        expect(eagerUser.age).to.equal(1);
        expect(eagerUser.Projects).to.exist;
        expect(eagerUser.Projects.length).to.equal(2);

        eagerUser.age = eagerUser.age + 1; // happy birthday joe

        const savedUser = await eagerUser.save();

        expect(savedUser.username).to.equal('joe');
        expect(savedUser.age).to.equal(2);
        expect(savedUser.Projects).to.exist;
        expect(savedUser.Projects.length).to.equal(2);
      });

      it('saves many objects that each a have collection of eagerly loaded objects', async () => {
        const bart = await UserEager.create({ username: 'bart', age: 20 });
        const lisa = await UserEager.create({ username: 'lisa', age: 20 });
        const detention1 = await ProjectEager.create({ title: 'detention1', overdue_days: 0 });
        const detention2 = await ProjectEager.create({ title: 'detention2', overdue_days: 0 });
        const exam1 = await ProjectEager.create({ title: 'exam1', overdue_days: 0 });
        const exam2 = await ProjectEager.create({ title: 'exam2', overdue_days: 0 });

        await bart.setProjects([detention1, detention2]);
        await lisa.setProjects([exam1, exam2]);

        const simpsons = await UserEager.findAll({
          where: { age: 20 },
          order: [['username', 'ASC']],
          include: [{ model: ProjectEager, as: 'Projects' }]
        });

        expect(simpsons.length).to.equal(2);

        const _bart = simpsons[0];
        const _lisa = simpsons[1];

        expect(_bart.Projects).to.exist;
        expect(_lisa.Projects).to.exist;
        expect(_bart.Projects.length).to.equal(2);
        expect(_lisa.Projects.length).to.equal(2);

        _bart.age = _bart.age + 1; // happy birthday bart - off to Moe's

        const savedbart = await _bart.save();

        expect(savedbart.username).to.equal('bart');
        expect(savedbart.age).to.equal(21);

        _lisa.username = 'lsimpson';

        const savedlisa = await _lisa.save();

        expect(savedlisa.username).to.equal('lsimpson');
        expect(savedlisa.age).to.equal(20);
      });

      it('saves many objects that each has one eagerly loaded object (to which they belong)', async () => {
        const user = await UserEager.create({ username: 'poobah', age: 18 });
        const homework = await ProjectEager.create({ title: 'homework', overdue_days: 10 });
        const party = await ProjectEager.create({ title: 'party', overdue_days: 2 });

        await user.setProjects([homework, party]);

        const projects = await ProjectEager.findAll({ include: [{ model: UserEager, as: 'Poobah' }] });

        expect(projects.length).to.equal(2);
        expect(projects[0].Poobah).to.exist;
        expect(projects[1].Poobah).to.exist;
        expect(projects[0].Poobah.username).to.equal('poobah');
        expect(projects[1].Poobah.username).to.equal('poobah');

        projects[0].title = 'partymore';
        projects[1].title = 'partymore';
        projects[0].overdue_days = 0;
        projects[1].overdue_days = 0;

        await projects[0].save();
        await projects[1].save();

        const savedprojects = await ProjectEager.findAll({
          where: { title: 'partymore', overdue_days: 0 },
          include: [{ model: UserEager, as: 'Poobah' }]
        });

        expect(savedprojects.length).to.equal(2);
        expect(savedprojects[0].Poobah).to.exist;
        expect(savedprojects[1].Poobah).to.exist;
        expect(savedprojects[0].Poobah.username).to.equal('poobah');
        expect(savedprojects[1].Poobah.username).to.equal('poobah');
      });
    });
  });

  describe('findAll', () => {
    let ParanoidUser;

    beforeEach(async () => {
      ParanoidUser = current.define(
        'ParanoidUser',
        {
          username: { type: DataTypes.STRING }
        },
        { paranoid: true }
      );

      ParanoidUser.hasOne(ParanoidUser);
      await ParanoidUser.sync({ force: true });
    });

    it('sql should have paranoid condition', async () => {
      await ParanoidUser.create({ username: 'cuss' });

      const users = await ParanoidUser.findAll();

      expect(users).to.have.length(1);

      await users[0].destroy();

      const remaining = await ParanoidUser.findAll();

      expect(remaining).to.have.length(0);
    });

    it('sequelize.and as where should include paranoid condition', async () => {
      await ParanoidUser.create({ username: 'cuss' });

      const users = await ParanoidUser.findAll({
        where: current.and({
          username: 'cuss'
        })
      });

      expect(users).to.have.length(1);

      await users[0].destroy();

      const remaining = await ParanoidUser.findAll({
        where: current.and({
          username: 'cuss'
        })
      });

      expect(remaining).to.have.length(0);
    });

    it('sequelize.or as where should include paranoid condition', async () => {
      await ParanoidUser.create({ username: 'cuss' });

      const users = await ParanoidUser.findAll({
        where: current.or({
          username: 'cuss'
        })
      });

      expect(users).to.have.length(1);

      await users[0].destroy();

      const remaining = await ParanoidUser.findAll({
        where: current.or({
          username: 'cuss'
        })
      });

      expect(remaining).to.have.length(0);
    });

    it('escapes a single single quotes properly in where clauses', async () => {
      await SharedUser.create({ username: "user'name" });

      const users = await SharedUser.findAll({
        where: { username: "user'name" }
      });

      expect(users.length).to.equal(1);
      expect(users[0].username).to.equal("user'name");
    });

    it('escapes two single quotes properly in where clauses', async () => {
      await SharedUser.create({ username: "user''name" });

      const users = await SharedUser.findAll({
        where: { username: "user''name" }
      });

      expect(users.length).to.equal(1);
      expect(users[0].username).to.equal("user''name");
    });

    it('returns the timestamps if no attributes have been specified', async () => {
      await SharedUser.create({ username: 'fnord' });

      const users = await SharedUser.findAll();

      expect(users[0].createdAt).to.exist;
    });

    it('does not return the timestamps if the username attribute has been specified', async () => {
      await SharedUser.create({ username: 'fnord' });

      const users = await SharedUser.findAll({ attributes: ['username'] });

      expect(users[0].createdAt).not.to.exist;
      expect(users[0].username).to.exist;
    });

    it('creates the deletedAt property, when defining paranoid as true', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();

      expect(users[0].deletedAt).to.be.null;
    });

    it('destroys a record with a primary key of something other than id', async () => {
      const UserDestroy = current.define('UserDestroy', {
        newId: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        email: DataTypes.STRING
      });

      await UserDestroy.sync();
      await UserDestroy.create({ newId: '123ABC', email: 'hello' });

      const user = await UserDestroy.findOne({ where: { email: 'hello' } });

      await user.destroy();
    });

    it('sets deletedAt property to a specific date when deleting an instance', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();

      await users[0].destroy();

      expect(users[0].deletedAt.getMonth).to.exist;

      const user = await users[0].reload({ paranoid: false });

      expect(user.deletedAt.getMonth).to.exist;
    });

    it('keeps the deletedAt-attribute with value null, when running updateAttributes', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();
      const user = await users[0].update({ username: 'newFnord' });

      expect(user.deletedAt).not.to.exist;
    });

    it('keeps the deletedAt-attribute with value null, when updating associations', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();
      const linkedUser = await ParanoidUser.create({ username: 'linkedFnord' });
      const user = await users[0].setParanoidUser(linkedUser);

      expect(user.deletedAt).not.to.exist;
    });

    it('can reuse query option objects', async () => {
      await SharedUser.create({ username: 'fnord' });

      const query = { where: { username: 'fnord' } };
      const users = await SharedUser.findAll(query);

      expect(users[0].username).to.equal('fnord');

      const usersAgain = await SharedUser.findAll(query);

      expect(usersAgain[0].username).to.equal('fnord');
    });
  });

  describe('find', () => {
    it('can reuse query option objects', async () => {
      await SharedUser.create({ username: 'fnord' });

      const query = { where: { username: 'fnord' } };
      const user = await SharedUser.findOne(query);

      expect(user.username).to.equal('fnord');

      const userAgain = await SharedUser.findOne(query);

      expect(userAgain.username).to.equal('fnord');
    });

    it('returns null for null, undefined, and unset boolean values', async () => {
      const Setting = current.define(
        'SettingHelper',
        {
          setting_key: DataTypes.STRING,
          bool_value: { type: DataTypes.BOOLEAN, allowNull: true },
          bool_value2: { type: DataTypes.BOOLEAN, allowNull: true },
          bool_value3: { type: DataTypes.BOOLEAN, allowNull: true }
        },
        { timestamps: false, logging: false }
      );

      await Setting.sync({ force: true });
      await Setting.create({ setting_key: 'test', bool_value: null, bool_value2: undefined });

      const setting = await Setting.findOne({ where: { setting_key: 'test' } });

      expect(setting.bool_value).to.equal(null);
      expect(setting.bool_value2).to.equal(null);
      expect(setting.bool_value3).to.equal(null);
    });
  });

  describe('equals', () => {
    it('can compare records with Date field', async () => {
      const user1 = await SharedUser.create({ username: 'fnord' });
      const user2 = await SharedUser.findOne({ where: { username: 'fnord' } });

      expect(user1.equals(user2)).to.be.true;
    });

    it('does not compare the existence of associations', async () => {
      const UserAssociationEqual = current.define(
        'UserAssociationEquals',
        {
          username: DataTypes.STRING,
          age: DataTypes.INTEGER
        },
        { timestamps: false }
      );

      const ProjectAssociationEqual = current.define(
        'ProjectAssocationEquals',
        {
          title: DataTypes.STRING,
          overdue_days: DataTypes.INTEGER
        },
        { timestamps: false }
      );

      UserAssociationEqual.hasMany(ProjectAssociationEqual, { as: 'Projects', foreignKey: 'userId' });
      ProjectAssociationEqual.belongsTo(UserAssociationEqual, { as: 'Users', foreignKey: 'userId' });

      await UserAssociationEqual.sync({ force: true });
      await ProjectAssociationEqual.sync({ force: true });

      const user1 = await UserAssociationEqual.create({ username: 'jimhalpert' });
      const project1 = await ProjectAssociationEqual.create({ title: 'A Cool Project' });

      await user1.setProjects([project1]);

      const user2 = await UserAssociationEqual.findOne({
        where: { username: 'jimhalpert' },
        include: [{ model: ProjectAssociationEqual, as: 'Projects' }]
      });

      const user3 = await UserAssociationEqual.create({ username: 'pambeesly' });

      expect(user1.get('Projects')).to.not.exist;
      expect(user2.get('Projects')).to.exist;
      expect(user1.equals(user2)).to.be.true;
      expect(user2.equals(user1)).to.be.true;
      expect(user1.equals(user3)).to.not.be.true;
      expect(user3.equals(user1)).to.not.be.true;
    });
  });

  describe('values', () => {
    it('returns all values', async () => {
      const User = current.define(
        'UserHelper',
        {
          username: DataTypes.STRING
        },
        { timestamps: false, logging: false }
      );

      await User.sync();

      const user = User.build({ username: 'foo' });
      expect(user.get({ plain: true })).to.deep.equal({ username: 'foo', id: null });
    });
  });

  describe('destroy', () => {
    if (current.dialect.supports.transactions) {
      it('supports transactions', async () => {
        const sequelize = await Support.prepareTransactionTest(current);
        const User = sequelize.define('User', { username: Support.Sequelize.STRING });

        await User.sync({ force: true });

        const user = await User.create({ username: 'foo' });
        const t = await sequelize.transaction();

        await user.destroy({ transaction: t });

        const count1 = await User.count();
        const count2 = await User.count({ transaction: t });

        expect(count1).to.equal(1);
        expect(count2).to.equal(0);

        await t.rollback();
      });
    }

    it('does not set the deletedAt date in subsequent destroys if dao is paranoid', async () => {
      const UserDestroy = current.define(
        'UserDestroy',
        {
          name: Support.Sequelize.STRING,
          bio: Support.Sequelize.TEXT
        },
        { paranoid: true }
      );

      await UserDestroy.sync({ force: true });

      const user = await UserDestroy.create({ name: 'hallo', bio: 'welt' });

      await user.destroy();
      await user.reload({ paranoid: false });

      const deletedAt = user.deletedAt;

      await user.destroy();
      await user.reload({ paranoid: false });

      expect(user.deletedAt).to.eql(deletedAt);
    });

    it('deletes a record from the database if dao is not paranoid', async () => {
      const UserDestroy = current.define('UserDestroy', {
        name: Support.Sequelize.STRING,
        bio: Support.Sequelize.TEXT
      });

      await UserDestroy.sync({ force: true });

      const u = await UserDestroy.create({ name: 'hallo', bio: 'welt' });
      const users = await UserDestroy.findAll();

      expect(users.length).to.equal(1);

      await u.destroy();

      const remainingUsers = await UserDestroy.findAll();

      expect(remainingUsers.length).to.equal(0);
    });

    it('allows sql logging of delete statements', async () => {
      const UserDelete = current.define('UserDelete', {
        name: Support.Sequelize.STRING,
        bio: Support.Sequelize.TEXT
      });

      await UserDelete.sync({ force: true });

      const u = await UserDelete.create({ name: 'hallo', bio: 'welt' });
      const users = await UserDelete.findAll();

      expect(users.length).to.equal(1);

      await u.destroy({
        logging(sql) {
          expect(sql).to.exist;
          expect(sql.toUpperCase().indexOf('DELETE')).to.be.above(-1);
        }
      });
    });

    it('delete a record of multiple primary keys table', async () => {
      const MultiPrimary = current.define('MultiPrimary', {
        bilibili: {
          type: Support.Sequelize.CHAR(2),
          primaryKey: true
        },

        guruguru: {
          type: Support.Sequelize.CHAR(2),
          primaryKey: true
        }
      });

      await MultiPrimary.sync({ force: true });
      await MultiPrimary.create({ bilibili: 'bl', guruguru: 'gu' });

      const m2 = await MultiPrimary.create({ bilibili: 'bl', guruguru: 'ru' });
      const ms = await MultiPrimary.findAll();

      expect(ms.length).to.equal(2);

      await m2.destroy({
        logging(sql) {
          expect(sql).to.exist;
          expect(sql.toUpperCase().indexOf('DELETE')).to.be.above(-1);
          expect(sql.indexOf('ru')).to.be.above(-1);
          expect(sql.indexOf('bl')).to.be.above(-1);
        }
      });

      const remainingMs = await MultiPrimary.findAll();

      expect(remainingMs.length).to.equal(1);
      expect(remainingMs[0].bilibili).to.equal('bl');
      expect(remainingMs[0].guruguru).to.equal('gu');
    });

    it('converts Infinity in where clause to a timestamp', async () => {
      const Date = current.define(
        'Date',
        {
          date: {
            type: DataTypes.DATE,
            primaryKey: true
          },
          deletedAt: {
            type: DataTypes.DATE,
            defaultValue: Infinity
          }
        },
        { paranoid: true }
      );

      await current.sync({ force: true });

      const date = await Date.build({ date: Infinity }).save();

      await date.destroy();
    });
  });

  describe('isSoftDeleted', () => {
    let ParanoidUser;

    beforeEach(async () => {
      ParanoidUser = current.define(
        'ParanoidUser',
        {
          username: { type: DataTypes.STRING }
        },
        { paranoid: true }
      );

      await ParanoidUser.sync({ force: true });
    });

    it('returns false if user is not soft deleted', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();

      expect(users[0].isSoftDeleted()).to.be.false;
    });

    it('returns true if user is soft deleted', async () => {
      await ParanoidUser.create({ username: 'fnord' });

      const users = await ParanoidUser.findAll();

      await users[0].destroy();

      expect(users[0].isSoftDeleted()).to.be.true;

      const user = await users[0].reload({ paranoid: false });

      expect(user.isSoftDeleted()).to.be.true;
    });

    it('works with custom `deletedAt` field name', async () => {
      const ParanoidUserWithCustomDeletedAt = current.define(
        'ParanoidUserWithCustomDeletedAt',
        {
          username: { type: DataTypes.STRING }
        },
        {
          deletedAt: 'deletedAtThisTime',
          paranoid: true
        }
      );

      ParanoidUserWithCustomDeletedAt.hasOne(ParanoidUser);

      await ParanoidUserWithCustomDeletedAt.sync({ force: true });
      await ParanoidUserWithCustomDeletedAt.create({ username: 'fnord' });

      const users = await ParanoidUserWithCustomDeletedAt.findAll();

      expect(users[0].isSoftDeleted()).to.be.false;

      await users[0].destroy();

      expect(users[0].isSoftDeleted()).to.be.true;

      const user = await users[0].reload({ paranoid: false });

      expect(user.isSoftDeleted()).to.be.true;
    });
  });

  describe('restore', () => {
    it('returns an error if the model is not paranoid', async () => {
      const user = await SharedUser.create({ username: 'Peter', secretValue: '42' });

      await expect(user.restore()).rejects.toThrow('Model is not paranoid');
    });

    it('restores a previously deleted model', async () => {
      const ParanoidUser = current.define(
          'ParanoidUser',
          {
            username: DataTypes.STRING,
            secretValue: DataTypes.STRING,
            data: DataTypes.STRING,
            intVal: { type: DataTypes.INTEGER, defaultValue: 1 }
          },
          {
            paranoid: true
          }
        ),
        data = [
          { username: 'Peter', secretValue: '42' },
          { username: 'Paul', secretValue: '43' },
          { username: 'Bob', secretValue: '44' }
        ];

      await ParanoidUser.sync({ force: true });
      await ParanoidUser.bulkCreate(data);

      const peter = await ParanoidUser.findOne({ where: { secretValue: '42' } });

      await peter.destroy();
      await peter.restore();

      const user = await ParanoidUser.findOne({ where: { secretValue: '42' } });

      expect(user).to.be.ok;
      expect(user.username).to.equal('Peter');
    });
  });
});
