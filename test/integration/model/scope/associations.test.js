import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../../../index.js';
import Support from '../../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('scope', () => {
    describe('associations', () => {
      let ScopeMe, Project, Company, Profile, UserAssociation;

      beforeEach(async () => {
        const sequelize = current;

        ScopeMe = current.define(
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
              isTony: {
                where: {
                  username: 'tony'
                }
              },
              includeActiveProjects() {
                return {
                  include: [
                    {
                      model: sequelize.models.company,
                      include: [sequelize.models.project.scope('active')]
                    }
                  ]
                };
              }
            }
          }
        );

        Project = current.define(
          'project',
          {
            active: Sequelize.BOOLEAN
          },
          {
            scopes: {
              active: {
                where: {
                  active: true
                }
              }
            }
          }
        );

        Company = current.define(
          'company',
          {
            active: Sequelize.BOOLEAN
          },
          {
            defaultScope: {
              where: { active: true }
            },
            scopes: {
              notActive: {
                where: {
                  active: false
                }
              },
              reversed: {
                order: [['id', 'DESC']]
              }
            }
          }
        );

        Profile = current.define(
          'profile',
          {
            active: Sequelize.BOOLEAN
          },
          {
            defaultScope: {
              where: { active: true }
            },
            scopes: {
              notActive: {
                where: {
                  active: false
                }
              }
            }
          }
        );

        Project.belongsToMany(Company, { through: 'CompanyProjects' });
        Company.belongsToMany(Project, { through: 'CompanyProjects' });

        ScopeMe.hasOne(Profile, { foreignKey: 'userId' });

        ScopeMe.belongsTo(Company);
        UserAssociation = Company.hasMany(ScopeMe, { as: 'users' });

        await current.sync({ force: true });

        const [u1, u2, u3, u4, u5, c1, c2] = await Promise.all([
          ScopeMe.create({
            id: 1,
            username: 'dan',
            email: 'dan@sequelizejs.com',
            access_level: 5,
            other_value: 10,
            parent_id: 1
          }),
          ScopeMe.create({
            id: 2,
            username: 'tobi',
            email: 'tobi@fakeemail.com',
            access_level: 10,
            other_value: 11,
            parent_id: 2
          }),
          ScopeMe.create({
            id: 3,
            username: 'tony',
            email: 'tony@sequelizejs.com',
            access_level: 3,
            other_value: 7,
            parent_id: 1
          }),
          ScopeMe.create({
            id: 4,
            username: 'fred',
            email: 'fred@foobar.com',
            access_level: 3,
            other_value: 7,
            parent_id: 1
          }),
          ScopeMe.create({
            id: 5,
            username: 'bob',
            email: 'bob@foobar.com',
            access_level: 1,
            other_value: 9,
            parent_id: 5
          }),
          Company.create({ id: 1, active: true }),
          Company.create({ id: 2, active: false })
        ]);

        await Promise.all([c1.setUsers([u1, u2, u3, u4]), c2.setUsers([u5])]);
      });

      describe('include', () => {
        it('should scope columns properly', () => {
          // Will error with ambigous column if id is not scoped properly to `Company`.`id`
          return expect(
            Company.findAll({
              where: { id: 1 },
              include: [UserAssociation]
            })
          ).resolves.toBeDefined();
        });

        it('should apply default scope when including an associations', async () => {
          const rows = await Company.findAll({
            include: [UserAssociation]
          });

          expect(rows[0].users).to.have.length(2);
        });

        it('should apply default scope when including a model', async () => {
          const rows = await Company.findAll({
            include: [{ model: ScopeMe, as: 'users' }]
          });

          expect(rows[0].users).to.have.length(2);
        });

        it('should be able to include a scoped model', async () => {
          const rows = await Company.findAll({
            include: [{ model: ScopeMe.scope('isTony'), as: 'users' }]
          });

          expect(rows[0].users).to.have.length(1);
          expect(rows[0].users[0].get('username')).to.equal('tony');
        });
      });

      describe('get', () => {
        beforeEach(async () => {
          const [p, companies] = await Promise.all([Project.create(), Company.unscoped().findAll()]);
          await p.setCompanies(companies);
        });

        describe('it should be able to unscope', () => {
          it('hasMany', async () => {
            const company = await Company.findByPk(1);

            const users = await company.getUsers({ scope: false });
            expect(users).to.have.length(4);
          });

          it('hasOne', async () => {
            await Profile.create({
              active: false,
              userId: 1
            });

            const user = await ScopeMe.findByPk(1);

            const profile = await user.getProfile({ scope: false });
            expect(profile).to.be.ok;
          });

          it('belongsTo', async () => {
            const user = await ScopeMe.unscoped().findOne({ where: { username: 'bob' } });

            const company = await user.getCompany({ scope: false });
            expect(company).to.be.ok;
          });

          it('belongsToMany', async () => {
            const rows = await Project.findAll();

            const companies = await rows[0].getCompanies({ scope: false });
            expect(companies).to.have.length(2);
          });
        });

        describe('it should apply default scope', () => {
          it('hasMany', async () => {
            const company = await Company.findByPk(1);

            const users = await company.getUsers();
            expect(users).to.have.length(2);
          });

          it('hasOne', async () => {
            await Profile.create({
              active: false,
              userId: 1
            });

            const user = await ScopeMe.findByPk(1);

            const profile = await user.getProfile();
            expect(profile).not.to.be.ok;
          });

          it('belongsTo', async () => {
            const user = await ScopeMe.unscoped().findOne({ where: { username: 'bob' } });

            const company = await user.getCompany();
            expect(company).not.to.be.ok;
          });

          it('belongsToMany', async () => {
            const rows = await Project.findAll();

            const companies = await rows[0].getCompanies();
            expect(companies).to.have.length(1);
            expect(companies[0].get('active')).to.be.ok;
          });
        });

        describe('it should be able to apply another scope', () => {
          it('hasMany', async () => {
            const company = await Company.findByPk(1);

            const users = await company.getUsers({ scope: 'isTony' });
            expect(users).to.have.length(1);
            expect(users[0].get('username')).to.equal('tony');
          });

          it('hasOne', async () => {
            await Profile.create({
              active: true,
              userId: 1
            });

            const user = await ScopeMe.findByPk(1);

            const profile = await user.getProfile({ scope: 'notActive' });
            expect(profile).not.to.be.ok;
          });

          it('belongsTo', async () => {
            const user = await ScopeMe.unscoped().findOne({ where: { username: 'bob' } });

            const company = await user.getCompany({ scope: 'notActive' });
            expect(company).to.be.ok;
          });

          it('belongsToMany', async () => {
            const rows = await Project.findAll();

            const companies = await rows[0].getCompanies({ scope: 'reversed' });
            expect(companies).to.have.length(2);
            expect(companies[0].id).to.equal(2);
            expect(companies[1].id).to.equal(1);
          });
        });
      });

      describe('scope with includes', () => {
        beforeEach(async () => {
          const [c, p1, p2] = await Promise.all([
            Company.findByPk(1),
            Project.create({ id: 1, active: true }),
            Project.create({ id: 2, active: false })
          ]);

          await c.setProjects([p1, p2]);
        });

        it('should scope columns properly', () => {
          return expect(ScopeMe.scope('includeActiveProjects').findAll()).resolves.toBeDefined();
        });

        it('should apply scope conditions', async () => {
          const user = await ScopeMe.scope('includeActiveProjects').findOne({ where: { id: 1 } });
          expect(user.company.projects).to.have.length(1);
        });
      });
    });
  });
});
