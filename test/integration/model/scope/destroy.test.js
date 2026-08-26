import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('destroy', () => {
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
              }
            },
            scopes: {
              lowAccess: {
                where: {
                  access_level: {
                    lte: 5
                  }
                }
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
        await ScopeMe.destroy({ where: {} });

        const users = await ScopeMe.unscoped().findAll();
        expect(users).to.have.length(2);
        expect(users[0].get('username')).to.equal('tony');
        expect(users[1].get('username')).to.equal('fred');
      });

      it('should be able to override default scope', async () => {
        await ScopeMe.destroy({ where: { access_level: { lt: 5 } } });

        const users = await ScopeMe.unscoped().findAll();
        expect(users).to.have.length(2);
        expect(users[0].get('username')).to.equal('tobi');
        expect(users[1].get('username')).to.equal('dan');
      });

      it('should be able to unscope destroy', async () => {
        await ScopeMe.unscoped().destroy({ where: {} });

        await expect(ScopeMe.unscoped().findAll()).resolves.to.have.length(0);
      });

      it('should be able to apply other scopes', async () => {
        await ScopeMe.scope('lowAccess').destroy({ where: {} });

        const users = await ScopeMe.unscoped().findAll();
        expect(users).to.have.length(1);
        expect(users[0].get('username')).to.equal('tobi');
      });

      it('should be able to merge scopes with where', async () => {
        await ScopeMe.scope('lowAccess').destroy({ where: { username: 'dan' } });

        const users = await ScopeMe.unscoped().findAll();
        expect(users).to.have.length(3);
        expect(users[0].get('username')).to.equal('tony');
        expect(users[1].get('username')).to.equal('tobi');
        expect(users[2].get('username')).to.equal('fred');
      });

      it('should work with empty where', async () => {
        await ScopeMe.scope('lowAccess').destroy();

        const users = await ScopeMe.unscoped().findAll();
        expect(users).to.have.length(1);
        expect(users[0].get('username')).to.equal('tobi');
      });
    });
  });
});
