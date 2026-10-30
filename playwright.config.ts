import { defineConfig, devices } from "@playwright/test";
import { ownerState } from "./e2e/passkeys";

const port = 4173;
// The sign-in tests start from a first launch, so they get a server of their own.
const signInPort = 4174;

// Use a pre-installed Chromium when one is provided (e.g. in containers without `playwright install`).
const launchOptions = { executablePath: process.env.CHROMIUM_PATH || undefined };

/** Serves the production build, exactly like the Docker image does, with a fresh database each run. */
const server = (serverPort: number) => ({
  command: "npm start",
  url: `http://localhost:${serverPort}/api/health`,
  reuseExistingServer: false,
  env: { PORT: String(serverPort), DATABASE_FILE: ":memory:" },
});

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
      // Registers the owner's passkey once; the app's tests then start signed in.
      name: "owner",
      testMatch: /owner\.setup\.ts/,
      use: { ...devices["Pixel 7"], launchOptions },
    },
    {
      name: "android-chrome",
      testIgnore: /sign-in\.spec\.ts/,
      dependencies: ["owner"],
      use: { ...devices["Pixel 7"], launchOptions, storageState: ownerState },
    },
    {
      name: "sign-in",
      testMatch: /sign-in\.spec\.ts/,
      use: { ...devices["Pixel 7"], launchOptions, baseURL: `http://localhost:${signInPort}` },
    },
  ],
  webServer: [server(port), server(signInPort)],
});
