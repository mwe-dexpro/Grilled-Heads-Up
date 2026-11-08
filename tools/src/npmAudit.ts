import { allowedBy, type AllowlistEntry } from "./allowlist.js";

export interface AuditFinding {
  /** The package the advisory is about. */
  name: string;
  severity: "high" | "critical";
  /** The advisory's name (`GHSA-…`, `CVE-…`), or its number when npm gave no address. */
  id: string;
  url: string;
  title: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Every advisory npm lists in `via` (a package that only passes one on names the other package, as a string). */
function advisories(audit: Record<string, unknown>): Record<string, unknown>[] {
  const vulnerabilities = audit["vulnerabilities"];
  if (!isRecord(vulnerabilities)) return [];
  return Object.values(vulnerabilities)
    .flatMap((vulnerability) => (isRecord(vulnerability) ? list(vulnerability["via"]) : []))
    .filter(isRecord);
}

/** The advisory's name: the last part of its address (`…/advisories/GHSA-xxxx`), or its number. */
function idOf(advisory: Record<string, unknown>): string {
  const last = text(advisory["url"]).split("/").pop() ?? "";
  return last === "" ? String(advisory["source"]) : last;
}

/** The high and critical advisories of an `npm audit --json` report, each once, critical first. */
export function highFindings(audit: unknown): AuditFinding[] {
  if (!isRecord(audit)) return [];
  const found = new Map<string, AuditFinding>();
  for (const advisory of advisories(audit)) {
    const severity = advisory["severity"];
    if (severity !== "high" && severity !== "critical") continue;
    const finding: AuditFinding = { name: text(advisory["name"]), severity, id: idOf(advisory), url: text(advisory["url"]), title: text(advisory["title"]) };
    found.set(`${finding.name} ${finding.id}`, finding);
  }
  const rank = (finding: AuditFinding) => (finding.severity === "critical" ? 0 : 1);
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** How many different advisories of this severity the report lists. */
function countOf(audit: Record<string, unknown>, severity: string): number {
  return new Set(
    advisories(audit)
      .filter((advisory) => advisory["severity"] === severity)
      .map((advisory) => `${text(advisory["name"])} ${idOf(advisory)}`),
  ).size;
}

/**
 * What `npm run security:audit` does with `npm audit --json`: fails on any high or critical advisory the allowlist does
 * not (still) allow, and on any output that is no audit, so that an audit that could not run never passes.
 */
export function gateNpmAudit(report: string, allowlist: AllowlistEntry[], today: string): { exitCode: 0 | 1; output: string } {
  let audit: unknown;
  try {
    audit = JSON.parse(report);
  } catch {
    return { exitCode: 1, output: "npm audit gave no JSON, so nothing was checked.\n" };
  }
  if (isRecord(audit) && "error" in audit) {
    const error = audit["error"];
    const summary = isRecord(error) ? text(error["summary"]) : "";
    const code = isRecord(error) ? text(error["code"]) : "";
    return { exitCode: 1, output: `npm audit failed${code === "" ? "" : ` (${code})`}: ${summary === "" ? "no reason given" : summary}\n` };
  }
  if (!isRecord(audit) || audit["auditReportVersion"] !== 2 || !isRecord(audit["vulnerabilities"])) {
    return { exitCode: 1, output: "npm audit gave a report in a format this check does not know (expected auditReportVersion 2).\n" };
  }

  const found = highFindings(audit).map((finding) => ({ finding, entry: allowedBy(allowlist, "npm-audit", finding.id, today) }));
  const open = found.filter(({ entry }) => entry === undefined).map(({ finding }) => finding);
  const allowedLines = found.flatMap(({ finding, entry }) =>
    entry === undefined ? [] : [`Allowed until ${entry.expires}: ${finding.name} ${finding.id} (${entry.reason})\n`],
  );

  if (open.length === 0) {
    return {
      exitCode: 0,
      output: `No high or critical advisories (${countOf(audit, "moderate")} moderate, ${countOf(audit, "low")} low).\n${allowedLines.join("")}`,
    };
  }
  const lines = open.map((finding) => `${finding.severity.padEnd(8)}  ${finding.name}  ${finding.id}  ${finding.url}  ${finding.title}\n`);
  return {
    exitCode: 1,
    output: `${open.length} high or critical ${open.length === 1 ? "advisory" : "advisories"} (npm audit):\n${lines.join("")}${allowedLines.join("")}`,
  };
}
