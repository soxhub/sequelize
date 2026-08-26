import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('associations'), () => {
  describe('scope', () => {
    let Post;
    let Image;
    let Question;
    let Comment;
    let Tag;
    let ItemTag;
    let PostTag;

    beforeEach(() => {
      Post = current.define('post', {});
      Image = current.define('image', {});
      Question = current.define('question', {});
      Comment = current.define('comment', {
        title: Sequelize.STRING,
        commentable: Sequelize.STRING,
        commentable_id: Sequelize.INTEGER,
        isMain: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        }
      });

      Comment.prototype.getItem = function () {
        return this['get' + this.get('commentable').substr(0, 1).toUpperCase() + this.get('commentable').substr(1)]();
      };

      Post.addScope('withComments', {
        include: [Comment]
      });
      Post.addScope('withMainComment', {
        include: [
          {
            model: Comment,
            as: 'mainComment'
          }
        ]
      });
      Post.hasMany(Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'post'
        },
        constraints: false
      });
      Post.hasOne(Comment, {
        foreignKey: 'commentable_id',
        as: 'mainComment',
        scope: {
          commentable: 'post',
          isMain: true
        },
        constraints: false
      });
      Comment.belongsTo(Post, {
        foreignKey: 'commentable_id',
        as: 'post',
        constraints: false
      });

      Image.hasMany(Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'image'
        },
        constraints: false
      });
      Comment.belongsTo(Image, {
        foreignKey: 'commentable_id',
        as: 'image',
        constraints: false
      });

      Question.hasMany(Comment, {
        foreignKey: 'commentable_id',
        scope: {
          commentable: 'question'
        },
        constraints: false
      });
      Comment.belongsTo(Question, {
        foreignKey: 'commentable_id',
        as: 'question',
        constraints: false
      });
    });

    describe('1:1', () => {
      it('should create, find and include associations with scope values', async () => {
        await current.sync({ force: true });

        const [post] = await Promise.all([
          Post.create(),
          Comment.create({
            title: 'I am a comment'
          }),
          Comment.create({
            title: 'I am a main comment',
            isMain: true
          })
        ]);

        const comment = await post.createComment({
          title: 'I am a post comment'
        });
        expect(comment.get('commentable')).to.equal('post');
        expect(comment.get('isMain')).to.be.false;

        const withoutMain = await Post.scope('withMainComment').findByPk(post.get('id'));
        expect(withoutMain.mainComment).to.be.null;

        const mainComment = await withoutMain.createMainComment({
          title: 'I am a main post comment'
        });
        expect(mainComment.get('commentable')).to.equal('post');
        expect(mainComment.get('isMain')).to.be.true;

        const withMain = await Post.scope('withMainComment').findByPk(post.id);
        expect(withMain.mainComment.get('id')).to.equal(mainComment.get('id'));

        const fetchedMain = await withMain.getMainComment();
        expect(fetchedMain.get('commentable')).to.equal('post');
        expect(fetchedMain.get('isMain')).to.be.true;

        const futureMain = await Comment.create({
          title: 'I am a future main comment'
        });
        await post.setMainComment(futureMain);

        const reassignedMain = await post.getMainComment();
        expect(reassignedMain.get('commentable')).to.equal('post');
        expect(reassignedMain.get('isMain')).to.be.true;
        expect(reassignedMain.get('title')).to.equal('I am a future main comment');
      });

      it('should create included association with scope values', async () => {
        await current.sync({ force: true });

        const created = await Post.create(
          {
            mainComment: {
              title: 'I am a main comment created with a post'
            }
          },
          {
            include: [{ model: Comment, as: 'mainComment' }]
          }
        );

        expect(created.mainComment.get('commentable')).to.equal('post');
        expect(created.mainComment.get('isMain')).to.be.true;

        const post = await Post.scope('withMainComment').findByPk(created.id);
        expect(post.mainComment.get('commentable')).to.equal('post');
        expect(post.mainComment.get('isMain')).to.be.true;
      });
    });

    describe('1:M', () => {
      it('should create, find and include associations with scope values', async () => {
        await current.sync({ force: true });

        const [post, image, question, commentA, commentB] = await Promise.all([
          Post.create(),
          Image.create(),
          Question.create(),
          Comment.create({
            title: 'I am a image comment'
          }),
          Comment.create({
            title: 'I am a question comment'
          })
        ]);

        await Promise.all([
          post.createComment({
            title: 'I am a post comment'
          }),
          image.addComment(commentA),
          question.setComments([commentB])
        ]);

        const comments = await Comment.findAll();
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
          post.getComments(),
          image.getComments(),
          question.getComments()
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

        expect(postItem).to.be.instanceof(Post);
        expect(imageItem).to.be.instanceof(Image);
        expect(questionItem).to.be.instanceof(Question);

        const [includedPost, includedImage, includedQuestion] = await Promise.all([
          Post.findOne({
            include: [Comment]
          }),
          Image.findOne({
            include: [Comment]
          }),
          Question.findOne({
            include: [Comment]
          })
        ]);

        expect(includedPost.comments.length).to.equal(1);
        expect(includedPost.comments[0].get('title')).to.equal('I am a post comment');
        expect(includedImage.comments.length).to.equal(1);
        expect(includedImage.comments[0].get('title')).to.equal('I am a image comment');
        expect(includedQuestion.comments.length).to.equal(1);
        expect(includedQuestion.comments[0].get('title')).to.equal('I am a question comment');
      });

      it('should make the same query if called multiple time (#4470)', async () => {
        const logs = [];
        const logging = function (log) {
          logs.push(log);
        };

        await current.sync({ force: true });

        const post = await Post.create();
        await post.createComment({
          title: 'I am a post comment'
        });

        await Post.scope('withComments').findAll({
          logging
        });

        await Post.scope('withComments').findAll({
          logging
        });

        expect(logs[0]).to.equal(logs[1]);
      });
      it('should created included association with scope values', async () => {
        await current.sync({ force: true });

        const created = await Post.create(
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
            include: [{ model: Comment, as: 'comments' }]
          }
        );

        for (const comment of created.comments) {
          expect(comment.get('commentable')).to.equal('post');
        }

        const post = await Post.scope('withComments').findByPk(created.id);

        const comments = await post.getComments();
        for (const comment of comments) {
          expect(comment.get('commentable')).to.equal('post');
        }
      });
    });

    if (Support.getTestDialect() !== 'sqlite') {
      describe('N:M', () => {
        describe('on the target', () => {
          beforeEach(() => {
            Post = current.define('post', {});
            Tag = current.define('tag', {
              type: DataTypes.STRING
            });
            PostTag = current.define('post_tag');

            Tag.belongsToMany(Post, { through: PostTag });
            Post.belongsToMany(Tag, { as: 'categories', through: PostTag, scope: { type: 'category' } });
            Post.belongsToMany(Tag, { as: 'tags', through: PostTag, scope: { type: 'tag' } });
          });

          it('should create, find and include associations with scope values', async () => {
            await Promise.all([Post.sync({ force: true }), Tag.sync({ force: true })]);
            await PostTag.sync({ force: true });

            const [postA, postB, postC, categoryA, categoryB, tagA, tagB] = await Promise.all([
              Post.create(),
              Post.create(),
              Post.create(),
              Tag.create({ type: 'category' }),
              Tag.create({ type: 'category' }),
              Tag.create({ type: 'tag' }),
              Tag.create({ type: 'tag' })
            ]);

            // Sequential, and each post's `set` before its other alias: `set` deletes every
            // through-row for the post that is not in the new list, and it filters that query by
            // the *through* scope -- never by the target-side scope these aliases use. Adding the
            // sibling alias first would leave a row that the `set` then deletes.
            await postA.addCategory(categoryA);
            await postA.createTag();

            await postB.setCategories([categoryB]);
            await postB.addTag(tagA);

            await postC.setTags([tagB]);
            await postC.createCategory();

            const [postACategories, postATags, postBCategories, postBTags, postCCategories, postCTags] =
              await Promise.all([
                postA.getCategories(),
                postA.getTags(),
                postB.getCategories(),
                postB.getTags(),
                postC.getCategories(),
                postC.getTags()
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
              Post.findOne({
                where: {
                  id: postA.get('id')
                },
                include: [
                  { model: Tag, as: 'tags' },
                  { model: Tag, as: 'categories' }
                ]
              }),
              Post.findOne({
                where: {
                  id: postB.get('id')
                },
                include: [
                  { model: Tag, as: 'tags' },
                  { model: Tag, as: 'categories' }
                ]
              }),
              Post.findOne({
                where: {
                  id: postC.get('id')
                },
                include: [
                  { model: Tag, as: 'tags' },
                  { model: Tag, as: 'categories' }
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
          beforeEach(() => {
            Post = current.define('post', {});
            Image = current.define('image', {});
            Question = current.define('question', {});

            ItemTag = current.define('item_tag', {
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
            Tag = current.define('tag', {
              name: DataTypes.STRING
            });

            Post.belongsToMany(Tag, {
              through: {
                model: ItemTag,
                unique: false,
                scope: {
                  taggable: 'post'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            Tag.belongsToMany(Post, {
              through: {
                model: ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });

            Image.belongsToMany(Tag, {
              through: {
                model: ItemTag,
                unique: false,
                scope: {
                  taggable: 'image'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            Tag.belongsToMany(Image, {
              through: {
                model: ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });

            Question.belongsToMany(Tag, {
              through: {
                model: ItemTag,
                unique: false,
                scope: {
                  taggable: 'question'
                }
              },
              foreignKey: 'taggable_id',
              constraints: false
            });
            Tag.belongsToMany(Question, {
              through: {
                model: ItemTag,
                unique: false
              },
              foreignKey: 'tag_id'
            });
          });

          it('should create, find and include associations with scope values', async () => {
            await Promise.all([
              Post.sync({ force: true }),
              Image.sync({ force: true }),
              Question.sync({ force: true }),
              Tag.sync({ force: true })
            ]);

            await ItemTag.sync({ force: true });

            const [post, image, question, tagA, tagB, tagC] = await Promise.all([
              Post.create(),
              Image.create(),
              Question.create(),
              Tag.create({ name: 'tagA' }),
              Tag.create({ name: 'tagB' }),
              Tag.create({ name: 'tagC' })
            ]);

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
              post.getTags(),
              image.getTags(),
              question.getTags()
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
              Post.findOne({
                where: {},
                include: [Tag]
              }),
              Image.findOne({
                where: {},
                include: [Tag]
              }),
              Question.findOne({
                where: {},
                include: [Tag]
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
