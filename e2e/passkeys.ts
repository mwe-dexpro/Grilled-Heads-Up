import type { CDPSession, Page } from "@playwright/test";

/** The signed-in owner's cookies and storage, saved by `owner.setup.ts` for the app's tests. */
export const ownerState = "test-results/owner.json";

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
