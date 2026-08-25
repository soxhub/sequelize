import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['test/unit/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
