import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Like workflow.test.ts, a test of the repository's own files: the left-out tests check (leftOutTests.ts) reads the JSON reports
// of the test runs, so every run has to write one where the check looks, and the commands that CI runs have to call the check.
// It cannot tell that the check runs after the tests in CI, only that the commands are wired; the real runs are in the evidence.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const scriptsOf = (path: string): Record<string, string> => {
  const data: unknown = JSON.parse(read(path));
  const scripts = typeof data === "object" && data !== null && "scripts" in data ? data.scripts : undefined;
  if (typeof scripts !== "object" || scripts === null) return {};
  return Object.fromEntries(Object.entries(scripts).flatMap(([name, command]) => (typeof command === "string" ? [[name, command]] : [])));
};
const workspaces = ["client", "server", "tools"];
const root = scriptsOf("package.json");

describe("the test commands write the reports that the left-out tests check reads", () => {
  it.each(workspaces)("%s: vitest writes its JSON report next to its coverage, and still measures coverage", (workspace) => {
    const command = scriptsOf(`${workspace}/package.json`)["test"] ?? "";

    expect(command).toContain("--coverage");
    expect(command).toContain("--reporter=json");
    expect(command).toContain("--reporter=default");
    expect(command).toContain("--outputFile.json=reports/test-results.json");
  });

  it("test:unit checks the report of every workspace, after the three runs", () => {
    const command = root["test:unit"] ?? "";

    for (const workspace of workspaces) expect(command, workspace).toContain(`vitest=${workspace}/reports/test-results.json`);
    expect(command.indexOf("check:left-out")).toBeGreaterThan(command.lastIndexOf("npm run test -w"));
  });

  it("test:e2e checks the Playwright report, after the run, and Playwright writes it there", () => {
    const command = root["test:e2e"] ?? "";

    expect(command).toContain("playwright=reports/e2e-results.json");
    expect(command.indexOf("check:left-out")).toBeGreaterThan(command.indexOf("playwright test"));
    expect(read("playwright.config.ts")).toContain('outputFile: "reports/e2e-results.json"');
  });

  it("check:left-out builds the tools and runs the check", () => {
    expect(root["check:left-out"]).toBe("npm run build -w tools && node tools/dist/bin/leftOutTests.js");
  });
});
