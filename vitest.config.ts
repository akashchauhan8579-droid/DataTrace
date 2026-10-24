import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'ai/**/*.test.ts',
      'backend/**/*.test.ts',
      'contracts/**/*.test.ts',
      'tests/**/*.test.ts',
      'verification/**/*.test.ts',
    ],
  },
});
