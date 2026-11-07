import type { IDBPDatabase, IDBPTransaction } from "idb";
import { receive, tick, type Timestamp } from "./hlc";

/**
 * The sync code works on any IndexedDB that has the stores of its record types plus the ones below, so it
 * is typed loosely: which stores hold which record types is the registry's business, not the database's.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- idb cannot name "a database of any schema": IDBPDatabase<AppDb> and a test's own schema are not assignable to a common type
export type SyncDb = IDBPDatabase<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as SyncDb
export type SyncTransaction = IDBPTransaction<any, string[], "readwrite">;

/** When each field of a record was last set, kept apart from the record so Tasks and Events stay clean. */
export interface FieldClocks {
  type: string;
  id: string;
  clocks: Record<string, string>;
}

/** A field change that the server has not confirmed yet. A newer edit of the same field replaces it. */
export interface OutboxEntry {
  type: string;
  id: string;
  field: string;
  value: unknown;
  hlc: string;
  /**
   * When (ms since the epoch) the server refused this change as certainly bad (malformed, or too big for any
   * request). It stays here, unsent, until a newer edit replaces it or an hour has passed (also across an app
   * restart): then it is tried once more, in case the refusal was the server's mistake.
   */
  rejectedAt?: number;
}

const syncStoreNames = ["fieldClocks", "outbox", "syncInfo"] as const;

/** Adds the stores sync needs; call it from the database upgrade that introduces sync. */
export function createSyncStores(db: SyncDb): void {
  db.createObjectStore("fieldClocks", { keyPath: ["type", "id"] });
  db.createObjectStore("outbox", { keyPath: ["type", "id", "field"] });
  // Key/value: "deviceId", "clock" (the HLC state), "cursor" (how far the server's feed was read), "lastSyncedAt".
  db.createObjectStore("syncInfo");
}

/** Every transaction that touches records also touches the sync stores, so the two never disagree. */
export function transactionOver(db: SyncDb, storeNames: string[]): SyncTransaction {
  return db.transaction([...new Set([...storeNames, ...syncStoreNames])], "readwrite");
}

/** This device's clock; the device id is made up once and kept for good. */
async function loadClock(tx: SyncTransaction): Promise<Timestamp> {
  const info = tx.objectStore("syncInfo");
  const saved = (await info.get("clock")) as Timestamp | undefined;
  if (saved) return saved;
  let node = (await info.get("deviceId")) as string | undefined;
  if (node === undefined) {
    node = crypto.randomUUID();
    await info.put(node, "deviceId");
  }
  return { wall: 0, counter: 0, node };
}

/** Stamps a local change; returns the timestamp all fields of that change share. */
export async function stampLocalChange(tx: SyncTransaction, now: Date): Promise<Timestamp> {
  const info = tx.objectStore("syncInfo");
  const clock = tick(await loadClock(tx), now.getTime());
  await info.put(clock, "clock");
  return clock;
}

/** Moves the clock past timestamps seen elsewhere (other devices' changes, the server's time). */
export async function receiveTimestamps(tx: SyncTransaction, seen: Pick<Timestamp, "wall" | "counter">[], now: Date): Promise<void> {
  const info = tx.objectStore("syncInfo");
  let clock = await loadClock(tx);
  for (const remote of seen) clock = receive(clock, remote, now.getTime());
  await info.put(clock, "clock");
}
