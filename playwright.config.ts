import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 7"],
        // Use a pre-installed Chromium when one is provided (e.g. in containers without `playwright install`).
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    // Serves the production build, exactly like the Docker image does.
    command: "npm start",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      DATABASE_FILE: "test-results/e2e.sqlite",
    },
  },
});
