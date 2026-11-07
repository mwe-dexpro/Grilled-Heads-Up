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
  withDefaults: (record: Partial<T> & { id: string }) => T;
}

/** The only way a domain store writes records: every change is stamped and queued for the server on the way. */
export interface Table<T extends Synced> {
  /** A record that exists and is not deleted. */
  get: (id: string) => Promise<T | undefined>;
  /** Live records only, in no particular order. */
  list: () => Promise<T[]>;
  /**
   * Saves a record that is new: every field is synced, under one shared clock. It throws when the id is taken
   * (also by a deleted record), because replacing a stored record from a copy read earlier would write that
   * copy's stale fields over what a sync brought meanwhile; to change a stored record, use `update`. A new record
   * is always live: only `delete` writes the tombstone.
   */
  put: (record: T) => Promise<void>;
  /**
   * Saves `record` unless `pick` chooses one of the live records: it is given them all and returns the one that
   * counts as the same, which is then returned and nothing is written. Looking and saving are one transaction, so two
   * calls at once for the same thing make one record, not two. Throws when the id is taken, like `put`.
   */
  findOrPut: (record: T, pick: (live: T[]) => T | undefined) => Promise<T>;
  /**
   * Changes a live record: reads it, applies the change and writes it in one transaction, so a sync that lands
   * meanwhile is never overwritten. Every field the change names is synced under one shared clock, also when its
   * value stays the same, so that fields set together are won or lost together. Returns the record as saved,
   * or undefined when there is none (missing or deleted). `change` can compute the fields from the stored record.
   */
  update: (id: string, change: Patch<T> | ((current: T) => Patch<T>)) => Promise<T | undefined>;
  /**
   * Marks the record deleted now (the tombstone); it stays stored so the deletion can sync. Returns whether this call
   * wrote the tombstone: false when the record is missing or was deleted already (nothing is written then). Looking
   * and writing are one transaction, so of two deletes at once exactly one says true.
   */
  delete: (id: string) => Promise<boolean>;
  /** A record that is deleted (a tombstone), by id; undefined when it is missing or live. */
  getDeleted: (id: string) => Promise<Deleted<T> | undefined>;
  /** Deleted records (tombstones), in no particular order. */
  listDeleted: () => Promise<Deleted<T>[]>;
  /**
   * Un-deletes a deleted record: writes `deletedAt` = null under a new clock (one field, one outbox entry), in
   * one transaction. That is an ordinary last-write-wins write, so it beats the older deletion on every device.
   * Returns the record as saved, or undefined when it is missing or not deleted.
   */
  restore: (id: string) => Promise<T | undefined>;
}

/** A record that is deleted: it has the time of its deletion. */
export type Deleted<T extends Synced> = T & { deletedAt: string };

const isDeleted = <T extends Synced>(record: T): record is Deleted<T> => record.deletedAt !== null;

/** Fields of a record that a store operation sets; never the id, and not `deletedAt`, which only `delete` and `restore` write. */
export type Patch<T extends Synced> = Partial<Omit<T, "id" | "deletedAt">>;

/**
 * Stores `next` and records what was written: one new clock for the `changed` fields, their per-field clocks, and
 * one outbox entry each. Everything happens in the caller's transaction.
 */
