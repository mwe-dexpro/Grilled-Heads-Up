import ts from "typescript";

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

/**
 * The rules whose disabling leaves a test out: the skip rules of Vitest and Playwright, `no-restricted-syntax`, which
 * forbids `skipIf`, `runIf`, `todo`, `fixme` and a `skip` taken from the test context, and the comments rule `no-use`, which
 * refuses the inline settings (`/* eslint rule: "off" *\/`) that would switch those rules off (see eslint.config.js).
 */
const skipRules = /no-disabled-tests|no-skipped-test|no-restricted-syntax|eslint-comments\/no-use/;
/** What ESLint reads as a directive: a disable, in a line or a block comment, or an inline setting of rules (`eslint` and a space), in a block comment only. */
const disable = /^[\s*]*eslint-disable/;
const setting = /^[\s*]*eslint\s/;
/** `#42` (not inside a longer word, as in `colour#3` or `&#39;`), or an address of an issue: `…/issues/42`. */
const issue = /(?<![\w&])#\d+(?!\w)|https?:\/\/\S+\/issues\/\d/;

/** Whether a text names an issue the way a left-out test must: `#42` or the address of the issue. */
export const namesIssue = (text: string): boolean => issue.test(text);

interface Comment {
  /** What stands between the comment's delimiters. */
  body: string;
  /** A `/* *\/` comment (a `//` comment is never an inline setting of rules). */
  block: boolean;
  /** Offset of the comment's first character. */
  start: number;
}

/**
 * Every comment of a file, as the TypeScript parser sees them: a `//` or `/*` inside a string, a template or a regular
 * expression is no comment, and a block comment is one piece whatever number of lines it has.
 */
function commentsOf({ path, text }: SourceFile): Comment[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Map<number, Comment>();
  const add = (ranges: ts.CommentRange[] | undefined) => {
    for (const { pos, end, kind } of ranges ?? []) {
      const block = kind === ts.SyntaxKind.MultiLineCommentTrivia;
      found.set(pos, { start: pos, block, body: text.slice(pos + 2, block ? end - 2 : end) });
    }
  };
  // Every comment is trivia of a token: before it (on its own line) or after it (on the same line).
  const visit = (node: ts.Node) => {
    if (ts.isJSDoc(node)) return;
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...found.values()];
}

/**
 * The places where a skipped test is allowed (an `eslint-disable` of `vitest/no-disabled-tests`,
 * `playwright/no-skipped-test` or `no-restricted-syntax`) without naming the issue that will bring it back anywhere in the
 * comment of the disable. Only a comment that begins with `eslint-disable`, or `eslint` and a space (an inline setting of rules,
 * which turns a rule off like a disable), is a directive, as for ESLint.
 */
export function skipsWithoutIssue(files: SourceFile[]): Skip[] {
  return files.flatMap((file) => {
    const lines = file.text.split(/\r?\n/);
    const lineStarts = [0];
    for (const match of file.text.matchAll(/\n/g)) lineStarts.push(match.index + 1);
    return commentsOf(file)
      .filter(({ body, block }) => (disable.test(body) || (block && setting.test(body))) && skipRules.test(body) && !namesIssue(body))
      .map(({ start }) => {
        const line = lineStarts.findLastIndex((offset) => offset <= start);
        return { path: file.path, line: line + 1, text: lines[line] ?? "" };
      })
      .sort((a, b) => a.line - b.line);
  });
}
