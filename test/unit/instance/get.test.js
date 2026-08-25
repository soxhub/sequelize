import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Instance'), () => {
  describe('get', () => {
    let getSpy, User;

    beforeEach(() => {
      getSpy = sinon.spy();
      User = current.define('User', {
        name: {
          type: DataTypes.STRING,
          get: getSpy
        }
      });
    });

    it('invokes getter if raw: false', () => {
      User.build().get('name');

      expect(getSpy.called, 'getSpy should have been called').to.be.true;
    });

    it('does not invoke getter if raw: true', () => {
      expect(getSpy.called, 'getSpy should not have been called').to.be.false;
    });
  });
});
