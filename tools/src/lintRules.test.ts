import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The repository's own ESLint config, run over a snippet that is checked as if it were an existing file of the project.
const root = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd: root });
const unitTest = resolve(root, "tools/src/today.test.ts");
const endToEnd = resolve(root, "e2e/events.spec.ts");

/** The rules about left-out tests that complain about `code` when it stands in `filePath` (line 1 is the import). */
async function flagged(code: string, filePath: string): Promise<string[]> {
  const header = filePath === unitTest ? 'import { describe, expect, it, test } from "vitest";\n' : 'import { test } from "@playwright/test";\n';
  const [result] = await eslint.lintText(header + code, { filePath });
  return (result?.messages ?? [])
    .filter(({ line }) => line > 1)
    .flatMap(({ ruleId }) => (ruleId !== null && /skip|todo|fixme|restricted|disabled|eslint-comments\/no-use/.test(ruleId) ? [ruleId] : []));
}

// The first lint of each kind of file builds the type information of the whole project: seconds on a busy machine, and the
// default 5 s timed out when the other test files ran at the same time.
describe("the ESLint config refuses a test that is left out without naming its issue", { timeout: 60_000 }, () => {
  const skippedInVitest: [string, string][] = [
    ["it.skip", 'it.skip("x", () => { expect(1).toBe(1); });'],
    ["it.skipIf", 'it.skipIf(process.platform === "win32")("x", () => { expect(1).toBe(1); });'],
    ["it.runIf", 'it.runIf(process.platform === "linux")("x", () => { expect(1).toBe(1); });'],
    ["test.skipIf", 'test.skipIf(true)("x", () => { expect(1).toBe(1); });'],
    ["describe.skipIf", 'describe.skipIf(true)("x", () => { it("y", () => { expect(1).toBe(1); }); });'],
    ["describe.runIf", 'describe.runIf(false)("x", () => { it("y", () => { expect(1).toBe(1); }); });'],
    ["it.todo", 'it.todo("x");'],
    ["test.todo", 'test.todo("x");'],
    ["describe.todo", 'describe.todo("x");'],
  ];

  it.each(skippedInVitest)("%s in a unit test", async (_form, code) => {
    const rules = await flagged(code, unitTest);

    expect(rules).not.toEqual([]);
  });

  const skippedInPlaywright: [string, string][] = [
    ["test.skip", 'test.skip("x", async () => {});'],
    ["test.fixme", 'test.fixme("x", async () => {});'],
    ["test.describe.fixme", 'test.describe.fixme("x", () => {});'],
    ["test.fixme inside a test", 'test("x", async () => { test.fixme(true, "later"); });'],
  ];

  it.each(skippedInPlaywright)("%s in an end-to-end test", async (_form, code) => {
    const rules = await flagged(code, endToEnd);

    expect(rules).not.toEqual([]);
  });

  const skippedAnotherWay: [string, string, string][] = [
    [
      "an inline rule setting that switches the skip rule off",
      "unit",
      '/* eslint vitest/no-disabled-tests: "off" -- flaky */\nit.skip("x", () => { expect(1).toBe(1); });',
    ],
    ["an inline rule setting for Playwright's skip rule", "e2e", '/* eslint playwright/no-skipped-test: "off" -- flaky */\ntest.skip("x", async () => {});'],
    ["an inline setting of any other rule", "unit", '/* eslint no-console: "off" -- noisy */\nit("x", () => { expect(1).toBe(1); });'],
    ["skip destructured from the test context", "unit", 'it("x", ({ skip }) => { skip(process.platform === "linux", "later"); expect(1).toBe(1); });'],
    ["skip read from the test context under another name", "unit", 'it("x", (task) => { task.skip("later"); expect(1).toBe(1); });'],
    ["skip taken out of the context in the body", "unit", 'it("x", (context) => { const { skip } = context; skip(); expect(1).toBe(1); });'],
    ["test.info().skip()", "e2e", 'test("x", async () => { test.info().skip(true, "later"); });'],
    ["test.info().fixme()", "e2e", 'test("x", async () => { test.info().fixme(true, "later"); });'],
  ];

  it.each(skippedAnotherWay)("%s", async (_form, kind, code) => {
    const rules = await flagged(code, kind === "unit" ? unitTest : endToEnd);

    expect(rules).not.toEqual([]);
  });

  it("still lets the disables of a left-out test through to lint:skips, which asks for the issue", async () => {
    const withReason = '// eslint-disable-next-line vitest/no-disabled-tests -- waits for #42\nit.skip("x", () => { expect(1).toBe(1); });';

    expect(await flagged(withReason, unitTest)).toEqual([]);
  });

  it("lets an ordinary test, and other uses of the words todo and runIf, through", async () => {
    expect(await flagged('it("x", () => { expect({ todo: 1 }.todo).toBe(1); });', unitTest)).toEqual([]);
    expect(await flagged('test("x", async () => { await Promise.resolve(); });', endToEnd)).toEqual([]);
    expect(await flagged('it("x", () => { expect([1, 2].map((n) => n * 2)).toEqual([2, 4]); });', unitTest)).toEqual([]);
  });
});
