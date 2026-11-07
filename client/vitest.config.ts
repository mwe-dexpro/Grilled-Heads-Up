import { defineConfig } from "vitest/config";

// A fixed device time zone with daylight saving, so day and time-zone tests mean the same on every machine.
// Set here, in the main process, so every test worker (forked or threaded, also under Stryker) inherits it.
process.env["TZ"] = "Europe/Berlin";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    // A committed `.only` fails the run, here and in CI.
    allowOnly: false,
    coverage: {
      provider: "v8",
      // Every source file counts, also those no test loads. Components are measured too, although only the e2e tests reach them.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.ts", "src/**/testing/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      // The measured values, rounded down. They only go up: raise them when a change lifts the coverage, never lower them.
      // Measured and reported for every file, but gated where unit tests are the way to test: the `.ts` files, hooks left out
      // (React components and hooks are reached by the end-to-end tests only; there is no React unit-test setup). So a new
      // component cannot turn the unit job red, and a new untested domain module does. The whole-client figures stay in the
      // summary: 45.0% lines, 50.5% branches, 43.8% functions, 46.0% statements when this gate was set.
      thresholds: { "src/**/!(use[A-Z]*).ts": { lines: 99, branches: 98, functions: 99, statements: 99 } },
    },
  },
});
