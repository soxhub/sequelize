import { beforeEach, afterEach } from 'vitest';
import Support from '../support.js';

// Registered as `setupFiles`, not imported by the test files. Vitest invalidates and re-runs setup
// files once per test file, so these hooks attach to every file the way a mocha root hook did.
// Importing this module instead would register the hooks against a single file, because the suite
// runs non-isolated and would evaluate it only once.

beforeEach(() => {
  Support.sequelize.test.trackRunningQueries();
  return Support.clearDatabase(Support.sequelize);
});

afterEach(({ task }) => {
  try {
    Support.sequelize.test.verifyNoRunningQueries();
  } catch (err) {
    err.message += ' in ' + task.fullName;
    throw err;
  }
});
