import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAllowlist } from "./allowlist.js";
import { namesIssue } from "./checkSkips.js";

// The repository's own allowlist, read from the file like workflow.test.ts reads the workflow (so Stryker, which runs the
// tests in a copy without the repository's other folders, does not run this file; it is about the file, not about a module).
const text = readFileSync(new URL("../../.github/security-allowlist.json", import.meta.url), "utf8");
const committed = parseAllowlist(text);

// The shape of the file only, with no day in it: adding, renewing or removing an entry must not need this test to change. What a
// day means (nothing has run out, nothing runs longer than 90 days) is `npm run security:allowlist`, which CI runs; the way the
// gates treat an entry (the rule, the paths, the day) is tested in allowlist.test.ts and sarifGate.test.ts with entries of their own.
describe("the committed allowlist", () => {
  it("is a valid list (an empty one is, too)", () => {
    expect(committed.errors).toEqual([]);
  });

  it("gives every entry the issue that removes it in its reason, as #123 or the address of the issue", () => {
    for (const { tool, id, reason } of committed.entries) expect(namesIssue(reason), `${tool} ${id}: the reason names no issue`).toBe(true);
  });
});
