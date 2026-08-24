import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';

describe(Support.getTestDialectTeaser('associations'), () => {
  describe('scope', () => {
    beforeEach(function () {
      this.Post = this.sequelize.define('post', {});
      this.Image = this.sequelize.define('image', {});
      this.Question = this.sequelize.define('question', {});
      this.Comment = this.sequelize.define('comment', {
        title: Sequelize.STRING,
        commentable: Sequelize.STRING,
        commentable_id: Sequelize.INTEGER,
        isMain: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        }
      });

      this.Comment.prototype.getItem = function () {
        return this['get' + this.get('commentable').substr(0, 1).toUpperCase() + this.get('commentable').substr(1)]();
      };

      this.Post.addScope('withComments', {
        include: [this.Comment]
      });
      this.Post.addScope('withMainComment', {
        include: [
          {
            model: this.Comment,
            as: 'mainComment'
          }
        ]
      });
      this.Post.hasMany(this.Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'post'
        },
        constraints: false
      });
      this.Post.hasOne(this.Comment, {
        foreignKey: 'commentable_id',
        as: 'mainComment',
        scope: {
          commentable: 'post',
          isMain: true
        },
        constraints: false
      });
      this.Comment.belongsTo(this.Post, {
        foreignKey: 'commentable_id',
        as: 'post',
        constraints: false
      });

      this.Image.hasMany(this.Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'image'
        },
        constraints: false
      });
      this.Comment.belongsTo(this.Image, {
        foreignKey: 'commentable_id',
        as: 'image',
        constraints: false
      });

      this.Question.hasMany(this.Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'question'
        },
        constraints: false
      });
      this.Comment.belongsTo(this.Question, {
        foreignKey: 'commentable_id',
        as: 'question',
        constraints: false
      });
    });

    describe('1:1', () => {
      it('should create, find and include associations with scope values', async function () {
        await this.sequelize.sync({ force: true });

        const [post] = await Promise.all([
          this.Post.create(),
          this.Comment.create({
            title: 'I am a comment'
          }),
          this.Comment.create({
            title: 'I am a main comment',
            isMain: true
          })
        ]);

        this.post = post;

        const comment = await post.createComment({
          title: 'I am a post comment'
        });
        expect(comment.get('commentable')).to.equal('post');
        expect(comment.get('isMain')).to.be.false;

        const withoutMain = await this.Post.scope('withMainComment').findById(this.post.get('id'));
        expect(withoutMain.mainComment).to.be.null;

        const mainComment = await withoutMain.createMainComment({
          title: 'I am a main post comment'
        });
        this.mainComment = mainComment;
        expect(mainComment.get('commentable')).to.equal('post');
        expect(mainComment.get('isMain')).to.be.true;

        const withMain = await this.Post.scope('withMainComment').findById(this.post.id);
        expect(withMain.mainComment.get('id')).to.equal(this.mainComment.get('id'));

        const fetchedMain = await withMain.getMainComment();
        expect(fetchedMain.get('commentable')).to.equal('post');
        expect(fetchedMain.get('isMain')).to.be.true;

        const futureMain = await this.Comment.create({
          title: 'I am a future main comment'
        });
        await this.post.setMainComment(futureMain);

        const reassignedMain = await this.post.getMainComment();
        expect(reassignedMain.get('commentable')).to.equal('post');
        expect(reassignedMain.get('isMain')).to.be.true;
        expect(reassignedMain.get('title')).to.equal('I am a future main comment');
      });

      it('should create included association with scope values', async function () {
        await this.sequelize.sync({ force: true });

        const created = await this.Post.create(
          {
            mainComment: {
              title: 'I am a main comment created with a post'
            }
          },
          {
            include: [{ model: this.Comment, as: 'mainComment' }]
          }
        );

        expect(created.mainComment.get('commentable')).to.equal('post');
        expect(created.mainComment.get('isMain')).to.be.true;

        const post = await this.Post.scope('withMainComment').findById(created.id);
        expect(post.mainComment.get('commentable')).to.equal('post');
        expect(post.mainComment.get('isMain')).to.be.true;
      });
    });

    describe('1:M', () => {
      it('should create, find and include associations with scope values', async function () {
        await this.sequelize.sync({ force: true });

        const [post, image, question, commentA, commentB] = await Promise.all([
          this.Post.create(),
          this.Image.create(),
          this.Question.create(),
          this.Comment.create({
            title: 'I am a image comment'
          }),
          this.Comment.create({
            title: 'I am a question comment'
          })
        ]);

        this.post = post;
        this.image = image;
        this.question = question;

        await Promise.all([
          post.createComment({
            title: 'I am a post comment'
          }),
          image.addComment(commentA),
          question.setComments([commentB])
        ]);

        const comments = await this.Comment.findAll();
        comments.forEach((comment) => {
          expect(comment.get('commentable')).to.be.ok;
        });
        expect(
          comments
            .map((comment) => {
              return comment.get('commentable');
            })
            .sort()
        ).to.deep.equal(['image', 'post', 'question']);

        const [postComments, imageComments, questionComments] = await Promise.all([
          this.post.getComments(),
          this.image.getComments(),
          this.question.getComments()
        ]);

        expect(postComments.length).to.equal(1);
        expect(postComments[0].get('title')).to.equal('I am a post comment');
        expect(imageComments.length).to.equal(1);
        expect(imageComments[0].get('title')).to.equal('I am a image comment');
        expect(questionComments.length).to.equal(1);
        expect(questionComments[0].get('title')).to.equal('I am a question comment');

        const [postItem, imageItem, questionItem] = await Promise.all([
          postComments[0].getItem(),
          imageComments[0].getItem(),
          questionComments[0].getItem()
        ]);

        expect(postItem).to.be.instanceof(this.Post);
        expect(imageItem).to.be.instanceof(this.Image);
        expect(questionItem).to.be.instanceof(this.Question);

        const [includedPost, includedImage, includedQuestion] = await Promise.all([
          this.Post.find({
            include: [this.Comment]
          }),
          this.Image.findOne({
            include: [this.Comment]
          }),
          this.Question.findOne({
            include: [this.Comment]
          })
        ]);

        expect(includedPost.comments.length).to.equal(1);
        expect(includedPost.comments[0].get('title')).to.equal('I am a post comment');
        expect(includedImage.comments.length).to.equal(1);
        expect(includedImage.comments[0].get('title')).to.equal('I am a image comment');
        expect(includedQuestion.comments.length).to.equal(1);
        expect(includedQuestion.comments[0].get('title')).to.equal('I am a question comment');
      });

      it('should make the same query if called multiple time (#4470)', async function () {
        const logs = [];
        const logging = function (log) {
          logs.push(log);
        };

        await this.sequelize.sync({ force: true });

        const post = await this.Post.create();
        await post.createComment({
          title: 'I am a post comment'
        });

        await this.Post.scope('withComments').findAll({
          logging
        });

        await this.Post.scope('withComments').findAll({
          logging
        });

        expect(logs[0]).to.equal(logs[1]);
      });
      it('should created included association with scope values', async function () {
        await this.sequelize.sync({ force: true });

        const created = await this.Post.create(
          {
            comments: [
              {
                title: 'I am a comment created with a post'
              },
              {
                title: 'I am a second comment created with a post'
              }
            ]
          },
          {
            include: [{ model: this.Comment, as: 'comments' }]
          }
        );

        this.post = created;

        for (const comment of created.comments) {
          expect(comment.get('commentable')).to.equal('post');
        }

        const post = await this.Post.scope('withComments').findById(this.post.id);

        const comments = await post.getComments();
        for (const comment of comments) {
          expect(comment.get('commentable')).to.equal('post');
        }
      });
    });

    if (Support.getTestDialect() !== 'sqlite') {
      describe('N:M', () => {
        describe('on the target', () => {
          beforeEach(function () {
            this.Post = this.sequelize.define('post', {});
            this.Tag = this.sequelize.define('tag', {
              type: DataTypes.STRING
            });
            this.PostTag = this.sequelize.define('post_tag');

            this.Tag.belongsToMany(this.Post, { through: this.PostTag });
            this.Post.belongsToMany(this.Tag, { as: 'categories', through: this.PostTag, scope: { type: 'category' } });
            this.Post.belongsToMany(this.Tag, { as: 'tags', through: this.PostTag, scope: { type: 'tag' } });
          });

          it('should create, find and include associations with scope values', async function () {
            await Promise.all([this.Post.sync({ force: true }), this.Tag.sync({ force: true })]);
            await this.PostTag.sync({ force: true });

            const [postA, postB, postC, categoryA, categoryB, tagA, tagB] = await Promise.all([
              this.Post.create(),
              this.Post.create(),
              this.Post.create(),
              this.Tag.create({ type: 'category' }),
              this.Tag.create({ type: 'category' }),
              this.Tag.create({ type: 'tag' }),
              this.Tag.create({ type: 'tag' })
            ]);

            this.postA = postA;
            this.postB = postB;
            this.postC = postC;

            await Promise.all([
              postA.addCategory(categoryA),
              postB.setCategories([categoryB]),
              postC.createCategory(),
              postA.createTag(),
              postB.addTag(tagA),
              postC.setTags([tagB])
            ]);

            const [postACategories, postATags, postBCategories, postBTags, postCCategories, postCTags] =
              await Promise.all([
                this.postA.getCategories(),
                this.postA.getTags(),
                this.postB.getCategories(),
                this.postB.getTags(),
                this.postC.getCategories(),
                this.postC.getTags()
              ]);

            expect(postACategories.length).to.equal(1);
            expect(postATags.length).to.equal(1);
            expect(postBCategories.length).to.equal(1);
            expect(postBTags.length).to.equal(1);
            expect(postCCategories.length).to.equal(1);
            expect(postCTags.length).to.equal(1);

            expect(postACategories[0].get('type')).to.equal('category');
            expect(postATags[0].get('type')).to.equal('tag');
            expect(postBCategories[0].get('type')).to.equal('category');
            expect(postBTags[0].get('type')).to.equal('tag');
            expect(postCCategories[0].get('type')).to.equal('category');
            expect(postCTags[0].get('type')).to.equal('tag');

            const [foundA, foundB, foundC] = await Promise.all([
              this.Post.findOne({
                where: {
                  id: this.postA.get('id')
                },
                include: [
                  { model: this.Tag, as: 'tags' },
                  { model: this.Tag, as: 'categories' }
                ]
              }),
              this.Post.findOne({
                where: {
                  id: this.postB.get('id')
                },
                include: [
                  { model: this.Tag, as: 'tags' },
                  { model: this.Tag, as: 'categories' }
                ]
              }),
              this.Post.findOne({
                where: {
                  id: this.postC.get('id')
                },
                include: [
                  { model: this.Tag, as: 'tags' },
                  { model: this.Tag, as: 'categories' }
                ]
              })
            ]);

            expect(foundA.get('categories').length).to.equal(1);
            expect(foundA.get('tags').length).to.equal(1);
            expect(foundB.get('categories').length).to.equal(1);
            expect(foundB.get('tags').length).to.equal(1);
            expect(foundC.get('categories').length).to.equal(1);
            expect(foundC.get('tags').length).to.equal(1);

            expect(foundA.get('categories')[0].get('type')).to.equal('category');
            expect(foundA.get('tags')[0].get('type')).to.equal('tag');
            expect(foundB.get('categories')[0].get('type')).to.equal('category');
            expect(foundB.get('tags')[0].get('type')).to.equal('tag');
            expect(foundC.get('categories')[0].get('type')).to.equal('category');
            expect(foundC.get('tags')[0].get('type')).to.equal('tag');
          });
        });

        describe('on the through model', () => {
          beforeEach(function () {
            this.Post = this.sequelize.define('post', {});
            this.Image = this.sequelize.define('image', {});
            this.Question = this.sequelize.define('question', {});

            this.ItemTag = this.sequelize.define('item_tag', {
              id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
              },
              tag_id: {
                type: DataTypes.INTEGER,
                unique: 'item_tag_taggable'
              },
              taggable: {
                type: DataTypes.STRING,
                unique: 'item_tag_taggable'
              },
              taggable_id: {
                type: DataTypes.INTEGER,
                unique: 'item_tag_taggable',
                references: null
              }
            });
            this.Tag = this.sequelize.define('tag', {
              name: DataTypes.STRING
            });

            this.Post.belongsToMany(this.Tag, {
              through: {
                model: this.ItemTag,
                unique: false,
                scope: {
                  taggable: 'post'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            this.Tag.belongsToMany(this.Post, {
              through: {
                model: this.ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });

            this.Image.belongsToMany(this.Tag, {
              through: {
                model: this.ItemTag,
                unique: false,
                scope: {
                  taggable: 'image'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            this.Tag.belongsToMany(this.Image, {
              through: {
                model: this.ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });

            this.Question.belongsToMany(this.Tag, {
              through: {
                model: this.ItemTag,
                unique: false,
                scope: {
                  taggable: 'question'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            this.Tag.belongsToMany(this.Question, {
              through: {
                model: this.ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });
          });

          it('should create, find and include associations with scope values', async function () {
            await Promise.all([
              this.Post.sync({ force: true }),
              this.Image.sync({ force: true }),
              this.Question.sync({ force: true }),
              this.Tag.sync({ force: true })
            ]);

            await this.ItemTag.sync({ force: true });

            const [post, image, question, tagA, tagB, tagC] = await Promise.all([
              this.Post.create(),
              this.Image.create(),
              this.Question.create(),
              this.Tag.create({ name: 'tagA' }),
              this.Tag.create({ name: 'tagB' }),
              this.Tag.create({ name: 'tagC' })
            ]);

            this.post = post;
            this.image = image;
            this.question = question;

            await Promise.all([
              (async () => {
                await post.setTags([tagA]);
                return Promise.all([post.createTag({ name: 'postTag' }), post.addTag(tagB)]);
              })(),
              (async () => {
                await image.setTags([tagB]);
                return Promise.all([image.createTag({ name: 'imageTag' }), image.addTag(tagC)]);
              })(),
              (async () => {
                await question.setTags([tagC]);
                return Promise.all([question.createTag({ name: 'questionTag' }), question.addTag(tagA)]);
              })()
            ]);

            const [postTags, imageTags, questionTags] = await Promise.all([
              this.post.getTags(),
              this.image.getTags(),
              this.question.getTags()
            ]);

            expect(postTags.length).to.equal(3);
            expect(imageTags.length).to.equal(3);
            expect(questionTags.length).to.equal(3);

            expect(
              postTags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['postTag', 'tagA', 'tagB']);

            expect(
              imageTags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['imageTag', 'tagB', 'tagC']);

            expect(
              questionTags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['questionTag', 'tagA', 'tagC']);

            const [foundPost, foundImage, foundQuestion] = await Promise.all([
              this.Post.findOne({
                where: {},
                include: [this.Tag]
              }),
              this.Image.findOne({
                where: {},
                include: [this.Tag]
              }),
              this.Question.findOne({
                where: {},
                include: [this.Tag]
              })
            ]);

            expect(foundPost.tags.length).to.equal(3);
            expect(foundImage.tags.length).to.equal(3);
            expect(foundQuestion.tags.length).to.equal(3);

            expect(
              foundPost.tags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['postTag', 'tagA', 'tagB']);

            expect(
              foundImage.tags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['imageTag', 'tagB', 'tagC']);

            expect(
              foundQuestion.tags
                .map((tag) => {
                  return tag.name;
                })
                .sort()
            ).to.deep.equal(['questionTag', 'tagA', 'tagC']);
          });
        });
      });
    }
  });
});
