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
const syncStatus = (page: Page) => page.getByRole("status").filter({ hasText: /sync/i });

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

  await phone.context.setOffline(true);
  await addTask(phone.page, title);
  await phone.page.getByRole("button", { name: "Sync now" }).click();
  await expect(syncStatus(phone.page)).toContainText("Offline");
  await expect(desktop.page.getByText(title)).toBeHidden();

  await phone.context.setOffline(false);
  await syncUntil(phone.page, (timeout) => expect(syncStatus(phone.page)).toContainText(/^Synced/, { timeout }));
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

test("the sync routes refuse requests without a session", async ({ playwright, baseURL }) => {
  const stranger = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

  expect((await stranger.get("/api/sync/pull")).status()).toBe(401);
  expect((await stranger.post("/api/sync/push", { data: { changes: [] } })).status()).toBe(401);
});
