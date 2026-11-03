import { encode } from "./hlc";
import { stampLocalChange, transactionOver, type FieldClocks, type OutboxEntry, type SyncDb, type SyncTransaction } from "./syncDb";

/** What every synced record has: an id, and `deletedAt` (the tombstone; null while the record lives). */
export interface Synced {
  id: string;
  deletedAt: string | null;
}

/** A kind of record that syncs. Register it in `recordTypes.ts`; neither the sync engine nor the server changes. */
export interface RecordType<T extends Synced> {
  /** The name on the wire. Never rename it once shipped. */
  type: string;
  /** The object store holding the records; it must exist in `openAppDb`. */
  storeName: string;
  /** Fills fields missing from a record saved by an older version, or built from Changes that arrived in part. */
  withDefaults(record: Partial<T> & { id: string }): T;
}

/** The only way a domain store writes records: every change is stamped and queued for the server on the way. */
export interface Table<T extends Synced> {
  /** A record that exists and is not deleted. */
  get(id: string): Promise<T | undefined>;
  /** Live records only, in no particular order. */
  list(): Promise<T[]>;
  /** Saves the record; fields that differ from the stored record are synced, each under one shared clock. */
  put(record: T): Promise<void>;
  /** Marks the record deleted now (the tombstone); it stays stored so the deletion can sync. */
  delete(id: string): Promise<void>;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Stores `next` and records what changed: one new clock for all changed fields, their per-field clocks, and one
 * outbox entry each. Everything happens in the caller's transaction. A record never seen before changes entirely.
 */
async function writeRecord<T extends Synced>(
  tx: SyncTransaction,
  { type, storeName }: RecordType<T>,
  prev: T | undefined,
  next: T,
  now: Date,
): Promise<void> {
  const fields = Object.keys(next).filter((field) => field !== "id") as Array<keyof T & string>;
  const changed = prev ? fields.filter((field) => !sameValue(prev[field], next[field])) : fields;
  if (changed.length === 0) return;

  const hlc = encode(await stampLocalChange(tx, now));
  await tx.objectStore(storeName).put(next);
  const clocks = ((await tx.objectStore("fieldClocks").get([type, next.id])) as FieldClocks | undefined) ?? { type, id: next.id, clocks: {} };
  for (const field of changed) {
    clocks.clocks[field] = hlc;
    const entry: OutboxEntry = { type, id: next.id, field, value: next[field], hlc };
    await tx.objectStore("outbox").put(entry);
  }
  await tx.objectStore("fieldClocks").put(clocks);
}

/**
 * Opens the table of a record type. Records saved before sync existed have no field clocks yet; they are
 * given clocks and outbox entries here, so that they reach the other devices too.
 */
export async function openTable<T extends Synced>(db: SyncDb, recordType: RecordType<T>, now: () => Date): Promise<Table<T>> {
  const { type, storeName, withDefaults } = recordType;

  const tx = transactionOver(db, [storeName]);
  for (const raw of (await tx.objectStore(storeName).getAll()) as Array<Partial<T> & { id: string }>) {
    if (!(await tx.objectStore("fieldClocks").get([type, raw.id]))) await writeRecord(tx, recordType, undefined, withDefaults(raw), now());
  }
  await tx.done;

  async function stored(id: string): Promise<T | undefined> {
    const raw = (await db.get(storeName, id)) as (Partial<T> & { id: string }) | undefined;
    return raw && withDefaults(raw);
  }

  return {
    async get(id) {
      const record = await stored(id);
      return record?.deletedAt === null ? record : undefined;
    },

    async list() {
      const all = (await db.getAll(storeName)) as Array<Partial<T> & { id: string }>;
      return all.map(withDefaults).filter((record) => record.deletedAt === null);
    },

    async put(record) {
      const tx = transactionOver(db, [storeName]);
      const raw = (await tx.objectStore(storeName).get(record.id)) as (Partial<T> & { id: string }) | undefined;
      await writeRecord(tx, recordType, raw && withDefaults(raw), withDefaults(record), now());
      await tx.done;
    },

    async delete(id) {
      const tx = transactionOver(db, [storeName]);
      const raw = (await tx.objectStore(storeName).get(id)) as (Partial<T> & { id: string }) | undefined;
      const prev = raw && withDefaults(raw);
      const at = now();
      if (prev && prev.deletedAt === null) await writeRecord(tx, recordType, prev, { ...prev, deletedAt: at.toISOString() }, at);
      await tx.done;
    },
  };
}
