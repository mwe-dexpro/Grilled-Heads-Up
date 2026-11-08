import { defineConfig } from "vitest/config";

const floors = { lines: 98, branches: 92, functions: 96, statements: 98 };

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
      // The floors for every single file (`perFile`), not for the sum: a new module that no test reaches fails whatever its
      // size or folder. They are the measured values of the file with the least, rounded down (`cli.ts`: lines 98.2%, functions
      // 96.2%; `checkSkips.ts`: branches 92.3%), and only go up: raise them when a change lifts the weakest file, never lower them.
      // Gated on every module, in `src/` and its folders, but not the command-line wrappers in `src/bin/`: they are one line each
      // and are run as processes by `bin.test.ts`, which coverage cannot see, so a new wrapper does not move the figures.
      thresholds: { perFile: true, "src/*.ts": floors, "src/!(bin)/**/*.ts": floors },
    },
  },
});
