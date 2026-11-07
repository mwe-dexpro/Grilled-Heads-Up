import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AllowlistEntry } from "./allowlist.js";
import { gateNpmAudit, highFindings } from "./npmAudit.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** `npm audit --json` of this repository before its high advisories were fixed. */
const baseline = fixture("npm-audit-baseline.json");
/** The same after `npm audit fix`: moderate and low advisories only. */
const fixed = fixture("npm-audit-fixed.json");

const today = "2026-11-07";
const allow = (id: string, fields: Partial<AllowlistEntry> = {}): AllowlistEntry => ({
  tool: "npm-audit",
  id,
  reason: "Not reachable.",
  expires: "2026-12-31",
  ...fields,
});

const advisory = (severity: string, id: string, extra: Record<string, unknown> = {}) => ({
  source: 1,
  name: "pkg",
  dependency: "pkg",
  title: `Problem ${id}`,
  url: `https://github.com/advisories/${id}`,
  severity,
  ...extra,
});
const audit = (vulnerabilities: Record<string, { via: unknown[] }>) => JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} });

describe("highFindings", () => {
  it("finds the high advisories of a real audit, with the package, the advisory and its address", () => {
    expect(highFindings(JSON.parse(baseline)).map(({ name, severity, id }) => [name, severity, id])).toEqual([
      ["source-map-js", "high", "GHSA-68fv-2mgg-jv7q"],
      ["vite", "high", "GHSA-587h-7wmj-h5pm"],
      ["zod", "high", "GHSA-mrhx-c7xc-m3w5"],
    ]);
    expect(highFindings(JSON.parse(baseline))[2]).toMatchObject({
      url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
      title: expect.stringContaining("Zod") as unknown,
    });
  });

  it("finds none in an audit of moderate and low advisories", () => {
    expect(highFindings(JSON.parse(fixed))).toEqual([]);
  });

  it("puts critical before high, then orders by package and advisory", () => {
    const found = highFindings(
      JSON.parse(
        audit({
          b: { via: [advisory("high", "GHSA-2", { name: "b" })] },
          a: { via: [advisory("critical", "GHSA-9", { name: "a" }), advisory("high", "GHSA-1", { name: "a" })] },
          c: { via: [advisory("critical", "GHSA-5", { name: "c" })] },
        }),
      ),
    );

    expect(found.map(({ name, id, severity }) => `${severity} ${name} ${id}`)).toEqual([
      "critical a GHSA-9",
      "critical c GHSA-5",
      "high a GHSA-1",
      "high b GHSA-2",
    ]);
  });

  it("leaves out packages that only pass on another package's advisory (they name it as a string)", () => {
    const found = highFindings(JSON.parse(audit({ outer: { via: ["inner"] }, inner: { via: [advisory("high", "GHSA-1", { name: "inner" })] } })));

    expect(found.map(({ name }) => name)).toEqual(["inner"]);
  });

  it("lists an advisory once, however many packages report it", () => {
    const same = advisory("high", "GHSA-1", { name: "inner" });

    expect(highFindings(JSON.parse(audit({ one: { via: [same] }, two: { via: [same] } })))).toHaveLength(1);
  });

  it("does not take a lower severity for high, nor an unknown one", () => {
    const found = highFindings(
      JSON.parse(
        audit({
          p: {
            via: [advisory("moderate", "GHSA-1"), advisory("low", "GHSA-2"), advisory("info", "GHSA-3"), advisory("HIGH", "GHSA-4"), advisory("", "GHSA-5")],
          },
        }),
      ),
    );

    expect(found).toEqual([]);
  });

  it("names an advisory without an address by its number", () => {
    const found = highFindings(JSON.parse(audit({ p: { via: [{ source: 4711, name: "p", title: "No address", severity: "high" }] } })));

    expect(found).toEqual([{ name: "p", severity: "high", id: "4711", url: "", title: "No address" }]);
  });

  it("reads the advisory's name from the address, however the address ends", () => {
    const found = highFindings(
      JSON.parse(
        audit({ p: { via: [advisory("high", "GHSA-ab12-cd34-ef56"), { ...advisory("high", "x"), source: 2, url: "https://example.com/other/CVE-2026-1" }] } }),
      ),
    );

    expect(found.map(({ id }) => id).sort()).toEqual(["CVE-2026-1", "GHSA-ab12-cd34-ef56"]);
  });

  it("copes with a package that has no advisories at all", () => {
    expect(highFindings(JSON.parse(audit({ p: { via: [] } })))).toEqual([]);
    expect(highFindings({ auditReportVersion: 2, vulnerabilities: {} })).toEqual([]);
  });
});

