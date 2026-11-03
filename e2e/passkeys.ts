import { expect, type CDPSession, type Page } from "@playwright/test";

/** The signed-in owner's cookies and storage, saved by `owner.setup.ts` for the app's tests. */
export const ownerState = "test-results/owner.json";
/** The same for the sync tests, which have a server and an owner of their own. */
export const syncOwnerState = "test-results/sync-owner.json";

/** First launch: registers the owner's passkey, confirms the recovery code and saves the signed-in state. */
export async function registerOwner(page: Page, statePath: string): Promise<void> {
  await addAuthenticator(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.getByRole("button", { name: "I've stored it" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await page.context().storageState({ path: statePath });
}

export interface Authenticator {
  cdp: CDPSession;
  authenticatorId: string;
}

/**
 * Gives the page a virtual platform authenticator (Chrome DevTools Protocol), standing in for the
 * phone's screen lock or Google Password Manager. Presence and verification succeed without a prompt.
 */
export async function addAuthenticator(page: Page): Promise<Authenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

/** The passkeys an authenticator holds, private keys included. */
export async function passkeysOf({ cdp, authenticatorId }: Authenticator) {
  return (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials;
}

export type Passkeys = Awaited<ReturnType<typeof passkeysOf>>;

/** Puts passkeys into another authenticator, as Google Password Manager syncs them to another device. */
export async function syncPasskeys(passkeys: Passkeys, { cdp, authenticatorId }: Authenticator): Promise<void> {
  for (const credential of passkeys) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
}
