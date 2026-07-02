import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["src/test/setupEnv.ts"],
    include: [
      "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "src/**/__test__/**/*Test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
