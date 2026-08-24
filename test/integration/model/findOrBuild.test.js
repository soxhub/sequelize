import { describe, it, beforeEach } from 'mocha';
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

  describe('findOrBuild', () => {
    it('initialize with includes', async () => {
      const [, user2] = await User.bulkCreate(
        [
          { username: 'Mello', age: 10 },
          { username: 'Mello', age: 20 }
        ],
        { returning: true }
      );

      const project = await Project.create({
        name: 'Investigate'
      });
      await user2.setProjects([project]);

      const [user, created] = await User.findOrBuild({
        defaults: {
          username: 'Mello',
          age: 10
        },
        where: {
          age: 20
        },
        include: [
          {
            model: Project
          }
        ]
      });

      expect(created).to.be.false;
      expect(user.get('id')).to.be.ok;
      expect(user.get('username')).to.equal('Mello');
      expect(user.get('age')).to.equal(20);

      expect(user.Projects).to.have.length(1);
      expect(user.Projects[0].get('name')).to.equal('Investigate');
    });
  });
});
