import { randomUUID } from "node:crypto";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { syncOwnerState } from "./passkeys";

// These tests run on a server and an owner of their own (see playwright.config.ts); every test uses titles
// of its own, because the tests run in parallel and share the owner's data.

/** One of the Owner's devices: a phone-sized browser that is signed in as the sync owner. */
async function device(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL, storageState: syncOwnerState });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  return { page, context };
}

const uniqueTitle = (title: string) => `${title} ${randomUUID().slice(0, 8)}`;
/** The footer's sync line as it is shown, and the live region that announces it to screen readers. */
const syncStatus = (page: Page) => page.locator(".sync-status");
const announcement = (page: Page) => page.getByRole("status");

async function addTask(page: Page, title: string) {
  await page.getByRole("button", { name: "New Task" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Presses "Sync now" until `done` holds: a sync that started before the other device pushed may miss it. */
async function syncUntil(page: Page, done: (timeout: number) => Promise<void>) {
  await expect(async () => {
    await page.getByRole("button", { name: "Sync now" }).click();
    await done(1500);
  }).toPass({ timeout: 15_000 });
}

test("a Task added offline on one device shows on the other after it is back online and both sync", async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!);
  const desktop = await device(browser, baseURL!);
  const title = uniqueTitle("Added in airplane mode");
  // The desktop is up to date before the phone adds anything, so that not seeing the Task later means something.
  await desktop.page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(desktop.page)).toContainText(/^Synced/);

  await phone.context.setOffline(true);
  const failedPushes: string[] = [];
  phone.page.on("requestfailed", (request) => request.url().includes("/api/sync/push") && failedPushes.push(request.url()));
  await addTask(phone.page, title);
  await phone.page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(phone.page)).toContainText("Offline");
  // The Task also armed the sync that follows a change by 2 s. Let it run, and fail, while the phone is still
  // offline (the second failed push): otherwise it would run after the reconnect and do the work the test
  // wants to see done by the browser's "online" event.
  await expect.poll(() => failedPushes.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await desktop.page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(desktop.page)).toContainText(/^Synced/);
  await expect(desktop.page.getByText(title)).toBeHidden();

  // Nobody presses Sync now on the phone, and no timer is left to run it (the next is a minute away): only coming
  // back online can start this sync.
  await phone.context.setOffline(false);
  await expect(syncStatus(phone.page)).toHaveText(/^Synced/);
  await syncUntil(desktop.page, (timeout) => expect(desktop.page.getByText(title)).toBeVisible({ timeout }));
});

test("Completing a Task on one device reaches the other", async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!);
  const desktop = await device(browser, baseURL!);
  const title = uniqueTitle("Book the table");
  await addTask(phone.page, title);
  await phone.page.getByRole("button", { name: "Sync now" }).click();
  await syncUntil(desktop.page, (timeout) => expect(desktop.page.getByText(title)).toBeVisible({ timeout }));

  await desktop.page.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await expect(desktop.page.getByRole("checkbox", { name: `Complete ${title}` })).toBeChecked();
  await desktop.page.getByRole("button", { name: "Sync now" }).click();

  await syncUntil(phone.page, (timeout) => expect(phone.page.getByRole("checkbox", { name: `Complete ${title}` })).toBeChecked({ timeout }));
});

test("the footer shows when the last sync happened, also after a reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(page)).toHaveText(/^Synced \d{1,2}:\d{2}/);
  const synced = (await syncStatus(page).textContent())!.replace("Synced ", "");

  // Reload with sync blocked, so the line can only show what the device remembered.
  await page.route("**/api/sync/**", (route) => route.abort());
  await page.reload();
  await expect(syncStatus(page)).toHaveText(`Offline · last synced ${synced}`);
});

test("a screen reader hears the sync line when it means something new, not at every background sync", async ({ page }) => {
  await page.goto("/");
  await expect(syncStatus(page)).toHaveText(/^Synced/);
  // The background sync that ran at start has set the time; nothing was announced for it.
  await expect(announcement(page)).toHaveText("");

  await page.getByRole("button", { name: "Sync now" }).click();

  await expect(announcement(page)).toHaveText(/^Synced/);
});

test("when the session has expired, the next sync leads to the sign-in screen and keeps the data", async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!);
  const title = uniqueTitle("Kept while signed out");
  await addTask(phone.page, title);
  const session = await phone.context.cookies();

  await phone.context.clearCookies();
  await phone.page.getByRole("button", { name: "Sync now" }).click();

  await expect(phone.page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  expect(await phone.page.evaluate(() => localStorage.getItem("signedIn"))).toBeNull();
  // The Task is still on the device, in the browser's database...
  const stored = await phone.page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("grilled-heads-up");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("tasks").objectStore("tasks").getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            open.result.close();
            resolve((request.result as Array<{ title: string }>).map((task) => task.title));
          };
        };
      }),
  );
  expect(stored).toContain(title);

  // ...and after signing in again (here: the session comes back) it shows, and syncs.
  await phone.context.addCookies(session);
  await phone.page.reload();
  await expect(phone.page.getByText(title)).toBeVisible();
  await phone.page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(phone.page)).toHaveText(/^Synced/);
  const other = await device(browser, baseURL!);
  await syncUntil(other.page, (timeout) => expect(other.page.getByText(title)).toBeVisible({ timeout }));
});

test("a tab that another tab's database upgrade waits for lets go and asks to be reloaded", async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!);
  const other = await phone.context.newPage();
  await other.goto("/");

  // Like a newer version of the app opening the database with a higher version number.
  await other.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("grilled-heads-up", 4);
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onblocked = () => reject(new Error("blocked by the other tab"));
        request.onerror = () => reject(request.error);
      }),
  );

  await expect(phone.page.getByRole("heading", { name: "Reload to continue", level: 1 })).toBeVisible();
  await expect(phone.page.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("the sync routes refuse requests without a session", async ({ playwright, baseURL }) => {
  const stranger = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

  expect((await stranger.get("/api/sync/pull")).status()).toBe(401);
  expect((await stranger.post("/api/sync/push", { data: { changes: [] } })).status()).toBe(401);
});
