import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 15_000,
  },
});
