export interface SourceFile {
  path: string;
  text: string;
}

export interface Skip {
  path: string;
  /** From 1. */
  line: number;
  text: string;
}

const skipRules = /no-disabled-tests|no-skipped-test/;
/** `#42`, or an address of an issue: `…/issues/42`. */
const issue = /#\d|https?:\/\/\S+\/issues\/\d/;

/** The comment at the end of a line of code, or the line itself if it is one; a `//` or `/*` inside a string is no comment. */
function commentOf(line: string): string | undefined {
  let quote = "";
  let escaped = false;
  for (const [at, char] of line.split("").entries()) {
    if (escaped) escaped = false;
    else if (quote !== "") {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "/" && ["/", "*"].includes(line.charAt(at + 1))) return line.slice(at);
  }
  return undefined;
}

/**
 * The places where a skipped test is allowed (an `eslint-disable` of `vitest/no-disabled-tests` or
 * `playwright/no-skipped-test`) without naming the issue that will bring it back, on the line of the disable itself.
 */
export function skipsWithoutIssue(files: SourceFile[]): Skip[] {
  return files.flatMap(({ path, text }) =>
    text
      .split(/\r?\n/)
      .map((line, index) => ({ path, line: index + 1, text: line, comment: commentOf(line) }))
      .filter(({ comment }) => comment?.includes("eslint-disable") === true && skipRules.test(comment) && !issue.test(comment))
      .map(({ path: file, line, text: source }) => ({ path: file, line, text: source })),
  );
}
