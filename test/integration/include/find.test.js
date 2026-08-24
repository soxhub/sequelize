import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import Sequelize from '../../../index.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Include'), () => {
  describe('find', () => {
    it('should include a non required model, with conditions and two includes N:M 1:M', async () => {
      const A = current.define('A', { name: DataTypes.STRING(40) }, { paranoid: true }),
        B = current.define('B', { name: DataTypes.STRING(40) }, { paranoid: true }),
        C = current.define('C', { name: DataTypes.STRING(40) }, { paranoid: true }),
        D = current.define('D', { name: DataTypes.STRING(40) }, { paranoid: true });

      // Associations
      A.hasMany(B);

      B.belongsTo(D);
      B.belongsToMany(C, {
        through: 'BC'
      });

      C.belongsToMany(B, {
        through: 'BC'
      });

      D.hasMany(B);

      await current.sync({ force: true });

      await A.findOne({
        include: [{ model: B, required: false, include: [{ model: C, required: false }, { model: D }] }]
      });
    });

    it('should work with a 1:M to M:1 relation with a where on the last include', async () => {
      const Model = current.define('Model', {});
      const Model2 = current.define('Model2', {});
      const Model4 = current.define('Model4', { something: { type: DataTypes.INTEGER } });

      Model.belongsTo(Model2);
      Model2.hasMany(Model);

      Model2.hasMany(Model4);
      Model4.belongsTo(Model2);

      await current.sync({ force: true });

      await Model.findOne({
        include: [{ model: Model2, include: [{ model: Model4, where: { something: 2 } }] }]
      });
    });

    it('should include a model with a where condition but no required', async () => {
      const User = current.define('User', {}, { paranoid: false }),
        Task = current.define(
          'Task',
          {
            deletedAt: {
              type: DataTypes.DATE
            }
          },
          { paranoid: false }
        );

      User.hasMany(Task, { foreignKey: 'userId' });
      Task.belongsTo(User, { foreignKey: 'userId' });

      await current.sync({
        force: true
      });

      const created = await User.create();

      await Task.bulkCreate([
        { userId: created.get('id'), deletedAt: new Date() },
        { userId: created.get('id'), deletedAt: new Date() },
        { userId: created.get('id'), deletedAt: new Date() }
      ]);

      const user = await User.findOne({
        include: [{ model: Task, where: { deletedAt: null }, required: false }]
      });

      expect(user).to.be.ok;
      expect(user.Tasks.length).to.equal(0);
    });

    it('should include a model with a where clause when the PK field name and attribute name are different', async () => {
      const User = current.define('User', {
          id: {
            type: DataTypes.UUID,
            defaultValue: Sequelize.UUIDV4,
            field: 'main_id',
            primaryKey: true
          }
        }),
        Task = current.define('Task', {
          searchString: { type: DataTypes.STRING }
        });

      User.hasMany(Task, { foreignKey: 'userId' });
      Task.belongsTo(User, { foreignKey: 'userId' });

      await current.sync({
        force: true
      });

      const created = await User.create();

      await Task.bulkCreate([
        { userId: created.get('id'), searchString: 'one' },
        { userId: created.get('id'), searchString: 'two' }
      ]);

      const user = await User.findOne({
        include: [{ model: Task, where: { searchString: 'one' } }]
      });

      expect(user).to.be.ok;
      expect(user.Tasks.length).to.equal(1);
    });

    it('should include a model with a through.where and required true clause when the PK field name and attribute name are different', async () => {
      const A = current.define('a', {}),
        B = current.define('b', {}),
        AB = current.define('a_b', {
          name: {
            type: DataTypes.STRING(40),
            field: 'name_id',
            primaryKey: true
          }
        });

      A.belongsToMany(B, { through: AB });
      B.belongsToMany(A, { through: AB });

      await current.sync({ force: true });

      const [created, b] = await Promise.all([A.create({}), B.create({})]);
      await created.addB(b, { through: { name: 'Foobar' } });

      const a = await A.findOne({
        include: [{ model: B, through: { where: { name: 'Foobar' } }, required: true }]
      });

      expect(a).to.not.equal(null);
      expect(a.get('bs')).to.have.length(1);
    });

    it('should still pull the main record when an included model is not required and has where restrictions without matches', async () => {
      const A = current.define('a', {
          name: DataTypes.STRING(40)
        }),
        B = current.define('b', {
          name: DataTypes.STRING(40)
        });

      A.belongsToMany(B, { through: 'a_b' });
      B.belongsToMany(A, { through: 'a_b' });

      await current.sync({ force: true });

      await A.create({
        name: 'Foobar'
      });

      const a = await A.findOne({
        where: { name: 'Foobar' },
        include: [{ model: B, where: { name: 'idontexist' }, required: false }]
      });

      expect(a).to.not.equal(null);
      expect(a.get('bs')).to.deep.equal([]);
    });

    it('should support a nested include (with a where)', async () => {
      const A = current.define('A', {
        name: DataTypes.STRING
      });

      const B = current.define('B', {
        flag: DataTypes.BOOLEAN
      });

      const C = current.define('C', {
        name: DataTypes.STRING
      });

      A.hasOne(B);
      B.belongsTo(A);

      B.hasMany(C);
      C.belongsTo(B);

      await current.sync({ force: true });

      const a = await A.findOne({
        include: [
          {
            model: B,
            where: { flag: true },
            include: [
              {
                model: C
              }
            ]
          }
        ]
      });

      expect(a).to.not.exist;
    });

    it('should support a belongsTo with the targetKey option', async () => {
      const User = current.define('User', { username: DataTypes.STRING }),
        Task = current.define('Task', { title: DataTypes.STRING });
      User.removeAttribute('id');
      Task.belongsTo(User, { foreignKey: 'user_name', targetKey: 'username' });

      await current.sync({ force: true });

      const newUser = await User.create({ username: 'bob' });
      const newTask = await Task.create({ title: 'some task' });
      await newTask.setUser(newUser);

      const foundTask = await Task.findOne({
        where: { title: 'some task' },
        include: [{ model: User }]
      });

      expect(foundTask).to.be.ok;
      expect(foundTask.User.username).to.equal('bob');
    });

    it('should support many levels of belongsTo (with a lower level having a where)', async () => {
      const A = current.define('a', {}),
        B = current.define('b', {}),
        C = current.define('c', {}),
        D = current.define('d', {}),
        E = current.define('e', {}),
        F = current.define('f', {}),
        G = current.define('g', {
          name: DataTypes.STRING
        }),
        H = current.define('h', {
          name: DataTypes.STRING
        });

      A.belongsTo(B);
      B.belongsTo(C);
      C.belongsTo(D);
      D.belongsTo(E);
      E.belongsTo(F);
      F.belongsTo(G);
      G.belongsTo(H);

      await current.sync({ force: true });

      const [a, b] = await Promise.all([
        A.create({}),
        (async (singles) => {
          let previousInstance, first;

          for (const model of singles) {
            const values = {};

            if (model.name === 'g') {
              values.name = 'yolo';
            }

            const instance = await model.create(values);

            if (previousInstance) {
              await previousInstance['set' + Sequelize.Utils.uppercaseFirst(model.name)](instance);
              previousInstance = instance;
            } else {
              previousInstance = first = instance;
            }
          }

          return first;
        })([B, C, D, E, F, G, H])
      ]);

      await a.setB(b);

      const found = await A.findOne({
        include: [
          {
            model: B,
            include: [
              {
                model: C,
                include: [
                  {
                    model: D,
                    include: [
                      {
                        model: E,
                        include: [
                          {
                            model: F,
                            include: [
                              {
                                model: G,
                                where: {
                                  name: 'yolo'
                                },
                                include: [{ model: H }]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      expect(found.b.c.d.e.f.g.h).to.be.ok;
    });

    it('should work with combinding a where and a scope', async () => {
      const User = current.define(
        'User',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          name: DataTypes.STRING
        },
        { underscored: true }
      );

      const Post = current.define(
        'Post',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, unique: true },
          owner_id: { type: DataTypes.INTEGER, unique: 'combiIndex' },
          owner_type: { type: DataTypes.ENUM, values: ['user', 'org'], defaultValue: 'user', unique: 'combiIndex' },
          private: { type: DataTypes.BOOLEAN, defaultValue: false }
        },
        { underscored: true }
      );

      User.hasMany(Post, {
        foreignKey: 'owner_id',
        scope: { owner_type: 'user' },
        as: 'UserPosts',
        constraints: false
      });
      Post.belongsTo(User, { foreignKey: 'owner_id', as: 'Owner', constraints: false });

      await current.sync({ force: true });

      await User.findOne({
        where: { id: 2 },
        include: [{ model: Post, as: 'UserPosts', where: { private: true } }]
      });
    });
  });
});
