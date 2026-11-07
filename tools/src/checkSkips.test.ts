import { describe, expect, it } from "vitest";
import { skipsWithoutIssue } from "./checkSkips.js";

const check = (...lines: string[]) => skipsWithoutIssue([{ path: "a.test.ts", text: lines.join("\n") }]);

describe("skipsWithoutIssue", () => {
  it("finds a vitest skip that is allowed with no issue named, and where it is", () => {
    const found = check("import x from 'y';", "// eslint-disable-next-line vitest/no-disabled-tests -- flaky on Windows", "it.skip('later', () => {});");

    expect(found).toEqual([{ path: "a.test.ts", line: 2, text: "// eslint-disable-next-line vitest/no-disabled-tests -- flaky on Windows" }]);
  });

  it("finds a Playwright skip that is allowed with no issue named", () => {
    expect(check("test.skip(true, 'x'); // eslint-disable-line playwright/no-skipped-test -- not now")).toHaveLength(1);
  });

  it("finds a disable with no reason at all, and a block comment", () => {
    expect(check("/* eslint-disable vitest/no-disabled-tests */")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests")).toHaveLength(1);
  });

  it("accepts a skip whose reason names an issue by number or by address", () => {
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- waits for #42")).toEqual([]);
    expect(check("// eslint-disable-next-line playwright/no-skipped-test -- https://github.com/mwe-dexpro/Grilled-Heads-Up/issues/17")).toEqual([]);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- see https://example.com/tracker/issues/9")).toEqual([]);
  });

  it("does not take a # without a number, or an address of no issue, for an issue", () => {
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- see # later")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- #abc")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- https://example.com/")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- https://example.com/issues/")).toHaveLength(1);
  });

  it("looks at the disable's own line only: an issue named elsewhere does not count", () => {
    expect(check("// see #42", "// eslint-disable-next-line vitest/no-disabled-tests -- later", "it.skip('x', () => {});")).toHaveLength(1);
  });

  it("finds a disable among other rules in one comment", () => {
    expect(check("// eslint-disable-next-line no-console, vitest/no-disabled-tests -- later")).toHaveLength(1);
  });

  it("leaves other disables alone: their own rules ask for a reason", () => {
    expect(check("// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the library has no type")).toEqual([]);
    expect(check("const text = 'no-disabled-tests';")).toEqual([]);
  });

  it("reports every file and every line with its own number", () => {
    const found = skipsWithoutIssue([
      { path: "a.test.ts", text: "// eslint-disable-next-line vitest/no-disabled-tests\n\n// eslint-disable-line playwright/no-skipped-test" },
      { path: "b.spec.ts", text: "ok\n// eslint-disable-next-line playwright/no-skipped-test" },
      { path: "c.ts", text: "nothing here" },
    ]);

    expect(found.map(({ path, line }) => [path, line])).toEqual([
      ["a.test.ts", 1],
      ["a.test.ts", 3],
      ["b.spec.ts", 2],
    ]);
  });

  it("finds nothing in no files, and in files without skips", () => {
    expect(skipsWithoutIssue([])).toEqual([]);
    expect(check("")).toEqual([]);
  });

  it("does not take text inside a string for a disable comment", () => {
    expect(check('const example = "// eslint-disable-next-line vitest/no-disabled-tests";')).toEqual([]);
    expect(check("const example = `x; // eslint-disable-line playwright/no-skipped-test`;")).toEqual([]);
    expect(check("const example = 'a /* eslint-disable vitest/no-disabled-tests */';")).toEqual([]);
    expect(check('check("don\'t"); // eslint-disable-line vitest/no-disabled-tests')).toHaveLength(1);
  });

  it("does not take a mention in prose for a disable comment", () => {
    expect(check("// Names the rule no-disabled-tests, which eslint-disable cannot switch off without an issue.")).toHaveLength(1);
    expect(check(" * An `eslint-disable` of `vitest/no-disabled-tests` needs an issue.")).toEqual([]);
  });

  it("reads lines ended by Windows line breaks too", () => {
    expect(check("one\r\n// eslint-disable-next-line vitest/no-disabled-tests\r\nthree")).toHaveLength(1);
  });
});
