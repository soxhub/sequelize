import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import sinon from 'sinon';
import Support from './support.js';

const dialect = Support.getTestDialect();
const current = Support.sequelize;

describe('Transaction', () => {
  let queryStub, stubConnection, stubRelease;

  beforeAll(() => {
    queryStub = sinon.stub(current, 'query').returns(Promise.resolve({}));

    stubConnection = sinon.stub(current.connectionManager, 'getConnection').returns(
      Promise.resolve({
        uuid: 'ssfdjd-434fd-43dfg23-2d',
        close() {}
      })
    );

    stubRelease = sinon.stub(current.connectionManager, 'releaseConnection').returns(Promise.resolve());
  });

  beforeEach(() => {
    queryStub.resetHistory();
    stubConnection.resetHistory();
    stubRelease.resetHistory();
  });

  afterAll(() => {
    queryStub.restore();
    stubConnection.restore();
  });

  it('should run auto commit query only when needed', () => {
    const expectations = {
      all: ['START TRANSACTION;']
    };
    return current.transaction(() => {
      expect(queryStub.args.map((arg) => arg[0])).to.deep.equal(expectations[dialect] || expectations.all);
      return Promise.resolve();
    });
  });
});
