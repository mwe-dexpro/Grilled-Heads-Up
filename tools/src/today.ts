/**
 * The day the security checks judge expiry by: today in UTC, unless `--today=YYYY-MM-DD` or `SECURITY_TODAY` says
 * otherwise (to see what a later day would do, and in the tests of the gates).
 */
export function todayFrom(args: string[], env: Record<string, string | undefined>, now: Date): string {
  const argument = args.find((arg) => arg.startsWith("--today="))?.slice("--today=".length);
  const named = argument ?? (env["SECURITY_TODAY"] === "" ? undefined : env["SECURITY_TODAY"]);
  if (named === undefined) return now.toISOString().slice(0, 10);
  const date = new Date(`${named}T00:00:00Z`);
  // Only the day as written by `toISOString` survives the round trip: no other text, and no day that does not exist.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== named) throw new Error(`"${named}" is not a day as YYYY-MM-DD.`);
  return named;
}
