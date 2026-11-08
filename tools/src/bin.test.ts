import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The command-line wrappers decide each gate's exit code, so they run for real: built once into a folder of their own,
// then started as processes in a throwaway repository, with the input a gate would get in CI.
const tools = fileURLToPath(new URL("..", import.meta.url));
const built = join(tools, "reports", "bin-test");
const bin = (name: string) => join(built, "bin", `${name}.js`);
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

const roots: string[] = [];
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tools-bin-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}
function start(name: string, cwd: string, args: string[] = [], input = "", env: Record<string, string> = {}): Run {
  const { status, stdout, stderr } = spawnSync(process.execPath, [bin(name), ...args], { cwd, input, encoding: "utf8", env: { ...process.env, ...env } });
  return { status, stdout, stderr };
}

beforeAll(() => {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  // A compile error does not stop tsc from writing its output, so the tests below would run code that `typecheck` refuses:
  // the build has to say it worked, and says what failed when it did not (also when tsc cannot start at all).
  const { status, stdout, stderr, error } = spawnSync(process.execPath, [tsc, "--project", "tsconfig.build.json", "--outDir", built], {
    cwd: tools,
    encoding: "utf8",
  });
  expect(error, "tsc did not start").toBeUndefined();
  expect(status, `tsc failed:\n${stdout}${stderr}`).toBe(0);
}, 120_000);

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  rmSync(built, { recursive: true, force: true });
});

const allowlistFile = ".github/security-allowlist.json";
const entry = (fields: Record<string, string> = {}) => ({
  tool: "npm-audit",
  id: "GHSA-aaaa-bbbb-cccc",
  reason: "Dev tool only; #99 removes it.",
  expires: "2999-01-01",
  ...fields,
});
const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const allowlist = (...entries: Record<string, string>[]) => JSON.stringify({ entries });

describe("security:allowlist (bin/allowlist.js)", () => {
  it("exits 0 for a valid allowlist and 1 for one with an expired entry, with the message on the stream that fits", () => {
    const good = repository({ [allowlistFile]: allowlist(entry({ expires: inThirtyDays })) });
    const bad = repository({ [allowlistFile]: allowlist(entry({ expires: "2020-01-01" })) });

    expect(start("allowlist", good)).toMatchObject({ status: 0, stdout: `${allowlistFile}: every exception is valid and has not run out.\n`, stderr: "" });
    const failed = start("allowlist", bad);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain("Expired on 2020-01-01");
  });

  it("takes the day from --today, and says so", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ expires: "2030-01-01" })) });

    expect(start("allowlist", root, ["--today=2030-01-01"]).status).toBe(0);
    const later = start("allowlist", root, ["--today=2030-01-02"]);
    expect(later.status).toBe(1);
    expect(later.stderr).toContain("Judging expiry as of 2030-01-02 (--today).");
  });

  it("is not moved by SECURITY_TODAY in the environment: an expired exception stays expired", () => {
    const root = repository({ [allowlistFile]: allowlist(entry({ expires: "2020-01-01" })) });

    expect(start("allowlist", root, [], "", { SECURITY_TODAY: "2019-12-15" }).status).toBe(1);
  });

  it("exits 1 with a message, not a stack trace, for a missing file and for a day that is no day", () => {
    const empty = repository({});
    const root = repository({ [allowlistFile]: allowlist() });

    const missing = start("allowlist", empty);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("ENOENT");
    expect(missing.stderr).not.toContain("    at ");
    expect(start("allowlist", root, ["--today=soon"])).toMatchObject({ status: 1, stderr: '"soon" is not a day as YYYY-MM-DD.\n' });
  });
});

