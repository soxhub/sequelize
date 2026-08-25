import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('aggregate', () => {
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
            access_level: Sequelize.INTEGER,
            other_value: Sequelize.INTEGER
          },
          {
            defaultScope: {
              where: {
                access_level: {
                  gte: 5
                }
              }
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
              }
            }
          }
        );
        Child.belongsTo(ScopeMe);
        ScopeMe.hasMany(Child);

        await current.sync({ force: true });

        await ScopeMe.bulkCreate([
          { username: 'tony', email: 'tony@sequelizejs.com', access_level: 3, other_value: 7 },
          { username: 'tobi', email: 'tobi@fakeemail.com', access_level: 10, other_value: 11 },
          { username: 'dan', email: 'dan@sequelizejs.com', access_level: 5, other_value: 10 },
          { username: 'fred', email: 'fred@foobar.com', access_level: 3, other_value: 7 }
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
        return expect(ScopeMe.aggregate('*', 'count')).to.eventually.equal(2);
      });

      it('should be able to override default scope', () => {
        return expect(ScopeMe.aggregate('*', 'count', { where: { access_level: { gt: 5 } } })).to.eventually.equal(1);
      });

      it('should be able to unscope', () => {
        return expect(ScopeMe.unscoped().aggregate('*', 'count')).to.eventually.equal(4);
      });

      it('should be able to apply other scopes', () => {
        return expect(ScopeMe.scope('lowAccess').aggregate('*', 'count')).to.eventually.equal(3);
      });

      it('should be able to merge scopes with where', () => {
        return expect(
          ScopeMe.scope('lowAccess').aggregate('*', 'count', { where: { username: 'dan' } })
        ).to.eventually.equal(1);
      });

      it('should be able to use where on include', () => {
        return expect(
          ScopeMe.scope('withInclude').aggregate('ScopeMe.id', 'count', {
            plain: true,
            dataType: new Sequelize.INTEGER(),
            includeIgnoreAttributes: false,
            limit: null,
            offset: null,
            order: null,
            attributes: []
          })
        ).to.eventually.equal(1);
      });
    });
  });
});
