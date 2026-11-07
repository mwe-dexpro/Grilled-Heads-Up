import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseAllowlist } from "../allowlist.js";
import { gateSarif } from "../sarifGate.js";
import { todayFrom } from "../today.js";

/** `node tools/dist/bin/sarifGate.js <folder or .sarif file>…`: fails on a high or critical CodeQL result the allowlist does not allow. */
function sarifFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((name) => name.endsWith(".sarif"))
    .map((name) => join(path, name));
}

const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const allowlist = parseAllowlist(readFileSync(".github/security-allowlist.json", "utf8"));
if (allowlist.errors.length > 0) {
  console.error(allowlist.errors.join("\n"));
  process.exitCode = 1;
} else {
  const files = paths.flatMap(sarifFiles).map((name) => ({ name, text: readFileSync(name, "utf8") }));
  const result = gateSarif(files, allowlist.entries, todayFrom(process.argv.slice(2), process.env, new Date()));
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  process.exitCode = result.exitCode;
}
