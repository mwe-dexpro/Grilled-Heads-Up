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
      exclude: ["**/*.test.ts", "src/fixtures/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      // The measured values, rounded down. They only go up: raise them when a change lifts the coverage, never lower them.
      // Gated on the modules (`src/*.ts`); the command-line wrappers in `src/bin/` are one line each and are run as processes
      // by `bin.test.ts`, which coverage cannot see, so a new wrapper does not move the figures.
      thresholds: { "src/*.ts": { lines: 99, branches: 98, functions: 98, statements: 99 } },
    },
  },
});
