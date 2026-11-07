import { describe, expect, it } from "vitest";
import type { AllowlistEntry } from "./allowlist.js";
import { gateSarif } from "./sarifGate.js";

const today = "2026-11-07";
const allow = (id: string, fields: Partial<AllowlistEntry> = {}): AllowlistEntry => ({
  tool: "codeql",
  id,
  reason: "Input is checked before.",
  expires: "2026-12-31",
  ...fields,
});

interface Rule {
  id: string;
  severity?: string | number | undefined;
}
interface Result {
  rule: string;
  file?: string;
  line?: number;
  message?: string;
}

/** A SARIF file as CodeQL writes it: the rules (security rules carry a security-severity) and the results. */
function sarif(rules: Rule[], results: Result[], extensionRules: Rule[] = []) {
  const toRule = ({ id, severity }: Rule) => ({
    id,
    properties: severity === undefined ? { tags: ["maintainability"] } : { "security-severity": severity, tags: ["security"] },
  });
  return JSON.stringify({
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "CodeQL", rules: rules.map(toRule) }, extensions: [{ name: "pack", rules: extensionRules.map(toRule) }] },
        results: results.map(({ rule, file, line, message }) => ({
          ruleId: rule,
          message: { text: message ?? `A problem of ${rule}` },
          locations: file === undefined ? [] : [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: line ?? 1 } } }],
        })),
      },
    ],
  });
}
const file = (text: string, name = "javascript.sarif") => ({ name, text });

