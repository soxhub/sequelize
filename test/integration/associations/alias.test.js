import { describe, it, expect } from 'vitest';
import Support from '../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Alias'), () => {
  it('should uppercase the first letter in alias getter, but not in eager loading', async () => {
    const User = current.define('user', {}),
      Task = current.define('task', {});

    User.hasMany(Task, { as: 'assignments', foreignKey: 'userId' });
    Task.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

    await current.sync({ force: true });

    const created = await User.create({ id: 1 });
    expect(created.getAssignments).to.be.ok;

    const createdTask = await Task.create({ id: 1, userId: 1 });
    expect(createdTask.getOwner).to.be.ok;

    const [user, task] = await Promise.all([
      User.findOne({ where: { id: 1 }, include: [{ model: Task, as: 'assignments' }] }),
      Task.findOne({ where: { id: 1 }, include: [{ model: User, as: 'owner' }] })
    ]);

    expect(user.assignments).to.be.ok;
    expect(task.owner).to.be.ok;
  });

  it('shouldnt touch the passed alias', async () => {
    const User = current.define('user', {}),
      Task = current.define('task', {});

    User.hasMany(Task, { as: 'ASSIGNMENTS', foreignKey: 'userId' });
    Task.belongsTo(User, { as: 'OWNER', foreignKey: 'userId' });

    await current.sync({ force: true });

    const created = await User.create({ id: 1 });
    expect(created.getASSIGNMENTS).to.be.ok;

    const createdTask = await Task.create({ id: 1, userId: 1 });
    expect(createdTask.getOWNER).to.be.ok;

    const [user, task] = await Promise.all([
      User.findOne({ where: { id: 1 }, include: [{ model: Task, as: 'ASSIGNMENTS' }] }),
      Task.findOne({ where: { id: 1 }, include: [{ model: User, as: 'OWNER' }] })
    ]);

    expect(user.ASSIGNMENTS).to.be.ok;
    expect(task.OWNER).to.be.ok;
  });

  it('should allow me to pass my own plural and singular forms to hasMany', async () => {
    const User = current.define('user', {}),
      Task = current.define('task', {});

    User.hasMany(Task, { as: { singular: 'task', plural: 'taskz' } });

    await current.sync({ force: true });

    const created = await User.create({ id: 1 });
    expect(created.getTaskz).to.be.ok;
    expect(created.addTask).to.be.ok;
    expect(created.addTaskz).to.be.ok;

    const user = await User.findOne({ where: { id: 1 }, include: [{ model: Task, as: 'taskz' }] });
    expect(user.taskz).to.be.ok;
  });

  it('should allow me to define plural and singular forms on the model', async () => {
    const User = current.define('user', {}),
      Task = current.define(
        'task',
        {},
        {
          name: {
            singular: 'assignment',
            plural: 'assignments'
          }
        }
      );

    User.hasMany(Task);

    await current.sync({ force: true });

    const created = await User.create({ id: 1 });
    expect(created.getAssignments).to.be.ok;
    expect(created.addAssignment).to.be.ok;
    expect(created.addAssignments).to.be.ok;

    const user = await User.findOne({ where: { id: 1 }, include: [Task] });
    expect(user.assignments).to.be.ok;
  });
});
