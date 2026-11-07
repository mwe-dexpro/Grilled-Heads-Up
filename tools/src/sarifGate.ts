import { isAllowed, type AllowlistEntry } from "./allowlist.js";

/** From this security severity on, a CodeQL result is high; from 9.0 critical. */
const highFrom = 7;
const criticalFrom = 9;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);

interface Finding {
  severity: "high" | "critical";
  rule: string;
  place: string;
  message: string;
}

/** The security severity of every rule of a run (CodeQL writes it as text, e.g. "7.5"), by rule id. */
function severities(run: Record<string, unknown>): Map<string, number> {
  const tool = isRecord(run["tool"]) ? run["tool"] : {};
  const sources = [tool["driver"], ...list(tool["extensions"])].filter(isRecord);
  const found = new Map<string, number>();
  for (const source of sources) {
    for (const rule of list(source["rules"]).filter(isRecord)) {
      const properties = rule["properties"];
      const raw = isRecord(properties) ? properties["security-severity"] : undefined;
      const severity = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
      if (typeof rule["id"] === "string" && !Number.isNaN(severity)) found.set(rule["id"], severity);
    }
  }
  return found;
}

function placeOf(result: Record<string, unknown>): string {
  const location = list(result["locations"]).find(isRecord);
  const physical = location !== undefined && isRecord(location["physicalLocation"]) ? location["physicalLocation"] : undefined;
  const artifact = physical !== undefined && isRecord(physical["artifactLocation"]) ? physical["artifactLocation"] : undefined;
  const region = physical !== undefined && isRecord(physical["region"]) ? physical["region"] : undefined;
  if (artifact === undefined || typeof artifact["uri"] !== "string") return "(no location)";
  return typeof region?.["startLine"] === "number" ? `${artifact["uri"]}:${region["startLine"]}` : artifact["uri"];
}

/**
 * What the CodeQL job does with the SARIF files the analysis wrote: fails on every result of a rule with a security
 * severity of 7.0 or more (high, critical) that the allowlist does not (still) allow, and on files it cannot read or
 * none at all, so that an analysis that produced nothing never passes.
 */
export function gateSarif(files: { name: string; text: string }[], allowlist: AllowlistEntry[], today: string): { exitCode: 0 | 1; output: string } {
  if (files.length === 0) return { exitCode: 1, output: "No SARIF files were found, so nothing was checked.\n" };

  const findings: Finding[] = [];
  let lower = 0;
  for (const { name, text } of files) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { exitCode: 1, output: `${name} is not valid SARIF JSON.\n` };
    }
    if (!isRecord(data) || !Array.isArray(data["runs"]) || !(data["runs"] as unknown[]).every(isRecord))
      return { exitCode: 1, output: `${name} is not valid SARIF JSON.\n` };
    for (const run of data["runs"] as Record<string, unknown>[]) {
      const bySeverity = severities(run);
      for (const result of list(run["results"]).filter(isRecord)) {
        const rule = typeof result["ruleId"] === "string" ? result["ruleId"] : "";
        const severity = bySeverity.get(rule);
        if (severity === undefined || severity < highFrom) {
          lower += 1;
          continue;
        }
        const message = isRecord(result["message"]) && typeof result["message"]["text"] === "string" ? result["message"]["text"] : "";
        findings.push({ severity: severity >= criticalFrom ? "critical" : "high", rule, place: placeOf(result), message });
      }
    }
  }

  const open = findings.filter((finding) => !isAllowed(allowlist, "codeql", finding.rule, today));
  const allowedRules = [...new Set(findings.filter((finding) => !open.includes(finding)).map((finding) => finding.rule))];
  const allowedLines = allowedRules.map((rule) => {
    const entry = allowlist.find((candidate) => candidate.tool === "codeql" && candidate.id === rule);
    return `Allowed until ${entry?.expires ?? "?"}: ${rule} (${entry?.reason ?? ""})\n`;
  });

  if (open.length === 0) {
    return {
      exitCode: 0,
      output: `No high or critical CodeQL results (${lower} ${lower === 1 ? "result" : "results"} of lower severity).\n${allowedLines.join("")}`,
    };
  }
  const rank = (finding: Finding) => (finding.severity === "critical" ? 0 : 1);
  const lines = [...open]
    .sort((a, b) => rank(a) - rank(b) || a.rule.localeCompare(b.rule) || a.place.localeCompare(b.place))
    .map((finding) => `${finding.severity.padEnd(8)}  ${finding.rule}  ${finding.place}  ${finding.message}\n`);
  return {
    exitCode: 1,
    output: `${open.length} high or critical CodeQL ${open.length === 1 ? "result" : "results"}:\n${lines.join("")}${allowedLines.join("")}`,
  };
}
