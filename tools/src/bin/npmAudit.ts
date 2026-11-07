import { readFileSync } from "node:fs";
import { parseAllowlist } from "../allowlist.js";
import { gateNpmAudit } from "../npmAudit.js";
import { todayFrom } from "../today.js";

/** `npm audit --json | node tools/dist/bin/npmAudit.js`: fails on a high or critical advisory the allowlist does not allow. */
const allowlist = parseAllowlist(readFileSync(".github/security-allowlist.json", "utf8"));
if (allowlist.errors.length > 0) {
  console.error(allowlist.errors.join("\n"));
  process.exitCode = 1;
} else {
  const result = gateNpmAudit(readFileSync(0, "utf8"), allowlist.entries, todayFrom(process.argv.slice(2), process.env, new Date()));
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  process.exitCode = result.exitCode;
}
