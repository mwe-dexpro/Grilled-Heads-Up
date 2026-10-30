import { defineConfig } from "vitest/config";

// A fixed device time zone with daylight saving, so day and time-zone tests mean the same on every machine.
// Set here, in the main process, so every test worker (forked or threaded, also under Stryker) inherits it.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
  },
});
