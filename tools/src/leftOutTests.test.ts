import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateLeftOut, type Report } from "./leftOutTests.js";

// The two fixtures are what Vitest's JSON reporter and Playwright's JSON reporter wrote for a scratch file of tests that are left
// out in every way the tools know (skip, todo, fixme, an option, an annotation, a skip in the body, an alias), with the fields
// the gate does not read and the machine's paths taken out.
const vitestFixture = readFileSync(new URL("fixtures/vitest-report.json", import.meta.url), "utf8");
const playwrightFixture = readFileSync(new URL("fixtures/playwright-report.json", import.meta.url), "utf8");

const vitest = (text: string, name = "client/reports/test-results.json"): Report => ({ kind: "vitest", name, text });
const playwright = (text: string, name = "reports/e2e-results.json"): Report => ({ kind: "playwright", name, text });
const vitestOf = (...tests: { status?: string; fullName: string }[]) =>
  JSON.stringify({ testResults: [{ name: "a.test.ts", assertionResults: tests.map((test) => ({ title: test.fullName, ...test })) }] });
const playwrightOf = (...tests: Record<string, unknown>[]) =>
  JSON.stringify({ suites: [{ title: "a.spec.ts", specs: tests.map((test, index) => ({ title: `test ${index}`, tests: [test] })) }] });

describe("gateLeftOut: Vitest", () => {
  it("fails every test that is skipped or todo and names no issue, whatever way it was left out, and says which", () => {
    const { exitCode, output } = gateLeftOut([vitest(vitestFixture)]);

    expect(exitCode).toBe(1);
    expect(output).toBe(
      [
        "4 tests are left out without naming an issue (#123 or its address, in the name of the test or, in Playwright, its annotation):",
        "client/reports/test-results.json: a group is skipped without a reason (skipped)",
        "client/reports/test-results.json: a group is a todo (todo)",
        "client/reports/test-results.json: a group is a todo by option (todo)",
        "client/reports/test-results.json: is skipped through an alias (skipped)",
        "",
      ].join("\n"),
    );
  });

  it("does not count a test that failed as left out, and lets one through that names its issue in its name", () => {
    const { output } = gateLeftOut([vitest(vitestFixture)]);

    expect(output).not.toContain("a group fails");
    expect(output).not.toContain("until #123 is fixed");
    expect(output).not.toContain("issues/7");
  });

  it("passes when every test ran, and says how many there were", () => {
    expect(
      gateLeftOut([vitest(vitestOf({ status: "passed", fullName: "a" }, { status: "passed", fullName: "b" }, { status: "failed", fullName: "c" }))]),
    ).toEqual({
      exitCode: 0,
      output: "No test is left out (3 tests in 1 report).\n",
    });
  });

  it("passes tests that are left out when each names its issue, and shows them", () => {
    const text = vitestOf(
      { status: "passed", fullName: "ran" },
      { status: "skipped", fullName: "waits for #123" },
      { status: "todo", fullName: "needs https://github.com/mwe-dexpro/Grilled-Heads-Up/issues/45" },
    );

    expect(gateLeftOut([vitest(text)])).toEqual({
      exitCode: 0,
      output:
        "No test is left out without an issue (3 tests in 1 report).\n" +
        "client/reports/test-results.json: waits for #123 (skipped)\n" +
        "client/reports/test-results.json: needs https://github.com/mwe-dexpro/Grilled-Heads-Up/issues/45 (todo)\n",
    });
  });

  it("counts a test with any status but passed or failed as left out, also one with no status", () => {
    const text = vitestOf({ status: "pending", fullName: "a" }, { status: "disabled", fullName: "b" }, { fullName: "c" });

    const { exitCode, output } = gateLeftOut([vitest(text)]);

    expect(exitCode).toBe(1);
    expect(output).toContain("3 tests are left out without");
    expect(output).toContain("test-results.json: a (pending)");
    expect(output).toContain("test-results.json: b (disabled)");
    expect(output).toContain("test-results.json: c (no status)");
  });

  it("names a test by its title when it has no full name, and counts a status that is no text as no status", () => {
    const text = JSON.stringify({
      testResults: [
        {
          assertionResults: [
            { title: "only a title", status: "todo" },
            { fullName: "odd", status: 5 },
          ],
        },
      ],
    });

    const { output } = gateLeftOut([vitest(text)]);

    expect(output).toContain("test-results.json: only a title (todo)\n");
    expect(output).toContain("test-results.json: odd (no status)\n");
  });

  it("says test for one, and report for one, and tests and reports for more", () => {
    const one = vitestOf({ status: "skipped", fullName: "a" });
    const ok = vitestOf({ status: "passed", fullName: "a" });

    expect(gateLeftOut([vitest(one)]).output).toMatch(/^1 test is left out without naming an issue/);
    expect(gateLeftOut([vitest(ok), vitest(ok, "server/reports/test-results.json")]).output).toBe("No test is left out (2 tests in 2 reports).\n");
  });

  it("fails a report that holds no test, as nothing ran", () => {
    for (const text of [JSON.stringify({ testResults: [] }), JSON.stringify({ testResults: [{ name: "a.test.ts", assertionResults: [] }] })]) {
      expect(gateLeftOut([vitest(text)])).toEqual({ exitCode: 1, output: "client/reports/test-results.json holds no test, so nothing was checked.\n" });
    }
  });

  it("fails a file that is not a Vitest report: no JSON, another shape, or a list of results with something else in it", () => {
    for (const text of [
      "",
      "{",
      "null",
      "[]",
      "{}",
      '{"testResults": {}}',
      '{"suites": []}',
      '{"testResults": [5]}',
      '{"testResults": [{"assertionResults": "x"}]}',
      '{"testResults": [{"assertionResults": [5]}]}',
    ]) {
      expect(gateLeftOut([vitest(text)]), text).toEqual({ exitCode: 1, output: "client/reports/test-results.json is not a Vitest JSON report.\n" });
    }
  });
});

