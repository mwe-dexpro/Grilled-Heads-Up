import { expect, test as base, type Locator } from "@playwright/test";

/**
 * `test` for the app's tests: sync is blocked, so the tests that share one server and owner don't pass
 * each other's Tasks around. The app then shows its offline sync status, which these tests don't look at.
 * The sync tests (`sync.spec.ts`) use their own server and Playwright's `test` directly.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route("**/api/sync/**", (route) => route.abort());
    await use(context);
  },
});

export { expect };

/** The kinds of touch event the tests send through the DevTools protocol (`Input.dispatchTouchEvent`). */
export type TouchType = "touchStart" | "touchMove" | "touchEnd" | "touchCancel";

/** Where an element is on the page; fails the test, saying so, when it is not shown (`boundingBox()` is then null). */
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator.toString()} is not shown, so it has no box.`);
  return box;
}

/** What an element says; fails the test, saying so, when it has no text content (a text node or the document). */
export async function textOf(locator: Locator): Promise<string> {
  const text = await locator.textContent();
  if (text === null) throw new Error(`${locator.toString()} has no text content.`);
  return text;
}

/** The base URL of the project a test runs in; every project of this suite has one. */
export function siteUrl(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("The Playwright project has no baseURL.");
  return baseURL;
}