async function writeRecord<T extends Synced>(
  tx: SyncTransaction,
  { type, storeName }: RecordType<T>,
  next: T,
  changed: (keyof T & string)[],
  now: Date,
): Promise<void> {
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

const fieldsOf = <T extends Synced>(record: T) => Object.keys(record).filter((field) => field !== "id") as (keyof T & string)[];

/**
 * Records saved before sync existed have no field clocks yet; they are given clocks and outbox entries here,
 * so that they reach the other devices too. Done once per record type (a flag in `syncInfo` says so), before
 * anything else writes to the type: a later write to such a record would give clocks to the fields it changed
 * only. Safe to call from several places and tabs.
 */
export async function queuePreSyncRecords<T extends Synced>(db: SyncDb, recordType: RecordType<T>, now: () => Date): Promise<void> {
  const { type, storeName, withDefaults } = recordType;
  const done = `queued:${type}`;
  if ((await db.get("syncInfo", done)) !== undefined) return;

  const tx = transactionOver(db, [storeName]);
  // Checked again inside the transaction: another tab may have finished between the two.
  if ((await tx.objectStore("syncInfo").get(done)) === undefined) {
    for (const raw of (await tx.objectStore(storeName).getAll()) as (Partial<T> & { id: string })[]) {
      if ((await tx.objectStore("fieldClocks").get([type, raw.id])) === undefined) {
        const record = withDefaults(raw);
        await writeRecord(tx, recordType, record, fieldsOf(record), now());
      }
    }
    await tx.objectStore("syncInfo").put(true, done);
  }
  await tx.done;
}

/** Opens the table of a record type; its records saved before sync existed are queued first. */
export async function openTable<T extends Synced>(db: SyncDb, recordType: RecordType<T>, now: () => Date): Promise<Table<T>> {
  const { storeName, withDefaults } = recordType;
  await queuePreSyncRecords(db, recordType, now);

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
      const all = (await db.getAll(storeName)) as (Partial<T> & { id: string })[];
      return all.map(withDefaults).filter((record) => record.deletedAt === null);
    },

    async put(record) {
      const tx = transactionOver(db, [storeName]);
      if ((await tx.objectStore(storeName).get(record.id)) !== undefined) {
        await tx.done;
        throw new Error(`Record ${record.id} exists already; use update to change it`);
      }
      const next = { ...withDefaults(record), deletedAt: null };
      await writeRecord(tx, recordType, next, fieldsOf(next), now());
      await tx.done;
    },

    async findOrPut(record, pick) {
      const tx = transactionOver(db, [storeName]);
      const all = (await tx.objectStore(storeName).getAll()) as (Partial<T> & { id: string })[];
      const found = pick(all.map(withDefaults).filter((other) => other.deletedAt === null));
      if (found) {
        await tx.done;
        return found;
      }
      if ((await tx.objectStore(storeName).get(record.id)) !== undefined) {
        await tx.done;
        throw new Error(`Record ${record.id} exists already; use update to change it`);
      }
      const next = { ...withDefaults(record), deletedAt: null };
      await writeRecord(tx, recordType, next, fieldsOf(next), now());
      await tx.done;
      return next;
    },

    async update(id, change) {
      const tx = transactionOver(db, [storeName]);
      const raw = (await tx.objectStore(storeName).get(id)) as (Partial<T> & { id: string }) | undefined;
      const prev = raw && withDefaults(raw);
      if (!prev || prev.deletedAt !== null) {
        await tx.done;
        return undefined;
      }
      const patch = typeof change === "function" ? change(prev) : change;
      const next = { ...prev, ...patch };
      await writeRecord(tx, recordType, next, Object.keys(patch) as (keyof T & string)[], now());
      await tx.done;
      return next;
    },

    async delete(id) {
      const tx = transactionOver(db, [storeName]);
      const raw = (await tx.objectStore(storeName).get(id)) as (Partial<T> & { id: string }) | undefined;
      const prev = raw && withDefaults(raw);
      const at = now();
      const live = prev?.deletedAt === null;
      if (live) await writeRecord(tx, recordType, { ...prev, deletedAt: at.toISOString() }, ["deletedAt"] as (keyof T & string)[], at);
      await tx.done;
      return live;
    },

    async getDeleted(id) {
      const record = await stored(id);
      return record !== undefined && isDeleted(record) ? record : undefined;
    },

    async listDeleted() {
      const all = (await db.getAll(storeName)) as (Partial<T> & { id: string })[];
      return all.map(withDefaults).filter(isDeleted);
    },

    async restore(id) {
      const tx = transactionOver(db, [storeName]);
      const raw = (await tx.objectStore(storeName).get(id)) as (Partial<T> & { id: string }) | undefined;
      const prev = raw && withDefaults(raw);
      if (!prev || prev.deletedAt === null) {
        await tx.done;
        return undefined;
      }
      const next = { ...prev, deletedAt: null };
      await writeRecord(tx, recordType, next, ["deletedAt"] as (keyof T & string)[], now());
      await tx.done;
      return next;
    },
  };
}
