import { defineConfig } from 'vitest/config';

// Browser end-to-end tests. Needs `npm run build` and `npx playwright install chromium` first.
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
