import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../../index.js';
import Support from '../support.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('sync', () => {
    beforeEach(() => {
      const testSync = current.define('testSync', {
        dummy: Sequelize.STRING
      });
      return testSync.drop();
    });

    it('should remove a column if it exists in the databases schema but not the model', async () => {
      const User = current.define('testSync', {
        name: Sequelize.STRING,
        age: Sequelize.INTEGER
      });

      await current.sync();

      current.define('testSync', {
        name: Sequelize.STRING
      });

      await current.sync({ alter: true });

      const data = await User.describe();
      expect(data).to.not.have.ownProperty('age');
      expect(data).to.have.ownProperty('name');
    });

    it('should add a column if it exists in the model but not the database', async () => {
      const testSync = current.define('testSync', {
        name: Sequelize.STRING
      });

      await current.sync();

      current.define('testSync', {
        name: Sequelize.STRING,
        age: Sequelize.INTEGER
      });

      await current.sync({ alter: true });

      const data = await testSync.describe();
      expect(data).to.have.ownProperty('age');
    });

    it('should change a column if it exists in the model but is different in the database', async () => {
      const testSync = current.define('testSync', {
        name: Sequelize.STRING,
        age: Sequelize.INTEGER
      });

      await current.sync();

      current.define('testSync', {
        name: Sequelize.STRING,
        age: Sequelize.STRING
      });

      await current.sync({ alter: true });

      const data = await testSync.describe();
      expect(data).to.have.ownProperty('age');
      expect(data.age.type).to.have.string('CHAR'); // CHARACTER VARYING, VARCHAR(n)
    });

    it('should not alter table if data type does not change', async () => {
      const testSync = current.define('testSync', {
        name: Sequelize.STRING,
        age: Sequelize.STRING
      });

      await current.sync();
      await testSync.create({ name: 'test', age: '1' });
      await current.sync({ alter: true });

      const data = await testSync.findOne();
      expect(data.dataValues.name).to.eql('test');
      expect(data.dataValues.age).to.eql('1');
    });

    it('should properly create composite index without affecting individual fields', async () => {
      const testSync = current.define(
        'testSync',
        {
          name: Sequelize.STRING,
          age: Sequelize.STRING
        },
        { indexes: [{ unique: true, fields: ['name', 'age'] }] }
      );

      await current.sync();

      await testSync.create({ name: 'test' });
      await testSync.create({ name: 'test2' });
      await testSync.create({ name: 'test3' });
      await testSync.create({ age: '1' });
      await testSync.create({ age: '2' });
      await testSync.create({ name: 'test', age: '1' });
      await testSync.create({ name: 'test', age: '2' });
      await testSync.create({ name: 'test2', age: '2' });
      await testSync.create({ name: 'test3', age: '2' });

      const data = await testSync.create({ name: 'test3', age: '1' });
      expect(data.dataValues.name).to.eql('test3');
      expect(data.dataValues.age).to.eql('1');
    });

    it('should properly create composite index that fails on constraint violation', async () => {
      const testSync = current.define(
        'testSync',
        {
          name: Sequelize.STRING,
          age: Sequelize.STRING
        },
        { indexes: [{ unique: true, fields: ['name', 'age'] }] }
      );

      await current.sync();
      await testSync.create({ name: 'test', age: '1' });

      const error = await expect(testSync.create({ name: 'test', age: '1' })).to.be.rejected;
      expect(error).to.be.ok;
    });

    it('should properly alter tables when there are foreign keys', async () => {
      const foreignKeyTestSyncA = current.define('foreignKeyTestSyncA', {
        dummy: Sequelize.STRING
      });

      const foreignKeyTestSyncB = current.define('foreignKeyTestSyncB', {
        dummy: Sequelize.STRING
      });

      foreignKeyTestSyncA.hasMany(foreignKeyTestSyncB);
      foreignKeyTestSyncB.belongsTo(foreignKeyTestSyncA);

      await current.sync({ alter: true });
      await current.sync({ alter: true });
    });

    describe('indexes', () => {
      describe('with alter:true', () => {
        it('should not duplicate named indexes after multiple sync calls', async () => {
          const User = current.define(
            'testSync',
            {
              email: {
                type: Sequelize.STRING
              },
              phone: {
                type: Sequelize.STRING
              },
              mobile: {
                type: Sequelize.STRING
              }
            },
            {
              indexes: [
                { name: 'another_index_email_mobile', fields: ['email', 'mobile'] },
                { name: 'another_index_phone_mobile', fields: ['phone', 'mobile'], unique: true },
                { name: 'another_index_email', fields: ['email'] },
                { name: 'another_index_mobile', fields: ['mobile'] }
              ]
            }
          );

          await User.sync({ sync: true });
          await User.sync({ alter: true });
          await User.sync({ alter: true });
          await User.sync({ alter: true });

          const results = await current.getQueryInterface().showIndex(User.getTableName());

          expect(results).to.have.length(4 + 1);
          expect(results.filter((r) => r.primary)).to.have.length(1);

          expect(results.filter((r) => r.name === 'another_index_email_mobile')).to.have.length(1);
          expect(results.filter((r) => r.name === 'another_index_phone_mobile')).to.have.length(1);
          expect(results.filter((r) => r.name === 'another_index_email')).to.have.length(1);
          expect(results.filter((r) => r.name === 'another_index_mobile')).to.have.length(1);
        });

        it('should not duplicate unnamed indexes after multiple sync calls', async () => {
          const User = current.define(
            'testSync',
            {
              email: {
                type: Sequelize.STRING
              },
              phone: {
                type: Sequelize.STRING
              },
              mobile: {
                type: Sequelize.STRING
              }
            },
            {
              indexes: [
                { fields: ['email', 'mobile'] },
                { fields: ['phone', 'mobile'], unique: true },
                { fields: ['email'] },
                { fields: ['mobile'] }
              ]
            }
          );

          await User.sync({ sync: true });
          await User.sync({ alter: true });
          await User.sync({ alter: true });
          await User.sync({ alter: true });

          const results = await current.getQueryInterface().showIndex(User.getTableName());

          expect(results).to.have.length(4 + 1);
          expect(results.filter((r) => r.primary)).to.have.length(1);
        });
      });

      it('should create only one unique index for unique:true column', async () => {
        const User = current.define('testSync', {
          email: {
            type: Sequelize.STRING,
            unique: true
          }
        });

        await User.sync({ force: true });

        const results = await current.getQueryInterface().showIndex(User.getTableName());

        expect(results).to.have.length(2);
        expect(results.filter((r) => r.primary)).to.have.length(1);

        expect(results.filter((r) => r.unique === true && r.primary === false)).to.have.length(1);
      });

      it('should create only one unique index for unique:true columns', async () => {
        const User = current.define('testSync', {
          email: {
            type: Sequelize.STRING,
            unique: true
          },
          phone: {
            type: Sequelize.STRING,
            unique: true
          }
        });

        await User.sync({ force: true });

        const results = await current.getQueryInterface().showIndex(User.getTableName());

        expect(results).to.have.length(3);
        expect(results.filter((r) => r.primary)).to.have.length(1);

        expect(results.filter((r) => r.unique === true && r.primary === false)).to.have.length(2);
      });

      it('should create only one unique index for unique:true columns taking care of options.indexes', async () => {
        const User = current.define(
          'testSync',
          {
            email: {
              type: Sequelize.STRING,
              unique: true
            },
            phone: {
              type: Sequelize.STRING,
              unique: true
            }
          },
          {
            indexes: [{ name: 'wow_my_index', fields: ['email', 'phone'], unique: true }]
          }
        );

        await User.sync({ force: true });

        const results = await current.getQueryInterface().showIndex(User.getTableName());

        expect(results).to.have.length(4);
        expect(results.filter((r) => r.primary)).to.have.length(1);

        expect(results.filter((r) => r.unique === true && r.primary === false)).to.have.length(3);
        expect(results.filter((r) => r.name === 'wow_my_index')).to.have.length(1);
      });

      it('should create only one unique index for unique:name column', async () => {
        const User = current.define('testSync', {
          email: {
            type: Sequelize.STRING,
            unique: 'wow_my_index'
          }
        });

        await User.sync({ force: true });

        const results = await current.getQueryInterface().showIndex(User.getTableName());

        expect(results).to.have.length(2);
        expect(results.filter((r) => r.primary)).to.have.length(1);

        expect(results.filter((r) => r.unique === true && r.primary === false)).to.have.length(1);
      });

      it('should create only one unique index for unique:name columns', async () => {
        const User = current.define('testSync', {
          email: {
            type: Sequelize.STRING,
            unique: 'wow_my_index'
          },
          phone: {
            type: Sequelize.STRING,
            unique: 'wow_my_index'
          }
        });

        await User.sync({ force: true });

        const results = await current.getQueryInterface().showIndex(User.getTableName());

        expect(results).to.have.length(2);
        expect(results.filter((r) => r.primary)).to.have.length(1);

        expect(results.filter((r) => r.unique === true && r.primary === false)).to.have.length(1);
      });
    });
  });
});
