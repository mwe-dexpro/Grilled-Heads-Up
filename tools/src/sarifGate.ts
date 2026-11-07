import { allowedBy, type AllowlistEntry } from "./allowlist.js";

/** From this security severity on, a CodeQL result is high; from 9.0 critical. */
const highFrom = 7;
const criticalFrom = 9;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

interface Finding {
  /** `unclassified`: the result's rule, or its security severity, cannot be found in the file. */
  severity: "high" | "critical" | "unclassified";
  rule: string;
  place: string;
  message: string;
}

/** What the file says of one rule: its id, whether it is a security rule, and its security severity if it has a usable one. */
interface RuleInfo {
  id: string | undefined;
  security: boolean;
  severity: number | undefined;
}

function infoOf(rule: Record<string, unknown>): RuleInfo {
  const properties = isRecord(rule["properties"]) ? rule["properties"] : {};
  const raw = properties["security-severity"];
  const severity = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return {
    id: typeof rule["id"] === "string" ? rule["id"] : undefined,
    security: list(properties["tags"]).includes("security") || raw !== undefined,
    severity: Number.isNaN(severity) ? undefined : severity,
  };
}

/** The rules of a run in the order the file lists them, by tool component (the driver, then each extension). */
function componentsOf(run: Record<string, unknown>): Record<string, unknown>[][] {
  const tool = isRecord(run["tool"]) ? run["tool"] : {};
  return [tool["driver"], ...list(tool["extensions"])].map((source) => (isRecord(source) ? list(source["rules"]).filter(isRecord) : []));
}

/**
 * What the run says of the rule a result belongs to: found by the result's rule id, else by the index it gives (`ruleIndex`
 * or `rule.index`, in the driver, or in the extension `rule.toolComponent.index` names). A run that does not say gives `undefined`.
 */
function ruleOf(components: Record<string, unknown>[][], result: Record<string, unknown>): { name: string | undefined; info: RuleInfo | undefined } {
  const reference = isRecord(result["rule"]) ? result["rule"] : {};
  const name = typeof result["ruleId"] === "string" ? result["ruleId"] : typeof reference["id"] === "string" ? reference["id"] : undefined;
  const all = components.flat().map(infoOf);
  const byId = name === undefined ? undefined : all.find(({ id }) => id === name);
  if (byId !== undefined) return { name, info: byId };

  const index = typeof result["ruleIndex"] === "number" ? result["ruleIndex"] : reference["index"];
  const component =
    isRecord(reference["toolComponent"]) && typeof reference["toolComponent"]["index"] === "number" ? reference["toolComponent"]["index"] + 1 : 0;
  const entry = typeof index === "number" ? components[component]?.[index] : undefined;
  const info = entry === undefined ? undefined : infoOf(entry);
  return { name: name ?? info?.id, info };
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
 * severity of 7.0 or more (high, critical) that the allowlist does not (still) allow, on a result it cannot classify (its
 * rule is not in the file, or a security rule has no usable severity: a changed file format must not let high results
 * pass), and on files it cannot read or none at all, so that an analysis that produced nothing never passes.
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
    const runs = isRecord(data) ? list(data["runs"]) : [];
    const runRecords = runs.filter(isRecord);
    if (!isRecord(data) || !Array.isArray(data["runs"]) || runRecords.length !== runs.length)
      return { exitCode: 1, output: `${name} is not valid SARIF JSON.\n` };
    for (const run of runRecords) {
      const components = componentsOf(run);
      for (const result of list(run["results"]).filter(isRecord)) {
        const { name, info } = ruleOf(components, result);
        const rule = name ?? "(no rule)";
        // A result is let through only when its rule is known and is no security rule, or has a security severity below 7.0.
        const severity = info?.severity;
        if (severity !== undefined && severity < highFrom) {
          lower += 1;
          continue;
        }
        if (info !== undefined && !info.security) {
          lower += 1;
          continue;
        }
        const message = isRecord(result["message"]) && typeof result["message"]["text"] === "string" ? result["message"]["text"] : "";
        const level = severity === undefined ? "unclassified" : severity >= criticalFrom ? "critical" : "high";
        findings.push({ severity: level, rule, place: placeOf(result), message });
      }
    }
  }

  const found = findings.map((finding) => ({ finding, entry: allowedBy(allowlist, "codeql", finding.rule, today) }));
  const open = found.filter(({ entry }) => entry === undefined).map(({ finding }) => finding);
  const allowed = new Map<string, AllowlistEntry>();
  for (const { finding, entry } of found) if (entry !== undefined) allowed.set(finding.rule, entry);
  const allowedLines = [...allowed].map(([rule, entry]) => `Allowed until ${entry.expires}: ${rule} (${entry.reason})\n`);

  if (open.length === 0) {
    return {
      exitCode: 0,
      output: `No high or critical CodeQL results (${lower} ${lower === 1 ? "result" : "results"} of lower severity).\n${allowedLines.join("")}`,
    };
  }
  const rank = (finding: Finding) => ["critical", "high", "unclassified"].indexOf(finding.severity);
  const lines = [...open]
    .sort((a, b) => rank(a) - rank(b) || a.rule.localeCompare(b.rule) || a.place.localeCompare(b.place))
    .map((finding) => `${finding.severity.padEnd(8)}  ${finding.rule}  ${finding.place}  ${finding.message}\n`);
  const kind = open.some(({ severity }) => severity === "unclassified") ? "high, critical or unclassified" : "high or critical";
  return {
    exitCode: 1,
    output: `${open.length} ${kind} CodeQL ${open.length === 1 ? "result" : "results"}:\n${lines.join("")}${allowedLines.join("")}`,
  };
}
