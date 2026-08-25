import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

// Vitest's default sequencer orders files by cached duration and runs previously-failed files first,
// so the order changes from run to run. These tests share one database and one `Support.sequelize`,
// which makes them order-sensitive, so pin the order to the alphabetical one mocha's glob produced.
class AlphabeticalSequencer extends BaseSequencer {
  async sort(files) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0));
  }
}

export default defineConfig({
  test: {
    sequence: { sequencer: AlphabeticalSequencer },
    globals: false,
    include: ['test/integration/**/*.test.js'],
    setupFiles: ['test/integration/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // The whole suite shares one database and `test/integration/support.js` drops every table in a
    // root `beforeEach`, so two files can never be in flight at once. A single fork with the module
    // registry left intact is also what the suite was written against under mocha: one process, one
    // `Support.sequelize`, one connection pool. Re-isolating would re-run `test/support.js` per file
    // and leak a pool plus two `process.on` listeners each time.
    pool: 'forks',
    // `fileParallelism: false` pins this to one worker, and one worker plus `isolate: false` is what
    // makes vitest hand the whole file list to a single long-lived fork.
    fileParallelism: false,
    isolate: false
  }
});
