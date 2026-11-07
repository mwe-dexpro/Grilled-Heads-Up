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

const skipRules = /(?:no-disabled-tests|no-skipped-test)\b/;
/** `#42`, or an address of an issue: `…/issues/42`. */
const issue = /#\d+|https?:\/\/\S+\/issues\/\d+/;

/** Where a comment starts on the line, outside any string: `//` or `/*`; -1 for none. */
function commentStart(line: string): number {
  let quote = "";
  for (let at = 0; at < line.length; at++) {
    const char = line.charAt(at);
    if (quote !== "") {
      if (char === "\\") at += 1;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "/" && (line.charAt(at + 1) === "/" || line.charAt(at + 1) === "*")) return at;
  }
  return -1;
}

/**
 * The places where a skipped test is allowed (an `eslint-disable` of `vitest/no-disabled-tests` or
 * `playwright/no-skipped-test`) without naming the issue that will bring it back, on the line of the disable itself.
 */
export function skipsWithoutIssue(files: SourceFile[]): Skip[] {
  return files.flatMap(({ path, text }) =>
    text
      .split(/\r?\n/)
      .map((line, index) => ({ path, line: index + 1, text: line }))
      .filter(({ text: line }) => {
        const at = commentStart(line);
        return at !== -1 && line.slice(at).includes("eslint-disable") && skipRules.test(line.slice(at)) && !issue.test(line.slice(at));
      }),
  );
}
