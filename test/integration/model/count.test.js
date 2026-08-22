import * as chai from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const expect = chai.expect;

describe(Support.getTestDialectTeaser('Model'), () => {
  beforeEach(function () {
    this.User = this.sequelize.define('User', {
      username: DataTypes.STRING,
      age: DataTypes.INTEGER
    });
    this.Project = this.sequelize.define('Project', {
      name: DataTypes.STRING
    });

    this.User.hasMany(this.Project);
    this.Project.belongsTo(this.User);

    return this.sequelize.sync({ force: true });
  });

  describe('count', () => {
    beforeEach(async function () {
      await this.User.bulkCreate([{ username: 'boo' }, { username: 'boo2' }]);

      const user = await this.User.findOne();
      await user.createProject({
        name: 'project1'
      });
    });

    it('should count rows', function () {
      return expect(this.User.count()).to.eventually.equal(2);
    });

    it('should support include', function () {
      return expect(
        this.User.count({
          include: [
            {
              model: this.Project,
              where: {
                name: 'project1'
              }
            }
          ]
        })
      ).to.eventually.equal(1);
    });

    it('should return attributes', async function () {
      await this.User.create({
        username: 'valak',
        createdAt: new Date().setFullYear(2015)
      });

      const users = await this.User.count({
        attributes: ['createdAt'],
        group: ['createdAt']
      });

      expect(users.length).to.be.eql(2);

      // have attributes
      expect(users[0].createdAt).to.exist;
      expect(users[1].createdAt).to.exist;
    });

    it('should not return NaN', async function () {
      await this.sequelize.sync({ force: true });

      await this.User.bulkCreate([
        { username: 'valak', age: 10 },
        { username: 'conjuring', age: 20 },
        { username: 'scary', age: 10 }
      ]);

      const result = await this.User.count({
        where: { age: 10 },
        group: ['age'],
        order: ['age']
      });
      expect(parseInt(result[0].count, 10)).to.be.eql(2);

      const missing = await this.User.count({
        where: { username: 'fire' }
      });
      expect(missing).to.be.eql(0);

      const grouped = await this.User.count({
        where: { username: 'fire' },
        group: 'age'
      });
      expect(grouped).to.be.eql([]);
    });

    it('should be able to specify column for COUNT()', async function () {
      await this.sequelize.sync({ force: true });

      await this.User.bulkCreate([
        { username: 'ember', age: 10 },
        { username: 'angular', age: 20 },
        { username: 'mithril', age: 10 }
      ]);

      const byUsername = await this.User.count({
        col: 'username'
      });
      expect(parseInt(byUsername, 10)).to.be.eql(3);

      const distinctAges = await this.User.count({
        col: 'age',
        distinct: true
      });
      expect(parseInt(distinctAges, 10)).to.be.eql(2);
    });

    it('should be able to use where clause on included models', async function () {
      const queryObject = {
        col: 'username',
        include: [this.Project],
        where: {
          '$Projects.name$': 'project1'
        }
      };

      const matching = await this.User.count(queryObject);
      expect(parseInt(matching, 10)).to.be.eql(1);

      queryObject.where['$Projects.name$'] = 'project2';

      const missing = await this.User.count(queryObject);
      expect(parseInt(missing, 10)).to.be.eql(0);
    });

    it('should be able to specify column for COUNT() with includes', async function () {
      await this.sequelize.sync({ force: true });

      await this.User.bulkCreate([
        { username: 'ember', age: 10 },
        { username: 'angular', age: 20 },
        { username: 'mithril', age: 10 }
      ]);

      const byUsername = await this.User.count({
        col: 'username',
        distinct: true,
        include: [this.Project]
      });
      expect(parseInt(byUsername, 10)).to.be.eql(3);

      const distinctAges = await this.User.count({
        col: 'age',
        distinct: true,
        include: [this.Project]
      });
      expect(parseInt(distinctAges, 10)).to.be.eql(2);
    });
  });
});
