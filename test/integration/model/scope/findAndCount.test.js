import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('findAndCount', () => {
      let ScopeMe;

      beforeEach(async () => {
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
              },
              attributes: ['username', 'email', 'access_level']
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
              }
            }
          }
        );

        await current.sync({ force: true });

        await ScopeMe.bulkCreate([
          { username: 'tony', email: 'tony@sequelizejs.com', access_level: 3, other_value: 7 },
          { username: 'tobi', email: 'tobi@fakeemail.com', access_level: 10, other_value: 11 },
          { username: 'dan', email: 'dan@sequelizejs.com', access_level: 5, other_value: 10 },
          { username: 'fred', email: 'fred@foobar.com', access_level: 3, other_value: 7 }
        ]);
      });

      it('should apply defaultScope', async () => {
        const result = await ScopeMe.findAndCountAll();
        expect(result.count).to.equal(2);
        expect(result.rows.length).to.equal(2);
      });

      it('should be able to override default scope', async () => {
        const result = await ScopeMe.findAndCountAll({ where: { access_level: { gt: 5 } } });
        expect(result.count).to.equal(1);
        expect(result.rows.length).to.equal(1);
      });

      it('should be able to unscope', async () => {
        const result = await ScopeMe.unscoped().findAndCountAll({ limit: 1 });
        expect(result.count).to.equal(4);
        expect(result.rows.length).to.equal(1);
      });

      it('should be able to apply other scopes', async () => {
        const result = await ScopeMe.scope('lowAccess').findAndCountAll();
        expect(result.count).to.equal(3);
      });

      it('should be able to merge scopes with where', async () => {
        const result = await ScopeMe.scope('lowAccess').findAndCountAll({ where: { username: 'dan' } });
        expect(result.count).to.equal(1);
      });

      it('should ignore the order option if it is found within the scope', async () => {
        const result = await ScopeMe.scope('withOrder').findAndCountAll();
        expect(result.count).to.equal(4);
      });
    });
  });
});
