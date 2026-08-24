import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

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
    beforeEach(async function () {
      this.User = this.sequelize.define('AmUser', { name: DataTypes.STRING }, { underscored: true });
      this.Post = this.sequelize.define('AmPost', { title: DataTypes.STRING }, { underscored: true });
      this.Tag = this.sequelize.define('AmTag', { label: DataTypes.STRING }, { underscored: true });
      this.Profile = this.sequelize.define('AmProfile', { bio: DataTypes.STRING }, { underscored: true });

      this.hasMany = this.User.hasMany(this.Post);
      this.belongsTo = this.Post.belongsTo(this.User);
      this.hasOne = this.User.hasOne(this.Profile);
      this.belongsToMany = this.Post.belongsToMany(this.Tag, { through: 'AmPostTag' });
      this.Tag.belongsToMany(this.Post, { through: 'AmPostTag' });

      // An aliased association with an explicit foreign key, as the consumer's polymorphic and
      // self-referential relationships are declared.
      this.aliased = this.User.hasMany(this.Post, { as: 'authored', foreignKey: 'author_id' });

      await this.sequelize.sync({ force: true });
    });

    describe('associationType', () => {
      // These four strings are copied verbatim into the consumer's `AssociationType` enum. Renaming
      // one here would not fail anything in this repo, and would silently send every relationship
      // of that kind down `eager-load.js`'s fall-through path.
      it('is BelongsTo', function () {
        expect(this.belongsTo.associationType).to.equal('BelongsTo');
      });

      it('is HasMany', function () {
        expect(this.hasMany.associationType).to.equal('HasMany');
      });

      it('is HasOne', function () {
        expect(this.hasOne.associationType).to.equal('HasOne');
      });

      it('is BelongsToMany', function () {
        expect(this.belongsToMany.associationType).to.equal('BelongsToMany');
      });

      it('covers every association the consumer branches on', function () {
        const types = Object.values(this.User.associations)
          .concat(Object.values(this.Post.associations))
          .map((association) => association.associationType);

        expect(new Set(types)).to.deep.equal(new Set(['HasMany', 'HasOne', 'BelongsTo', 'BelongsToMany']));
      });
    });

    describe('associationAccessor', () => {
      it('equals the association alias', function () {
        expect(this.hasMany.associationAccessor).to.equal(this.hasMany.as);
        expect(this.aliased.associationAccessor).to.equal('authored');
      });

      it('is the key the association is registered under on the model', function () {
        // `eager-load.js` looks associations up by accessor rather than holding references.
        expect(this.User.associations[this.hasMany.associationAccessor]).to.equal(this.hasMany);
        expect(this.User.associations.authored).to.equal(this.aliased);
      });

      it('defaults to the pluralized model name for a to-many association', function () {
        expect(this.hasMany.associationAccessor).to.equal('AmPosts');
        expect(this.belongsToMany.associationAccessor).to.equal('AmTags');
      });

      it('defaults to the singular model name for a to-one association', function () {
        expect(this.belongsTo.associationAccessor).to.equal('AmUser');
        expect(this.hasOne.associationAccessor).to.equal('AmProfile');
      });

      it('is also the dataValues key an eagerly loaded association lands on', async function () {
        // This is the join between the metadata and the read path: `eager-load.js` reads
        // `instance.dataValues[accessor]` to find what has already been loaded.
        const user = await this.User.create({ name: 'owner' });
        await this.Post.create({ title: 'a', am_user_id: user.id });

        const loaded = await this.User.findOne({ where: { id: user.id }, include: [this.Post] });

        expect(loaded.dataValues[this.hasMany.associationAccessor]).to.be.an('array');
        expect(loaded.dataValues[this.hasMany.associationAccessor][0].get('title')).to.equal('a');
      });
    });

    describe('foreignKey and otherKey', () => {
      it('derives an underscored foreign key from the source model', function () {
        expect(this.hasMany.foreignKey).to.equal('am_user_id');
        expect(this.belongsTo.foreignKey).to.equal('am_user_id');
        expect(this.hasOne.foreignKey).to.equal('am_user_id');
      });

      it('honours an explicit foreign key', function () {
        expect(this.aliased.foreignKey).to.equal('author_id');
      });

      it('exposes both sides of a belongsToMany', function () {
        expect(this.belongsToMany.foreignKey).to.equal('am_post_id');
        expect(this.belongsToMany.otherKey).to.equal('am_tag_id');
      });

      it('leaves otherKey undefined on every other association type', function () {
        // `eager-load.js` reaches for `otherKey` only inside its BelongsToMany branch; its presence
        // is what distinguishes a join-table hop from a direct foreign key.
        expect(this.hasMany.otherKey).to.be.undefined;
        expect(this.belongsTo.otherKey).to.be.undefined;
        expect(this.hasOne.otherKey).to.be.undefined;
      });
    });

    describe('through', () => {
      it('is present only on a belongsToMany', function () {
        expect(this.belongsToMany.through).to.be.an('object');
        expect(this.hasMany.through).to.be.undefined;
      });

      it('carries the join model, which the consumer queries directly', function () {
        // `eager-load.js:450` pulls `association.through.model` out to build its own join query
        // against the through table.
        expect(this.belongsToMany.through.model).to.equal(this.sequelize.models.AmPostTag);
        expect(this.belongsToMany.through.model.getTableName()).to.be.a('string');
      });

      it('carries a through scope when one is declared', function () {
        const Left = this.sequelize.define('AmLeft', { n: DataTypes.INTEGER });
        const Right = this.sequelize.define('AmRight', { n: DataTypes.INTEGER });
        const association = Left.belongsToMany(Right, {
          through: { model: 'AmLeftRight', scope: { active: true } }
        });

        expect(association.through.scope).to.deep.equal({ active: true });
      });
    });

    describe('scope', () => {
      it('is undefined when the association is unscoped', function () {
        expect(this.hasMany.scope).to.be.undefined;
      });

      it('is exposed so it can be merged into a hand-built where clause', function () {
        // `eager-load.js:96` does `Object.assign({}, association.scope, relationship.where)`.
        const association = this.User.hasMany(this.Post, { as: 'drafts', scope: { title: 'draft' } });

        expect(association.scope).to.deep.equal({ title: 'draft' });
      });
    });

    describe('source and target', () => {
      it('point at the model objects on both ends', function () {
        expect(this.hasMany.source).to.equal(this.User);
        expect(this.hasMany.target).to.equal(this.Post);
        expect(this.belongsTo.source).to.equal(this.Post);
        expect(this.belongsTo.target).to.equal(this.User);
      });

      it('exposes the metadata the consumer reads off the target', function () {
        expect(this.hasMany.target.name).to.equal('AmPost');
        expect(this.hasMany.target.tableName).to.be.a('string');
        expect(this.hasMany.target.options).to.be.an('object');
      });
    });

    describe('primaryKeyAttribute', () => {
      it('is the attribute name, not the column', function () {
        expect(this.User.primaryKeyAttribute).to.equal('id');
      });

      it('is what instance.get() keys off after a raw hydration', async function () {
        // `eager-load.js:259` builds its id index with `row.get(targetModel.primaryKeyAttribute)`.
        const user = await this.User.create({ name: 'owner' });

        expect(user.get(this.User.primaryKeyAttribute)).to.equal(user.id);
      });

      it('follows an explicitly declared primary key', function () {
        const Model = this.sequelize.define('AmCustomPk', {
          code: { type: DataTypes.STRING, primaryKey: true }
        });

        expect(Model.primaryKeyAttribute).to.equal('code');
      });
    });

    describe('Model.scoped', () => {
      // `eager-load.js:92` picks between the relationship's model and `association.target` with
      // `relationship.model.scoped ? … : …`, so the flag has to stay falsy on a base model.
      it('is falsy on a model as defined', function () {
        expect(this.User.scoped).to.not.be.ok;
      });

      it('is true on the result of .scope()', function () {
        expect(this.User.scope(null).scoped).to.equal(true);
      });

      it('leaves the scoped model otherwise interchangeable with its base', function () {
        const Scoped = this.User.scope(null);

        expect(Scoped.name).to.equal(this.User.name);
        expect(Scoped.primaryKeyAttribute).to.equal(this.User.primaryKeyAttribute);
        expect(Scoped.getTableName()).to.equal(this.User.getTableName());
      });

      it('is true for a model carrying a default scope only once .scope() is called', function () {
        const Scoped = this.sequelize.define(
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
