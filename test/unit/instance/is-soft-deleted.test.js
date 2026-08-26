import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import moment from 'moment';

const current = Support.sequelize;

const Sequelize = Support.Sequelize;

describe(Support.getTestDialectTeaser('Instance'), () => {
  describe('isSoftDeleted', () => {
    let paranoidUser, user;

    beforeEach(() => {
      const User = current.define('User', {
        name: DataTypes.STRING,
        birthdate: DataTypes.DATE,
        meta: DataTypes.JSON,
        deletedAt: {
          type: Sequelize.DATE
        }
      });

      const ParanoidUser = current.define(
        'User',
        {
          name: DataTypes.STRING,
          birthdate: DataTypes.DATE,
          meta: DataTypes.JSON,
          deletedAt: {
            type: Sequelize.DATE
          }
        },
        {
          paranoid: true
        }
      );

      paranoidUser = ParanoidUser.build(
        {
          name: 'a'
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user = User.build(
        {
          name: 'a'
        },
        {
          isNewRecord: false,
          raw: true
        }
      );
    });

    it('should not throw if paranoid is set to true', () => {
      expect(() => {
        paranoidUser.isSoftDeleted();
      }).to.not.throw();
    });

    it('should throw if paranoid is set to false', () => {
      expect(() => {
        user.isSoftDeleted();
      }).to.throw('Model is not paranoid');
    });

    it('should return false if the soft-delete property is the same as ' + 'the default value', () => {
      paranoidUser.setDataValue('deletedAt', null);
      expect(paranoidUser.isSoftDeleted()).to.be.false;
    });

    it('should return false if the soft-delete property is set to a date in ' + 'the future', () => {
      paranoidUser.setDataValue('deletedAt', moment().add(5, 'days').format());
      expect(paranoidUser.isSoftDeleted()).to.be.false;
    });

    it('should return true if the soft-delete property is set to a date ' + 'before now', () => {
      paranoidUser.setDataValue('deletedAt', moment().subtract(5, 'days').format());
      expect(paranoidUser.isSoftDeleted()).to.be.true;
    });
  });
});
