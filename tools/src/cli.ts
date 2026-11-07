import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAllowlist, parseAllowlist } from "./allowlist.js";
import { skipsWithoutIssue, type SourceFile } from "./checkSkips.js";
import { gitleaksIgnore, trivyIgnore } from "./ignoreFiles.js";
import { gateNpmAudit } from "./npmAudit.js";
import { gateSarif } from "./sarifGate.js";
import { todayFrom } from "./today.js";

/**
 * The command-line tools, as functions of what they are given and what they print, so that tests (and Stryker) run them
 * without a process of their own. `src/bin/*.ts` only hands each one to `runCli`.
 */
export interface CliInput {
  /** The command-line arguments after the script's name. */
  args: string[];
  now: Date;
  /** The folder that paths are read from and written to. */
  root: string;
  stdin: () => string;
}

export interface CliResult {
  exitCode: 0 | 1;
  stdout: string;
  stderr: string;
}

export type Command = (input: CliInput) => CliResult;

const succeed = (stdout: string, stderr = ""): CliResult => ({ exitCode: 0, stdout, stderr });
const fail = (stderr: string, stdout = ""): CliResult => ({ exitCode: 1, stdout, stderr });
/** What the gate printed, on the stream that matches its exit code. */
const gated = ({ exitCode, output }: { exitCode: 0 | 1; output: string }, notice: string): CliResult =>
  exitCode === 0 ? succeed(output, notice) : fail(notice + output);

const defaultAllowlist = ".github/security-allowlist.json";

/** The day expiry is judged by, and the line that says so when the command line moved it away from the clock's. */
function judgedDay({ args, now }: CliInput): { day: string; notice: string } {
  const day = todayFrom(args, now);
  return { day, notice: args.some((arg) => arg.startsWith("--today=")) ? `Judging expiry as of ${day} (--today).\n` : "" };
}

/** The allowlist of the repository, or the messages that say why it cannot be used. */
function allowlistOf(root: string) {
  const { entries, errors } = parseAllowlist(readFileSync(join(root, defaultAllowlist), "utf8"));
  return errors.length > 0 ? { errors: `${errors.join("\n")}\n` } : { entries };
}

/** `npm run security:allowlist`: fails on an invalid, expired or too long exception. */
export const allowlistCommand: Command = (input) => {
  const { day, notice } = judgedDay(input);
  const file = input.args.find((arg) => arg.endsWith(".json")) ?? defaultAllowlist;
  const result = checkAllowlist(readFileSync(join(input.root, file), "utf8"), day);
  if (result.ok) return succeed(`${file}: every exception is valid and has not run out.\n`, notice);
  return fail(`${notice}${result.messages.map((message) => `${file}: ${message}`).join("\n")}\n`);
};

/** `npm audit --json | node tools/dist/bin/npmAudit.js`: fails on a high or critical advisory the allowlist does not allow. */
export const npmAuditCommand: Command = (input) => {
  const { day, notice } = judgedDay(input);
  const allowlist = allowlistOf(input.root);
  if (allowlist.entries === undefined) return fail(notice + allowlist.errors);
  return gated(gateNpmAudit(input.stdin(), allowlist.entries, day), notice);
};

/** The SARIF files a path stands for: itself, or the `.sarif` and `.sarif.json` files of a folder, in name order. */
function sarifFiles(root: string, path: string): string[] {
  if (!statSync(join(root, path)).isDirectory()) return [path];
  return readdirSync(join(root, path))
    .filter((name) => name.endsWith(".sarif") || name.endsWith(".sarif.json"))
    .sort()
    .map((name) => join(path, name));
}

/** `node tools/dist/bin/sarifGate.js <folder or file>…`: fails on a high or critical CodeQL result the allowlist does not allow. */
export const sarifGateCommand: Command = (input) => {
  const { day, notice } = judgedDay(input);
  const allowlist = allowlistOf(input.root);
  if (allowlist.entries === undefined) return fail(notice + allowlist.errors);
  const paths = input.args.filter((arg) => !arg.startsWith("--"));
  const files = paths.flatMap((path) => sarifFiles(input.root, path)).map((name) => ({ name, text: readFileSync(join(input.root, name), "utf8") }));
  return gated(gateSarif(files, allowlist.entries, day), notice);
};

/** `npm run security:ignorefiles`: writes `.trivyignore` and `.gitleaksignore` from the allowlist, right before those scanners run. */
export const ignoreFilesCommand: Command = (input) => {
  const { day, notice } = judgedDay(input);
  const allowlist = allowlistOf(input.root);
  if (allowlist.entries === undefined) return fail(notice + allowlist.errors);
  writeFileSync(join(input.root, ".trivyignore"), trivyIgnore(allowlist.entries));
  writeFileSync(join(input.root, ".gitleaksignore"), gitleaksIgnore(allowlist.entries, day));
  return succeed("Wrote .trivyignore and .gitleaksignore from .github/security-allowlist.json.\n", notice);
};

/** The folders `lint:skips` reads, relative to the repository's root. */
const skipRoots = ["client/src", "server/src", "tools/src", "e2e"];

function sources(root: string, folder: string): SourceFile[] {
  const entries = readdirSync(join(root, folder), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sources(root, path);
    return /\.tsx?$/.test(entry.name) ? [{ path, text: readFileSync(join(root, path), "utf8") }] : [];
  });
}

/** `npm run lint:skips`: fails on a test that is left out without naming the issue that brings it back. */
export const checkSkipsCommand: Command = ({ root }) => {
  const found = skipsWithoutIssue(skipRoots.flatMap((folder) => sources(root, folder)));
  if (found.length === 0) return succeed("Every skipped test names its issue (there are none).\n");
  return fail(
    found.map(({ path, line, text }) => `${path}:${line}: a skipped test needs the issue that brings it back (#123 or its address): ${text.trim()}\n`).join(""),
  );
};

/** What `runCli` needs of the process it runs in. */
export interface CliProcess {
  argv: string[];
  cwd(): string;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  exitCode: number | string | null | undefined;
}

/**
 * Runs a command in a process: prints what it says, sets the exit code from its result, and turns an error it throws
 * (a missing file, a day that is no day) into a message and exit code 1 rather than a stack trace.
 */
export function runCli(command: Command, proc: CliProcess = process, stdin: () => string = () => readFileSync(0, "utf8")): void {
  let result: CliResult;
  try {
    result = command({ args: proc.argv.slice(2), now: new Date(), root: proc.cwd(), stdin });
  } catch (error) {
    result = fail(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  proc.stdout.write(result.stdout);
  proc.stderr.write(result.stderr);
  proc.exitCode = result.exitCode;
}
