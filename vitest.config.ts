import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // integration tests share one headless browser — run files serially
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