describe("gateSarif", () => {
  it("passes results of rules below 7.0 and results of rules with no security severity, and says how many there were", () => {
    const text = sarif(
      [
        { id: "js/medium", severity: "6.9" },
        { id: "js/unused", severity: undefined },
      ],
      [
        { rule: "js/medium", file: "a.ts", line: 1 },
        { rule: "js/unused", file: "b.ts", line: 2 },
      ],
    );

    expect(gateSarif([file(text)], [], today)).toEqual({ exitCode: 0, output: "No high or critical CodeQL results (2 results of lower severity).\n" });
  });

  it("fails a result of a rule at 7.0 or above, with file, line and rule, and calls 9.0 and above critical", () => {
    const text = sarif(
      [
        { id: "js/path-injection", severity: "7.0" },
        { id: "js/sql-injection", severity: "9.8" },
        { id: "js/almost", severity: "8.9" },
        { id: "js/critical-edge", severity: "9.0" },
      ],
      [
        { rule: "js/path-injection", file: "server/src/files.ts", line: 12, message: "This path depends on user input." },
        { rule: "js/sql-injection", file: "server/src/db.ts", line: 40 },
        { rule: "js/almost", file: "a.ts", line: 3 },
        { rule: "js/critical-edge", file: "c.ts", line: 4 },
      ],
    );

    const result = gateSarif([file(text)], [], today);

    expect(result.exitCode).toBe(1);
    expect(result.output.split("\n")).toEqual([
      "4 high or critical CodeQL results:",
      "critical  js/critical-edge  c.ts:4  A problem of js/critical-edge",
      "critical  js/sql-injection  server/src/db.ts:40  A problem of js/sql-injection",
      "high      js/almost  a.ts:3  A problem of js/almost",
      "high      js/path-injection  server/src/files.ts:12  This path depends on user input.",
      "",
    ]);
  });

  it("says result in the singular for one", () => {
    const result = gateSarif([file(sarif([{ id: "js/x", severity: 8 }], [{ rule: "js/x", file: "a.ts", line: 1 }]))], [], today);

    expect(result.output.split("\n")[0]).toBe("1 high or critical CodeQL result:");
  });

  it("reads a severity written as a number, and ignores one that is no number", () => {
    const text = sarif(
      [
        { id: "js/number", severity: 7.5 },
        { id: "js/text", severity: "high" },
        { id: "js/empty", severity: "" },
      ],
      [
        { rule: "js/number", file: "a.ts", line: 1 },
        { rule: "js/text", file: "b.ts", line: 2 },
        { rule: "js/empty", file: "c.ts", line: 3 },
      ],
    );

    const result = gateSarif([file(text)], [], today);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("js/number");
    expect(result.output).not.toContain("js/text");
    expect(result.output).not.toContain("js/empty");
  });

  it("finds the severity of a rule that comes with a query pack (an extension)", () => {
    const text = sarif([], [{ rule: "js/from-pack", file: "a.ts", line: 9 }], [{ id: "js/from-pack", severity: "8.0" }]);

    expect(gateSarif([file(text)], [], today).exitCode).toBe(1);
  });

  it("gives a result with no rule entry, or no location, no severity it could not have, and names the place it does not know", () => {
    const unknownRule = gateSarif([file(sarif([], [{ rule: "js/unlisted", file: "a.ts", line: 1 }]))], [], today);
    const noLocation = gateSarif([file(sarif([{ id: "js/x", severity: "8.0" }], [{ rule: "js/x" }]))], [], today);

    expect(unknownRule.exitCode).toBe(0);
    expect(noLocation.output).toContain("high      js/x  (no location)  A problem of js/x");
  });

  it("lets a rule on the allowlist pass, says so, and still fails the others", () => {
    const text = sarif(
      [
        { id: "js/one", severity: "8.0" },
        { id: "js/two", severity: "8.0" },
      ],
      [
        { rule: "js/one", file: "a.ts", line: 1 },
        { rule: "js/two", file: "b.ts", line: 2 },
      ],
    );

    const some = gateSarif([file(text)], [allow("js/one")], today);
    const all = gateSarif([file(text)], [allow("js/one"), allow("js/two")], today);

    expect(some.exitCode).toBe(1);
    expect(some.output).toContain("js/two");
    expect(some.output).not.toMatch(/high +js\/one/);
    expect(all.exitCode).toBe(0);
    expect(all.output).toContain("Allowed until 2026-12-31: js/one (Input is checked before.)");
  });

  it("does not let an expired entry or an entry of another tool pass a result, and lets an entry pass on its last day", () => {
    const text = sarif([{ id: "js/one", severity: "8.0" }], [{ rule: "js/one", file: "a.ts", line: 1 }]);

    expect(gateSarif([file(text)], [allow("js/one", { expires: "2026-11-06" })], today).exitCode).toBe(1);
    expect(gateSarif([file(text)], [allow("js/one", { tool: "trivy" })], today).exitCode).toBe(1);
    expect(gateSarif([file(text)], [allow("js/one", { expires: today })], today).exitCode).toBe(0);
  });

  it("reads several files and several runs, and names the file of a result it could not read", () => {
    const first = sarif([{ id: "js/one", severity: "8.0" }], [{ rule: "js/one", file: "a.ts", line: 1 }]);
    const second = sarif([{ id: "js/two", severity: "8.0" }], [{ rule: "js/two", file: "b.ts", line: 2 }]);
    const twoRuns = JSON.stringify({ runs: [...(JSON.parse(first) as { runs: unknown[] }).runs, ...(JSON.parse(second) as { runs: unknown[] }).runs] });

    expect(gateSarif([file(first, "one.sarif"), file(second, "two.sarif")], [], today).output).toContain("2 high or critical CodeQL results");
    expect(gateSarif([file(twoRuns)], [], today).output).toContain("2 high or critical CodeQL results");
    expect(gateSarif([file(first, "one.sarif"), file("{", "broken.sarif")], [], today)).toEqual({
      exitCode: 1,
      output: "broken.sarif is not valid SARIF JSON.\n",
    });
  });

  it("says result for one and results for more, below the line as well", () => {
    const one = sarif([{ id: "js/low", severity: "1.0" }], [{ rule: "js/low", file: "a.ts", line: 1 }]);
    const two = sarif(
      [{ id: "js/low", severity: "1.0" }],
      [
        { rule: "js/low", file: "a.ts", line: 1 },
        { rule: "js/low", file: "a.ts", line: 2 },
      ],
    );

    expect(gateSarif([file(one)], [], today).output).toBe("No high or critical CodeQL results (1 result of lower severity).\n");
    expect(gateSarif([file(two)], [], today).output).toBe("No high or critical CodeQL results (2 results of lower severity).\n");
  });

  it("writes an allowed rule once, with its day and reason, however many results it has", () => {
    const text = sarif(
      [{ id: "js/one", severity: "8.0" }],
      [
        { rule: "js/one", file: "a.ts", line: 1 },
        { rule: "js/one", file: "b.ts", line: 2 },
      ],
    );

    expect(gateSarif([file(text)], [allow("js/one", { reason: "Checked before.", expires: "2026-12-01" })], today).output).toBe(
      "No high or critical CodeQL results (0 results of lower severity).\nAllowed until 2026-12-01: js/one (Checked before.)\n",
    );
  });

  it("writes each allowed rule on a line of its own, and each finding too", () => {
    const text = sarif(
      [
        { id: "js/one", severity: "8.0" },
        { id: "js/two", severity: "8.0" },
        { id: "js/three", severity: "8.0" },
      ],
      [
        { rule: "js/one", file: "a.ts", line: 1 },
        { rule: "js/two", file: "b.ts", line: 2 },
        { rule: "js/three", file: "c.ts", line: 3 },
      ],
    );

    expect(gateSarif([file(text)], [allow("js/one", { reason: "One." }), allow("js/two", { reason: "Two." })], today).output).toBe(
      "1 high or critical CodeQL result:\nhigh      js/three  c.ts:3  A problem of js/three\nAllowed until 2026-12-31: js/one (One.)\nAllowed until 2026-12-31: js/two (Two.)\n",
    );
    expect(gateSarif([file(text)], [], today).output.split("\n")).toHaveLength(5);
  });

  it("writes the place as file and line, the file alone without a line, and says so without a location", () => {
    const withoutLine = JSON.stringify({
      runs: [
        {
          tool: { driver: { rules: [{ id: "js/x", properties: { "security-severity": "8" } }] } },
          results: [{ ruleId: "js/x", message: { text: "m" }, locations: [{ physicalLocation: { artifactLocation: { uri: "a.ts" } } }] }],
        },
      ],
    });
    const oddLocation = JSON.stringify({
      runs: [
        {
          tool: { driver: { rules: [{ id: "js/x", properties: { "security-severity": "8" } }] } },
          results: [{ ruleId: "js/x", message: { text: "m" }, locations: [null, { physicalLocation: { artifactLocation: { uri: 5 } } }] }],
        },
      ],
    });

    expect(gateSarif([file(withoutLine)], [], today).output).toBe("1 high or critical CodeQL result:\nhigh      js/x  a.ts  m\n");
    expect(gateSarif([file(oddLocation)], [], today).output).toBe("1 high or critical CodeQL result:\nhigh      js/x  (no location)  m\n");
  });

  it("copes with a result that has no rule or no message, and with rules and results that are not objects", () => {
    const text = JSON.stringify({
      runs: [
        {
          tool: {
            driver: {
              rules: [
                null,
                "text",
                { id: "js/x", properties: { "security-severity": "8" } },
                { id: 5, properties: { "security-severity": "9" } },
                { id: "js/np", properties: "none" },
              ],
            },
            extensions: [null, { rules: "none" }],
          },
          results: [
            null,
            "text",
            { ruleId: "js/x", locations: [{ physicalLocation: { artifactLocation: { uri: "a.ts" }, region: { startLine: 3 } } }] },
            { message: { text: "no rule" } },
            { ruleId: "js/x", message: "plain", locations: "none" },
          ],
        },
        { tool: null, results: "none" },
        { tool: { driver: { rules: {} }, extensions: {} } },
      ],
    });

    expect(gateSarif([file(text)], [], today)).toEqual({
      exitCode: 1,
      output: "2 high or critical CodeQL results:\nhigh      js/x  (no location)  \nhigh      js/x  a.ts:3  \n",
    });
  });

  it("fails when there is nothing to read: an analysis that wrote no results is not a pass", () => {
    expect(gateSarif([], [], today)).toEqual({ exitCode: 1, output: "No SARIF files were found, so nothing was checked.\n" });
  });

  it("fails for a file that is JSON but not SARIF", () => {
    for (const text of ["null", "[]", "{}", '{"runs": "none"}', '{"runs": [null]}']) {
      const result = gateSarif([file(text, "odd.sarif")], [], today);
      expect(result, text).toEqual({ exitCode: 1, output: "odd.sarif is not valid SARIF JSON.\n" });
    }
  });

  it("passes a file with a run that found nothing", () => {
    expect(gateSarif([file(JSON.stringify({ runs: [{ tool: { driver: { name: "CodeQL" } } }] }))], [], today)).toEqual({
      exitCode: 0,
      output: "No high or critical CodeQL results (0 results of lower severity).\n",
    });
  });
});
