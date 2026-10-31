import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { addAuthenticator, passkeysOf, syncPasskeys, type Authenticator, type Passkeys } from "./passkeys";

// One story on one server, from the first launch on: each test builds on the ones before.
test.describe.configure({ mode: "serial" });

const recoveryCodeShape = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/;
const today = (page: Page) => page.getByRole("heading", { name: "Today", level: 1 });
const signInHeading = (page: Page) => page.getByRole("heading", { name: "Sign in", level: 1 });

let phonePasskeys: Passkeys;
let recoveryCode: string;

/** A device with a passkey provider of its own, which starts out empty. */
async function device(browser: Browser, { baseURL, desktop = false }: { baseURL: string; desktop?: boolean }) {
  const context = await browser.newContext({ ...(desktop ? devices["Desktop Chrome"] : devices["Pixel 7"]), baseURL });
  const page = await context.newPage();
  const authenticator = await addAuthenticator(page);
  return { page, authenticator };
}

/**
 * Signs in with the owner's first passkey, synced to this device. Each use is synced back, as Google
 * Password Manager does, so the next device's copy has the latest signature counter.
 */
async function signInWithSyncedPasskey(page: Page, authenticator: Authenticator) {
  await syncPasskeys(phonePasskeys, authenticator);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(today(page)).toBeVisible();
  phonePasskeys = await passkeysOf(authenticator);
}

async function signInWithRecoveryCode(page: Page, code: string) {
  await page.getByRole("textbox", { name: "Recovery code" }).fill(code);
  await page.getByRole("button", { name: "Sign in with recovery code" }).click();
}

test("on first launch, a passkey is registered and the recovery code is shown once", async ({ page }) => {
  const phone = await addAuthenticator(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

  await page.getByRole("button", { name: "Create passkey" }).click();

  await expect(page.getByRole("heading", { name: "Your recovery code" })).toBeVisible();
  recoveryCode = (await page.getByText(recoveryCodeShape).textContent())!;
  phonePasskeys = await passkeysOf(phone);
  expect(phonePasskeys).toHaveLength(1);
  await page.getByRole("button", { name: "I've stored it" }).click();
  await expect(today(page)).toBeVisible();

  await page.reload();
  await expect(today(page)).toBeVisible();
  await expect(page.getByText(recoveryCodeShape)).toBeHidden();
});

test("nobody else can register once an owner exists", async ({ page, request }) => {
  await addAuthenticator(page);
  await page.goto("/");

  await expect(signInHeading(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create passkey" })).toBeHidden();
  expect((await request.post("/api/auth/register/options")).status()).toBe(403);
});

test("the passkey signs in on Android Chrome", async ({ page }) => {
  const phone = await addAuthenticator(page);
  await page.goto("/");
  await signInWithRecoveryCode(page, "wrong-code");
  await expect(page.getByRole("alert")).toHaveText("That recovery code doesn't match.");

  await signInWithSyncedPasskey(page, phone);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(signInHeading(page)).toBeVisible();
  await page.reload();
  await expect(signInHeading(page)).toBeVisible();
});

test("the synced passkey signs in on a desktop browser", async ({ browser, baseURL }) => {
  const desktop = await device(browser, { baseURL: baseURL!, desktop: true });
  await desktop.page.goto("/");

  await signInWithSyncedPasskey(desktop.page, desktop.authenticator);

  // The desktop already has this passkey, so adding it again is refused.
  await desktop.page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(desktop.page.getByRole("status")).toHaveText("This device already has a passkey for Grilled Heads-Up.");

  // A recovery code that got lost before it was stored is replaced from a signed-in session.
  await desktop.page.getByRole("button", { name: "New recovery code" }).click();
  await expect(desktop.page.getByRole("heading", { name: "Your recovery code" })).toBeVisible();
  const replacedCode = (await desktop.page.getByText(recoveryCodeShape).textContent())!;
  expect(replacedCode).not.toBe(recoveryCode);
  recoveryCode = replacedCode;
  await desktop.page.getByRole("button", { name: "I've stored it" }).click();
  await expect(today(desktop.page)).toBeVisible();
  await desktop.page.context().close();
});

test("the recovery code signs in on a new phone and registers a new passkey", async ({ browser, baseURL }) => {
  const newPhone = await device(browser, { baseURL: baseURL! });
  await newPhone.page.goto("/");

  await signInWithRecoveryCode(newPhone.page, recoveryCode.toLowerCase());

  // The used code is spent, so the new one is shown first, before anything that could be interrupted.
  await expect(newPhone.page.getByRole("heading", { name: "Your recovery code" })).toBeVisible();
  const newCode = (await newPhone.page.getByText(recoveryCodeShape).textContent())!;
  expect(newCode).not.toBe(recoveryCode);
  await newPhone.page.getByRole("button", { name: "I've stored it" }).click();
  await expect(newPhone.page.getByRole("heading", { name: "Create a new passkey" })).toBeVisible();
  await newPhone.page.getByRole("button", { name: "Create passkey" }).click();
  await expect(today(newPhone.page)).toBeVisible();
  expect(await passkeysOf(newPhone.authenticator)).toHaveLength(1);

  await newPhone.page.getByRole("button", { name: "Sign out" }).click();
  await signInWithRecoveryCode(newPhone.page, recoveryCode);
  await expect(newPhone.page.getByRole("alert")).toHaveText("That recovery code doesn't match.");
  await newPhone.page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(today(newPhone.page)).toBeVisible();
  await newPhone.page.context().close();
});

test("the server's data routes reject requests that aren't signed in", async ({ page, request }) => {
  expect((await request.get("/api/passkeys")).status()).toBe(401);

  const phone = await addAuthenticator(page);
  await page.goto("/");
  await signInWithSyncedPasskey(page, phone);
  const passkeys = await page.request.get("/api/passkeys");
  expect(passkeys.status()).toBe(200);
  expect(await passkeys.json()).toHaveLength(2);
});
