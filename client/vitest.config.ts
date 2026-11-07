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
    },
  },
});
