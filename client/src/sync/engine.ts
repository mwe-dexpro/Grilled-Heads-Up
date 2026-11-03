import { decode } from "./hlc";
import type { RecordType, Synced } from "./replica";
import { receiveTimestamps, transactionOver, type FieldClocks, type OutboxEntry, type SyncDb } from "./syncDb";
import { TransportError, type Change, type FailureKind, type Transport } from "./transport";

/** Never above what the server takes in one request. */
const batchSize = 500;

export type SyncStatus = "idle" | "syncing" | FailureKind;

export interface SyncState {
  status: SyncStatus;
  /** When the last sync went through, in ms since the epoch; null before the first. */
  lastSyncedAt: number | null;
}

export interface SyncEngine {
  /**
   * Pushes local changes, then pulls what other devices did. Runs at once, or, while a run is under way,
   * once more right after it (any number of requests during a run share that one follow-up). Never rejects:
   * the outcome shows in `state()`.
   */
  syncNow(): Promise<void>;
  state(): SyncState;
  /** Called whenever the status or the time of the last sync changes. Returns how to stop listening. */
  subscribe(listener: (state: SyncState) => void): () => void;
  /** Called after a run that changed records on this device, so screens can reload. */
  onRemoteChanges(listener: () => void): () => void;
}

export interface SyncEngineOptions {
  db: SyncDb;
  /** Everything that syncs. A Change of a type missing here (from a newer version elsewhere) is skipped. */
  types: Array<RecordType<Synced>>;
  transport: Transport;
  now?: () => Date;
}

/** Keeps this device's records and the server's feed in step, field by field, later clock winning (ADR-0004). */
export async function createSyncEngine({ db, types, transport, now = () => new Date() }: SyncEngineOptions): Promise<SyncEngine> {
  const typeNamed = new Map(types.map((recordType) => [recordType.type, recordType]));
  const storeNames = types.map((recordType) => recordType.storeName);

  let state: SyncState = { status: "idle", lastSyncedAt: ((await db.get("syncInfo", "lastSyncedAt")) as number | undefined) ?? null };
  const stateListeners = new Set<(state: SyncState) => void>();
  const remoteListeners = new Set<() => void>();

  function setState(change: Partial<SyncState>) {
    state = { ...state, ...change };
    for (const listener of stateListeners) listener(state);
  }

  /** Sends the outbox as it is now, in batches; an entry is dropped only if no newer edit replaced it meanwhile. */
  async function push() {
    const entries = (await db.getAll("outbox")) as OutboxEntry[];
    for (let from = 0; from < entries.length; from += batchSize) {
      const batch = entries.slice(from, from + batchSize);
      const { serverTime } = await transport.push(batch.map(({ type, id, field, value, hlc }) => ({ type, id, field, value, hlc })));
      const tx = transactionOver(db, []);
      for (const sent of batch) {
        const queued = (await tx.objectStore("outbox").get([sent.type, sent.id, sent.field])) as OutboxEntry | undefined;
        if (queued?.hlc === sent.hlc) await tx.objectStore("outbox").delete([sent.type, sent.id, sent.field]);
      }
      await receiveTimestamps(tx, [{ wall: serverTime, counter: 0 }], now());
      await tx.done;
    }
  }

  /** Applies one page of the feed and its cursor in one transaction; returns whether any record changed here. */
  async function apply(changes: Change[], cursor: number, serverTime: number): Promise<boolean> {
    const tx = transactionOver(db, storeNames);
    const clocksOf = new Map<string, FieldClocks>();
    const touched = new Set<string>();
    let applied = false;

    for (const change of changes) {
      const recordType = typeNamed.get(change.type);
      if (!recordType) continue;
      const key = `${change.type}/${change.id}`;
      let clocks = clocksOf.get(key);
      if (!clocks) {
        clocks = ((await tx.objectStore("fieldClocks").get([change.type, change.id])) as FieldClocks | undefined) ?? { type: change.type, id: change.id, clocks: {} };
        clocksOf.set(key, clocks);
      }
      const local = clocks.clocks[change.field];
      // Equal means our own change coming back; older means we already know better.
      if (local !== undefined && change.hlc <= local) continue;

      const store = tx.objectStore(recordType.storeName);
      const base = ((await store.get(change.id)) as Partial<Synced> | undefined) ?? { id: change.id };
      await store.put(recordType.withDefaults({ ...base, id: change.id, [change.field]: change.value }));
      clocks.clocks[change.field] = change.hlc;
      touched.add(key);
      applied = true;

      // A pending edit of this field is older than the change that just won, so the server would drop it anyway.
      const pending = (await tx.objectStore("outbox").get([change.type, change.id, change.field])) as OutboxEntry | undefined;
      if (pending && pending.hlc < change.hlc) await tx.objectStore("outbox").delete([change.type, change.id, change.field]);
    }

    for (const key of touched) await tx.objectStore("fieldClocks").put(clocksOf.get(key)!);
    await receiveTimestamps(tx, [...changes.map(({ hlc }) => decode(hlc)), { wall: serverTime, counter: 0 }], now());
    await tx.objectStore("syncInfo").put(cursor, "cursor");
    await tx.done;
    return applied;
  }

  /** Reads the feed page by page from the saved cursor; `onApplied` hears of each page that changed a record. */
  async function pull(onApplied: () => void) {
    let cursor = ((await db.get("syncInfo", "cursor")) as number | undefined) ?? 0;
    for (let more = true; more; ) {
      const page = await transport.pull(cursor, batchSize);
      if (await apply(page.changes, page.cursor, page.serverTime)) onApplied();
      cursor = page.cursor;
      more = page.more;
    }
  }

  async function run() {
    setState({ status: "syncing" });
    let applied = false;
    try {
      await push();
      await pull(() => (applied = true));
      const lastSyncedAt = now().getTime();
      await db.put("syncInfo", lastSyncedAt, "lastSyncedAt");
      setState({ status: "idle", lastSyncedAt });
    } catch (error) {
      setState({ status: error instanceof TransportError ? error.kind : "failed" });
    }
    if (applied) for (const listener of remoteListeners) listener();
  }

  let current: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  function syncNow(): Promise<void> {
    if (current === null) {
      current = run().finally(() => {
        current = null;
      });
      return current;
    }
    followUp ??= current.then(() => {
      followUp = null;
      return syncNow();
    });
    return followUp;
  }

  return {
    syncNow,
    state: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => void stateListeners.delete(listener);
    },
    onRemoteChanges(listener) {
      remoteListeners.add(listener);
      return () => void remoteListeners.delete(listener);
    },
  };
}
