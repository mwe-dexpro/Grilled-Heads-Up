/**
 * The day the security checks judge expiry by: today in UTC, unless `--today=YYYY-MM-DD` says otherwise (to see what a
 * later day would do, and in the tests of the gates). Only the command line can move it: an environment variable, set in
 * a workflow or by a stray `env:` line, would make expired exceptions valid again without anything showing it.
 */
export function todayFrom(args: string[], now: Date): string {
  const named = args.find((arg) => arg.startsWith("--today="))?.slice("--today=".length);
  if (named === undefined) return now.toISOString().slice(0, 10);
  const date = new Date(`${named}T00:00:00Z`);
  // Only the day as written by `toISOString` survives the round trip: no other text, and no day that does not exist.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== named) throw new Error(`"${named}" is not a day as YYYY-MM-DD.`);
  return named;
}
