import { TransportError, type Change, type PullPage, type Transport } from "../transport";

export interface MemoryServerOptions {
  /** The server's clock in ms. */
  time?: () => number;
  /** Most changes it returns per pull, below what the client asks for. */
  pageSize?: number;
}

/**
 * The server's push/pull contract in memory (see `server/src/sync.ts`): the later clock wins per field, every
 * accepted change gets the next position in the feed, pulls come in pages. Tests drive the sync engine with it.
 */
export class MemoryServer {
  online = true;
  signedIn = true;
  /** Awaited after a push is stored and before it is answered; lets a test act while a push is in flight. */
  afterPushStored: (() => Promise<void>) | null = null;
  pushRequests = 0;
  pullRequests = 0;
  /** How many changes pulls have handed out, to see what a device downloaded again. */
  pulledChanges = 0;

  private readonly fields = new Map<string, { change: Change; seq: number }>();
  private seq = 0;
  private readonly time: () => number;
  private readonly pageSize: number;

  constructor({ time = Date.now, pageSize = 500 }: MemoryServerOptions = {}) {
    this.time = time;
    this.pageSize = pageSize;
  }

  /** What the server holds for a field: its winning change. */
  stored(type: string, id: string, field: string): Change | undefined {
    return this.fields.get(JSON.stringify([type, id, field]))?.change;
  }

  /** Puts changes into the feed as another device would, bypassing any client. */
  inject(changes: Change[]): void {
    this.accept(changes);
  }

  transport(): Transport {
    return {
      push: async (changes) => {
        this.check();
        if (changes.length > 500) throw new TransportError("failed");
        this.pushRequests++;
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

  private check() {
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
