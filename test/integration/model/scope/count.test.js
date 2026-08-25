import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('count', () => {
      let Child, ScopeMe;

      beforeEach(async () => {
        Child = current.define('Child', {
          priority: Sequelize.INTEGER
        });
        ScopeMe = current.define(
          'ScopeMe',
          {
            username: Sequelize.STRING,
            email: Sequelize.STRING,
            aliasValue: {
              field: 'alias_value',
              type: Sequelize.INTEGER
            },
            access_level: Sequelize.INTEGER,
            other_value: Sequelize.INTEGER
          },
          {
            defaultScope: {
              where: {
                access_level: {
                  gte: 5
                }
              },
              attributes: ['id', 'username', 'email', 'access_level']
            },
            scopes: {
              lowAccess: {
                where: {
                  access_level: {
                    lte: 5
                  }
                }
              },
              withOrder: {
                order: ['username']
              },
              withInclude: {
                include: [
                  {
                    model: Child,
                    where: {
                      priority: 1
                    }
                  }
                ]
              },
              withIncludeFunction: () => {
                return {
                  include: [
                    {
                      model: Child,
                      where: {
                        priority: 1
                      }
                    }
                  ]
                };
              },
              withIncludeFunctionAndStringAssociation: () => {
                return {
                  include: [
                    {
                      association: 'Children',
                      where: {
                        priority: 1
                      }
                    }
                  ]
                };
              },
              withAliasedField: {
                where: {
                  aliasValue: { [Sequelize.Op.ne]: 1 }
                }
              }
            }
          }
        );
        Child.belongsTo(ScopeMe);
        ScopeMe.hasMany(Child);

        await current.sync({ force: true });

        await ScopeMe.bulkCreate([
          { username: 'tony', email: 'tony@sequelizejs.com', access_level: 3, other_value: 7, aliasValue: 12 },
          { username: 'tobi', email: 'tobi@fakeemail.com', access_level: 10, other_value: 11, aliasValue: 5 },
          { username: 'dan', email: 'dan@sequelizejs.com', access_level: 5, other_value: 10, aliasValue: 1 },
          { username: 'fred', email: 'fred@foobar.com', access_level: 3, other_value: 7, aliasValue: 10 }
        ]);

        const records = await ScopeMe.findAll();
        await Promise.all([
          records[0].createChild({
            priority: 1
          }),
          records[1].createChild({
            priority: 2
          })
        ]);
      });

      it('should apply defaultScope', () => {
        return expect(ScopeMe.count()).to.eventually.equal(2);
      });

      it('should be able to override default scope', () => {
        return expect(ScopeMe.count({ where: { access_level: { gt: 5 } } })).to.eventually.equal(1);
      });

      it('should be able to unscope', () => {
        return expect(ScopeMe.unscoped().count()).to.eventually.equal(4);
      });

      it('should be able to apply other scopes', () => {
        return expect(ScopeMe.scope('lowAccess').count()).to.eventually.equal(3);
      });

      it('should be able to merge scopes with where', () => {
        return expect(ScopeMe.scope('lowAccess').count({ where: { username: 'dan' } })).to.eventually.equal(1);
      });

      it('should be able to merge scopes with where on aliased fields', () => {
        return expect(ScopeMe.scope('withAliasedField').count({ where: { aliasValue: 5 } })).to.eventually.equal(1);
      });

      it('should ignore the order option if it is found within the scope', () => {
        return expect(ScopeMe.scope('withOrder').count()).to.eventually.equal(4);
      });

      it('should be able to use where on include', () => {
        return expect(ScopeMe.scope('withInclude').count()).to.eventually.equal(1);
      });

      it('should be able to use include with function scope', () => {
        return expect(ScopeMe.scope('withIncludeFunction').count()).to.eventually.equal(1);
      });

      it('should be able to use include with function scope and string association', () => {
        return expect(ScopeMe.scope('withIncludeFunctionAndStringAssociation').count()).to.eventually.equal(1);
      });
    });
  });
});
