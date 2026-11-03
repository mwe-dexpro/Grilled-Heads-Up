import { TransportError, type Change, type PullPage, type Transport } from "../transport";

export interface MemoryServerOptions {
  /** The server's clock in ms. */
  time?: () => number;
  /** Most changes it returns per pull, below what the client asks for. */
  pageSize?: number;
  /** The largest push it takes, as the JSON text in bytes; a bigger one is refused like the real server's 413. */
  maxPushBytes?: number;
}

/**
 * The server's push/pull contract in memory (see `server/src/sync.ts`): the later clock wins per field, every
 * accepted change gets the next position in the feed, pulls come in pages. Tests drive the sync engine with it.
 */
export class MemoryServer {
  online = true;
  signedIn = true;
  /** Refuses every push that carries a change this says yes to, naming the first such change (like our server's 400). */
  rejects: ((change: Change) => boolean) | null = null;
  /** Fails (like a 500) every push. */
  failPushes = false;
  /**
   * Answers every push with this HTTP status and no reason, like a proxy or a server bug would; only seen
   * by what goes through `fetch` below.
   */
  pushStatus: number | null = null;
  /** Awaited after a push is stored and before it is answered; lets a test act while a push is in flight. */
  afterPushStored: (() => Promise<void>) | null = null;
  pushRequests = 0;
  pullRequests = 0;
  /** How many changes pulls have handed out, to see what a device downloaded again. */
  pulledChanges = 0;
  /** How many changes pushes have carried, to see what a device sent. */
  pushedChanges = 0;
  /** How many pushes it refused as too big or malformed. */
  refusedPushes = 0;
  /** Every request that reached it, answered or not. */
  requests = 0;

  private readonly fields = new Map<string, { change: Change; seq: number }>();
  private seq = 0;
  private readonly time: () => number;
  private readonly pageSize: number;
  private readonly maxPushBytes: number;

  constructor({ time = Date.now, pageSize = 500, maxPushBytes = 1024 * 1024 }: MemoryServerOptions = {}) {
    this.time = time;
    this.pageSize = pageSize;
    this.maxPushBytes = maxPushBytes;
  }

  /** What the server holds for a field: its winning change. */
  stored(type: string, id: string, field: string): Change | undefined {
    return this.fields.get(JSON.stringify([type, id, field]))?.change;
  }

  /** What the server holds for a record: the winning change of each of its fields. */
  record(type: string, id: string): Record<string, Change> {
    const fields: Record<string, Change> = {};
    for (const { change } of this.fields.values()) if (change.type === type && change.id === id) fields[change.field] = change;
    return fields;
  }

  /** Puts changes into the feed as another device would, bypassing any client. */
  inject(changes: Change[]): void {
    this.accept(changes);
  }

  transport(): Transport {
    return {
      push: async (changes) => {
        this.check();
        this.pushRequests++;
        if (this.failPushes) throw new TransportError("failed");
        const tooBig = changes.length > 500 || new TextEncoder().encode(JSON.stringify({ changes })).length > this.maxPushBytes;
        const bad = this.rejects ? changes.findIndex(this.rejects) : -1;
        if (tooBig || bad !== -1) {
          this.refusedPushes++;
          throw new TransportError("rejected", tooBig ? { tooBig: true } : { badChange: bad });
        }
        this.pushedChanges += changes.length;
        this.accept(changes);
        const hook = this.afterPushStored;
        this.afterPushStored = null;
        await hook?.();
        return { serverTime: this.time() };
      },
      pull: async (after, limit): Promise<PullPage> => {
        this.check();
        this.pullRequests++;
        const feed = [...this.fields.values()].filter((row) => row.seq > after).sort((a, b) => a.seq - b.seq);
        const size = Math.min(limit, this.pageSize);
        const page = feed.slice(0, size);
        this.pulledChanges += page.length;
        return {
          changes: page.map((row) => row.change),
          cursor: page.length > 0 ? page[page.length - 1].seq : after,
          more: feed.length > size,
          serverTime: this.time(),
        };
      },
    };
  }

  /**
   * The same server as HTTP answers, for tests that run the real transport (`createHttpTransport(server.fetch)`):
   * what the transport does with each status is part of what is tested.
   */
  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const transport = this.transport();
    const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
    if (url.pathname === "/api/sync/push" && this.pushStatus !== null) {
      this.refusedPushes++;
      return new Response("", { status: this.pushStatus });
    }
    try {
      if (url.pathname === "/api/sync/push") {
        const { changes } = JSON.parse(String(init?.body)) as { changes: Change[] };
        return json(200, await transport.push(changes));
      }
      return json(200, await transport.pull(Number(url.searchParams.get("after")), Number(url.searchParams.get("limit"))));
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      if (error.kind === "offline") throw new TypeError("Failed to fetch");
      if (error.kind === "signedOut") return json(401);
      if (error.kind === "failed") return json(500);
      return error.refusal && "badChange" in error.refusal ? json(400, { index: error.refusal.badChange }) : json(413);
    }
  };

  private check() {
    this.requests++;
    if (!this.online) throw new TransportError("offline");
    if (!this.signedIn) throw new TransportError("signedOut");
  }

  private accept(changes: Change[]) {
    for (const change of changes) {
      const key = JSON.stringify([change.type, change.id, change.field]);
      const current = this.fields.get(key);
      if (current && change.hlc <= current.change.hlc) continue;
      this.fields.set(key, { change, seq: ++this.seq });
    }
  }
}
