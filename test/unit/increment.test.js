import { describe, it, expect } from 'vitest';
import Support from '../support.js';

const current = Support.sequelize;
const Sequelize = Support.Sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('increment', () => {
    describe('options tests', () => {
      const Model = current.define('User', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true
        },
        count: Sequelize.BIGINT
      });

      it('should reject if options are missing', () => {
        return expect(Model.increment(['id', 'count'])).rejects.toThrow(
          'Missing where attribute in the options parameter'
        );
      });

      it('should reject if options.where are missing', () => {
        return expect(Model.increment(['id', 'count'], { by: 10 })).rejects.toThrow(
          'Missing where attribute in the options parameter'
        );
      });
    });
  });
});
