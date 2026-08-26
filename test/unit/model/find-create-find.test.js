import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { UniqueConstraintError } from '../../../lib/errors.js';
import Support from '../support.js';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('findCreateFind', () => {
    const Model = current.define('Model', {});
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should return the result of the first find call if not empty', async () => {
      const result = {},
        where = { prop: Math.random().toString() },
        findSpy = sandbox.stub(Model, 'findOne').returns(Promise.resolve(result));

      await expect(
        Model.findCreateFind({
          where
        })
      ).resolves.to.eql([result, false]);

      expect(findSpy.calledOnce).to.be.true;
      expect(findSpy.getCall(0).args[0].where).to.equal(where);
    });

    it('should create if first find call is empty', async () => {
      const result = {},
        where = { prop: Math.random().toString() },
        createSpy = sandbox.stub(Model, 'create').returns(Promise.resolve(result));

      sandbox.stub(Model, 'findOne').returns(Promise.resolve(null));

      await expect(
        Model.findCreateFind({
          where
        })
      ).resolves.to.eql([result, true]);

      expect(createSpy.calledWith(where), 'createSpy should have been called with expected arguments').to.be.true;
    });

    it('should do a second find if create failed do to unique constraint', async () => {
      const result = {},
        where = { prop: Math.random().toString() },
        findSpy = sandbox.stub(Model, 'findOne');

      sandbox.stub(Model, 'create').callsFake(() => {
        return Promise.reject(new UniqueConstraintError());
      });

      findSpy.onFirstCall().returns(Promise.resolve(null));
      findSpy.onSecondCall().returns(Promise.resolve(result));

      await expect(
        Model.findCreateFind({
          where
        })
      ).resolves.to.eql([result, false]);

      expect(findSpy.calledTwice).to.be.true;
      expect(findSpy.getCall(1).args[0].where).to.equal(where);
    });
  });
});
