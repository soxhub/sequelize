import { beforeEach, afterEach } from 'mocha';
import Support from '../support.js';

beforeEach(() => {
  Support.sequelize.test.trackRunningQueries();
  return Support.clearDatabase(Support.sequelize);
});

// Stays a `function` so `this.currentTest` still resolves to the mocha context.
afterEach(function () {
  try {
    Support.sequelize.test.verifyNoRunningQueries();
  } catch (err) {
    err.message += ' in ' + this.currentTest.fullTitle();
    throw err;
  }
});

export default Support;
