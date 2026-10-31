/** What the server says about sign-in: whether an owner exists yet, and whether this browser is signed in. */
export interface SessionStatus {
  owner: boolean;
  signedIn: boolean;
}

/** The screen the app starts on: the app itself, first-launch setup, or sign-in. */
export type StartScreen = "app" | "setup" | "signIn";

/**
 * Without a connection the app can't ask the server, so it trusts the last answer it got: a device that
 * was signed in keeps working offline (its data is on the device), and the server checks again when it can.
 */
export function startScreen(status: SessionStatus | "unreachable", wasSignedIn: boolean): StartScreen {
  if (status === "unreachable") return wasSignedIn ? "app" : "signIn";
  if (status.signedIn) return "app";
  return status.owner ? "signIn" : "setup";
}

const storageKey = "signedIn";

export function loadSignedIn(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(storageKey) === "yes";
}

export function saveSignedIn(storage: Pick<Storage, "setItem" | "removeItem">, signedIn: boolean): void {
  if (signedIn) storage.setItem(storageKey, "yes");
  else storage.removeItem(storageKey);
}
