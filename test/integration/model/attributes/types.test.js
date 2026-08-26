import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('attributes', () => {
    describe('types', () => {
      describe('VIRTUAL', () => {
        let User, Task, Project, sqlAssert;

        beforeEach(() => {
          User = current.define(
            'user',
            {
              storage: Sequelize.STRING,
              field1: {
                type: Sequelize.VIRTUAL,
                set(val) {
                  this.setDataValue('storage', val);
                  this.setDataValue('field1', val);
                },
                get() {
                  return this.getDataValue('field1');
                }
              },
              field2: {
                type: Sequelize.VIRTUAL,
                get() {
                  return 42;
                }
              },
              virtualWithDefault: {
                type: Sequelize.VIRTUAL,
                defaultValue: 'cake'
              }
            },
            { timestamps: false }
          );

          Task = current.define('task', {});
          Project = current.define('project', {});

          Task.belongsTo(User);
          Project.belongsToMany(User, { through: 'project_user' });
          User.belongsToMany(Project, { through: 'project_user' });

          sqlAssert = (sql) => {
            expect(sql.indexOf('field1')).to.equal(-1);
            expect(sql.indexOf('field2')).to.equal(-1);
          };

          return current.sync({ force: true });
        });

        it('should not be ignored in dataValues get', () => {
          const user = User.build({
            field1: 'field1_value',
            field2: 'field2_value'
          });

          expect(user.get()).to.deep.equal({
            storage: 'field1_value',
            field1: 'field1_value',
            virtualWithDefault: 'cake',
            field2: 42,
            id: null
          });
        });

        it('should be ignored in table creation', async () => {
          const fields = await current.getQueryInterface().describeTable(User.tableName);
          expect(Object.keys(fields).length).to.equal(2);
        });

        it('should be ignored in find, findAll and includes', () => {
          return Promise.all([
            User.findOne({
              logging: sqlAssert
            }),
            User.findAll({
              logging: sqlAssert
            }),
            Task.findAll({
              include: [User],
              logging: sqlAssert
            }),
            Project.findAll({
              include: [User],
              logging: sqlAssert
            })
          ]);
        });

        it('should allow me to store selected values', async () => {
          const Post = current.define('Post', {
            text: Sequelize.TEXT,
            someBoolean: {
              type: Sequelize.VIRTUAL
            }
          });

          await current.sync({ force: true });
          await Post.bulkCreate([{ text: 'text1' }, { text: 'text2' }]);

          const boolQuery = 'EXISTS(SELECT 1) AS "someBoolean"';
          const post = await Post.findOne({ attributes: ['id', 'text', Sequelize.literal(boolQuery)] });

          expect(post.get('someBoolean')).to.be.ok;
          expect(post.get().someBoolean).to.be.ok;
        });

        it('should be ignored in create and updateAttributes', async () => {
          const created = await User.create({
            field1: 'something'
          });

          // We already verified that the virtual is not added to the table definition, so if this succeeds, were good

          expect(created.virtualWithDefault).to.equal('cake');
          expect(created.storage).to.equal('something');

          const updated = await created.update(
            {
              field1: 'something else'
            },
            {
              fields: ['storage']
            }
          );

          expect(updated.virtualWithDefault).to.equal('cake');
          expect(updated.storage).to.equal('something else');
        });

        it('should be ignored in bulkCreate and and bulkUpdate', async () => {
          await User.bulkCreate(
            [
              {
                field1: 'something'
              }
            ],
            {
              logging: sqlAssert
            }
          );

          const users = await User.findAll();
          expect(users[0].storage).to.equal('something');
        });
      });
    });
  });
});
