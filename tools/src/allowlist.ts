/**
 * The one list of exceptions to the security gates (`.github/security-allowlist.json`). An exception names the tool
 * that found something, what it found, why that is acceptable, and the day it runs out; after that day CI fails again.
 */
const toolNames = ["npm-audit", "trivy", "codeql", "gitleaks"] as const;
export type ToolName = (typeof toolNames)[number];

export interface AllowlistEntry {
  tool: ToolName;
  /** The advisory (GHSA or CVE) for npm-audit and trivy, the rule id for codeql, the fingerprint for gitleaks. */
  id: string;
  reason: string;
  /** The last day the exception holds, as `YYYY-MM-DD`. */
  expires: string;
}

/** An exception holds for at most this many days from the day it is added. */
export const maxDays = 90;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const isToolName = (value: unknown): value is ToolName => toolNames.some((name) => name === value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** The time of a day (midnight UTC), or undefined for text that is no day of the calendar. */
function timeOfDay(day: string): number | undefined {
  if (!dayPattern.test(day)) return undefined;
  const time = Date.parse(`${day}T00:00:00Z`);
  // `Date` rolls 30 February over to March; a day that survives the round trip exists.
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day ? undefined : time;
}

/** Reads the allowlist: the entries that are valid, and a message for everything that is not. */
export function parseAllowlist(text: string): { entries: AllowlistEntry[]; errors: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], errors: ["The allowlist is not valid JSON."] };
  }
  if (!isRecord(data) || !Array.isArray(data["entries"])) {
    return { entries: [], errors: ['The allowlist must be an object with an "entries" list.'] };
  }

  const entries: AllowlistEntry[] = [];
  const errors: string[] = [];
  const rows: unknown[] = data["entries"];
  rows.forEach((row, index) => {
    const label = `Entry ${index + 1}`;
    if (!isRecord(row)) {
      errors.push(`${label} is not an object.`);
      return;
    }
    const { tool, id, reason, expires } = row;
    const problems: string[] = [];
    if (!isToolName(tool)) problems.push(`the tool ${typeof tool === "string" ? `"${tool}"` : String(tool)} is not one of ${toolNames.join(", ")}.`);
    if (!hasText(id)) problems.push("the id is missing.");
    if (!hasText(reason)) problems.push("the reason is missing.");
    if (typeof expires !== "string" || timeOfDay(expires) === undefined) problems.push("the expiry date must be a day as YYYY-MM-DD.");
    if (problems.length > 0) {
      errors.push(...problems.map((problem) => `${label}: ${problem}`));
      return;
    }
    // The checks above made these what the entry says.
    if (!isToolName(tool) || !hasText(id) || !hasText(reason) || typeof expires !== "string") return;
    const first = entries.findIndex((other) => other.tool === tool && other.id === id);
    if (first !== -1) {
      errors.push(`${label}: ${tool} ${id} is on the allowlist already (entry ${first + 1}).`);
      return;
    }
    entries.push({ tool, id, reason, expires });
  });
  return { entries, errors };
}

/** The entries whose last day has gone by. An entry still holds on the day it names. */
export function expired(entries: AllowlistEntry[], today: string): AllowlistEntry[] {
  return entries.filter((entry) => entry.expires < today);
}

/** Whether an exception for this finding holds today. An expired one excepts nothing. */
export function isAllowed(entries: AllowlistEntry[], tool: ToolName, id: string, today: string): boolean {
  return entries.some((entry) => entry.tool === tool && entry.id === id && entry.expires >= today);
}

/** What `npm run security:allowlist` says: is the file valid, has nothing expired, does nothing run longer than 90 days. */
export function checkAllowlist(text: string, today: string): { ok: boolean; messages: string[] } {
  const { entries, errors } = parseAllowlist(text);
  const messages = [...errors];
  for (const entry of expired(entries, today)) {
    messages.push(`Expired on ${entry.expires}: ${entry.tool} ${entry.id} (${entry.reason}). Fix it, or renew it with a new reason.`);
  }
  const limit = (timeOfDay(today) ?? 0) + maxDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if ((timeOfDay(entry.expires) ?? 0) > limit) {
      messages.push(
        `${entry.tool} ${entry.id} expires on ${entry.expires}, more than ${maxDays} days from ${today}. An exception lasts at most ${maxDays} days; renew it when it runs out.`,
      );
    }
  }
  return { ok: messages.length === 0, messages };
}
