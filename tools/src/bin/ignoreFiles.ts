import { readFileSync, writeFileSync } from "node:fs";
import { parseAllowlist } from "../allowlist.js";
import { gitleaksIgnore, trivyIgnore } from "../ignoreFiles.js";
import { todayFrom } from "../today.js";

/** `npm run security:ignorefiles`: writes `.trivyignore` and `.gitleaksignore` from the allowlist, right before those scanners run. */
const allowlist = parseAllowlist(readFileSync(".github/security-allowlist.json", "utf8"));
if (allowlist.errors.length > 0) {
  console.error(allowlist.errors.join("\n"));
  process.exitCode = 1;
} else {
  writeFileSync(".trivyignore", trivyIgnore(allowlist.entries));
  writeFileSync(".gitleaksignore", gitleaksIgnore(allowlist.entries, todayFrom(process.argv.slice(2), process.env, new Date())));
  console.log("Wrote .trivyignore and .gitleaksignore from .github/security-allowlist.json.");
}
