import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import Sequelize from '../../../index.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('associations'), () => {
  describe('Test options.foreignKey', () => {
    let A, B, C;

    beforeEach(() => {
      A = current.define('A', {
        id: {
          type: DataTypes.CHAR(20),
          primaryKey: true
        }
      });
      B = current.define('B', {
        id: {
          type: Sequelize.CHAR(20),
          primaryKey: true
        }
      });
      C = current.define('C', {});
    });

    it('should not be overwritten for belongsTo', () => {
      const reqValidForeignKey = { foreignKey: { allowNull: false } };
      A.belongsTo(B, reqValidForeignKey);
      A.belongsTo(C, reqValidForeignKey);
      expect(A.rawAttributes.CId.type).to.deep.equal(C.rawAttributes.id.type);
    });
    it('should not be overwritten for belongsToMany', () => {
      const reqValidForeignKey = { foreignKey: { allowNull: false }, through: 'ABBridge' };
      B.belongsToMany(A, reqValidForeignKey);
      A.belongsTo(C, reqValidForeignKey);
      expect(A.rawAttributes.CId.type).to.deep.equal(C.rawAttributes.id.type);
    });
    it('should not be overwritten for hasOne', () => {
      const reqValidForeignKey = { foreignKey: { allowNull: false } };
      B.hasOne(A, reqValidForeignKey);
      A.belongsTo(C, reqValidForeignKey);
      expect(A.rawAttributes.CId.type).to.deep.equal(C.rawAttributes.id.type);
    });
    it('should not be overwritten for hasMany', () => {
      const reqValidForeignKey = { foreignKey: { allowNull: false } };
      B.hasMany(A, reqValidForeignKey);
      A.belongsTo(C, reqValidForeignKey);
      expect(A.rawAttributes.CId.type).to.deep.equal(C.rawAttributes.id.type);
    });
  });
});
