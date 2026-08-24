import { expect } from 'chai';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('findAndCount', () => {
      beforeEach(async function () {
        this.ScopeMe = this.sequelize.define(
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

        await this.sequelize.sync({ force: true });

        await this.ScopeMe.bulkCreate([
          { username: 'tony', email: 'tony@sequelizejs.com', access_level: 3, other_value: 7 },
          { username: 'tobi', email: 'tobi@fakeemail.com', access_level: 10, other_value: 11 },
          { username: 'dan', email: 'dan@sequelizejs.com', access_level: 5, other_value: 10 },
          { username: 'fred', email: 'fred@foobar.com', access_level: 3, other_value: 7 }
        ]);
      });

      it('should apply defaultScope', async function () {
        const result = await this.ScopeMe.findAndCount();
        expect(result.count).to.equal(2);
        expect(result.rows.length).to.equal(2);
      });

      it('should be able to override default scope', async function () {
        const result = await this.ScopeMe.findAndCount({ where: { access_level: { gt: 5 } } });
        expect(result.count).to.equal(1);
        expect(result.rows.length).to.equal(1);
      });

      it('should be able to unscope', async function () {
        const result = await this.ScopeMe.unscoped().findAndCount({ limit: 1 });
        expect(result.count).to.equal(4);
        expect(result.rows.length).to.equal(1);
      });

      it('should be able to apply other scopes', async function () {
        const result = await this.ScopeMe.scope('lowAccess').findAndCount();
        expect(result.count).to.equal(3);
      });

      it('should be able to merge scopes with where', async function () {
        const result = await this.ScopeMe.scope('lowAccess').findAndCount({ where: { username: 'dan' } });
        expect(result.count).to.equal(1);
      });

      it('should ignore the order option if it is found within the scope', async function () {
        const result = await this.ScopeMe.scope('withOrder').findAndCount();
        expect(result.count).to.equal(4);
      });
    });
  });
});
