import { decode } from "./hlc";
import { queuePreSyncRecords, type RecordType, type Synced } from "./replica";
import { receiveTimestamps, transactionOver, type FieldClocks, type OutboxEntry, type SyncDb } from "./syncDb";
import { TransportError, type Change, type FailureKind, type Transport } from "./transport";

/** Never above what the server takes in one request. */
const batchSize = 500;
/** The server takes 1 MB of JSON per request; stay well below it, whatever the values weigh. */
const batchBytes = 400_000;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** "rejected": the last sync went through, but the server refused some changes, which stay only on this device. */
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
   * the outcome shows in `state()`. The status is "syncing" only for a run someone asked to see
   * (`showProgress`, for the Sync now button); background runs change it only to report how they ended.
   */
  syncNow(options?: { showProgress?: boolean }): Promise<void>;
  state(): SyncState;
  /** Called whenever the status or the time of the last sync changes. Returns how to stop listening. */
  subscribe(listener: (state: SyncState) => void): () => void;
  /** Called after a run that changed records on this device, so screens can reload. */
  onRemoteChanges(listener: () => void): () => void;
}

const toChange = ({ type, id, field, value, hlc }: OutboxEntry): Change => ({ type, id, field, value, hlc });

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

  /** The outbox entries as batches that fit one request each, in the order they were made. */
  function batchesOf(entries: OutboxEntry[]): OutboxEntry[][] {
    const batches: OutboxEntry[][] = [];
    let bytes = 0;
    for (const entry of entries) {
      const size = byteLength(JSON.stringify(toChange(entry))) + 1;
      const last = batches[batches.length - 1];
      if (last && last.length < batchSize && bytes + size <= batchBytes) {
        last.push(entry);
        bytes += size;
      } else {
        batches.push([entry]);
        bytes = size;
      }
    }
    return batches;
  }

  /** Sends one batch; an entry is dropped from the outbox only if no newer edit replaced it meanwhile. */
  async function send(batch: OutboxEntry[]) {
    const { serverTime } = await transport.push(batch.map(toChange));
    const tx = transactionOver(db, []);
    for (const sent of batch) {
      const queued = (await tx.objectStore("outbox").get([sent.type, sent.id, sent.field])) as OutboxEntry | undefined;
      if (queued?.hlc === sent.hlc) await tx.objectStore("outbox").delete([sent.type, sent.id, sent.field]);
    }
    await receiveTimestamps(tx, [{ wall: serverTime, counter: 0 }], now());
    await tx.done;
  }

  /** Keeps a refused entry in the outbox, marked, so it is not sent again until a newer edit replaces it. */
  async function setAside(entry: OutboxEntry) {
    const tx = transactionOver(db, []);
    const queued = (await tx.objectStore("outbox").get([entry.type, entry.id, entry.field])) as OutboxEntry | undefined;
    if (queued?.hlc === entry.hlc) await tx.objectStore("outbox").put({ ...queued, rejected: true });
    await tx.done;
  }

  /** Sends a batch the server refuses as a whole by halves, until the entry it objects to stands alone. */
  async function sendOrSplit(batch: OutboxEntry[]) {
    try {
      await send(batch);
    } catch (error) {
      if (!(error instanceof TransportError && error.kind === "rejected")) throw error;
      if (batch.length === 1) return setAside(batch[0]);
      const half = batch.length >> 1;
      await sendOrSplit(batch.slice(0, half));
      await sendOrSplit(batch.slice(half));
    }
  }

  /** Sends the outbox as it is now, except what the server refused before. */
  async function push() {
    const entries = ((await db.getAll("outbox")) as OutboxEntry[]).filter((entry) => !entry.rejected);
    for (const batch of batchesOf(entries)) await sendOrSplit(batch);
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
      // Equal means our own change coming back; older means we already know better. A clock text is never empty.
      if (change.hlc <= (clocks.clocks[change.field] ?? "")) continue;

      const store = tx.objectStore(recordType.storeName);
      const base = ((await store.get(change.id)) as Partial<Synced> | undefined) ?? {};
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
    // Another tab may have read further meanwhile; never move the position back.
    const saved = ((await tx.objectStore("syncInfo").get("cursor")) as number | undefined) ?? 0;
    await tx.objectStore("syncInfo").put(Math.max(saved, cursor), "cursor");
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

  /** Set by a request that wants to see "syncing"; the next run to start shows it. */
  let progressWanted = false;

  async function run() {
    if (progressWanted) setState({ status: "syncing" });
    progressWanted = false;
    let applied = false;
    try {
      // A push that fails for another reason than the connection or the session doesn't keep the pull from running.
      let pushFailure: unknown = null;
      try {
        // The stores do this when they open; here too, since the first run can come before they are done.
        for (const recordType of types) await queuePreSyncRecords(db, recordType, now);
        await push();
      } catch (error) {
        if (error instanceof TransportError && (error.kind === "offline" || error.kind === "signedOut")) throw error;
        pushFailure = error;
      }
      await pull(() => (applied = true));
      if (pushFailure) throw pushFailure;
      const lastSyncedAt = now().getTime();
      await db.put("syncInfo", lastSyncedAt, "lastSyncedAt");
      const refused = ((await db.getAll("outbox")) as OutboxEntry[]).some((entry) => entry.rejected);
      setState({ status: refused ? "rejected" : "idle", lastSyncedAt });
    } catch (error) {
      setState({ status: error instanceof TransportError && error.kind !== "rejected" ? error.kind : "failed" });
    }
    if (applied) for (const listener of remoteListeners) listener();
  }

  let current: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  function syncNow({ showProgress = false } = {}): Promise<void> {
    if (showProgress) progressWanted = true;
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
