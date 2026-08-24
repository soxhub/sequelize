import { expect } from 'chai';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scopes', () => {
    beforeEach(async function () {
      this.ScopeMe = this.sequelize.define(
        'ScopeMe',
        {
          username: Sequelize.STRING,
          email: Sequelize.STRING,
          access_level: Sequelize.INTEGER,
          other_value: Sequelize.INTEGER,
          parent_id: Sequelize.INTEGER
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
            highValue: {
              where: {
                other_value: {
                  gte: 10
                }
              }
            },
            andScope: {
              where: {
                $and: [
                  {
                    email: {
                      like: '%@sequelizejs.com'
                    }
                  },
                  { access_level: 3 }
                ]
              }
            }
          }
        }
      );

      await this.sequelize.sync({ force: true });

      await this.ScopeMe.bulkCreate([
        { username: 'tony', email: 'tony@sequelizejs.com', access_level: 3, other_value: 7, parent_id: 1 },
        { username: 'tobi', email: 'tobi@fakeemail.com', access_level: 10, other_value: 11, parent_id: 2 },
        { username: 'dan', email: 'dan@sequelizejs.com', access_level: 5, other_value: 10, parent_id: 1 },
        { username: 'fred', email: 'fred@foobar.com', access_level: 3, other_value: 7, parent_id: 1 }
      ]);
    });

    it('should be able use where in scope', async function () {
      const users = await this.ScopeMe.scope({ where: { parent_id: 2 } }).findAll();

      expect(users).to.have.length(1);
      expect(users[0].username).to.equal('tobi');
    });

    it('should be able to combine scope and findAll where clauses', async function () {
      const users = await this.ScopeMe.scope({ where: { parent_id: 1 } }).findAll({ where: { access_level: 3 } });

      expect(users).to.have.length(2);
      expect(['tony', 'fred'].indexOf(users[0].username) !== -1).to.be.true;
      expect(['tony', 'fred'].indexOf(users[1].username) !== -1).to.be.true;
    });

    it('should be able to use a defaultScope if declared', async function () {
      const users = await this.ScopeMe.all();

      expect(users).to.have.length(2);
      expect([10, 5].indexOf(users[0].access_level) !== -1).to.be.true;
      expect([10, 5].indexOf(users[1].access_level) !== -1).to.be.true;
      expect(['dan', 'tobi'].indexOf(users[0].username) !== -1).to.be.true;
      expect(['dan', 'tobi'].indexOf(users[1].username) !== -1).to.be.true;
    });

    it('should be able to handle $and in scopes', async function () {
      const users = await this.ScopeMe.scope('andScope').findAll();

      expect(users).to.have.length(1);
      expect(users[0].username).to.equal('tony');
    });

    describe('should not overwrite', () => {
      it('default scope with values from previous finds', async function () {
        const filtered = await this.ScopeMe.findAll({ where: { other_value: 10 } });
        expect(filtered).to.have.length(1);

        const users = await this.ScopeMe.findAll();
        // This should not have other_value: 10
        expect(users).to.have.length(2);
      });

      it('other scopes with values from previous finds', async function () {
        const filtered = await this.ScopeMe.scope('highValue').findAll({ where: { access_level: 10 } });
        expect(filtered).to.have.length(1);

        const users = await this.ScopeMe.scope('highValue').findAll();
        // This should not have other_value: 10
        expect(users).to.have.length(2);
      });
    });

    it('should have no problem performing findOrCreate', async function () {
      const [user] = await this.ScopeMe.findOrCreate({ where: { username: 'fake' } });
      expect(user.username).to.equal('fake');
    });
  });
});
