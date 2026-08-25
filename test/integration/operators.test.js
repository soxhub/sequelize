import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';
import DataTypes from '../../lib/data-types.js';

const current = Support.sequelize;

const Op = Sequelize.Op;

describe(Support.getTestDialectTeaser('Operators'), () => {
  describe('REGEXP', () => {
    let User;

    beforeEach(() => {
      User = current.define(
        'user',
        {
          id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            field: 'userId'
          },
          name: {
            type: DataTypes.STRING,
            field: 'full_name'
          }
        },
        {
          tableName: 'users',
          timestamps: false
        }
      );

      return current.getQueryInterface().createTable('users', {
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true
        },
        full_name: {
          type: DataTypes.STRING
        }
      });
    });

    describe('case sensitive', () => {
      it('should work with a regexp where', async () => {
        await User.create({
          name: 'Foobar'
        });

        const user = await User.findOne({
          where: {
            name: {
              [Op.regexp]: '^Foo'
            }
          }
        });

        expect(user).to.be.ok;
      });

      it('should work with a not regexp where', async () => {
        await User.create({
          name: 'Foobar'
        });

        const user = await User.findOne({
          where: {
            name: {
              [Op.notRegexp]: '^Foo'
            }
          }
        });

        expect(user).to.not.be.ok;
      });

      it('should properly escape regular expressions', async () => {
        await User.bulkCreate([
          {
            name: 'John'
          },
          {
            name: 'Bob'
          }
        ]);

        await User.findAll({
          where: {
            name: {
              [Op.notRegexp]: "Bob'; drop table users --"
            }
          }
        });

        await User.findAll({
          where: {
            name: {
              [Op.regexp]: "Bob'; drop table users --"
            }
          }
        });

        const users = await User.findAll();
        expect(users).length(2);
      });
    });

    describe('case insensitive', () => {
      it('should work with a case-insensitive regexp where', async () => {
        await User.create({
          name: 'Foobar'
        });

        const user = await User.findOne({
          where: {
            name: {
              [Op.iRegexp]: '^foo'
            }
          }
        });

        expect(user).to.be.ok;
      });

      it('should work with a case-insensitive not regexp where', async () => {
        await User.create({
          name: 'Foobar'
        });

        const user = await User.findOne({
          where: {
            name: {
              [Op.notIRegexp]: '^foo'
            }
          }
        });

        expect(user).to.not.be.ok;
      });

      it('should properly escape regular expressions', async () => {
        await User.bulkCreate([
          {
            name: 'John'
          },
          {
            name: 'Bob'
          }
        ]);

        await User.findAll({
          where: {
            name: {
              [Op.iRegexp]: "Bob'; drop table users --"
            }
          }
        });

        await User.findAll({
          where: {
            name: {
              [Op.notIRegexp]: "Bob'; drop table users --"
            }
          }
        });

        const users = await User.findAll();
        expect(users).length(2);
      });
    });
  });
});
