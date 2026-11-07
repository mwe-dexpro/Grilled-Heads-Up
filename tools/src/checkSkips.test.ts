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
    expect(check("// The rule no-disabled-tests is on for every test file.")).toEqual([]);
    expect(check("// eslint-disable-next-line no-console -- a mention of no-skipped-test: still a disable comment that names it")).toHaveLength(1);
    expect(check(" * An `eslint-disable` of `vitest/no-disabled-tests` needs an issue.")).toEqual([]);
  });

  it("finds the comment after code, also one that follows a string with a quote or an escape in it", () => {
    expect(check('check("don\'t"); // eslint-disable-line vitest/no-disabled-tests')).toHaveLength(1);
    expect(check("const s = 'it\\'s'; // eslint-disable-line vitest/no-disabled-tests")).toHaveLength(1);
    expect(check('const s = "a \\" // eslint-disable-line vitest/no-disabled-tests";')).toEqual([]);
    expect(check("const s = 'a'; const t = 'b'; /* eslint-disable vitest/no-disabled-tests */")).toHaveLength(1);
    expect(check("const url = a / b; // eslint-disable-line playwright/no-skipped-test")).toHaveLength(1);
  });

  it("accepts an issue at an address with http as well as https", () => {
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- http://tracker.example/issues/3")).toEqual([]);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- https://tracker.example/x/issues/3")).toEqual([]);
  });

  it("reads lines ended by Windows line breaks too", () => {
    expect(check("one\r\n// eslint-disable-next-line vitest/no-disabled-tests\r\nthree")).toHaveLength(1);
  });

  it("finds a disable whose rule name stands on a later line of a block comment than its opener", () => {
    const found = check("const before = 1;", "/* eslint-disable-next-line", "   vitest/no-disabled-tests -- flaky on CI */", "it.skip('x', () => {});");

    expect(found).toEqual([{ path: "a.test.ts", line: 2, text: "/* eslint-disable-next-line" }]);
  });

  it("accepts a block comment that names its issue on a later line than the rule", () => {
    expect(check("/* eslint-disable-next-line vitest/no-disabled-tests", "   -- waits for #42 */", "it.skip('x', () => {});")).toEqual([]);
  });

  it("finds a disable after a regular expression that looks like the start of a comment, and a block comment of several lines", () => {
    expect(check("const pattern = /\\/*/;", "/*", " eslint-disable", " vitest/no-disabled-tests", " */")).toHaveLength(1);
    expect(check("const pattern = /a\\/b/; // eslint-disable-line vitest/no-disabled-tests")).toHaveLength(1);
    expect(check("const pattern = /\\/*/; /* eslint-disable vitest/no-disabled-tests */")).toHaveLength(1);
  });

  it("finds the other ways of leaving a test out: skipIf, runIf, todo and fixme are all disabled through no-restricted-syntax", () => {
    expect(check("// eslint-disable-next-line no-restricted-syntax -- later")).toHaveLength(1);
    expect(check("// eslint-disable-next-line no-restricted-syntax -- later, see #17")).toEqual([]);
  });

  it("counts only a comment that begins with the directive, as ESLint does: a mention in a doc comment is no disable", () => {
    expect(check("/**", " * An `eslint-disable` of `vitest/no-disabled-tests` needs an issue.", " */")).toEqual([]);
    expect(check("// see eslint-disable-line vitest/no-disabled-tests")).toEqual([]);
    expect(check("/** eslint-disable vitest/no-disabled-tests */")).toHaveLength(1);
    expect(check("/*", " * eslint-disable vitest/no-disabled-tests", " */")).toHaveLength(1);
  });

  it("reads a component file (TSX) as well", () => {
    const source = { path: "Probe.tsx", text: "const a = <div>{/* eslint-disable-next-line vitest/no-disabled-tests */}</div>;" };

    expect(skipsWithoutIssue([source])).toHaveLength(1);
  });

  it("takes only a number or the address of an issue as an issue, not a # that is part of a longer word", () => {
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- #3abc")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- colour#3")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- &#39;")).toHaveLength(1);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- waits for (#42), then goes")).toEqual([]);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- #42")).toEqual([]);
    expect(check("// eslint-disable-next-line vitest/no-disabled-tests -- see #42, #43")).toEqual([]);
  });
});
