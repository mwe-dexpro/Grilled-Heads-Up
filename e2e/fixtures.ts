import { expect, test as base } from "@playwright/test";

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
