import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  let User, Project;

  beforeEach(() => {
    User = current.define('User', {
      username: DataTypes.STRING,
      age: DataTypes.INTEGER
    });
    Project = current.define('Project', {
      name: DataTypes.STRING
    });

    User.hasMany(Project);
    Project.belongsTo(User);

    return current.sync({ force: true });
  });

  describe('count', () => {
    beforeEach(async () => {
      await User.bulkCreate([{ username: 'boo' }, { username: 'boo2' }]);

      const user = await User.findOne();
      await user.createProject({
        name: 'project1'
      });
    });

    it('should count rows', () => {
      return expect(User.count()).to.eventually.equal(2);
    });

    it('should support include', () => {
      return expect(
        User.count({
          include: [
            {
              model: Project,
              where: {
                name: 'project1'
              }
            }
          ]
        })
      ).to.eventually.equal(1);
    });

    it('should return attributes', async () => {
      await User.create({
        username: 'valak',
        createdAt: new Date().setFullYear(2015)
      });

      const users = await User.count({
        attributes: ['createdAt'],
        group: ['createdAt']
      });

      expect(users.length).to.be.eql(2);

      // have attributes
      expect(users[0].createdAt).to.exist;
      expect(users[1].createdAt).to.exist;
    });

    it('should not return NaN', async () => {
      await current.sync({ force: true });

      await User.bulkCreate([
        { username: 'valak', age: 10 },
        { username: 'conjuring', age: 20 },
        { username: 'scary', age: 10 }
      ]);

      const result = await User.count({
        where: { age: 10 },
        group: ['age'],
        order: ['age']
      });
      expect(parseInt(result[0].count, 10)).to.be.eql(2);

      const missing = await User.count({
        where: { username: 'fire' }
      });
      expect(missing).to.be.eql(0);

      const grouped = await User.count({
        where: { username: 'fire' },
        group: 'age'
      });
      expect(grouped).to.be.eql([]);
    });

    it('should be able to specify column for COUNT()', async () => {
      await current.sync({ force: true });

      await User.bulkCreate([
        { username: 'ember', age: 10 },
        { username: 'angular', age: 20 },
        { username: 'mithril', age: 10 }
      ]);

      const byUsername = await User.count({
        col: 'username'
      });
      expect(parseInt(byUsername, 10)).to.be.eql(3);

      const distinctAges = await User.count({
        col: 'age',
        distinct: true
      });
      expect(parseInt(distinctAges, 10)).to.be.eql(2);
    });

    it('should be able to use where clause on included models', async () => {
      const queryObject = {
        col: 'username',
        include: [Project],
        where: {
          '$Projects.name$': 'project1'
        }
      };

      const matching = await User.count(queryObject);
      expect(parseInt(matching, 10)).to.be.eql(1);

      queryObject.where['$Projects.name$'] = 'project2';

      const missing = await User.count(queryObject);
      expect(parseInt(missing, 10)).to.be.eql(0);
    });

    it('should be able to specify column for COUNT() with includes', async () => {
      await current.sync({ force: true });

      await User.bulkCreate([
        { username: 'ember', age: 10 },
        { username: 'angular', age: 20 },
        { username: 'mithril', age: 10 }
      ]);

      const byUsername = await User.count({
        col: 'username',
        distinct: true,
        include: [Project]
      });
      expect(parseInt(byUsername, 10)).to.be.eql(3);

      const distinctAges = await User.count({
        col: 'age',
        distinct: true,
        include: [Project]
      });
      expect(parseInt(distinctAges, 10)).to.be.eql(2);
    });
  });
});
