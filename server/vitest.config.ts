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
      include: ["src/**/*.ts"],
      exclude: [
        "src/test/**",
        "src/**/*.d.ts",
        // Composition roots and process entrypoints: wiring only, exercised in
        // production by real Firebase/Discord/ngrok connections.
        "src/app/index.ts",
        "src/app/bootstrap.ts",
        "src/app/container/**",
        "src/shared/config/firebase.ts",
        "src/docs/**",
        "src/deploy-commands.ts",
      ],
      // A few points below the actual current coverage (~98/94/97/98 at the
      // time this was added), not an arbitrary round number - previously
      // there was no gate at all, so `npm run coverage` in CI was just an
      // HTML report generator that couldn't fail a PR no matter how much
      // coverage regressed. Set close enough to today's numbers to catch a
      // real regression, with enough slack that one reasonable new
      // defensive branch doesn't turn into a fire drill.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 93,
        lines: 95,
      },
    },
  },
});
