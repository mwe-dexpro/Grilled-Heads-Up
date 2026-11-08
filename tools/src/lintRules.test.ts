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
    .flatMap(({ ruleId }) => (ruleId !== null && /skip|todo|fixme|restricted|disabled/.test(ruleId) ? [ruleId] : []));
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

  it("lets an ordinary test, and other uses of the words todo and runIf, through", async () => {
    expect(await flagged('it("x", () => { expect({ todo: 1 }.todo).toBe(1); });', unitTest)).toEqual([]);
    expect(await flagged('test("x", async () => { await Promise.resolve(); });', endToEnd)).toEqual([]);
  });
});
