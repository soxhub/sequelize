import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Instance'), () => {
  describe('changed', () => {
    let User;

    beforeEach(() => {
      User = current.define('User', {
        name: DataTypes.STRING,
        birthday: DataTypes.DATE,
        yoj: DataTypes.DATEONLY,
        meta: DataTypes.JSON
      });
    });

    it('should return true for changed primitive', () => {
      const user = User.build(
        {
          name: 'a'
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      expect(user.changed('meta')).to.equal(false);
      user.set('name', 'b');
      user.set('meta', null);
      expect(user.changed('name')).to.equal(true);
      expect(user.changed('meta')).to.equal(true);
    });

    it('should return falsy for unchanged primitive', () => {
      const user = User.build(
        {
          name: 'a',
          meta: null
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('name', 'a');
      user.set('meta', null);
      expect(user.changed('name')).to.equal(false);
      expect(user.changed('meta')).to.equal(false);
    });

    it('should return true for multiple changed values', () => {
      const user = User.build(
        {
          name: 'a',
          birthday: new Date(new Date() - 10)
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('name', 'b');
      user.set('birthday', new Date());
      expect(user.changed('name')).to.equal(true);
      expect(user.changed('birthday')).to.equal(true);
    });

    it('should return false for two instances with same value', () => {
      const milliseconds = 1436921941088;
      const firstDate = new Date(milliseconds);
      const secondDate = new Date(milliseconds);

      const user = User.build(
        {
          birthday: firstDate
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('birthday', secondDate);
      expect(user.changed('birthday')).to.equal(false);
    });

    it('should return true for changed JSON with same object', () => {
      const user = User.build(
        {
          meta: {
            city: 'Copenhagen'
          }
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      const meta = user.get('meta');
      meta.city = 'Stockholm';

      user.set('meta', meta);
      expect(user.changed('meta')).to.equal(true);
    });

    it('should return true for JSON dot.separated key with changed values', () => {
      const user = User.build(
        {
          meta: {
            city: 'Stockholm'
          }
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('meta.city', 'Gothenburg');
      expect(user.changed('meta')).to.equal(true);
    });

    it('should return false for JSON dot.separated key with same value', () => {
      const user = User.build(
        {
          meta: {
            city: 'Gothenburg'
          }
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('meta.city', 'Gothenburg');
      expect(user.changed('meta')).to.equal(false);
    });

    it('should return true for JSON dot.separated key with object', () => {
      const user = User.build(
        {
          meta: {
            address: { street: 'Main street', number: '40' }
          }
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('meta.address', { street: 'Second street', number: '1' });
      expect(user.changed('meta')).to.equal(true);
    });

    it('should return false for JSON dot.separated key with same object', () => {
      const user = User.build(
        {
          meta: {
            address: { street: 'Main street', number: '40' }
          }
        },
        {
          isNewRecord: false,
          raw: true
        }
      );

      user.set('meta.address', { street: 'Main street', number: '40' });
      expect(user.changed('meta')).to.equal(false);
    });

    it('should return false when changed from null to null', () => {
      const attributes = {};
      for (const attr of Object.keys(User.rawAttributes)) {
        attributes[attr] = null;
      }

      const user = User.build(attributes, {
        isNewRecord: false,
        raw: true
      });

      for (const attr of Object.keys(User.rawAttributes)) {
        user.set(attr, null);
      }

      for (const attr of Object.keys(User.rawAttributes)) {
        expect(user.changed(attr), `${attr} is not changed`).to.equal(false);
      }
    });
  });
});
