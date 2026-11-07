import { readdirSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Which files Stryker mutates is decided by the `mutate` globs of each workspace, with `!` for what is left out. These tests
// read the real globs, so that a file that is left out by accident (or one that should be left out and is not) shows here.
const repository = fileURLToPath(new URL("../..", import.meta.url));

function mutateGlobs(workspace: string): string[] {
  const config: unknown = JSON.parse(readFileSync(join(repository, workspace, "stryker.config.json"), "utf8"));
  const mutate = typeof config === "object" && config !== null && "mutate" in config ? config.mutate : undefined;
  if (!Array.isArray(mutate)) throw new Error(`${workspace}/stryker.config.json has no mutate list`);
  return mutate.map(String);
}

/** Whether Stryker mutates the file (a path from the workspace's root), by the workspace's globs. */
function mutated(workspace: string, path: string): boolean {
  const globs = mutateGlobs(workspace);
  const left = (glob: string) => glob.startsWith("!") && matchesGlob(path, glob.slice(1));
  return globs.some((glob) => !glob.startsWith("!") && matchesGlob(path, glob)) && !globs.some(left);
}

/** Every file below a folder of the workspace, as a path from the workspace's root. */
const filesBelow = (workspace: string, folder: string) =>
  readdirSync(join(repository, workspace, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(folder, entry.parentPath.slice(join(repository, workspace, folder).length), entry.name).replaceAll("\\", "/"));

describe("what Stryker mutates in the client", () => {
  it("leaves out React hooks (use followed by a capital), which only the end-to-end tests reach", () => {
    for (const path of ["src/app/useRoute.ts", "src/home/useNow.ts", "src/sync/useSync.ts", "src/useAnything.ts"])
      expect(mutated("client", path), path).toBe(false);
  });

  it("keeps a file whose name merely begins with use: it is not a hook, and the glob must not hide it", () => {
    for (const path of ["src/auth/user.ts", "src/x/useful.ts", "src/data/used.ts", "src/use.ts", "src/data/userStore.ts"])
      expect(mutated("client", path), path).toBe(true);
  });

  it("takes in a new file of the domain without a config edit, and leaves out tests, their helpers and components", () => {
    expect(mutated("client", "src/tasks/somethingNew.ts")).toBe(true);
    expect(mutated("client", "src/tasks/somethingNew.test.ts")).toBe(false);
    expect(mutated("client", "src/sync/testing/memoryServer.ts")).toBe(false);
    expect(mutated("client", "src/ui/Component.tsx")).toBe(false);
  });

  it("agrees with the files in the repository: every `.ts` file but tests, helpers and hooks is mutated, and nothing else", () => {
    const sources = filesBelow("client", "src").filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.includes("/testing/"));
    const hook = (path: string) => /(^|\/)use[A-Z][^/]*\.ts$/.test(path);

    expect(sources.filter((path) => hook(path)).length).toBeGreaterThan(0);
    expect(sources.filter((path) => mutated("client", path) === hook(path))).toEqual([]);
  });
});

describe("what Stryker mutates in the server and the tools", () => {
  it("leaves out the server's entry point and test helpers, and keeps the rest", () => {
    expect(mutated("server", "src/server.ts")).toBe(false);
    expect(mutated("server", "src/testing/passkey.ts")).toBe(false);
    expect(mutated("server", "src/auth.test.ts")).toBe(false);
    for (const path of ["src/auth.ts", "src/app.ts", "src/sync.ts", "src/database.ts", "src/useful.ts"]) expect(mutated("server", path), path).toBe(true);
  });

  it("leaves out the tools' command-line wrappers and fixtures, and keeps the modules, including the code the wrappers run", () => {
    expect(mutated("tools", "src/bin/allowlist.ts")).toBe(false);
    expect(mutated("tools", "src/bin.test.ts")).toBe(false);
    for (const path of ["src/cli.ts", "src/allowlist.ts", "src/sarifGate.ts"]) expect(mutated("tools", path), path).toBe(true);
  });
});
