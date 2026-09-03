import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    globalSetup: ["./src/test/globalSetup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
