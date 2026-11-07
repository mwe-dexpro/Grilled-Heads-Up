import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // A committed `.only` fails the run, here and in CI.
    allowOnly: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "src/**/testing/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      // The measured values, rounded down. They only go up: raise them when a change lifts the coverage, never lower them.
      thresholds: { lines: 93, branches: 87, functions: 92, statements: 93 },
    },
  },
});
