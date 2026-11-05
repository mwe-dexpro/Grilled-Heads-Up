/**
 * How many steps of this app's own history lie behind a history entry: 0 for the entry the app was opened on (a
 * bookmark, a link, a reload), which may have anything before it in the tab, 1 for the one after it, and so on.
 * `navigation.ts` keeps it in each entry's `history.state`; the rules for it are here, without the browser.
 */

/** The depth kept in a `history.state`, or `undefined` for an entry the app has not marked yet. */
export function depthOf(state: unknown): number | undefined {
  const stored = typeof state === "object" && state !== null ? (state as { depth?: unknown }).depth : undefined;
  return typeof stored === "number" ? stored : undefined;
}

/**
 * The depth of the entry the browser has just moved to. An entry that is marked (Back, Forward, a reload) has its
 * own. One that is not is new: it replaces the entry we were on (as deep as that one), or comes after it (one deeper).
 */
export function depthAfterMove({ stored, current, replacing }: { stored: number | undefined; current: number; replacing: boolean }): number {
  if (stored !== undefined) return stored;
  return replacing ? current : current + 1;
}

/** Whether there is a step of the app to go back to. */
export function canGoBack(depth: number): boolean {
  return depth > 0;
}
