import { expect, test as setup } from "@playwright/test";
import { addAuthenticator, ownerState } from "./passkeys";

setup("register the owner's passkey", async ({ page }) => {
  await addAuthenticator(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.getByRole("button", { name: "I've stored it" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await page.context().storageState({ path: ownerState });
});
