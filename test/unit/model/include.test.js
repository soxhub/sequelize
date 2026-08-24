import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import Sequelize from '../../../index.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('all', () => {
    const Referral = current.define('referal');

    Referral.belongsTo(Referral);

    it('can expand nested self-reference', () => {
      const options = { include: [{ all: true, nested: true }] };

      current.Model._expandIncludeAll.call(Referral, options);

      expect(options.include).to.deep.equal([{ model: Referral }]);
    });
  });

  describe('_validateIncludedElements', () => {
    let User, Task, Company;

    beforeEach(() => {
      User = current.define('User');
      Task = current.define('Task', {
        title: Sequelize.STRING
      });
      Company = current.define('Company', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          field: 'field_id'
        },
        name: Sequelize.STRING
      });

      User.Tasks = User.hasMany(Task);
      User.Company = User.belongsTo(Company);
      Company.Employees = Company.hasMany(User);
      Company.Owner = Company.belongsTo(User, { as: 'Owner', foreignKey: 'ownerId' });
    });

    describe('attributes', () => {
      it("should not inject the aliased PK again, if it's already there", () => {
        let options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [
            {
              model: Company,
              attributes: ['name']
            }
          ]
        });

        expect(options.include[0].attributes).to.deep.equal([['field_id', 'id'], 'name']);

        options = Sequelize.Model._validateIncludedElements(options);

        // Calling validate again shouldn't add the pk again
        expect(options.include[0].attributes).to.deep.equal([['field_id', 'id'], 'name']);
      });

      describe('include / exclude', () => {
        it('allows me to include additional attributes', () => {
          const options = Sequelize.Model._validateIncludedElements({
            model: User,
            include: [
              {
                model: Company,
                attributes: {
                  include: ['foobar']
                }
              }
            ]
          });

          expect(options.include[0].attributes).to.deep.equal([
            ['field_id', 'id'],
            'name',
            'createdAt',
            'updatedAt',
            'ownerId',
            'foobar'
          ]);
        });

        it('allows me to exclude attributes', () => {
          const options = Sequelize.Model._validateIncludedElements({
            model: User,
            include: [
              {
                model: Company,
                attributes: {
                  exclude: ['name']
                }
              }
            ]
          });

          expect(options.include[0].attributes).to.deep.equal([
            ['field_id', 'id'],
            'createdAt',
            'updatedAt',
            'ownerId'
          ]);
        });

        it('include takes precendence over exclude', () => {
          const options = Sequelize.Model._validateIncludedElements({
            model: User,
            include: [
              {
                model: Company,
                attributes: {
                  exclude: ['name'],
                  include: ['name']
                }
              }
            ]
          });

          expect(options.include[0].attributes).to.deep.equal([
            ['field_id', 'id'],
            'createdAt',
            'updatedAt',
            'ownerId',
            'name'
          ]);
        });
      });
    });

    describe('scope', () => {
      let Project;

      beforeEach(() => {
        Project = current.define(
          'project',
          {
            bar: {
              type: Sequelize.STRING,
              field: 'foo'
            }
          },
          {
            defaultScope: {
              where: {
                active: true
              }
            },
            scopes: {
              this: {
                where: { this: true }
              },
              that: {
                where: { that: false },
                limit: 12
              },
              attr: {
                attributes: ['baz']
              },
              foobar: {
                where: {
                  bar: 42
                }
              }
            }
          }
        );

        User.hasMany(Project);

        User.hasMany(Project.scope('this'), { as: 'thisProject' });
      });

      it('adds the default scope to where', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ model: Project }]
        });

        expect(options.include[0]).to.have.property('where').which.deep.equals({ active: true });
      });

      it('adds the where from a scoped model', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ model: Project.scope('that') }]
        });

        expect(options.include[0]).to.have.property('where').which.deep.equals({ that: false });
        expect(options.include[0]).to.have.property('limit').which.equals(12);
      });

      it('adds the attributes from a scoped model', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ model: Project.scope('attr') }]
        });

        expect(options.include[0]).to.have.property('attributes').which.deep.equals(['baz']);
      });

      it('merges where with the where from a scoped model', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ where: { active: false }, model: Project.scope('that') }]
        });

        expect(options.include[0]).to.have.property('where').which.deep.equals({ active: false, that: false });
      });

      it('add the where from a scoped associated model', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ model: Project, as: 'thisProject' }]
        });

        expect(options.include[0]).to.have.property('where').which.deep.equals({ this: true });
      });

      it('handles a scope with an aliased column (.field)', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ model: Project.scope('foobar') }]
        });

        expect(options.include[0]).to.have.property('where').which.deep.equals({ foo: 42 });
      });
    });

    describe('duplicating', () => {
      it('should tag a hasMany association as duplicating: true if undefined', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [User.Tasks]
        });

        expect(options.include[0].duplicating).to.equal(true);
      });

      it('should respect include.duplicating for a hasMany', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks, duplicating: false }]
        });

        expect(options.include[0].duplicating).to.equal(false);
      });
    });

    describe('_conformInclude: string alias', () => {
      it('should expand association from string alias', () => {
        const options = {
          include: ['Owner']
        };
        Sequelize.Model._conformOptions(options, Company);

        expect(options.include[0]).to.deep.equal({
          model: User,
          association: Company.Owner,
          as: 'Owner'
        });
      });

      it('should expand string association', () => {
        const options = {
          include: [
            {
              association: 'Owner',
              attributes: ['id']
            }
          ]
        };
        Sequelize.Model._conformOptions(options, Company);

        expect(options.include[0]).to.deep.equal({
          model: User,
          association: Company.Owner,
          attributes: ['id'],
          as: 'Owner'
        });
      });
    });

    describe('_getIncludedAssociation', () => {
      it('returns an association when there is a single unaliased association', () => {
        expect(User._getIncludedAssociation(Task)).to.equal(User.Tasks);
      });

      it('returns an association when there is a single aliased association', () => {
        const AliasUser = current.define('User');
        const AliasTask = current.define('Task');
        const Tasks = AliasTask.belongsTo(AliasUser, { as: 'owner' });
        expect(AliasTask._getIncludedAssociation(AliasUser, 'owner')).to.equal(Tasks);
      });

      it('returns an association when there are multiple aliased associations', () => {
        expect(Company._getIncludedAssociation(User, 'Owner')).to.equal(Company.Owner);
      });
    });

    describe('subQuery', () => {
      it('should be true if theres a duplicating association', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks }],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
      });

      it('should be false if theres a duplicating association but no limit', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks }],
          limit: null
        });

        expect(options.subQuery).to.equal(false);
      });

      it('should be true if theres a nested duplicating association', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Company, include: [Company.Employees] }],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
      });

      it('should be false if theres a nested duplicating association but no limit', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Company, include: [Company.Employees] }],
          limit: null
        });

        expect(options.subQuery).to.equal(false);
      });

      it('should tag a required hasMany association', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks, required: true }],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
        expect(options.include[0].subQuery).to.equal(false);
        expect(options.include[0].subQueryFilter).to.equal(true);
      });

      it('should not tag a required hasMany association with duplicating false', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks, required: true, duplicating: false }],
          limit: 3
        });

        expect(options.subQuery).to.equal(false);
        expect(options.include[0].subQuery).to.equal(false);
        expect(options.include[0].subQueryFilter).to.equal(false);
      });

      it('should tag a hasMany association with where', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks, where: { title: Math.random().toString() } }],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
        expect(options.include[0].subQuery).to.equal(false);
        expect(options.include[0].subQueryFilter).to.equal(true);
      });

      it('should not tag a hasMany association with where and duplicating false', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Tasks, where: { title: Math.random().toString() }, duplicating: false }],
          limit: 3
        });

        expect(options.subQuery).to.equal(false);
        expect(options.include[0].subQuery).to.equal(false);
        expect(options.include[0].subQueryFilter).to.equal(false);
      });

      it('should tag a required belongsTo alongside a duplicating association', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Company, required: true }, { association: User.Tasks }],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
        expect(options.include[0].subQuery).to.equal(true);
      });

      it('should not tag a required belongsTo alongside a duplicating association with duplicating false', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [
            { association: User.Company, required: true },
            { association: User.Tasks, duplicating: false }
          ],
          limit: 3
        });

        expect(options.subQuery).to.equal(false);
        expect(options.include[0].subQuery).to.equal(false);
      });

      it('should tag a belongsTo association with where alongside a duplicating association', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [
            { association: User.Company, where: { name: Math.random().toString() } },
            { association: User.Tasks }
          ],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
        expect(options.include[0].subQuery).to.equal(true);
      });

      it('should tag a required belongsTo association alongside a duplicating association with a nested belongsTo', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [{ association: User.Company, required: true, include: [Company.Owner] }, User.Tasks],
          limit: 3
        });

        expect(options.subQuery).to.equal(true);
        expect(options.include[0].subQuery).to.equal(true);
        expect(options.include[0].include[0].subQuery).to.equal(false);
        expect(options.include[0].include[0].parent.subQuery).to.equal(true);
      });

      it('should tag a belongsTo association with where alongside a duplicating association with duplicating false', () => {
        const options = Sequelize.Model._validateIncludedElements({
          model: User,
          include: [
            { association: User.Company, where: { name: Math.random().toString() } },
            { association: User.Tasks, duplicating: false }
          ],
          limit: 3
        });

        expect(options.subQuery).to.equal(false);
        expect(options.include[0].subQuery).to.equal(false);
      });
    });
  });
});
