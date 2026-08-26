import { describe, it, beforeEach, expect } from 'vitest';
import Sequelize from '../../../index.js';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

const Op = Sequelize.Op;

describe(Support.getTestDialectTeaser('Include'), () => {
  describe('LIMIT', () => {
    /*
     * shortcut for building simple {name: 'foo'} seed data
     */
    function build() {
      return Array.prototype.slice.call(arguments).map((arg) => ({ name: arg }));
    }

    /*
     * association overview
     * [Task]N---N[Project]N---N[User]N---N[Hobby]
     *                            1
     *                            |
     *                            |
     *                            |
     *                            N
     *            [Comment]N---1[Post]N---N[Tag]N---1[Color]
     *                            1
     *                            |
     *                            |
     *                            |
     *                            N
     *                        [Footnote]
     */
    let Project, User, Task, Hobby, Post, Comment, Tag, Color, Footnote;

    beforeEach(() => {
      Project = current.define(
        'Project',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      User = current.define(
        'User',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Task = current.define(
        'Task',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Hobby = current.define(
        'Hobby',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      User.belongsToMany(Project, { through: 'user_project' });
      Project.belongsToMany(User, { through: 'user_project' });

      Project.belongsToMany(Task, { through: 'task_project' });
      Task.belongsToMany(Project, { through: 'task_project' });

      User.belongsToMany(Hobby, { through: 'user_hobby' });
      Hobby.belongsToMany(User, { through: 'user_hobby' });

      Post = current.define(
        'Post',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Comment = current.define(
        'Comment',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Tag = current.define(
        'Tag',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Color = current.define(
        'Color',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Footnote = current.define(
        'Footnote',
        {
          name: {
            type: DataTypes.STRING,
            primaryKey: true
          }
        },
        { timestamps: false }
      );

      Post.hasMany(Comment);
      Comment.belongsTo(Post);

      Post.belongsToMany(Tag, { through: 'post_tag' });
      Tag.belongsToMany(Post, { through: 'post_tag' });

      Post.hasMany(Footnote);
      Footnote.belongsTo(Post);

      User.hasMany(Post);
      Post.belongsTo(User);

      Tag.belongsTo(Color);
      Color.hasMany(Tag);
    });

    /*
     * many-to-many
     */
    it('supports many-to-many association with where clause', async () => {
      await current.sync({ force: true });

      const [projects, users] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob'))
      ]);

      await Promise.all([projects[0].addUser(users[0]), projects[1].addUser(users[1]), projects[2].addUser(users[0])]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            where: {
              name: 'Alice'
            }
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports 2 levels of required many-to-many associations', async () => {
      await current.sync({ force: true });

      const [projects, users, hobbies] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]),
        projects[1].addUser(users[1]),
        projects[2].addUser(users[0]),
        users[0].addHobby(hobbies[0])
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Hobby,
                required: true
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports 2 levels of required many-to-many associations with where clause', async () => {
      await current.sync({ force: true });

      const [projects, users, hobbies] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]),
        projects[1].addUser(users[1]),
        projects[2].addUser(users[0]),
        users[0].addHobby(hobbies[0]),
        users[1].addHobby(hobbies[1])
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Hobby,
                where: {
                  name: 'archery'
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports 2 levels of required many-to-many associations with through.where clause', async () => {
      await current.sync({ force: true });

      const [projects, users, hobbies] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]),
        projects[1].addUser(users[1]),
        projects[2].addUser(users[0]),
        users[0].addHobby(hobbies[0]),
        users[1].addHobby(hobbies[1])
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Hobby,
                required: true,
                through: {
                  where: {
                    HobbyName: 'archery'
                  }
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports 3 levels of required many-to-many associations with where clause', async () => {
      await current.sync({ force: true });

      const [tasks, projects, users, hobbies] = await Promise.all([
        Task.bulkCreate(build('alpha', 'bravo', 'charlie')),
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob', 'Charlotte')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        tasks[0].addProject(projects[0]),
        tasks[1].addProject(projects[1]),
        tasks[2].addProject(projects[2]),
        projects[0].addUser(users[0]),
        projects[1].addUser(users[1]),
        projects[2].addUser(users[0]),
        users[0].addHobby(hobbies[0]),
        users[1].addHobby(hobbies[1])
      ]);

      const result = await Task.findAll({
        include: [
          {
            model: Project,
            required: true,
            include: [
              {
                model: User,
                required: true,
                include: [
                  {
                    model: Hobby,
                    where: {
                      name: 'archery'
                    }
                  }
                ]
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports required many-to-many association', async () => {
      await current.sync({ force: true });

      const [projects, users] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie')),
        User.bulkCreate(build('Alice', 'Bob'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]), // alpha
        projects[2].addUser(users[0]) // charlie
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports 2 required many-to-many association', async () => {
      await current.sync({ force: true });

      const [projects, users, tasks] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie', 'delta')),
        User.bulkCreate(build('Alice', 'Bob', 'David')),
        Task.bulkCreate(build('a', 'c', 'd'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]),
        projects[0].addTask(tasks[0]),
        projects[1].addUser(users[1]),
        projects[2].addTask(tasks[1]),
        projects[3].addUser(users[2]),
        projects[3].addTask(tasks[2])
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true
          },
          {
            model: Task,
            required: true
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('delta');
    });

    /*
     * one-to-many
     */
    it('supports required one-to-many association', async () => {
      await current.sync({ force: true });

      const [posts, comments] = await Promise.all([
        Post.bulkCreate(build('alpha', 'bravo', 'charlie')),
        Comment.bulkCreate(build('comment0', 'comment1'))
      ]);

      await Promise.all([posts[0].addComment(comments[0]), posts[2].addComment(comments[1])]);

      const result = await Post.findAll({
        include: [
          {
            model: Comment,
            required: true
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports required one-to-many association with where clause', async () => {
      await current.sync({ force: true });

      const [posts, comments] = await Promise.all([
        Post.bulkCreate(build('alpha', 'bravo', 'charlie')),
        Comment.bulkCreate(build('comment0', 'comment1', 'comment2'))
      ]);

      await Promise.all([
        posts[0].addComment(comments[0]),
        posts[1].addComment(comments[1]),
        posts[2].addComment(comments[2])
      ]);

      const result = await Post.findAll({
        include: [
          {
            model: Comment,
            required: true,
            where: {
              [Op.or]: [
                {
                  name: 'comment0'
                },
                {
                  name: 'comment2'
                }
              ]
            }
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('charlie');
    });

    it('supports required one-to-many association with where clause (findOne)', async () => {
      await current.sync({ force: true });

      const [posts, comments] = await Promise.all([
        Post.bulkCreate(build('alpha', 'bravo', 'charlie')),
        Comment.bulkCreate(build('comment0', 'comment1', 'comment2'))
      ]);

      await Promise.all([
        posts[0].addComment(comments[0]),
        posts[1].addComment(comments[1]),
        posts[2].addComment(comments[2])
      ]);

      const post = await Post.findOne({
        include: [
          {
            model: Comment,
            required: true,
            where: {
              name: 'comment2'
            }
          }
        ]
      });

      expect(post.name).to.equal('charlie');
    });

    it('supports 2 levels of required one-to-many associations', async () => {
      await current.sync({ force: true });

      const [users, posts, comments] = await Promise.all([
        User.bulkCreate(build('Alice', 'Bob', 'Charlotte', 'David')),
        Post.bulkCreate(build('post0', 'post1', 'post2')),
        Comment.bulkCreate(build('comment0', 'comment1', 'comment2'))
      ]);

      await Promise.all([
        users[0].addPost(posts[0]),
        users[1].addPost(posts[1]),
        users[3].addPost(posts[2]),
        posts[0].addComment(comments[0]),
        posts[2].addComment(comments[2])
      ]);

      const result = await User.findAll({
        include: [
          {
            model: Post,
            required: true,
            include: [
              {
                model: Comment,
                required: true
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('David');
    });

    /*
     * mixed many-to-many, one-to-many and many-to-one
     */
    it('supports required one-to-many association with nested required many-to-many association', async () => {
      await current.sync({ force: true });

      const [users, posts, tags] = await Promise.all([
        User.bulkCreate(build('Alice', 'Bob', 'Charlotte', 'David')),
        Post.bulkCreate(build('alpha', 'charlie', 'delta')),
        Tag.bulkCreate(build('atag', 'btag', 'dtag'))
      ]);

      await Promise.all([
        users[0].addPost(posts[0]),
        users[2].addPost(posts[1]),
        users[3].addPost(posts[2]),

        posts[0].addTag([tags[0]]),
        posts[2].addTag([tags[2]])
      ]);

      const result = await User.findAll({
        include: [
          {
            model: Post,
            required: true,
            include: [
              {
                model: Tag,
                required: true
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('David');
    });

    it('supports required many-to-many association with nested required one-to-many association', async () => {
      await current.sync({ force: true });

      const [projects, users, posts] = await Promise.all([
        Project.bulkCreate(build('alpha', 'bravo', 'charlie', 'delta')),
        User.bulkCreate(build('Alice', 'Bob', 'David')),
        Post.bulkCreate(build('post0', 'post1', 'post2'))
      ]);

      await Promise.all([
        projects[0].addUser(users[0]),
        projects[1].addUser(users[1]),
        projects[3].addUser(users[2]),

        users[0].addPost([posts[0]]),
        users[2].addPost([posts[2]])
      ]);

      const result = await Project.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Post,
                required: true,
                duplicating: true
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('delta');
    });

    it('supports required many-to-one association with nested many-to-many association with where clause', async () => {
      await current.sync({ force: true });

      const [posts, users, hobbies] = await Promise.all([
        Post.bulkCreate(build('post0', 'post1', 'post2', 'post3')),
        User.bulkCreate(build('Alice', 'Bob', 'Charlotte', 'David')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        posts[0].setUser(users[0]),
        posts[1].setUser(users[1]),
        posts[3].setUser(users[3]),
        users[0].addHobby(hobbies[0]),
        users[1].addHobby(hobbies[1]),
        users[3].addHobby(hobbies[0])
      ]);

      const result = await Post.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Hobby,
                where: {
                  name: 'archery'
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('post3');
    });

    it('supports required many-to-one association with nested many-to-many association with through.where clause', async () => {
      await current.sync({ force: true });

      const [posts, users, hobbies] = await Promise.all([
        Post.bulkCreate(build('post0', 'post1', 'post2', 'post3')),
        User.bulkCreate(build('Alice', 'Bob', 'Charlotte', 'David')),
        Hobby.bulkCreate(build('archery', 'badminton'))
      ]);

      await Promise.all([
        posts[0].setUser(users[0]),
        posts[1].setUser(users[1]),
        posts[3].setUser(users[3]),
        users[0].addHobby(hobbies[0]),
        users[1].addHobby(hobbies[1]),
        users[3].addHobby(hobbies[0])
      ]);

      const result = await Post.findAll({
        include: [
          {
            model: User,
            required: true,
            include: [
              {
                model: Hobby,
                required: true,
                through: {
                  where: {
                    HobbyName: 'archery'
                  }
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('post3');
    });

    it('supports required many-to-one association with multiple nested associations with where clause', async () => {
      await current.sync({ force: true });

      const [comments, posts, users, tags] = await Promise.all([
        Comment.bulkCreate(build('comment0', 'comment1', 'comment2', 'comment3', 'comment4', 'comment5')),
        Post.bulkCreate(build('post0', 'post1', 'post2', 'post3', 'post4')),
        User.bulkCreate(build('Alice', 'Bob')),
        Tag.bulkCreate(build('tag0', 'tag1'))
      ]);

      await Promise.all([
        comments[0].setPost(posts[0]),
        comments[1].setPost(posts[1]),
        comments[3].setPost(posts[2]),
        comments[4].setPost(posts[3]),
        comments[5].setPost(posts[4]),

        posts[0].addTag(tags[0]),
        posts[3].addTag(tags[0]),
        posts[4].addTag(tags[0]),
        posts[1].addTag(tags[1]),

        posts[0].setUser(users[0]),
        posts[2].setUser(users[0]),
        posts[4].setUser(users[0]),
        posts[1].setUser(users[1])
      ]);

      const result = await Comment.findAll({
        include: [
          {
            model: Post,
            required: true,
            include: [
              {
                model: User,
                where: {
                  name: 'Alice'
                }
              },
              {
                model: Tag,
                where: {
                  name: 'tag0'
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('comment5');
    });

    it('supports required many-to-one association with nested one-to-many association with where clause', async () => {
      await current.sync({ force: true });

      const [comments, posts, footnotes] = await Promise.all([
        Comment.bulkCreate(build('comment0', 'comment1', 'comment2')),
        Post.bulkCreate(build('post0', 'post1', 'post2')),
        Footnote.bulkCreate(build('footnote0', 'footnote1', 'footnote2'))
      ]);

      await Promise.all([
        comments[0].setPost(posts[0]),
        comments[1].setPost(posts[1]),
        comments[2].setPost(posts[2]),
        posts[0].addFootnote(footnotes[0]),
        posts[1].addFootnote(footnotes[1]),
        posts[2].addFootnote(footnotes[2])
      ]);

      const result = await Comment.findAll({
        include: [
          {
            model: Post,
            required: true,
            include: [
              {
                model: Footnote,
                where: {
                  [Op.or]: [
                    {
                      name: 'footnote0'
                    },
                    {
                      name: 'footnote2'
                    }
                  ]
                }
              }
            ]
          }
        ],
        order: ['name'],
        limit: 1,
        offset: 1
      });

      expect(result.length).to.equal(1);
      expect(result[0].name).to.equal('comment2');
    });
  });
});