describe("gateNpmAudit", () => {
  it("passes the audit of the fixed tree and says how many lower advisories there are", () => {
    const result = gateNpmAudit(fixed, [], today);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No high or critical advisories");
    expect(result.output).toMatch(/\d+ moderate/);
  });

  it("fails the audit that has high advisories, naming package, severity and advisory address", () => {
    const result = gateNpmAudit(baseline, [], today);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("high      vite  GHSA-587h-7wmj-h5pm  https://github.com/advisories/GHSA-587h-7wmj-h5pm");
    expect(result.output).toContain("zod");
    expect(result.output).toContain("source-map-js");
    expect(result.output).toContain("3 high or critical advisories");
  });

  it("fails on a critical one and puts it first", () => {
    const result = gateNpmAudit(audit({ p: { via: [advisory("high", "GHSA-1", { name: "p" }), advisory("critical", "GHSA-2", { name: "p" })] } }), [], today);

    expect(result.exitCode).toBe(1);
    expect(
      result.output
        .split("\n")
        .filter((line) => /^(critical|high) /.test(line))
        .map((line) => line.split(" ")[0]),
    ).toEqual(["critical", "high"]);
  });

  it("passes moderate findings alone", () => {
    const result = gateNpmAudit(audit({ p: { via: [advisory("moderate", "GHSA-1")] } }), [], today);

    expect(result.exitCode).toBe(0);
  });

  it("lets an advisory on the allowlist pass, says so, and still fails the others", () => {
    const some = gateNpmAudit(baseline, [allow("GHSA-587h-7wmj-h5pm"), allow("GHSA-68fv-2mgg-jv7q")], today);
    const all = gateNpmAudit(baseline, [allow("GHSA-587h-7wmj-h5pm"), allow("GHSA-68fv-2mgg-jv7q"), allow("GHSA-mrhx-c7xc-m3w5")], today);

    expect(some.exitCode).toBe(1);
    expect(some.output).toContain("GHSA-mrhx-c7xc-m3w5");
    expect(some.output).not.toMatch(/high +vite/);
    expect(all.exitCode).toBe(0);
    expect(all.output).toContain("Allowed until 2026-12-31: vite GHSA-587h-7wmj-h5pm (Not reachable.)");
  });

  it("does not let an expired entry, or an entry of another tool, pass an advisory", () => {
    const entries = [allow("GHSA-587h-7wmj-h5pm", { expires: "2026-11-06" }), allow("GHSA-68fv-2mgg-jv7q", { tool: "trivy" })];

    const result = gateNpmAudit(baseline, entries, today);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("GHSA-587h-7wmj-h5pm");
    expect(result.output).toContain("GHSA-68fv-2mgg-jv7q");
  });

  it("lets an entry pass an advisory on its last day", () => {
    const result = gateNpmAudit(audit({ p: { via: [advisory("high", "GHSA-1", { name: "p" })] } }), [allow("GHSA-1", { expires: today })], today);

    expect(result.exitCode).toBe(0);
  });

  it("counts the moderate and low advisories, each once", () => {
    const text = audit({
      a: { via: [advisory("moderate", "GHSA-1", { name: "a" }), advisory("moderate", "GHSA-2", { name: "a" }), advisory("low", "GHSA-3", { name: "a" })] },
      b: { via: [advisory("moderate", "GHSA-1", { name: "a" }), advisory("low", "GHSA-4", { name: "b" }), advisory("low", "GHSA-5", { name: "b" }), "a"] },
    });

    expect(gateNpmAudit(text, [], today)).toEqual({ exitCode: 0, output: "No high or critical advisories (2 moderate, 3 low).\n" });
  });

  it("says advisory for one and advisories for more", () => {
    const one = gateNpmAudit(audit({ p: { via: [advisory("high", "GHSA-1", { name: "p" })] } }), [], today);
    const two = gateNpmAudit(audit({ p: { via: [advisory("high", "GHSA-1", { name: "p" }), advisory("high", "GHSA-2", { name: "p" })] } }), [], today);

    expect(one.output.split("\n")[0]).toBe("1 high or critical advisory (npm audit):");
    expect(two.output.split("\n")[0]).toBe("2 high or critical advisories (npm audit):");
  });

  it("writes a finding as severity, package, advisory, address and title, and an allowed one with its day and reason", () => {
    const text = audit({
      p: { via: [advisory("high", "GHSA-1", { name: "p", title: "It breaks" }), advisory("high", "GHSA-2", { name: "q", title: "It leaks" })] },
    });

    expect(gateNpmAudit(text, [allow("GHSA-2", { reason: "Dev only.", expires: "2026-12-01" })], today).output).toBe(
      "1 high or critical advisory (npm audit):\nhigh      p  GHSA-1  https://github.com/advisories/GHSA-1  It breaks\nAllowed until 2026-12-01: q GHSA-2 (Dev only.)\n",
    );
  });

  it("writes each allowed advisory on a line of its own", () => {
    const text = audit({ p: { via: [advisory("high", "GHSA-1", { name: "p" }), advisory("high", "GHSA-2", { name: "q" })] } });

    expect(gateNpmAudit(text, [allow("GHSA-1", { reason: "One." }), allow("GHSA-2", { reason: "Two." })], today).output).toBe(
      "No high or critical advisories (0 moderate, 0 low).\nAllowed until 2026-12-31: p GHSA-1 (One.)\nAllowed until 2026-12-31: q GHSA-2 (Two.)\n",
    );
  });

  it("explains each way npm audit can fail", () => {
    const failed = (error: unknown) => gateNpmAudit(JSON.stringify({ error }), [], today).output;

    expect(failed({ code: "ENOTFOUND", summary: "no registry" })).toBe("npm audit failed (ENOTFOUND): no registry\n");
    expect(failed({ summary: "no registry" })).toBe("npm audit failed: no registry\n");
    expect(failed({ code: "E401" })).toBe("npm audit failed (E401): no reason given\n");
    expect(failed({})).toBe("npm audit failed: no reason given\n");
    expect(failed("plain")).toBe("npm audit failed: no reason given\n");
    expect(failed({ code: 401, summary: 5 })).toBe("npm audit failed: no reason given\n");
    expect(gateNpmAudit("", [], today)).toEqual({ exitCode: 1, output: "npm audit gave no JSON, so nothing was checked.\n" });
    expect(gateNpmAudit("{}", [], today)).toEqual({
      exitCode: 1,
      output: "npm audit gave a report in a format this check does not know (expected auditReportVersion 2).\n",
    });
  });

  it("reads reports that are odd in places without failing: advisories that are not objects, a package that is not an object", () => {
    const odd = JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: { a: null, b: "text", c: { via: "no list" }, d: { via: [null, 5, [], advisory("high", "GHSA-1", { name: "d" })] } },
    });

    expect(highFindings(JSON.parse(odd)).map(({ id }) => id)).toEqual(["GHSA-1"]);
    expect(highFindings(null)).toEqual([]);
    expect(highFindings("text")).toEqual([]);
    expect(highFindings([])).toEqual([]);
    expect(highFindings({ vulnerabilities: "none" })).toEqual([]);
    expect(highFindings({ vulnerabilities: [] })).toEqual([]);
  });

  it("names an advisory by its number when its address is empty or ends in a slash", () => {
    const found = highFindings(
      JSON.parse(
        audit({
          p: {
            via: [
              { source: 7, name: "p", severity: "high", url: "" },
              { source: 8, name: "p", severity: "high", url: "https://example.com/advisories/" },
            ],
          },
        }),
      ),
    );

    expect(found.map(({ id }) => id)).toEqual(["7", "8"]);
  });

  it("fails when npm audit failed, rather than passing for lack of findings", () => {
    const result = gateNpmAudit(
      JSON.stringify({ message: "x", error: { code: "ENOTFOUND", summary: "request to the registry failed", detail: "..." } }),
      [],
      today,
    );

    expect(result).toEqual({ exitCode: 1, output: "npm audit failed (ENOTFOUND): request to the registry failed\n" });
  });

  it("fails for an error without a summary too", () => {
    expect(gateNpmAudit(JSON.stringify({ error: {} }), [], today).exitCode).toBe(1);
    expect(gateNpmAudit(JSON.stringify({ error: "plain" }), [], today).exitCode).toBe(1);
  });

  it("fails for no output, for text that is not JSON, and for JSON that is no audit", () => {
    for (const text of [
      "",
      "   ",
      "npm ERR! something",
      "null",
      "[]",
      "{}",
      '{"vulnerabilities": {}}',
      '{"auditReportVersion": 1, "vulnerabilities": {}}',
      '{"auditReportVersion": 2}',
      '{"auditReportVersion": 2, "vulnerabilities": []}',
    ]) {
      const result = gateNpmAudit(text, [], today);
      expect(result.exitCode, text).toBe(1);
      expect(result.output, text).toContain("npm audit");
    }
  });

  it("passes a clean audit", () => {
    const result = gateNpmAudit(audit({}), [], today);

    expect(result).toEqual({ exitCode: 0, output: "No high or critical advisories (0 moderate, 0 low).\n" });
  });
});
