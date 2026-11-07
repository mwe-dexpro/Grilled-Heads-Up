import { describe, expect, it } from "vitest";
import { allowedBy, checkAllowlist, expired, maxDays, parseAllowlist, type AllowlistEntry } from "./allowlist.js";

const entry = (fields: Partial<AllowlistEntry> = {}): AllowlistEntry => ({
  tool: "npm-audit",
  id: "GHSA-aaaa-bbbb-cccc",
  reason: "Only used by a dev tool that never sees input.",
  expires: "2026-12-31",
  ...fields,
});
const file = (entries: unknown) => JSON.stringify({ entries });

describe("parseAllowlist", () => {
  it("reads entries with a tool, an id, a reason and an expiry date", () => {
    const entries = [
      entry(),
      entry({ tool: "trivy", id: "CVE-2026-0001" }),
      entry({ tool: "codeql", id: "js/path-injection" }),
      entry({ tool: "gitleaks", id: "abc123:file.txt:aws:4" }),
    ];

    expect(parseAllowlist(file(entries))).toEqual({ entries, errors: [] });
  });

  it("accepts an empty allowlist: nothing is excepted", () => {
    expect(parseAllowlist(file([]))).toEqual({ entries: [], errors: [] });
  });

  it("refuses text that is not JSON", () => {
    expect(parseAllowlist("{ entries: ")).toEqual({ entries: [], errors: ["The allowlist is not valid JSON."] });
    expect(parseAllowlist("")).toEqual({ entries: [], errors: ["The allowlist is not valid JSON."] });
  });

  it("refuses anything that is not an object with a list of entries", () => {
    for (const text of ["null", "[]", '"entries"', "7", "{}", '{"entries": {}}', '{"entries": "none"}', '{"entries": null}']) {
      expect(parseAllowlist(text), text).toEqual({ entries: [], errors: ['The allowlist must be an object with an "entries" list.'] });
    }
  });

  it("refuses an entry that is not an object, and says which one", () => {
    const result = parseAllowlist(file([entry(), null, "text", [], 5]));

    expect(result.entries).toEqual([entry()]);
    expect(result.errors).toEqual(["Entry 2 is not an object.", "Entry 3 is not an object.", "Entry 4 is not an object.", "Entry 5 is not an object."]);
  });

  it("refuses a tool it does not know", () => {
    const result = parseAllowlist(file([entry({ tool: "semgrep" as never }), { ...entry(), tool: 5 }, { ...entry(), tool: undefined }]));

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      'Entry 1: the tool "semgrep" is not one of npm-audit, trivy, codeql, gitleaks.',
      "Entry 2: the tool 5 is not one of npm-audit, trivy, codeql, gitleaks.",
      "Entry 3: the tool undefined is not one of npm-audit, trivy, codeql, gitleaks.",
    ]);
  });

  it("refuses a missing or blank id", () => {
    const result = parseAllowlist(file([entry({ id: "" }), entry({ id: "   " }), { ...entry(), id: undefined }, { ...entry(), id: 5 }]));

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual(["Entry 1: the id is missing.", "Entry 2: the id is missing.", "Entry 3: the id is missing.", "Entry 4: the id is missing."]);
  });

  it("refuses a missing or blank reason: every exception says why", () => {
    const result = parseAllowlist(file([entry({ reason: "" }), entry({ reason: " \n\t" }), { ...entry(), reason: undefined }, { ...entry(), reason: ["x"] }]));

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      "Entry 1: the reason is missing.",
      "Entry 2: the reason is missing.",
      "Entry 3: the reason is missing.",
      "Entry 4: the reason is missing.",
    ]);
  });

  it("refuses a missing, malformed or impossible expiry date", () => {
    const bad = [
      undefined,
      "",
      "soon",
      "2026-1-5",
      "05.01.2026",
      "2026-01-05T00:00:00Z",
      "2026-13-01",
      "2026-02-30",
      "2026-00-10",
      "2026-04-31",
      20261231,
      "2026-01-011",
      "x2026-01-01",
      "2026-01-01 ",
      "02026-01-01",
      null,
      ["2026-01-01"],
    ];
    const result = parseAllowlist(file(bad.map((expires) => ({ ...entry(), expires }))));

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual(bad.map((_, index) => `Entry ${index + 1}: the expiry date must be a day as YYYY-MM-DD.`));
  });

  it("accepts a day that exists, also 29 February of a leap year", () => {
    expect(parseAllowlist(file([entry({ expires: "2028-02-29" }), entry({ id: "GHSA-2", expires: "2026-12-31" })])).errors).toEqual([]);
    expect(parseAllowlist(file([entry({ expires: "2027-02-29" })])).errors).toEqual(["Entry 1: the expiry date must be a day as YYYY-MM-DD."]);
  });

  it("refuses the same exception twice, but not the same id for two tools", () => {
    const twice = parseAllowlist(file([entry(), entry({ reason: "Again." })]));
    const twoTools = parseAllowlist(file([entry(), entry({ tool: "trivy" })]));

    expect(twice.entries).toEqual([entry()]);
    expect(twice.errors).toEqual(["Entry 2: npm-audit GHSA-aaaa-bbbb-cccc is on the allowlist already (entry 1)."]);
    expect(twoTools.errors).toEqual([]);
  });

  it("reports every problem of an entry", () => {
    const result = parseAllowlist(file([{ tool: "nope", id: "", reason: "", expires: "never" }]));

    expect(result.errors).toHaveLength(4);
  });

  it("keeps the valid entries when others are broken", () => {
    const result = parseAllowlist(file([entry({ id: "GHSA-ok" }), entry({ reason: "" })]));

    expect(result.entries).toEqual([entry({ id: "GHSA-ok" })]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("expired", () => {
  it("is every entry whose day has gone by", () => {
    const old = entry({ id: "old", expires: "2026-06-30" });
    const fresh = entry({ id: "fresh", expires: "2026-07-31" });

    expect(expired([old, fresh], "2026-07-15")).toEqual([old]);
  });

  it("still counts an entry on the day it expires, and no more on the day after", () => {
    const onTheDay = entry({ expires: "2026-07-15" });

    expect(expired([onTheDay], "2026-07-14")).toEqual([]);
    expect(expired([onTheDay], "2026-07-15")).toEqual([]);
    expect(expired([onTheDay], "2026-07-16")).toEqual([onTheDay]);
  });

  it("compares days across a month and a year end", () => {
    expect(expired([entry({ expires: "2026-12-31" })], "2027-01-01")).toHaveLength(1);
    expect(expired([entry({ expires: "2026-09-30" })], "2026-10-01")).toHaveLength(1);
    expect(expired([entry({ expires: "2026-10-01" })], "2026-09-30")).toHaveLength(0);
  });

  it("is nothing for an empty allowlist", () => {
    expect(expired([], "2026-07-15")).toEqual([]);
  });
});

describe("allowedBy", () => {
  const entries = [entry(), entry({ tool: "trivy", id: "CVE-1", expires: "2026-07-15" })];

  it("is the entry for a tool and id that are on the allowlist", () => {
    expect(allowedBy(entries, "npm-audit", "GHSA-aaaa-bbbb-cccc", "2026-07-01")).toBe(entries[0]);
    expect(allowedBy(entries, "trivy", "CVE-1", "2026-07-15")).toBe(entries[1]);
  });

  it("is nothing for another id, or the same id of another tool", () => {
    expect(allowedBy(entries, "npm-audit", "GHSA-other", "2026-07-01")).toBeUndefined();
    expect(allowedBy(entries, "codeql", "GHSA-aaaa-bbbb-cccc", "2026-07-01")).toBeUndefined();
    expect(allowedBy([], "npm-audit", "GHSA-aaaa-bbbb-cccc", "2026-07-01")).toBeUndefined();
  });

  it("is nothing once the entry has expired: it excepts nothing then", () => {
    expect(allowedBy(entries, "trivy", "CVE-1", "2026-07-16")).toBeUndefined();
  });
});

describe("checkAllowlist", () => {
  it("passes an empty allowlist and one whose entries are valid and not expired", () => {
    expect(checkAllowlist(file([]), "2026-07-01")).toEqual({ ok: true, messages: [] });
    expect(checkAllowlist(file([entry({ expires: "2026-08-15" })]), "2026-07-01")).toEqual({ ok: true, messages: [] });
  });

  it("fails an expired entry and says which, with its reason", () => {
    const result = checkAllowlist(file([entry({ expires: "2026-06-30" })]), "2026-07-01");

    expect(result.ok).toBe(false);
    expect(result.messages).toEqual([
      "Expired on 2026-06-30: npm-audit GHSA-aaaa-bbbb-cccc (Only used by a dev tool that never sees input.). Fix it, or renew it with a new reason.",
    ]);
  });

  it("passes an entry on its last day and fails it on the next", () => {
    expect(checkAllowlist(file([entry({ expires: "2026-07-01" })]), "2026-07-01").ok).toBe(true);
    expect(checkAllowlist(file([entry({ expires: "2026-07-01" })]), "2026-07-02").ok).toBe(false);
  });

  it("fails an invalid allowlist with the problems found", () => {
    const result = checkAllowlist(file([entry({ reason: "" })]), "2026-07-01");

    expect(result).toEqual({ ok: false, messages: ["Entry 1: the reason is missing."] });
  });

  it("fails text that is not JSON", () => {
    expect(checkAllowlist("nope", "2026-07-01")).toEqual({ ok: false, messages: ["The allowlist is not valid JSON."] });
  });

  it("refuses an expiry more than 90 days away, and takes exactly 90", () => {
    expect(maxDays).toBe(90);
    expect(checkAllowlist(file([entry({ expires: "2026-09-29" })]), "2026-07-01").ok).toBe(true);
    const tooFar = checkAllowlist(file([entry({ expires: "2026-09-30" })]), "2026-07-01");

    expect(tooFar.ok).toBe(false);
    expect(tooFar.messages).toEqual([
      "npm-audit GHSA-aaaa-bbbb-cccc expires on 2026-09-30, more than 90 days from 2026-07-01. An exception lasts at most 90 days; renew it when it runs out.",
    ]);
  });

  it("counts the 90 days across a year end and a leap day", () => {
    expect(checkAllowlist(file([entry({ expires: "2027-03-30" })]), "2026-12-30").ok).toBe(true);
    expect(checkAllowlist(file([entry({ expires: "2027-03-31" })]), "2026-12-30").ok).toBe(false);
    expect(checkAllowlist(file([entry({ expires: "2028-05-29" })]), "2028-02-29").ok).toBe(true);
    expect(checkAllowlist(file([entry({ expires: "2028-05-30" })]), "2028-02-29").ok).toBe(false);
  });

  it("lists every problem, expired entries and invalid ones together", () => {
    const result = checkAllowlist(
      file([entry({ expires: "2026-01-01" }), entry({ id: "GHSA-x", reason: "" }), entry({ id: "GHSA-y", expires: "2027-12-31" })]),
      "2026-07-01",
    );

    expect(result.ok).toBe(false);
    expect(result.messages).toHaveLength(3);
  });
});
