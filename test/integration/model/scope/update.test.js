import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import _ from 'lodash';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('update', () => {
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
        await ScopeMe.update({ username: 'ruben' }, { where: {} });

        const users = await ScopeMe.unscoped().findAll({ where: { username: 'ruben' } });
        expect(users).to.have.length(2);
        expect(users[0].get('email')).to.equal('tobi@fakeemail.com');
        expect(users[1].get('email')).to.equal('dan@sequelizejs.com');
      });

      it('should be able to override default scope', async () => {
        await ScopeMe.update({ username: 'ruben' }, { where: { access_level: { lt: 5 } } });

        const users = await ScopeMe.unscoped().findAll({ where: { username: 'ruben' } });
        expect(users).to.have.length(2);
        expect(users[0].get('email')).to.equal('tony@sequelizejs.com');
        expect(users[1].get('email')).to.equal('fred@foobar.com');
      });

      it('should be able to unscope destroy', async () => {
        await ScopeMe.unscoped().update({ username: 'ruben' }, { where: {} });

        const rubens = await ScopeMe.unscoped().findAll();
        expect(
          _.every(rubens, (r) => {
            return r.get('username') === 'ruben';
          })
        ).to.be.true;
      });

      it('should be able to apply other scopes', async () => {
        await ScopeMe.scope('lowAccess').update({ username: 'ruben' }, { where: {} });

        const users = await ScopeMe.unscoped().findAll({ where: { username: { $ne: 'ruben' } } });
        expect(users).to.have.length(1);
        expect(users[0].get('email')).to.equal('tobi@fakeemail.com');
      });

      it('should be able to merge scopes with where', async () => {
        await ScopeMe.scope('lowAccess').update({ username: 'ruben' }, { where: { username: 'dan' } });

        const users = await ScopeMe.unscoped().findAll({ where: { username: 'ruben' } });
        expect(users).to.have.length(1);
        expect(users[0].get('email')).to.equal('dan@sequelizejs.com');
      });

      it('should work with empty where', async () => {
        await ScopeMe.scope('lowAccess').update({
          username: 'ruby'
        });

        const users = await ScopeMe.unscoped().findAll({ where: { username: 'ruby' } });
        expect(users).to.have.length(3);
        users.forEach((user) => {
          expect(user.get('username')).to.equal('ruby');
        });
      });
    });
  });
});
