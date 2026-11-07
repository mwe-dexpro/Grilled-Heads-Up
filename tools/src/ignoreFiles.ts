import type { AllowlistEntry } from "./allowlist.js";

const header = "# Generated from .github/security-allowlist.json by `npm run security:ignorefiles`. Do not edit; do not commit.\n";

/** A reason as the text of one comment line: line breaks would turn the rest of it into something else. */
const oneLine = (reason: string) => reason.replace(/\s*[\r\n]\s*/g, " ").trim();

/**
 * The `.trivyignore` for the allowlist's Trivy entries. Trivy drops an entry itself on its `exp:` day, so an entry that
 * has run out fails twice: here, and in `security:allowlist`.
 */
export function trivyIgnore(entries: AllowlistEntry[]): string {
  const lines = entries.filter((entry) => entry.tool === "trivy").flatMap((entry) => [`# ${oneLine(entry.reason)}`, `${entry.id} exp:${entry.expires}`]);
  return header + lines.map((line) => `${line}\n`).join("");
}

/**
 * The `.gitleaksignore` for the allowlist's gitleaks entries. It knows no dates, so an entry that has run out is left
 * out: the finding is reported again, as it should be.
 */
export function gitleaksIgnore(entries: AllowlistEntry[], today: string): string {
  const lines = entries
    .filter((entry) => entry.tool === "gitleaks" && entry.expires >= today)
    .flatMap((entry) => [`# ${oneLine(entry.reason)} (until ${entry.expires})`, entry.id]);
  return header + lines.map((line) => `${line}\n`).join("");
}
