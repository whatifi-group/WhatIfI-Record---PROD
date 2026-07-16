import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["scripts/**/*.test.mjs"],
  },
});

