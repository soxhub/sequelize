import { describe, it } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Multiple Level Filters'), () => {
  it('can filter through belongsTo', async () => {
    const User = current.define('User', { username: DataTypes.STRING }),
      Task = current.define('Task', { title: DataTypes.STRING }),
      Project = current.define('Project', { title: DataTypes.STRING });

    Project.belongsTo(User);
    User.hasMany(Project);

    Task.belongsTo(Project);
    Project.hasMany(Task);

    await current.sync({ force: true });

    await User.bulkCreate([
      {
        username: 'leia'
      },
      {
        username: 'vader'
      }
    ]);

    await Project.bulkCreate([
      {
        UserId: 1,
        title: 'republic'
      },
      {
        UserId: 2,
        title: 'empire'
      }
    ]);

    await Task.bulkCreate([
      {
        ProjectId: 1,
        title: 'fight empire'
      },
      {
        ProjectId: 1,
        title: 'stablish republic'
      },
      {
        ProjectId: 2,
        title: 'destroy rebel alliance'
      },
      {
        ProjectId: 2,
        title: 'rule everything'
      }
    ]);

    const tasks = await Task.findAll({
      include: [
        {
          model: Project,
          include: [{ model: User, where: { username: 'leia' } }],
          required: true
        }
      ]
    });

    expect(tasks.length).to.be.equal(2);
    expect(tasks[0].title).to.be.equal('fight empire');
    expect(tasks[1].title).to.be.equal('stablish republic');
  });

  it('avoids duplicated tables in query', async () => {
    const User = current.define('User', { username: DataTypes.STRING }),
      Task = current.define('Task', { title: DataTypes.STRING }),
      Project = current.define('Project', { title: DataTypes.STRING });

    Project.belongsTo(User);
    User.hasMany(Project);

    Task.belongsTo(Project);
    Project.hasMany(Task);

    await current.sync({ force: true });

    await User.bulkCreate([
      {
        username: 'leia'
      },
      {
        username: 'vader'
      }
    ]);

    await Project.bulkCreate([
      {
        UserId: 1,
        title: 'republic'
      },
      {
        UserId: 2,
        title: 'empire'
      }
    ]);

    await Task.bulkCreate([
      {
        ProjectId: 1,
        title: 'fight empire'
      },
      {
        ProjectId: 1,
        title: 'stablish republic'
      },
      {
        ProjectId: 2,
        title: 'destroy rebel alliance'
      },
      {
        ProjectId: 2,
        title: 'rule everything'
      }
    ]);

    const tasks = await Task.findAll({
      include: [
        {
          model: Project,
          include: [
            {
              model: User,
              where: {
                username: 'leia',
                id: 1
              }
            }
          ],
          required: true
        }
      ]
    });

    expect(tasks.length).to.be.equal(2);
    expect(tasks[0].title).to.be.equal('fight empire');
    expect(tasks[1].title).to.be.equal('stablish republic');
  });

  it('can filter through hasMany', async () => {
    const User = current.define('User', { username: DataTypes.STRING }),
      Task = current.define('Task', { title: DataTypes.STRING }),
      Project = current.define('Project', { title: DataTypes.STRING });

    Project.belongsTo(User);
    User.hasMany(Project);

    Task.belongsTo(Project);
    Project.hasMany(Task);

    await current.sync({ force: true });

    await User.bulkCreate([
      {
        username: 'leia'
      },
      {
        username: 'vader'
      }
    ]);

    await Project.bulkCreate([
      {
        UserId: 1,
        title: 'republic'
      },
      {
        UserId: 2,
        title: 'empire'
      }
    ]);

    await Task.bulkCreate([
      {
        ProjectId: 1,
        title: 'fight empire'
      },
      {
        ProjectId: 1,
        title: 'stablish republic'
      },
      {
        ProjectId: 2,
        title: 'destroy rebel alliance'
      },
      {
        ProjectId: 2,
        title: 'rule everything'
      }
    ]);

    const users = await User.findAll({
      include: [
        {
          model: Project,
          include: [{ model: Task, where: { title: 'fight empire' } }],
          required: true
        }
      ]
    });

    expect(users.length).to.be.equal(1);
    expect(users[0].username).to.be.equal('leia');
  });

  it('can filter through hasMany connector', async () => {
    const User = current.define('User', { username: DataTypes.STRING }),
      Project = current.define('Project', { title: DataTypes.STRING });

    Project.belongsToMany(User, { through: 'user_project' });
    User.belongsToMany(Project, { through: 'user_project' });

    await current.sync({ force: true });

    await User.bulkCreate([
      {
        username: 'leia'
      },
      {
        username: 'vader'
      }
    ]);

    await Project.bulkCreate([
      {
        title: 'republic'
      },
      {
        title: 'empire'
      }
    ]);

    const user = await User.findByPk(1);
    const project = await Project.findByPk(1);
    await user.setProjects([project]);

    const secondUser = await User.findByPk(2);
    const secondProject = await Project.findByPk(2);
    await secondUser.setProjects([secondProject]);

    const users = await User.findAll({
      include: [{ model: Project, where: { title: 'republic' } }]
    });

    expect(users.length).to.be.equal(1);
    expect(users[0].username).to.be.equal('leia');
  });
});
