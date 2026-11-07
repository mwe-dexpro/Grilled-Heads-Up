import { readFileSync } from "node:fs";
import { checkAllowlist } from "../allowlist.js";
import { todayFrom } from "../today.js";

/** `npm run security:allowlist`: fails on an invalid, expired or too long exception. */
const file = process.argv.find((arg) => arg.endsWith(".json")) ?? ".github/security-allowlist.json";
const result = checkAllowlist(readFileSync(file, "utf8"), todayFrom(process.argv.slice(2), process.env, new Date()));
if (result.ok) console.log(`${file}: every exception is valid and has not run out.`);
else console.error(result.messages.map((message) => `${file}: ${message}`).join("\n"));
process.exitCode = result.ok ? 0 : 1;
