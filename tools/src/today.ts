/**
 * The day the security checks judge expiry by: today in UTC, unless `--today=YYYY-MM-DD` or `SECURITY_TODAY` says
 * otherwise (to see what a later day would do, and in the tests of the gates).
 */
export function todayFrom(args: string[], env: Record<string, string | undefined>, now: Date): string {
  const argument = args.find((arg) => arg.startsWith("--today="))?.slice("--today=".length);
  const named = argument ?? (env["SECURITY_TODAY"] === "" ? undefined : env["SECURITY_TODAY"]);
  if (named === undefined) return now.toISOString().slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(named) ? new Date(`${named}T00:00:00Z`) : undefined;
  if (parsed === undefined || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== named) {
    throw new Error(`"${named}" is not a day as YYYY-MM-DD.`);
  }
  return named;
}
