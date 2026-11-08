import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allowlistCommand,
  checkSkipsCommand,
  ignoreFilesCommand,
  npmAuditCommand,
  runCli,
  sarifGateCommand,
  type CliInput,
  type CliProcess,
  type CliResult,
  type Command,
} from "./cli.js";

const now = new Date("2026-11-07T12:00:00Z");
const allowlistFile = ".github/security-allowlist.json";
const entry = (fields: Record<string, string> = {}) => ({
  tool: "npm-audit",
  id: "GHSA-aaaa-bbbb-cccc",
  reason: "Dev tool only; #99 removes it.",
  expires: "2026-12-31",
  ...fields,
});
const allowlist = (...entries: Record<string, string>[]) => JSON.stringify({ entries });
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

const roots: string[] = [];
/** A folder of files, as the root of a repository for the length of the test. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tools-cli-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const run = (command: Command, root: string, args: string[] = [], stdin = ""): CliResult =>
  command({
    args,
    now,
    root,
    stdin: () => stdin,
  });

describe("allowlistCommand", () => {
  it("passes an allowlist that is valid and has not run out, and says which file it read", () => {
    const root = repository({ [allowlistFile]: allowlist(entry()) });

    expect(run(allowlistCommand, root)).toEqual({ exitCode: 0, stdout: `${allowlistFile}: every exception is valid and has not run out.\n`, stderr: "" });
  });

  it("fails an exception that has run out, naming the file and the entry", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ expires: "2026-11-06" })) });

    const result = run(allowlistCommand, root);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `${allowlistFile}: Expired on 2026-11-06: npm-audit GHSA-aaaa-bbbb-cccc (Dev tool only; #99 removes it.). Fix it, or renew it with a new reason.\n`,
    );
  });

  it("holds an exception through its last day, and fails it the day after: --today moves the day, and says so on stderr", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ expires: "2026-11-07" })) });

    expect(run(allowlistCommand, root, ["--today=2026-11-07"])).toMatchObject({ exitCode: 0, stderr: "Judging expiry as of 2026-11-07 (--today).\n" });
    const later = run(allowlistCommand, root, ["--today=2026-11-08"]);
    expect(later.exitCode).toBe(1);
    expect(later.stderr).toMatch(/^Judging expiry as of 2026-11-08 \(--today\)\.\n.*Expired on 2026-11-07/);
  });

  it("says nothing about the day when the clock's day is used", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    expect(run(allowlistCommand, root).stderr).toBe("");
  });

  it("reads the file a .json argument names, and still says which", () => {
    const root = repository({ [allowlistFile]: allowlist(), "other/list.json": allowlist(entry({ expires: "2020-01-01" })) });

    const result = run(allowlistCommand, root, ["other/list.json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^other\/list\.json: Expired on 2020-01-01/);
  });

  it("reads a file named by an absolute path, as a person at the command line expects", () => {
    const root = repository({ [allowlistFile]: allowlist() });
    const elsewhere = repository({ "list.json": allowlist(entry({ expires: "2020-01-01" })) });
    const named = join(elsewhere, "list.json");

    const result = run(allowlistCommand, root, [named]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`${named}: Expired on 2020-01-01`);
  });

  it("fails an allowlist that is not valid, with every message on a line of its own", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ tool: "snyk" }), entry({ reason: "" })) });

    const result = run(allowlistCommand, root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.split("\n")).toHaveLength(3);
    expect(
      result.stderr
        .split("\n")
        .slice(0, 2)
        .every((line) => line.startsWith(`${allowlistFile}: Entry `)),
    ).toBe(true);
  });

  it("does not read the file when the day is no day, and when there is no file", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    expect(() => run(allowlistCommand, root, ["--today=soon"])).toThrow('"soon" is not a day as YYYY-MM-DD');
    expect(() => run(allowlistCommand, repository({}))).toThrow(/ENOENT/);
  });
});

describe("npmAuditCommand", () => {
  it("fails the audit with high advisories in it, listing them on stderr", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    const result = run(npmAuditCommand, root, [], fixture("npm-audit-baseline.json"));

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("high or critical advisories (npm audit):");
    expect(result.stderr).toContain("GHSA-mrhx-c7xc-m3w5");
  });

  it("passes the audit without them, and says so on stdout", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    const result = run(npmAuditCommand, root, [], fixture("npm-audit-fixed.json"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^No high or critical advisories \(\d+ moderate, \d+ low\)\.\n/);
    expect(result.stderr).toBe("");
  });

  it("lets the allowlist's entries through, each with its day", () => {
    const ids = [...new Set(fixture("npm-audit-baseline.json").match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g))];
    const root = repository({ [allowlistFile]: allowlist(...ids.map((id) => entry({ id }))) });

    const result = run(npmAuditCommand, root, [], fixture("npm-audit-baseline.json"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Allowed until 2026-12-31: zod GHSA-mrhx-c7xc-m3w5");
  });

  it("judges the allowlist by the day --today names, and says so", () => {
    const ids = [...new Set(fixture("npm-audit-baseline.json").match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g))];
    const root = repository({ [allowlistFile]: allowlist(...ids.map((id) => entry({ id }))) });

    const result = run(npmAuditCommand, root, ["--today=2027-01-01"], fixture("npm-audit-baseline.json"));

    expect(result.exitCode).toBe(1);
    expect(result.stderr.startsWith("Judging expiry as of 2027-01-01 (--today).\n")).toBe(true);
  });

  it("stops at an allowlist that is not valid, before it reads the audit", () => {
    const root = repository({ [allowlistFile]: "{" });
    const input: CliInput = {
      args: [],
      now,
      root,
      stdin: () => {
        throw new Error("the audit was read");
      },
    };

    expect(npmAuditCommand(input)).toEqual({ exitCode: 1, stdout: "", stderr: "The allowlist is not valid JSON.\n" });
  });
});

describe("an allowlist that is not valid, for the commands that read it", () => {
  it("names every error on a line of its own, the way the allowlist check does", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ tool: "snyk" }), entry({ reason: "" })) });

    const result = run(npmAuditCommand, root, [], fixture("npm-audit-fixed.json"));

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: 'Entry 1: the tool "snyk" is not one of npm-audit, trivy, codeql, gitleaks.\nEntry 2: the reason is missing.\n',
    });
  });
});

describe("sarifGateCommand", () => {
  const sarif = (rule: string, severity: string, line: number) =>
    JSON.stringify({
      runs: [
        {
          tool: { driver: { rules: [{ id: rule, properties: { "security-severity": severity, tags: ["security"] } }] } },
          results: [
            { ruleId: rule, message: { text: "m" }, locations: [{ physicalLocation: { artifactLocation: { uri: "a.ts" }, region: { startLine: line } } }] },
          ],
        },
      ],
    });

  it("fails on a high result in the .sarif files of a folder, with its place on stderr", () => {
    const root = repository({ [allowlistFile]: allowlist(), "sarif/javascript.sarif": sarif("js/x", "8.0", 7) });

    const result = run(sarifGateCommand, root, ["sarif"]);

    expect(result).toEqual({ exitCode: 1, stdout: "", stderr: "1 high or critical CodeQL result:\nhigh      js/x  a.ts:7  m\n" });
  });

  it("reads files that end in .sarif.json too, and no other file of the folder", () => {
    const root = repository({
      [allowlistFile]: allowlist(),
      "sarif/b.sarif.json": sarif("js/b", "8.0", 2),
      "sarif/a.sarif": sarif("js/a", "9.5", 1),
      "sarif/notes.txt": "not json at all",
      "sarif/c.json": "{",
    });

    const result = run(sarifGateCommand, root, ["sarif"]);

    expect(result.stderr.split("\n")).toEqual(["2 high or critical CodeQL results:", "critical  js/a  a.ts:1  m", "high      js/b  a.ts:2  m", ""]);
  });

  it("reads the files of a folder in the order of their names, so the first broken one is the one named", () => {
    const root = repository({ [allowlistFile]: allowlist(), "sarif/b.sarif": "{", "sarif/a.sarif": "{", "sarif/c.sarif": "{" });

    expect(run(sarifGateCommand, root, ["sarif"]).stderr).toBe(`${join("sarif", "a.sarif")} is not valid SARIF JSON.\n`);
  });

  it("takes a file as it is, several paths together, and leaves options out of the paths", () => {
    const root = repository({ [allowlistFile]: allowlist(), "one.txt": sarif("js/one", "8.0", 1), "dir/two.sarif": sarif("js/two", "8.0", 2) });

    const result = run(sarifGateCommand, root, ["--today=2026-11-07", "one.txt", "dir"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("2 high or critical CodeQL results:");
    expect(result.stderr).toContain("Judging expiry as of 2026-11-07 (--today).");
  });

  it("passes a folder without high results, and says so on stdout", () => {
    const root = repository({ [allowlistFile]: allowlist(), "sarif/a.sarif": sarif("js/low", "3.0", 1) });

    expect(run(sarifGateCommand, root, ["sarif"])).toEqual({
      exitCode: 0,
      stdout: "No high or critical CodeQL results (1 result of lower severity).\n",
      stderr: "",
    });
  });

  it("fails, and does not pass, when the folder holds no SARIF file or no path is given", () => {
    const root = repository({ [allowlistFile]: allowlist(), "empty/readme.txt": "x" });

    expect(run(sarifGateCommand, root, ["empty"])).toMatchObject({ exitCode: 1, stderr: "No SARIF files were found, so nothing was checked.\n" });
    expect(run(sarifGateCommand, root, [])).toMatchObject({ exitCode: 1, stderr: "No SARIF files were found, so nothing was checked.\n" });
  });

  it("lets the allowlist's rules through, and stops at an allowlist that is not valid", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ tool: "codeql", id: "js/x" })), "sarif/a.sarif": sarif("js/x", "8.0", 7) });
    const broken = repository({ [allowlistFile]: "[]", "sarif/a.sarif": sarif("js/x", "8.0", 7) });

    expect(run(sarifGateCommand, root, ["sarif"]).exitCode).toBe(0);
    expect(run(sarifGateCommand, broken, ["sarif"])).toEqual({ exitCode: 1, stdout: "", stderr: 'The allowlist must be an object with an "entries" list.\n' });
  });

  it("reads files and folders named by an absolute path, in name order, naming them as given", () => {
    const root = repository({ [allowlistFile]: allowlist() });
    const elsewhere = repository({ "out/b.sarif": sarif("js/b", "8.0", 2), "out/a.sarif": sarif("js/a", "9.5", 1), "single.sarif": sarif("js/c", "8.0", 3) });

    const folder = run(sarifGateCommand, root, [join(elsewhere, "out")]);
    const file = run(sarifGateCommand, root, [join(elsewhere, "single.sarif")]);

    expect(folder.exitCode).toBe(1);
    expect(folder.stderr).toBe(`2 high or critical CodeQL results:\ncritical  js/a  a.ts:1  m\nhigh      js/b  a.ts:2  m\n`);
    expect(file.stderr).toBe("1 high or critical CodeQL result:\nhigh      js/c  a.ts:3  m\n");
  });

  it("throws for a path that is not there", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    expect(() => run(sarifGateCommand, root, ["missing"])).toThrow(/ENOENT/);
  });
});

describe("ignoreFilesCommand", () => {
  const entries = allowlist(
    entry({ tool: "trivy", id: "CVE-2026-0001", expires: "2026-12-31" }),
    entry({ tool: "gitleaks", id: "abc:file:rule:1", expires: "2026-11-30" }),
  );

  it("writes both files into the root from the allowlist, and says so", () => {
    const root = repository({ [allowlistFile]: entries });

    const result = run(ignoreFilesCommand, root);

    expect(result).toEqual({ exitCode: 0, stdout: "Wrote .trivyignore and .gitleaksignore from .github/security-allowlist.json.\n", stderr: "" });
    expect(readFileSync(join(root, ".trivyignore"), "utf8")).toContain("CVE-2026-0001 exp:2027-01-01\n");
    expect(readFileSync(join(root, ".gitleaksignore"), "utf8")).toContain("abc:file:rule:1\n");
  });

  it("leaves a gitleaks entry out from the day after it ran out, by the day of --today", () => {
    const root = repository({ [allowlistFile]: entries });

    run(ignoreFilesCommand, root, ["--today=2026-12-01"]);

    expect(readFileSync(join(root, ".gitleaksignore"), "utf8")).not.toContain("abc:file:rule:1");
  });

  it("writes nothing for an allowlist that is not valid", () => {
    const root = repository({ [allowlistFile]: "{" });

    expect(run(ignoreFilesCommand, root)).toEqual({ exitCode: 1, stdout: "", stderr: "The allowlist is not valid JSON.\n" });
    expect(() => readFileSync(join(root, ".trivyignore"))).toThrow(/ENOENT/);
    expect(() => readFileSync(join(root, ".gitleaksignore"))).toThrow(/ENOENT/);
  });
});

describe("checkSkipsCommand", () => {
  const folders = { "client/src/a.ts": "", "server/src/a.ts": "", "tools/src/a.ts": "", "e2e/a.ts": "" };

  it("passes a repository where no test is left out without an issue", () => {
    const root = repository({ ...folders, "client/src/b.test.ts": "// eslint-disable-next-line vitest/no-disabled-tests -- #5\nit.skip('x', () => {});\n" });

    expect(run(checkSkipsCommand, root)).toEqual({ exitCode: 0, stdout: "Every skipped test names its issue (there are none).\n", stderr: "" });
  });

  it("fails on each one without, in all four folders and the folders below them, with file and line", () => {
    const disable = "// eslint-disable-next-line vitest/no-disabled-tests -- later";
    const root = repository({
      "client/src/deep/er/a.test.ts": `import x from "y";\n${disable}\n`,
      "server/src/a.test.ts": `${disable}\n`,
      "tools/src/a.test.ts": `\n\n${disable}\n`,
      "e2e/a.spec.ts": `// eslint-disable-next-line playwright/no-skipped-test -- later\n`,
      "client/src/Probe.tsx": `const a = <p>{/* eslint-disable-line no-restricted-syntax */}</p>;\n`,
    });

    const result = run(checkSkipsCommand, root);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(
      result.stderr
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.split(": a skipped test")[0]),
    ).toEqual([
      join("client/src/deep/er/a.test.ts") + ":2",
      join("client/src/Probe.tsx") + ":1",
      join("server/src/a.test.ts") + ":1",
      join("tools/src/a.test.ts") + ":3",
      join("e2e/a.spec.ts") + ":1",
    ]);
    expect(result.stderr).toContain(
      `${join("server/src/a.test.ts")}:1: a skipped test needs the issue that brings it back (#123 or its address): ${disable}\n`,
    );
  });

  it("trims the line it shows, and reads files that end in .ts or .tsx, not ones that merely contain it", () => {
    const disable = "// eslint-disable-next-line vitest/no-disabled-tests -- later";
    const root = repository({
      ...folders,
      "client/src/a.test.ts": `    ${disable}   \n`,
      "client/src/old.ts.bak": `${disable}\n`,
      "client/src/old.tsx.orig": `${disable}\n`,
    });

    const result = run(checkSkipsCommand, root);

    expect(result.stderr).toBe(`${join("client/src/a.test.ts")}:1: a skipped test needs the issue that brings it back (#123 or its address): ${disable}\n`);
  });

  it("reads source files only", () => {
    const root = repository({ ...folders, "client/src/notes.md": "// eslint-disable-next-line vitest/no-disabled-tests\n", "e2e/data.json": "{}" });

    expect(run(checkSkipsCommand, root).exitCode).toBe(0);
  });

  it("throws when a folder is missing, rather than passing without having looked", () => {
    const root = repository({ "client/src/a.ts": "", "server/src/a.ts": "", "tools/src/a.ts": "" });

    expect(() => run(checkSkipsCommand, root)).toThrow(/ENOENT/);
  });
});

