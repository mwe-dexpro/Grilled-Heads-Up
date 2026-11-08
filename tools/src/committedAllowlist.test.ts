import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkAllowlist, parseAllowlist } from "./allowlist.js";
import { gateSarif } from "./sarifGate.js";

// The repository's own allowlist, read from the file like workflow.test.ts reads the workflow (so Stryker, which runs the
// tests in a copy without the repository's other folders, does not run this file; it is about the file, not about a module).
const text = readFileSync(new URL("../../.github/security-allowlist.json", import.meta.url), "utf8");
const committed = parseAllowlist(text);
// The day the entries were written: what the file is judged against must not move with the calendar.
const addedOn = "2026-11-08";

/** A SARIF file as CodeQL writes it, with one result of a security rule. */
function sarif(rule: string, severity: string, file: string, line: number, message: string): { name: string; text: string } {
  const driver = { name: "CodeQL", rules: [{ id: rule, properties: { "security-severity": severity, tags: ["security"] } }] };
  const result = {
    ruleId: rule,
    message: { text: message },
    locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: line } } }],
  };
  return { name: "javascript.sarif", text: JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver }, results: [result] }] }) };
}
const rateLimiting = sarif("js/missing-rate-limiting", "7.5", "server/src/auth.ts", 156, "This route handler performs authorization, but is not rate-limited.");

describe("the committed allowlist, as CodeQL's first run will meet it", () => {
  it("is valid on the day it was written, and every entry names the follow-up that removes it", () => {
    expect(committed.errors).toEqual([]);
    expect(checkAllowlist(text, addedOn)).toEqual({ ok: true, messages: [] });
    for (const { id, reason } of committed.entries) expect(reason, id).toMatch(/follow-up/i);
  });

  it("lets the missing rate limiting of the passkey routes through (the query counts a call of verify... or ...Authentication... as authorization), with the entry shown", () => {
    const { exitCode, output } = gateSarif([rateLimiting], committed.entries, addedOn);

    expect(output).toContain("Allowed until ");
    expect(output).toContain("js/missing-rate-limiting");
    expect(exitCode).toBe(0);
  });

  it("still fails any other high result, and the same rule once its entry has run out", () => {
    const other = sarif("js/sql-injection", "8.8", "server/src/sync.ts", 100, "A problem.");

    expect(gateSarif([other], committed.entries, addedOn).exitCode).toBe(1);
    expect(gateSarif([rateLimiting], committed.entries, "2027-12-31").exitCode).toBe(1);
  });
});
