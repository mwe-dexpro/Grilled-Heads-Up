import { defineConfig, devices } from "@playwright/test";
import { ownerState, syncOwnerState } from "./e2e/passkeys";

const port = 4173;
// The sign-in tests start from a first launch, so they get a server of their own.
const signInPort = 4174;
// So do the sync tests: two devices share one owner there, and synced data would leak between parallel tests.
const syncPort = 4175;

// Use a pre-installed Chromium when one is provided (e.g. in containers without `playwright install`).
const chromiumPath = process.env["CHROMIUM_PATH"];
const launchOptions = chromiumPath !== undefined && chromiumPath !== "" ? { executablePath: chromiumPath } : {};
const onCI = (process.env["CI"] ?? "") !== "";

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
  forbidOnly: true,
  retries: 0,
  reporter: onCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Registers the owner's passkey once; the app's tests then start signed in.
      name: "owner",
      testMatch: /(^|\/)owner\.setup\.ts$/,
      use: { ...devices["Pixel 7"], launchOptions },
    },
    {
      name: "android-chrome",
      testIgnore: /(sign-in|sync)\.spec\.ts/,
      dependencies: ["owner"],
      use: { ...devices["Pixel 7"], launchOptions, storageState: ownerState },
    },
    {
      name: "sync-owner",
      testMatch: /sync-owner\.setup\.ts$/,
      use: { ...devices["Pixel 7"], launchOptions, baseURL: `http://localhost:${syncPort}` },
    },
    {
      name: "sync",
      testMatch: /sync\.spec\.ts/,
      dependencies: ["sync-owner"],
      use: { ...devices["Pixel 7"], launchOptions, baseURL: `http://localhost:${syncPort}`, storageState: syncOwnerState },
    },
    {
      name: "sign-in",
      testMatch: /sign-in\.spec\.ts/,
      use: { ...devices["Pixel 7"], launchOptions, baseURL: `http://localhost:${signInPort}` },
    },
  ],
  webServer: [server(port), server(signInPort), server(syncPort)],
});
