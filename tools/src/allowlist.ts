import { matchesGlob } from "./glob.js";

/**
 * The one list of exceptions to the security gates (`.github/security-allowlist.json`). An exception names the tool
 * that found something, what it found, why that is acceptable, and the day it runs out; after that day CI fails again.
 * A CodeQL exception can be limited to files.
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
  /**
   * For `codeql` only: the files (globs, see `matchesGlob`) the exception is limited to. A result in any other file, or with no
   * file, is not excused. Without it the exception holds for the rule in the whole repository.
   */
  paths?: string[];
}

/** An exception holds for at most this many days from the day it is added. */
export const maxDays = 90;

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
/** A non-empty list of non-blank texts, or undefined. */
const pathsOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.length > 0 && value.every((path) => typeof path === "string" && path.trim() !== "") ? value.map(String) : undefined;
const toolOf = (value: unknown): ToolName | undefined => toolNames.find((name) => name === value);

/** The time of a day (midnight UTC), or undefined for anything that is no day of the calendar. */
function timeOfDay(day: string): number | undefined {
  const match = dayPattern.exec(day);
  if (match === null) return undefined;
  const [, year = "", month = "", date = ""] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(date));
  // `Date` rolls 30 February over to March; a day that survives the round trip exists.
  return new Date(time).toISOString().slice(0, 10) === day ? time : undefined;
}

const dayOf = (value: unknown): string | undefined => (typeof value === "string" && timeOfDay(value) !== undefined ? value : undefined);

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
    const tool = toolOf(row["tool"]);
    const id = textOf(row["id"]);
    const reason = textOf(row["reason"]);
    const expires = dayOf(row["expires"]);
    const scoped = row["paths"] !== undefined;
    const paths = scoped ? pathsOf(row["paths"]) : undefined;
    if (tool === undefined || id === undefined || reason === undefined || expires === undefined || (scoped && (tool !== "codeql" || paths === undefined))) {
      if (tool === undefined)
        errors.push(`${label}: the tool ${typeof row["tool"] === "string" ? `"${row["tool"]}"` : String(row["tool"])} is not one of ${toolNames.join(", ")}.`);
      if (id === undefined) errors.push(`${label}: the id is missing.`);
      if (reason === undefined) errors.push(`${label}: the reason is missing.`);
      if (expires === undefined) errors.push(`${label}: the expiry date must be a day as YYYY-MM-DD.`);
      if (scoped && tool !== undefined && tool !== "codeql")
        errors.push(`${label}: paths are for codeql entries only (the other tools' findings have no path).`);
      if (scoped && tool === "codeql" && paths === undefined) errors.push(`${label}: the paths must be a list of path globs, each a text.`);
      return;
    }
    const first = entries.findIndex((other) => other.tool === tool && other.id === id);
    if (first !== -1) {
      errors.push(`${label}: ${tool} ${id} is on the allowlist already (entry ${first + 1}).`);
      return;
    }
    entries.push({ tool, id, reason, expires, ...(paths === undefined ? {} : { paths }) });
  });
  return { entries, errors };
}

/** The entries whose last day has gone by. An entry still holds on the day it names. */
export function expired(entries: AllowlistEntry[], today: string): AllowlistEntry[] {
  return entries.filter((entry) => entry.expires < today);
}

/**
 * The exception that holds for this finding today, if there is one. An expired exception excepts nothing, and an exception
 * limited to paths excepts only a finding in one of those files (`file`; a finding whose file is not known is never excepted).
 */
export function allowedBy(entries: AllowlistEntry[], tool: ToolName, id: string, today: string, file?: string): AllowlistEntry | undefined {
  return entries.find(
    (entry) =>
      entry.tool === tool &&
      entry.id === id &&
      entry.expires >= today &&
      (entry.paths === undefined || (file !== undefined && entry.paths.some((glob) => matchesGlob(glob, file)))),
  );
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
