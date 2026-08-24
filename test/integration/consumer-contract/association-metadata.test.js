import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

/**
 * `common/app-core/src/lib/sequelize-extensions/eager-load.js` does not use `include`. It walks
 * association objects itself, branches on `associationType`, and hand-builds one query per
 * relationship — so the shape of an `Association` is load-bearing for the whole legacy read path
 * (`base-manager.ts:1046` → `fastFindAll`, plus four call sites inside `eager-load.js`).
 *
 * `associationType` and `associationAccessor` are referenced in 7 and 5 files under `lib/` and in
 * no test in this repo, while the consumer branches on them 7 and 4 times respectively. The exact
 * `associationType` strings are duplicated into a consumer-side enum
 * (`legacy-data-layer/src/sequelize.ts:383`), so they are a literal API contract, not an
 * implementation detail.
 *
 * Consumers:
 *   common/app-core/src/lib/sequelize-extensions/eager-load.js
 *   data-access-layer/legacy-data-layer/src/sequelize.ts
 */
describe(Support.getTestDialectTeaser('Consumer contract'), () => {
  describe('association metadata', () => {
    let User, Post, Tag, Profile, hasMany, belongsTo, hasOne, belongsToMany, aliased;

    beforeEach(async () => {
      User = current.define('AmUser', { name: DataTypes.STRING }, { underscored: true });
      Post = current.define('AmPost', { title: DataTypes.STRING }, { underscored: true });
      Tag = current.define('AmTag', { label: DataTypes.STRING }, { underscored: true });
      Profile = current.define('AmProfile', { bio: DataTypes.STRING }, { underscored: true });

      hasMany = User.hasMany(Post);
      belongsTo = Post.belongsTo(User);
      hasOne = User.hasOne(Profile);
      belongsToMany = Post.belongsToMany(Tag, { through: 'AmPostTag' });
      Tag.belongsToMany(Post, { through: 'AmPostTag' });

      // An aliased association with an explicit foreign key, as the consumer's polymorphic and
      // self-referential relationships are declared.
      aliased = User.hasMany(Post, { as: 'authored', foreignKey: 'author_id' });

      await current.sync({ force: true });
    });

    describe('associationType', () => {
      // These four strings are copied verbatim into the consumer's `AssociationType` enum. Renaming
      // one here would not fail anything in this repo, and would silently send every relationship
      // of that kind down `eager-load.js`'s fall-through path.
      it('is BelongsTo', () => {
        expect(belongsTo.associationType).to.equal('BelongsTo');
      });

      it('is HasMany', () => {
        expect(hasMany.associationType).to.equal('HasMany');
      });

      it('is HasOne', () => {
        expect(hasOne.associationType).to.equal('HasOne');
      });

      it('is BelongsToMany', () => {
        expect(belongsToMany.associationType).to.equal('BelongsToMany');
      });

      it('covers every association the consumer branches on', () => {
        const types = Object.values(User.associations)
          .concat(Object.values(Post.associations))
          .map((association) => association.associationType);

        expect(new Set(types)).to.deep.equal(new Set(['HasMany', 'HasOne', 'BelongsTo', 'BelongsToMany']));
      });
    });

    describe('associationAccessor', () => {
      it('equals the association alias', () => {
        expect(hasMany.associationAccessor).to.equal(hasMany.as);
        expect(aliased.associationAccessor).to.equal('authored');
      });

      it('is the key the association is registered under on the model', () => {
        // `eager-load.js` looks associations up by accessor rather than holding references.
        expect(User.associations[hasMany.associationAccessor]).to.equal(hasMany);
        expect(User.associations.authored).to.equal(aliased);
      });

      it('defaults to the pluralized model name for a to-many association', () => {
        expect(hasMany.associationAccessor).to.equal('AmPosts');
        expect(belongsToMany.associationAccessor).to.equal('AmTags');
      });

      it('defaults to the singular model name for a to-one association', () => {
        expect(belongsTo.associationAccessor).to.equal('AmUser');
        expect(hasOne.associationAccessor).to.equal('AmProfile');
      });

      it('is also the dataValues key an eagerly loaded association lands on', async () => {
        // This is the join between the metadata and the read path: `eager-load.js` reads
        // `instance.dataValues[accessor]` to find what has already been loaded.
        const user = await User.create({ name: 'owner' });
        await Post.create({ title: 'a', am_user_id: user.id });

        const loaded = await User.findOne({ where: { id: user.id }, include: [Post] });

        expect(loaded.dataValues[hasMany.associationAccessor]).to.be.an('array');
        expect(loaded.dataValues[hasMany.associationAccessor][0].get('title')).to.equal('a');
      });
    });

    describe('foreignKey and otherKey', () => {
      it('derives an underscored foreign key from the source model', () => {
        expect(hasMany.foreignKey).to.equal('am_user_id');
        expect(belongsTo.foreignKey).to.equal('am_user_id');
        expect(hasOne.foreignKey).to.equal('am_user_id');
      });

      it('honours an explicit foreign key', () => {
        expect(aliased.foreignKey).to.equal('author_id');
      });

      it('exposes both sides of a belongsToMany', () => {
        expect(belongsToMany.foreignKey).to.equal('am_post_id');
        expect(belongsToMany.otherKey).to.equal('am_tag_id');
      });

      it('leaves otherKey undefined on every other association type', () => {
        // `eager-load.js` reaches for `otherKey` only inside its BelongsToMany branch; its presence
        // is what distinguishes a join-table hop from a direct foreign key.
        expect(hasMany.otherKey).to.be.undefined;
        expect(belongsTo.otherKey).to.be.undefined;
        expect(hasOne.otherKey).to.be.undefined;
      });
    });

    describe('through', () => {
      it('is present only on a belongsToMany', () => {
        expect(belongsToMany.through).to.be.an('object');
        expect(hasMany.through).to.be.undefined;
      });

      it('carries the join model, which the consumer queries directly', () => {
        // `eager-load.js:450` pulls `association.through.model` out to build its own join query
        // against the through table.
        expect(belongsToMany.through.model).to.equal(current.models.AmPostTag);
        expect(belongsToMany.through.model.getTableName()).to.be.a('string');
      });

      it('carries a through scope when one is declared', () => {
        const Left = current.define('AmLeft', { n: DataTypes.INTEGER });
        const Right = current.define('AmRight', { n: DataTypes.INTEGER });
        const association = Left.belongsToMany(Right, {
          through: { model: 'AmLeftRight', scope: { active: true } }
        });

        expect(association.through.scope).to.deep.equal({ active: true });
      });
    });

    describe('scope', () => {
      it('is undefined when the association is unscoped', () => {
        expect(hasMany.scope).to.be.undefined;
      });

      it('is exposed so it can be merged into a hand-built where clause', () => {
        // `eager-load.js:96` does `Object.assign({}, association.scope, relationship.where)`.
        const association = User.hasMany(Post, { as: 'drafts', scope: { title: 'draft' } });

        expect(association.scope).to.deep.equal({ title: 'draft' });
      });
    });

    describe('source and target', () => {
      it('point at the model objects on both ends', () => {
        expect(hasMany.source).to.equal(User);
        expect(hasMany.target).to.equal(Post);
        expect(belongsTo.source).to.equal(Post);
        expect(belongsTo.target).to.equal(User);
      });

      it('exposes the metadata the consumer reads off the target', () => {
        expect(hasMany.target.name).to.equal('AmPost');
        expect(hasMany.target.tableName).to.be.a('string');
        expect(hasMany.target.options).to.be.an('object');
      });
    });

    describe('primaryKeyAttribute', () => {
      it('is the attribute name, not the column', () => {
        expect(User.primaryKeyAttribute).to.equal('id');
      });

      it('is what instance.get() keys off after a raw hydration', async () => {
        // `eager-load.js:259` builds its id index with `row.get(targetModel.primaryKeyAttribute)`.
        const user = await User.create({ name: 'owner' });

        expect(user.get(User.primaryKeyAttribute)).to.equal(user.id);
      });

      it('follows an explicitly declared primary key', () => {
        const Model = current.define('AmCustomPk', {
          code: { type: DataTypes.STRING, primaryKey: true }
        });

        expect(Model.primaryKeyAttribute).to.equal('code');
      });
    });

    describe('Model.scoped', () => {
      // `eager-load.js:92` picks between the relationship's model and `association.target` with
      // `relationship.model.scoped ? … : …`, so the flag has to stay falsy on a base model.
      it('is falsy on a model as defined', () => {
        expect(User.scoped).to.not.be.ok;
      });

      it('is true on the result of .scope()', () => {
        expect(User.scope(null).scoped).to.equal(true);
      });

      it('leaves the scoped model otherwise interchangeable with its base', () => {
        const Scoped = User.scope(null);

        expect(Scoped.name).to.equal(User.name);
        expect(Scoped.primaryKeyAttribute).to.equal(User.primaryKeyAttribute);
        expect(Scoped.getTableName()).to.equal(User.getTableName());
      });

      it('is true for a model carrying a default scope only once .scope() is called', () => {
        const Scoped = current.define(
          'AmDefaultScoped',
          { n: DataTypes.INTEGER },
          { defaultScope: { where: { n: 1 } } }
        );

        expect(Scoped.scoped).to.not.be.ok;
        expect(Scoped.scope('defaultScope').scoped).to.equal(true);
      });
    });
  });
});
