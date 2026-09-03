import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/unit/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // nothing here touches a database or registers process-level listeners, so worker threads are safe
    pool: 'threads',
    fsModuleCache: true
  }
});