describe("runCli", () => {
  const fakeProcess = (argv: string[], cwd: string) => {
    const written = { stdout: "", stderr: "" };
    const proc: CliProcess = {
      argv,
      cwd: () => cwd,
      stdout: { write: (text) => (written.stdout += text) },
      stderr: { write: (text) => (written.stderr += text) },
      exitCode: undefined,
    };
    return { proc, written };
  };

  it("hands the command its arguments (after the script's name), folder, clock and input, and prints and exits as the result says", () => {
    const { proc, written } = fakeProcess(["node", "script.js", "one", "--two"], "/somewhere");
    let seen: CliInput | undefined;
    const command: Command = (input) => {
      seen = input;
      return { exitCode: 1, stdout: "out\n", stderr: "err\n" };
    };

    runCli(command, proc, () => "piped");

    expect(written).toEqual({ stdout: "out\n", stderr: "err\n" });
    expect(proc.exitCode).toBe(1);
    expect(seen?.args).toEqual(["one", "--two"]);
    expect(seen?.root).toBe("/somewhere");
    expect(seen?.stdin()).toBe("piped");
    expect(Math.abs((seen?.now.getTime() ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it("exits with 0 when the result says so", () => {
    const { proc } = fakeProcess(["node", "script.js"], "/");
    proc.exitCode = 1;

    runCli(() => ({ exitCode: 0, stdout: "", stderr: "" }), proc);

    expect(proc.exitCode).toBe(0);
  });

  it("turns an error the command throws into its message and exit code 1, not a stack trace", () => {
    const first = fakeProcess(["node", "script.js"], "/");
    const second = fakeProcess(["node", "script.js"], "/");

    runCli(() => {
      throw new Error("There is no such file.");
    }, first.proc);
    const notAnError: unknown = "plain text";
    runCli(() => {
      throw notAnError;
    }, second.proc);

    expect(first.written).toEqual({ stdout: "", stderr: "There is no such file.\n" });
    expect(first.proc.exitCode).toBe(1);
    expect(second.written).toEqual({ stdout: "", stderr: "plain text\n" });
    expect(second.proc.exitCode).toBe(1);
  });
});
