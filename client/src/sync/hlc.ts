/**
 * Hybrid logical clock (ADR-0010). Every synced change carries one timestamp; the later timestamp wins.
 * `wall` follows the device clock but never goes backwards and jumps ahead of anything the device has
 * seen, so an edit made after seeing another device's change always stamps later, even on a slow clock.
 */
export interface Timestamp {
  /** Milliseconds since the epoch. */
  wall: number;
  /** Orders changes within one millisecond. */
  counter: number;
  /** The device that made it; breaks ties so two devices never produce equal timestamps. */
  node: string;
}

const wallDigits = 15;
const counterDigits = 5;
const maxCounter = 10 ** counterDigits - 1;

/** The timestamp as text of fixed width, so comparing two of them as strings compares the timestamps. */
export function encode({ wall, counter, node }: Timestamp): string {
  return `${String(wall).padStart(wallDigits, "0")}-${String(counter).padStart(counterDigits, "0")}-${node}`;
}

export function decode(hlc: string): Timestamp {
  const counterAt = wallDigits + 1;
  const nodeAt = counterAt + counterDigits + 1;
  return { wall: Number(hlc.slice(0, wallDigits)), counter: Number(hlc.slice(counterAt, nodeAt - 1)), node: hlc.slice(nodeAt) };
}

/** A counter that no longer fits its width moves on to the next millisecond instead. */
function normalized(wall: number, counter: number, node: string): Timestamp {
  return counter > maxCounter ? { wall: wall + 1, counter: 0, node } : { wall, counter, node };
}

/** The clock after a change made on this device at `now` (ms): later than every earlier timestamp it produced. */
export function tick(state: Timestamp, now: number): Timestamp {
  const wall = Math.max(state.wall, now);
  return normalized(wall, wall === state.wall ? state.counter + 1 : 0, state.node);
}

/** The clock after seeing a timestamp from elsewhere (another device's change, or the server's time). */
export function receive(state: Timestamp, remote: Pick<Timestamp, "wall" | "counter">, now: number): Timestamp {
  const wall = Math.max(state.wall, remote.wall, now);
  const counters = [...(wall === state.wall ? [state.counter] : []), ...(wall === remote.wall ? [remote.counter] : [])];
  return normalized(wall, counters.length === 0 ? 0 : Math.max(...counters) + 1, state.node);
}
