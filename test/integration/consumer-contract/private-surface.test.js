import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

/**
 * These tests pin the *undocumented* instance/model surface that `auditboard-backend` builds on.
 * None of it is public API, so nothing else in this suite protects it, yet a change here breaks
 * the consumer silently. The refactors that land on this fork (lodash removal, async/await
 * migration, `.then()` cleanups) all touch the same code paths.
 *
 * Each block names the consumer file it stands in for. If a block fails, the fix is either to
 * restore the behaviour or to coordinate the change with that file — not to relax the assertion.
 *
 * Consumers:
 *   common/app-core/src/lib/sequelize-extensions/fast-find-all.js
 *   common/app-core/src/legacy-data-layer/model-builder.ts
 */
describe(Support.getTestDialectTeaser('Consumer contract'), () => {
  describe('private instance surface', () => {
    let User, Post;

    beforeEach(async () => {
      User = current.define(
        'PsUser',
        {
          name: DataTypes.STRING,
          age: { type: DataTypes.INTEGER, defaultValue: 42 }
        },
        { paranoid: true, underscored: true }
      );

      Post = current.define('PsPost', { title: DataTypes.STRING }, { underscored: true });

      User.hasMany(Post);
      Post.belongsTo(User);

      await current.sync({ force: true });
    });

    // `buildModelInstances` hydrates raw `sequelize.query` rows by constructing a bare instance and
    // assigning `dataValues` wholesale. It relies on the constructor doing nothing else.
    describe('new Model({}, { isNewRecord: false })', () => {
      it('produces an empty, non-dirty, non-new instance', () => {
        const instance = new User({}, { isNewRecord: false });

        expect(instance.isNewRecord).to.equal(false);
        expect(instance.dataValues).to.deep.equal({});
        expect(instance._previousDataValues).to.deep.equal({});
        expect(instance.changed()).to.equal(false);
      });

      it('does not apply default values', () => {
        // Defaults are only for new records. If they leaked in, every raw-hydrated row would come
        // back with `age: 42` shadowing a genuine `null` from the database.
        expect(new User({}, { isNewRecord: false }).get('age')).to.be.undefined;
        expect(new User({}).get('age')).to.equal(42);
      });

      it('gives each instance its own mutable, extensible _options', () => {
        const a = new User({}, { isNewRecord: false });
        const b = new User({}, { isNewRecord: false });

        expect(a._options).to.be.an('object');
        expect(a._options).to.not.equal(b._options);

        a._options.attributes = ['id', 'name'];
        expect(b._options.attributes).to.be.undefined;
      });

      it('does not mutate the caller-supplied options object', () => {
        // `_options` is derived from the caller's object; the consumer writes to `_options` per
        // instance and would corrupt a shared options literal if the two were the same object.
        const options = { isNewRecord: false };
        const instance = new User({}, options);

        instance._options.attributes = ['id'];

        expect(options).to.deep.equal({ isNewRecord: false });
      });

      it('normalizes aliased entries in options.attributes', () => {
        // `[column, alias]` pairs collapse to the alias, so `_options.attributes` is always a flat
        // list of the keys that will appear on `dataValues`.
        const instance = new User({}, { isNewRecord: false, attributes: ['id', ['name', 'label']] });

        expect(instance._options.attributes).to.deep.equal(['id', 'label']);
      });
    });

    // `instance.dataValues = result` bypasses `set()` entirely.
    describe('wholesale dataValues assignment', () => {
      it('is readable through get() and toJSON() without going through set()', () => {
        const instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 7, name: 'raw', age: null };

        expect(instance.get('name')).to.equal('raw');
        expect(instance.get('age')).to.equal(null);
        expect(instance.toJSON()).to.deep.equal({ id: 7, name: 'raw', age: null });
      });

      it('leaves the instance non-dirty', () => {
        // `_previousDataValues` is untouched by the assignment. The consumer never saves these
        // instances, but `changed()` reporting every column would make any accidental save
        // rewrite the whole row.
        const instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 7, name: 'raw' };

        expect(instance.changed()).to.equal(false);
        expect(instance.changed('name')).to.equal(false);
      });

      it('still runs custom getters over the assigned values', () => {
        const Model = current.define('PsGetter', {
          name: {
            type: DataTypes.STRING,
            get() {
              return `<${this.getDataValue('name')}>`;
            }
          }
        });

        const instance = new Model({}, { isNewRecord: false });
        instance.dataValues = { id: 1, name: 'raw' };

        expect(instance.get('name')).to.equal('<raw>');
      });
    });

    // `_options.attributes` is written by the consumer and read only by the consumer's own
    // serializer. Sequelize must treat it as an inert passenger.
    describe('_options as a carrier for consumer state', () => {
      it('preserves unknown keys written onto _options', () => {
        const instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 1, name: 'raw' };

        instance._options.attributes = ['id', 'name'];
        instance._options.serializeMap = { id: 'ID' };

        expect(instance._options.attributes).to.deep.equal(['id', 'name']);
        expect(instance._options.serializeMap).to.deep.equal({ id: 'ID' });
      });

      it('does not let _options.attributes filter get() or toJSON()', () => {
        // The consumer sets `_options.attributes` purely as a record of what it selected. If
        // Sequelize started honouring it as a projection, serialized payloads would change shape.
        const instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 1, name: 'raw', age: 3 };
        instance._options.attributes = ['id'];

        expect(instance.toJSON()).to.deep.equal({ id: 1, name: 'raw', age: 3 });
      });

      it('keeps _options.attributes across a get({ plain: true }) round trip', () => {
        const instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 1, name: 'raw' };
        instance._options.attributes = ['id', 'name'];

        instance.get({ plain: true });

        expect(instance._options.attributes).to.deep.equal(['id', 'name']);
      });
    });

    // `instance-extensions` filters `_options.includeNames` to drop an eagerly-loaded association
    // from a serialized payload. That only works because `get()` reads the array live.
    describe('_options.includeNames', () => {
      let loaded;

      beforeEach(async () => {
        const user = await User.create({ name: 'owner' });
        await Post.create({ title: 'a', ps_user_id: user.id });
        loaded = await User.findOne({ where: { id: user.id }, include: [Post] });
      });

      it('is populated for an eagerly loaded association', () => {
        expect(loaded._options.includeNames).to.include('PsPosts');
      });

      it('is read live, so removing a name stops that include being plainified', () => {
        // The key itself stays on the output — `get({ plain: true })` walks `dataValues`, and
        // `includeNames` only decides whether to recurse into a value. Dropping a name therefore
        // leaves a bare Model instance where a plain object would have been, which is exactly the
        // signal the consumer's serializer keys off to decide whether to emit the association.
        const before = loaded.get({ plain: true });
        expect(before.PsPosts[0]).to.not.be.instanceOf(Support.Sequelize.Model);

        loaded._options.includeNames = loaded._options.includeNames.filter((n) => n !== 'PsPosts');

        const after = loaded.get({ plain: true });
        expect(after).to.have.property('name', 'owner');
        expect(after.PsPosts[0]).to.be.instanceOf(Support.Sequelize.Model);
      });
    });

    // Documented so nobody "fixes" reload() into a merge without noticing the consumer relies on
    // the reset: state parked on `_options` is gone after a reload and must be re-applied.
    describe('reload()', () => {
      it('replaces _options wholesale, discarding consumer keys', async () => {
        const user = await User.create({ name: 'owner' });

        user._options.attributes = ['id', 'name'];
        user._options.serializeMap = { id: 'ID' };

        await user.reload();

        expect(user._options.serializeMap).to.be.undefined;
      });
    });

    // `findAllIncludesWithPermissionsImpl` freezes permission metadata onto both the instance and
    // its `dataValues` with `writable: false, configurable: false`. Sequelize must not later try to
    // rewrite those slots — in strict mode that throws rather than silently failing.
    describe('non-writable properties defined on dataValues', () => {
      let instance;

      beforeEach(() => {
        instance = new User({}, { isNewRecord: false });
        instance.dataValues = { id: 1, name: 'raw' };

        const frozenEnumerable = { writable: false, configurable: false, enumerable: true };
        Object.defineProperties(instance.dataValues, {
          _permissions: { value: Object.freeze({ read: true }), ...frozenEnumerable },
          _qps: { value: true, ...frozenEnumerable }
        });
      });

      it('survives get() and toJSON()', () => {
        expect(() => instance.get()).to.not.throw();

        const json = instance.toJSON();
        expect(json._qps).to.equal(true);
        expect(json._permissions).to.deep.equal({ read: true });
      });

      it('survives get({ plain: true })', () => {
        expect(() => instance.get({ plain: true })).to.not.throw();
      });

      it('does not block setting a normal attribute', () => {
        expect(() => instance.set('name', 'changed')).to.not.throw();
        expect(instance.get('name')).to.equal('changed');
      });
    });

    // `buildFindAllQuery`'s fallback path re-derives the paranoid `where` clause by hand.
    describe('paranoid metadata used to hand-build a soft-delete filter', () => {
      it('exposes the deletedAt attribute name via _timestampAttributes', () => {
        // The consumer defines every model with `underscored: true`, which renames the attribute
        // itself — not just the column — so the lookup key is `deleted_at`. A non-paranoid model
        // has no entry at all, which is how the consumer decides to skip the filter entirely.
        expect(User._timestampAttributes.deletedAt).to.equal('deleted_at');
        expect(Post._timestampAttributes.deletedAt).to.be.undefined;
      });

      it('uses the camelCase attribute name when the model is not underscored', () => {
        const Model = current.define('PsCamel', { name: DataTypes.STRING }, { paranoid: true });

        expect(Model._timestampAttributes.deletedAt).to.equal('deletedAt');
        expect(Model.rawAttributes.deletedAt.field).to.equal('deletedAt');
      });

      it('exposes the underlying column and default via rawAttributes', () => {
        const attribute = User.rawAttributes[User._timestampAttributes.deletedAt];

        expect(attribute.field).to.equal('deleted_at');
        expect(Object.hasOwn(attribute, 'defaultValue')).to.equal(false);
      });

      it('reports paranoid and timestamps through model.options', () => {
        expect(User.options.paranoid).to.equal(true);
        expect(User.options.timestamps).to.equal(true);
      });
    });

    // The consumer generates SQL itself, then hands the string to `sequelize.query`.
    describe('queryInterface.QueryGenerator.selectQuery', () => {
      it('is reachable as a property of the sequelize instance', () => {
        expect(current.queryInterface.QueryGenerator.selectQuery).to.be.a('function');
      });

      it('accepts a bare table name with no model argument', () => {
        // Called with two arguments the table gets no alias, so `where` keys must be treated as
        // literal column names — that is what lets the consumer key its filter off `field`.
        const sql = current.queryInterface.QueryGenerator.selectQuery(User.getTableName(), {
          attributes: ['id', 'name'],
          where: { deleted_at: null },
          limit: 10
        });

        expect(sql).to.match(/^SELECT /);
        expect(sql).to.contain(User.getTableName());
        expect(sql).to.contain('deleted_at');
        expect(sql).to.not.contain('PsUser.');
        expect(sql).to.contain('LIMIT 10');
      });

      it('produces SQL the connection actually accepts', async () => {
        await User.create({ name: 'owner' });

        const sql = current.queryInterface.QueryGenerator.selectQuery(User.getTableName(), {
          attributes: ['id', 'name'],
          where: { deleted_at: null }
        });

        const rows = await current.query(sql, { type: current.QueryTypes.SELECT });

        expect(rows).to.have.length(1);
        expect(rows[0].name).to.equal('owner');
      });

      it('returns a plain string table name from getTableName()', () => {
        expect(User.getTableName()).to.be.a('string');
      });
    });

    // `model-builder` wraps ~14 methods onto the generated model's prototype, including `save` and
    // `destroy`, to drive cache invalidation. Internal call sites must dispatch through the
    // prototype rather than holding a direct reference.
    describe('prototype method overrides', () => {
      it('is what Model.create() dispatches to', async () => {
        const original = User.prototype.save;
        const seen = [];

        User.prototype.save = function save(...args) {
          // The consumer reads dirty-tracking state before delegating.
          seen.push({ isNewRecord: this.isNewRecord, changed: Object.assign({}, this._changed) });
          return original.apply(this, args).then((result) => result);
        };

        try {
          const user = await User.create({ name: 'owner' });
          expect(user.get('name')).to.equal('owner');
        } finally {
          User.prototype.save = original;
        }

        expect(seen).to.have.length(1);
        expect(seen[0].isNewRecord).to.equal(true);
        expect(seen[0].changed.name).to.equal(true);
      });

      it('is what instance.destroy() dispatches to, and may return a thenable', async () => {
        const user = await User.create({ name: 'owner' });
        const original = User.prototype.destroy;
        let called = 0;

        User.prototype.destroy = function destroy(...args) {
          called++;
          return original.apply(this, args).then((result) => result);
        };

        try {
          await user.destroy();
        } finally {
          User.prototype.destroy = original;
        }

        expect(called).to.equal(1);
        expect(await User.count()).to.equal(0);
      });
    });
  });
});
