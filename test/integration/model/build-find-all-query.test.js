import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const Op = Support.Sequelize.Op;
const current = Support.sequelize;

/**
 * `buildFindAllQuery` exists so callers can obtain the SQL for a find without executing it. It
 * shares its option normalization with `findAll` (`_prepareFindOptions`, `_conformFindOptions`,
 * `_finalizeFindOptions`), and these tests are what hold the two together: if the shared steps
 * stop being shared, the SQL will diverge and the equality assertions below will fail.
 */
describe(Support.getTestDialectTeaser('Model'), () => {
  describe('buildFindAllQuery', () => {
    let User, Post, Tag;

    beforeEach(async () => {
      User = current.define('BfqUser', {
        name: DataTypes.STRING,
        age: DataTypes.INTEGER,
        active: DataTypes.BOOLEAN
      });
      Post = current.define('BfqPost', { title: DataTypes.STRING, n: DataTypes.INTEGER });
      Tag = current.define('BfqTag', { label: DataTypes.STRING });

      User.hasMany(Post);
      Post.belongsTo(User);
      Post.belongsToMany(Tag, { through: 'BfqPostTag' });
      Tag.belongsToMany(Post, { through: 'BfqPostTag' });

      await current.sync({ force: true });
    });

    /** Runs findAll, capturing the SQL it actually executes. */
    async function executedSql(Model, options) {
      let sql = null;
      await Model.findAll({
        ...options,
        logging: (statement) => {
          if (sql === null) {
            sql = statement;
          }
        }
      });
      return sql.replace(/^Executing \(default\): /, '');
    }

    function itMatches(label, build) {
      it(`matches findAll for ${label}`, async () => {
        const [Model, options] = build();
        expect(Model.buildFindAllQuery(options)).to.equal(await executedSql(Model, options));
      });
    }

    itMatches('no options', () => {
      return [User, {}];
    });
    itMatches('a where clause', () => {
      return [User, { where: { id: 1 } }];
    });
    itMatches('an operator in where', () => {
      return [User, { where: { age: { [Op.gt]: 18 } } }];
    });
    itMatches('an attribute subset', () => {
      return [User, { attributes: ['name'] }];
    });
    itMatches('order, limit and offset', () => {
      return [User, { where: { active: true }, order: [['name', 'DESC']], limit: 5, offset: 10 }];
    });
    itMatches('a grouped aggregate', () => {
      return [
        User,
        {
          attributes: ['age', [current.fn('COUNT', current.col('id')), 'c']],
          group: ['age']
        }
      ];
    });
    itMatches('a hasMany include', () => {
      return [User, { include: [Post] }];
    });
    itMatches('a belongsTo include', () => {
      return [Post, { include: [User] }];
    });
    itMatches('an include with an attribute subset', () => {
      return [User, { attributes: ['name'], include: [Post] }];
    });
    itMatches('a nested include', () => {
      return [User, { include: [{ model: Post, include: [Tag] }] }];
    });
    // `include: all` is only expanded by `_expandIncludeAll`, so this is the case that fails if
    // `buildFindAllQuery` ever stops sharing the conform step with `findAll`.
    itMatches('include: all', () => {
      return [User, { include: [{ all: true }] }];
    });
    itMatches('include: all, nested', () => {
      return [User, { include: [{ all: true, nested: true }] }];
    });
    itMatches('an include with where and order', () => {
      return [User, { where: { active: true }, include: [Post], order: ['id'] }];
    });
    itMatches('an include with a limit', () => {
      return [User, { include: [Post], limit: 3 }];
    });
    itMatches('paranoid disabled', () => {
      return [User, { paranoid: false }];
    });
    itMatches('raw', () => {
      return [User, { raw: true, where: { id: 2 } }];
    });
    itMatches('a row lock', () => {
      return [User, { where: { id: 1 }, lock: true }];
    });

    it('does not mutate the options it is given', function () {
      const options = { where: { id: 1 }, attributes: ['name'] };
      const snapshot = JSON.stringify(options);

      User.buildFindAllQuery(options);

      expect(JSON.stringify(options)).to.equal(snapshot);
    });

    it('runs no hooks and issues no query', function () {
      const fired = [];
      for (const name of ['beforeFind', 'beforeFindAfterExpandIncludeAll', 'beforeFindAfterOptions', 'afterFind']) {
        User.addHook(name, () => fired.push(name));
      }

      let queried = false;
      User.buildFindAllQuery({ logging: () => (queried = true) });

      expect(fired, 'no hooks should fire').to.deep.equal([]);
      expect(queried, 'no query should be issued').to.be.false;
    });

    it('rejects a non-object argument like findAll does', function () {
      expect(() => User.buildFindAllQuery(1)).to.throw(/must be an options object/);
    });

    it('rejects a malformed attributes option like findAll does', function () {
      expect(() => User.buildFindAllQuery({ attributes: 'name' })).to.throw(/attributes option must be an array/);
    });

    describe('findAll still drives its hooks around the shared steps', () => {
      it('fires the find hooks in order', async function () {
        const fired = [];
        for (const name of ['beforeFind', 'beforeFindAfterExpandIncludeAll', 'beforeFindAfterOptions', 'afterFind']) {
          User.addHook(name, () => fired.push(name));
        }

        await User.findAll();

        expect(fired).to.deep.equal([
          'beforeFind',
          'beforeFindAfterExpandIncludeAll',
          'beforeFindAfterOptions',
          'afterFind'
        ]);
      });

      it('applies a where set by beforeFind', async function () {
        await User.create({ name: 'kept' });
        User.addHook('beforeFind', (options) => {
          options.where = { name: 'absent' };
        });

        expect(await User.findAll()).to.have.length(0);
      });

      it('applies an attribute list set by beforeFindAfterOptions', async function () {
        await User.create({ name: 'a', age: 3 });
        User.addHook('beforeFindAfterOptions', (options) => {
          options.attributes = ['name'];
        });

        const [user] = await User.findAll();
        expect(Object.keys(user.dataValues)).to.deep.equal(['name']);
      });

      it('skips the hooks when hooks is false', async function () {
        const fired = [];
        User.addHook('beforeFind', () => fired.push('beforeFind'));

        await User.findAll({ hooks: false });

        expect(fired).to.deep.equal([]);
      });
    });
  });
});
