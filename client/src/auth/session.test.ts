import { describe, expect, test } from "vitest";
import { loadSignedIn, saveSignedIn, startScreen } from "./session";

describe("startScreen", () => {
  test("a signed-in browser starts in the app", () => {
    expect(startScreen({ owner: true, signedIn: true }, false)).toBe("app");
  });

  test("first launch, before anyone has a passkey, starts with setup", () => {
    expect(startScreen({ owner: false, signedIn: false }, false)).toBe("setup");
  });

  test("once an owner exists, a signed-out browser starts with sign-in", () => {
    expect(startScreen({ owner: true, signedIn: false }, false)).toBe("signIn");
  });

  test("the server's answer wins over what the browser remembers", () => {
    expect(startScreen({ owner: true, signedIn: false }, true)).toBe("signIn");
  });

  test("offline, a browser that was signed in keeps working", () => {
    expect(startScreen("unreachable", true)).toBe("app");
  });

  test("offline, a browser that wasn't signed in waits on sign-in", () => {
    expect(startScreen("unreachable", false)).toBe("signIn");
  });
});

describe("remembering sign-in", () => {
  test("is remembered, and forgotten on sign-out", () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    };
    expect(loadSignedIn(fake)).toBe(false);

    saveSignedIn(fake, true);
    expect(loadSignedIn(fake)).toBe(true);

    saveSignedIn(fake, false);
    expect(loadSignedIn(fake)).toBe(false);
  });
});