describe("security:audit (bin/npmAudit.js, npm audit --json on stdin)", () => {
  it("exits 1 for an audit with high advisories, listing them on stderr, and 0 for one without", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    const failed = start("npmAudit", root, [], fixture("npm-audit-baseline.json"));
    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain("GHSA-mrhx-c7xc-m3w5");
    expect(start("npmAudit", root, [], fixture("npm-audit-fixed.json"))).toMatchObject({ status: 0, stderr: "" });
  });

  it("exits 1 for input that is no audit, so an audit that could not run never passes", () => {
    const root = repository({ [allowlistFile]: allowlist() });

    expect(start("npmAudit", root, [], "")).toMatchObject({ status: 1, stderr: "npm audit gave no JSON, so nothing was checked.\n" });
  });
});

describe("the CodeQL gate (bin/sarifGate.js, a folder of SARIF files)", () => {
  const sarif = (severity: string) =>
    JSON.stringify({
      runs: [
        {
          tool: { driver: { rules: [{ id: "js/x", properties: { "security-severity": severity, tags: ["security"] } }] } },
          results: [
            { ruleId: "js/x", message: { text: "m" }, locations: [{ physicalLocation: { artifactLocation: { uri: "a.ts" }, region: { startLine: 3 } } }] },
          ],
        },
      ],
    });

  it("exits 1 for a high result, 0 for a lower one, and 1 for a folder with no SARIF in it or no folder at all", () => {
    const root = repository({
      [allowlistFile]: allowlist(),
      "high/javascript.sarif": sarif("8.8"),
      "low/javascript.sarif": sarif("3.0"),
      "none/readme.txt": "x",
    });

    expect(start("sarifGate", root, ["high"])).toMatchObject({ status: 1, stderr: "1 high or critical CodeQL result:\nhigh      js/x  a.ts:3  m\n" });
    expect(start("sarifGate", root, ["low"])).toMatchObject({ status: 0, stderr: "" });
    expect(start("sarifGate", root, ["none"]).status).toBe(1);
    expect(start("sarifGate", root, []).status).toBe(1);
  });

  it("finds the file CodeQL writes with either ending", () => {
    const root = repository({ [allowlistFile]: allowlist(), "out/javascript.sarif.json": sarif("8.8") });

    expect(start("sarifGate", root, ["out"]).status).toBe(1);
  });
});

describe("security:ignorefiles (bin/ignoreFiles.js)", () => {
  it("writes .trivyignore and .gitleaksignore next to where it runs, and exits 0; an invalid allowlist writes nothing and exits 1", () => {
    const good = repository({ [allowlistFile]: allowlist(entry({ tool: "trivy", id: "CVE-2026-0001", expires: "2999-12-31" })) });
    const bad = repository({ [allowlistFile]: "{" });

    expect(start("ignoreFiles", good).status).toBe(0);
    expect(readFileSync(join(good, ".trivyignore"), "utf8")).toContain("CVE-2026-0001 exp:3000-01-01\n");
    expect(readFileSync(join(good, ".gitleaksignore"), "utf8")).toContain("Generated from");
    expect(start("ignoreFiles", bad)).toMatchObject({ status: 1, stderr: "The allowlist is not valid JSON.\n" });
    expect(() => readFileSync(join(bad, ".trivyignore"))).toThrow(/ENOENT/);
  });
});

describe("lint:skips (bin/checkSkips.js)", () => {
  const folders = { "client/src/a.ts": "", "server/src/a.ts": "", "tools/src/a.ts": "", "e2e/a.ts": "" };

  it("exits 1 for a skip allowed with no issue, naming file and line on stderr, and 0 for one that names it", () => {
    const bad = repository({ ...folders, "client/src/a.test.ts": "const x = 1;\n// eslint-disable-next-line vitest/no-disabled-tests -- later\n" });
    const good = repository({ ...folders, "client/src/a.test.ts": "// eslint-disable-next-line vitest/no-disabled-tests -- #12\n" });

    const failed = start("checkSkips", bad);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toContain(`${join("client/src/a.test.ts")}:2:`);
    expect(start("checkSkips", good)).toMatchObject({ status: 0, stdout: "Every skipped test names its issue (there are none).\n" });
  });
});
