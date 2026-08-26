import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Instance'), () => {
  describe('toJSON', () => {
    let User, Project;

    beforeEach(async () => {
      User = current.define(
        'User',
        {
          username: { type: DataTypes.STRING },
          age: DataTypes.INTEGER,
          level: { type: DataTypes.INTEGER },
          isUser: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          isAdmin: { type: DataTypes.BOOLEAN }
        },
        {
          timestamps: false
        }
      );

      Project = current.define('NiceProject', { title: DataTypes.STRING }, { timestamps: false });

      User.hasMany(Project, { as: 'Projects', foreignKey: 'lovelyUserId' });
      Project.belongsTo(User, { as: 'LovelyUser', foreignKey: 'lovelyUserId' });

      await User.sync({ force: true });
      await Project.sync({ force: true });
    });

    it("dont return instance that isn't defined", async () => {
      const created = await Project.create({ lovelyUserId: null });

      const project = await Project.findOne({
        where: {
          id: created.id
        },
        include: [{ model: User, as: 'LovelyUser' }]
      });

      const json = project.toJSON();
      expect(json.LovelyUser).to.be.equal(null);
    });

    it("dont return instances that aren't defined", async () => {
      const created = await User.create({ username: 'cuss' });

      const user = await User.findOne({
        where: {
          id: created.id
        },
        include: [{ model: Project, as: 'Projects' }]
      });

      expect(user.Projects).to.be.instanceof(Array);
      expect(user.Projects).to.be.length(0);
    });

    describe('build', () => {
      it('returns an object containing all values', () => {
        const user = User.build({
          username: 'Adam',
          age: 22,
          level: -1,
          isUser: false,
          isAdmin: true
        });

        expect(user.toJSON()).to.deep.equal({
          id: null,
          username: 'Adam',
          age: 22,
          level: -1,
          isUser: false,
          isAdmin: true
        });
      });

      it('returns a response that can be stringified', () => {
        const user = User.build({
          username: 'test.user',
          age: 99,
          isAdmin: true,
          isUser: false
        });
        expect(JSON.stringify(user)).to.deep.equal(
          '{"id":null,"username":"test.user","age":99,"isAdmin":true,"isUser":false}'
        );
      });

      it('returns a response that can be stringified and then parsed', () => {
        const user = User.build({ username: 'test.user', age: 99, isAdmin: true });
        expect(JSON.parse(JSON.stringify(user))).to.deep.equal({
          username: 'test.user',
          age: 99,
          isAdmin: true,
          isUser: false,
          id: null
        });
      });
    });

    describe('create', () => {
      it('returns an object containing all values', async () => {
        const user = await User.create({
          username: 'Adam',
          age: 22,
          level: -1,
          isUser: false,
          isAdmin: true
        });

        expect(user.toJSON()).to.deep.equal({
          id: user.get('id'),
          username: 'Adam',
          age: 22,
          isUser: false,
          isAdmin: true,
          level: -1
        });
      });

      it('returns a response that can be stringified', async () => {
        const user = await User.create({
          username: 'test.user',
          age: 99,
          isAdmin: true,
          isUser: false,
          level: null
        });

        expect(JSON.stringify(user)).to.deep.equal(
          `{"id":${user.get('id')},"username":"test.user","age":99,"isAdmin":true,"isUser":false,"level":null}`
        );
      });

      it('returns a response that can be stringified and then parsed', async () => {
        const user = await User.create({
          username: 'test.user',
          age: 99,
          isAdmin: true,
          level: null
        });

        expect(JSON.parse(JSON.stringify(user))).to.deep.equal({
          age: 99,
          id: user.get('id'),
          isAdmin: true,
          isUser: false,
          level: null,
          username: 'test.user'
        });
      });
    });

    describe('find', () => {
      it('returns an object containing all values', async () => {
        const created = await User.create({
          username: 'Adam',
          age: 22,
          level: -1,
          isUser: false,
          isAdmin: true
        });

        const user = await User.findByPk(created.get('id'));

        expect(user.toJSON()).to.deep.equal({
          id: user.get('id'),
          username: 'Adam',
          age: 22,
          level: -1,
          isUser: false,
          isAdmin: true
        });
      });

      it('returns a response that can be stringified', async () => {
        const created = await User.create({
          username: 'test.user',
          age: 99,
          isAdmin: true,
          isUser: false
        });

        const user = await User.findByPk(created.get('id'));

        expect(JSON.stringify(user)).to.deep.equal(
          `{"id":${user.get('id')},"username":"test.user","age":99,"level":null,"isUser":false,"isAdmin":true}`
        );
      });

      it('returns a response that can be stringified and then parsed', async () => {
        const created = await User.create({
          username: 'test.user',
          age: 99,
          isAdmin: true
        });

        const user = await User.findByPk(created.get('id'));

        expect(JSON.parse(JSON.stringify(user))).to.deep.equal({
          id: user.get('id'),
          username: 'test.user',
          age: 99,
          isAdmin: true,
          isUser: false,
          level: null
        });
      });
    });

    it('includes the eagerly loaded associations', async () => {
      const user = await User.create({ username: 'fnord', age: 1, isAdmin: true });
      const project = await Project.create({ title: 'fnord' });
      await user.setProjects([project]);

      const users = await User.findAll({ include: [{ model: Project, as: 'Projects' }] });
      const _user = users[0];

      expect(_user.Projects).to.exist;
      expect(JSON.parse(JSON.stringify(_user)).Projects).to.exist;

      const projects = await Project.findAll({ include: [{ model: User, as: 'LovelyUser' }] });
      const _project = projects[0];

      expect(_project.LovelyUser).to.exist;
      expect(JSON.parse(JSON.stringify(_project)).LovelyUser).to.exist;
    });
  });
});
