/** Pure rules of the swipe-to-reveal Task row; `SwipeRow` only feeds pointer coordinates in. */

/** Pixels from either screen edge where a swipe is ignored: Android's back gesture starts there (ALIGNMENT §3.4). */
export const edgeZone = 24;

/** Width of each revealed action (design README, "Swipe actions"). */
export const actionWidth = 78;

/** Whether a swipe may start at `x` on a viewport this wide: not inside either edge zone. */
export function canStartSwipe(x: number, viewportWidth: number): boolean {
  return x >= edgeZone && x <= viewportWidth - edgeZone;
}

/**
 * Where the row sits while it is dragged by (`dx`, `dy`) from where it rested (`from`: 0 closed, `-actionsWidth`
 * open): clamped between fully open and closed, and left where it was until the horizontal move exceeds the
 * vertical one, so scrolling up or down never moves it.
 */
export function dragOffset(dx: number, dy: number, actionsWidth: number, from = 0): number {
  if (Math.abs(dx) <= Math.abs(dy)) return from;
  return Math.min(0, Math.max(-actionsWidth, from + dx));
}

/** On release: opens (snaps to `-actionsWidth`) when dragged left by more than a third of the actions' width, else closes. */
export function settle(offset: number, actionsWidth: number): number {
  return offset < -actionsWidth / 3 ? -actionsWidth : 0;
}
