import { namesIssue } from "./checkSkips.js";

/** A report a test run wrote: the JSON reporter's file of Vitest or of Playwright, with the name it is called in messages. */
export interface Report {
  kind: "vitest" | "playwright";
  name: string;
  text: string;
}

/** What a report says of the tests: how many there were, and each one that was left out, with how and whether it names an issue. */
interface Counted {
  total: number;
  leftOut: { name: string; how: string; cited: boolean }[];
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
/** The list of objects the value is, or undefined when it is anything else (a report of another shape). */
const recordsOf = (value: unknown): Json[] | undefined => (Array.isArray(value) && value.every(isRecord) ? value : undefined);
/** The objects of a list that is allowed to be missing or odd. */
const optionalRecords = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Vitest's JSON reporter: `testResults` (one per file), each with `assertionResults` (one per test). Only `passed` and `failed` ran. */
function countVitest(data: unknown): Counted | undefined {
  const files = isRecord(data) ? recordsOf(data["testResults"]) : undefined;
  if (files === undefined) return undefined;
  const tests: Json[] = [];
  for (const file of files) {
    const results = recordsOf(file["assertionResults"]);
    if (results === undefined) return undefined;
    tests.push(...results);
  }
  const leftOut = tests.flatMap((test) => {
    const status = typeof test["status"] === "string" ? test["status"] : undefined;
    if (status === "passed" || status === "failed") return [];
    const name = textOf(test["fullName"]) || textOf(test["title"]);
    return [{ name, how: status ?? "no status", cited: namesIssue(name) }];
  });
  return { total: tests.length, leftOut };
}

/**
 * Playwright's JSON reporter: suites inside suites (the first is the file), their specs, and in each spec one test per project.
 * A test is left out when its status or its expected status is `skipped`, or it has a `skip` or `fixme` annotation (which
 * `test.skip`, `test.fixme`, a test's `annotation` detail and `testInfo.skip()` all leave). The issue may stand in the titles or
 * in the description of any annotation.
 */
function countPlaywright(data: unknown): Counted | undefined {
  const top = isRecord(data) ? recordsOf(data["suites"]) : undefined;
  if (top === undefined) return undefined;
  let total = 0;
  const leftOut: Counted["leftOut"] = [];
  const visit = (suite: Json, path: string[]): boolean => {
    const here = [...path, textOf(suite["title"])];
    const specs = suite["specs"] === undefined ? [] : recordsOf(suite["specs"]);
    const inner = suite["suites"] === undefined ? [] : recordsOf(suite["suites"]);
    if (specs === undefined || inner === undefined) return false;
    for (const spec of specs) {
      const tests = recordsOf(spec["tests"]);
      if (tests === undefined) return false;
      for (const test of tests) {
        total += 1;
        const titles = [...here, textOf(spec["title"])];
        const annotations = optionalRecords(test["annotations"]);
        const annotation = annotations.map((one) => textOf(one["type"])).find((type) => type === "skip" || type === "fixme");
        const skipped = test["status"] === "skipped" || test["expectedStatus"] === "skipped";
        if (!skipped && annotation === undefined) continue;
        const project = textOf(test["projectName"]);
        leftOut.push({
          name: `${project === "" ? "" : `[${project}] `}${titles.join(" › ")}`,
          how: skipped ? "skipped" : (annotation ?? ""),
          cited: namesIssue([...titles, ...annotations.map((one) => textOf(one["description"]))].join(" ")),
        });
      }
    }
    return inner.every((child) => visit(child, here));
  };
  return top.every((suite) => visit(suite, [])) ? { total, leftOut } : undefined;
}

function count({ kind, text }: Report): Counted | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  return kind === "vitest" ? countVitest(data) : countPlaywright(data);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The backstop behind the lint rules: after the test runs, no test may be left out (skipped, todo, fixme) unless its name or
 * annotation names the issue that brings it back, however it was left out and wherever the call stands. A lint rule sees the
 * ways it knows; the report says what the runner did. A report that holds no test, or is not the runner's report, fails too.
 */
export function gateLeftOut(reports: Report[]): { exitCode: 0 | 1; output: string } {
  if (reports.length === 0) return { exitCode: 1, output: "No test report was given, so nothing was checked.\n" };

  let total = 0;
  const open: string[] = [];
  const cited: string[] = [];
  for (const report of reports) {
    const counted = count(report);
    if (counted === undefined) return { exitCode: 1, output: `${report.name} is not a ${report.kind === "vitest" ? "Vitest" : "Playwright"} JSON report.\n` };
    if (counted.total === 0) return { exitCode: 1, output: `${report.name} holds no test, so nothing was checked.\n` };
    total += counted.total;
    for (const { name, how, cited: named } of counted.leftOut) (named ? cited : open).push(`${report.name}: ${name} (${how})\n`);
  }

  if (open.length > 0) {
    const tests = `${open.length} ${open.length === 1 ? "test is" : "tests are"}`;
    return {
      exitCode: 1,
      output: `${tests} left out without naming an issue (#123 or its address, in the name of the test or, in Playwright, its annotation):\n${open.join("")}`,
    };
  }
  const size = `(${plural(total, "test", "tests")} in ${plural(reports.length, "report", "reports")})`;
  return { exitCode: 0, output: `No test is left out${cited.length === 0 ? "" : " without an issue"} ${size}.\n${cited.join("")}` };
}
