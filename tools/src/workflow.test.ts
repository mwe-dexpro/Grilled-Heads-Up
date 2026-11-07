import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// What the CI workflow promises, read from the file itself: the parts of it that no other check would notice breaking.
const workflow = readFileSync(fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)), "utf8");

/** The text of one job, from its id to the next job's. */
function job(id: string): string {
  const start = workflow.indexOf(`\n  ${id}:\n`);
  if (start === -1) throw new Error(`The workflow has no job ${id}.`);
  const next = /\n {2}[a-z-]+:\n/.exec(workflow.slice(start + 1));
  return workflow.slice(start, next === null ? undefined : start + 1 + next.index);
}

describe("the workflow's concurrency", () => {
  const group = /^ {2}group: (.*)$/m.exec(workflow)?.[1] ?? "";
  const cancel = /^ {2}cancel-in-progress: (.*)$/m.exec(workflow)?.[1] ?? "";

  it("cancels an older run of the same pull request, and only of a pull request", () => {
    expect(cancel).toBe("${{ github.event_name == 'pull_request' }}");
    expect(group).toContain("github.event_name == 'pull_request' && github.ref ||");
  });

  it("gives every run on main, every nightly run and every manual run a group of its own: GitHub keeps one pending run per group and cancels the older, so a shared group would drop a commit's run", () => {
    expect(group).toBe("${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}");
  });
});

describe("the CodeQL job", () => {
  it("keeps the SARIF file it gates on, whether or not the gate fails, so that a real CodeQL result can become a test fixture", () => {
    const codeql = job("codeql");

    expect(codeql).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40} # v\S+\n\s+if: always\(\)\n\s+with:\n\s+name: sarif-results\n\s+path: sarif-results\//);
  });
});
