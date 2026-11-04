import { test as setup } from "@playwright/test";
import { ownerState, registerOwner } from "./passkeys";

setup("register the owner's passkey", async ({ page }) => {
  await registerOwner(page, ownerState);
});
