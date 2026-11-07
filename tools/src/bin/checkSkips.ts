import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { skipsWithoutIssue, type SourceFile } from "../checkSkips.js";

/** `npm run lint:skips`: fails on a skipped test that is allowed without naming the issue that brings it back. */
const roots = ["client/src", "server/src", "tools/src", "e2e"];

function sources(folder: string): SourceFile[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [{ path, text: readFileSync(path, "utf8") }] : [];
  });
}

const found = skipsWithoutIssue(roots.flatMap(sources));
for (const { path, line, text } of found)
  console.error(`${path}:${line}: a skipped test needs the issue that brings it back (#123 or its address): ${text.trim()}`);
if (found.length === 0) console.log("Every skipped test names its issue (there are none).");
process.exitCode = found.length === 0 ? 0 : 1;