describe("gateLeftOut: Playwright", () => {
  it("fails every test that is left out and names no issue in its title or its annotations, and says which", () => {
    const { exitCode, output } = gateLeftOut([playwright(playwrightFixture)]);

    expect(exitCode).toBe(1);
    expect(output).toBe(
      [
        "3 tests are left out without naming an issue (#123 or its address, in the name of the test or, in Playwright, its annotation):",
        "reports/e2e-results.json: mixed.spec.mjs › a group › is left out in its body (skipped)",
        "reports/e2e-results.json: mixed.spec.mjs › a group › is left out by an annotation (skipped)",
        "reports/e2e-results.json: mixed.spec.mjs › a group › is skipped (skipped)",
        "",
      ].join("\n"),
    );
  });

  it("lets through a test whose title or annotation names its issue, and a test that failed is not one that was left out", () => {
    const { output } = gateLeftOut([playwright(playwrightFixture)]);

    expect(output).not.toContain("annotation for #123");
    expect(output).not.toContain("fixme for #5");
    expect(output).not.toContain("described annotation");
    expect(output).not.toContain("fails");
  });

  it("passes when every test ran, with an annotation that does not leave the test out", () => {
    const text = playwrightOf(
      { expectedStatus: "passed", status: "expected", annotations: [], results: [{ status: "passed" }] },
      { expectedStatus: "passed", status: "expected", annotations: [{ type: "slow" }], results: [{ status: "passed" }] },
      { expectedStatus: "failed", status: "expected", annotations: [{ type: "fail" }], results: [{ status: "failed" }] },
    );

    expect(gateLeftOut([playwright(text)])).toEqual({ exitCode: 0, output: "No test is left out (3 tests in 1 report).\n" });
  });

  it("finds a test that is left out by its expected status, by its status, or by a skip or fixme annotation alone", () => {
    const text = playwrightOf(
      { expectedStatus: "skipped", status: "skipped", annotations: [], results: [] },
      { expectedStatus: "passed", status: "skipped", annotations: [], results: [{ status: "skipped" }] },
      { expectedStatus: "passed", status: "expected", annotations: [{ type: "fixme" }], results: [{ status: "passed" }] },
      { expectedStatus: "passed", status: "expected", annotations: [{ type: "skip" }], results: [{ status: "passed" }] },
    );

    const { exitCode, output } = gateLeftOut([playwright(text)]);

    expect(exitCode).toBe(1);
    expect(output).toContain("4 tests are left out without naming an issue");
    expect(output).toContain("a.spec.ts › test 0 (skipped)");
    expect(output).toContain("a.spec.ts › test 1 (skipped)");
    expect(output).toContain("a.spec.ts › test 2 (fixme)");
    expect(output).toContain("a.spec.ts › test 3 (skip)");
  });

  it("reads the issue from the description of any annotation of the test", () => {
    const text = playwrightOf({
      expectedStatus: "skipped",
      status: "skipped",
      annotations: [{ type: "issue" }, { type: "skip", description: "waits for #77" }],
      results: [],
    });

    expect(gateLeftOut([playwright(text)])).toEqual({
      exitCode: 0,
      output: "No test is left out without an issue (1 test in 1 report).\nreports/e2e-results.json: a.spec.ts › test 0 (skipped)\n",
    });
  });

  it("finds a test left out by its expected status alone, whatever its status says", () => {
    for (const status of ["expected", undefined, 5]) {
      const text = playwrightOf({ expectedStatus: "skipped", status, annotations: [], results: [] });

      expect(gateLeftOut([playwright(text)]).output, String(status)).toContain("a.spec.ts › test 0 (skipped)");
    }
  });

  it("reads the issue from an annotation description that stands alone, not glued to the title, and copes with annotations of any shape", () => {
    const skipped = { expectedStatus: "skipped", status: "skipped", results: [] };
    const alone = playwrightOf({ ...skipped, annotations: [null, 5, { type: "skip", description: "#77" }] });
    const missing = playwrightOf({ ...skipped });
    const notAList = playwrightOf({ ...skipped, annotations: "skip" });

    expect(gateLeftOut([playwright(alone)]).exitCode).toBe(0);
    for (const text of [missing, notAList]) expect(gateLeftOut([playwright(text)]).output).toContain("a.spec.ts › test 0 (skipped)");
  });

  it("finds tests in nested suites and names the project of one that runs in several", () => {
    const left = { expectedStatus: "skipped", status: "skipped", annotations: [], results: [], projectName: "android-chrome" };
    const text = JSON.stringify({
      suites: [
        {
          title: "a.spec.ts",
          suites: [{ title: "outer", suites: [{ title: "inner", specs: [{ title: "deep", tests: [left, { ...left, projectName: "" }] }] }] }],
        },
      ],
    });

    const { output } = gateLeftOut([playwright(text)]);

    expect(output).toContain("reports/e2e-results.json: [android-chrome] a.spec.ts › outer › inner › deep (skipped)");
    expect(output).toContain("reports/e2e-results.json: a.spec.ts › outer › inner › deep (skipped)");
  });

  it("fails a report that holds no test, and a file that is not a Playwright report", () => {
    expect(gateLeftOut([playwright(JSON.stringify({ suites: [] }))])).toEqual({
      exitCode: 1,
      output: "reports/e2e-results.json holds no test, so nothing was checked.\n",
    });
    for (const text of [
      "",
      "{",
      "null",
      "[]",
      "{}",
      '{"suites": {}}',
      '{"suites": [5]}',
      '{"testResults": []}',
      '{"suites": [{"specs": [5]}]}',
      '{"suites": [{"specs": 5}]}',
      '{"suites": [{"suites": [5]}]}',
      '{"suites": [{"suites": 5}]}',
      '{"suites": [{"specs": [{"tests": [5]}]}]}',
    ]) {
      expect(gateLeftOut([playwright(text)]), text).toEqual({ exitCode: 1, output: "reports/e2e-results.json is not a Playwright JSON report.\n" });
    }
  });
});

describe("gateLeftOut: several reports", () => {
  it("adds the tests of all reports, and fails when any one leaves a test out without an issue", () => {
    const ran = vitestOf({ status: "passed", fullName: "a" });
    const left = vitestOf({ status: "skipped", fullName: "b" });

    const result = gateLeftOut([vitest(ran, "client/r.json"), vitest(left, "server/r.json"), playwright(playwrightFixture)]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("server/r.json: b (skipped)");
    expect(result.output).toContain("reports/e2e-results.json: mixed.spec.mjs › a group › is skipped (skipped)");
    expect(result.output).not.toContain("client/r.json");
  });

  it("fails when it is given no report: nothing was checked", () => {
    expect(gateLeftOut([])).toEqual({ exitCode: 1, output: "No test report was given, so nothing was checked.\n" });
  });

  it("stops at the first report it cannot read", () => {
    expect(gateLeftOut([vitest(vitestOf({ status: "passed", fullName: "a" })), vitest("{", "server/r.json")])).toEqual({
      exitCode: 1,
      output: "server/r.json is not a Vitest JSON report.\n",
    });
  });
});
