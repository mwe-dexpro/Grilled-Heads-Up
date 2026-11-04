import { test as setup } from "@playwright/test";
import { registerOwner, syncOwnerState } from "./passkeys";

setup("register the owner's passkey for the sync tests", async ({ page }) => {
  await registerOwner(page, syncOwnerState);
});
