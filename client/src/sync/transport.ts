/** One field of one record, as it was set at `hlc` (see ADR-0004 and ADR-0010). Also what the server stores. */
export interface Change {
  /** Record type, e.g. "task". */
  type: string;
  id: string;
  /** Field name, e.g. "title"; `deletedAt` is the tombstone. Never "id". */
  field: string;
  value: unknown;
  hlc: string;
}

export interface PullPage {
  changes: Change[];
  /** Position of the last change returned; the next pull continues after it. */
  cursor: number;
  more: boolean;
  /** The server's clock in ms. Devices whose own clock runs behind catch up to it. */
  serverTime: number;
}

/** How the engine talks to the server; the app uses HTTP, tests an in-memory server. */
export interface Transport {
  push: (changes: Change[]) => Promise<{ serverTime: number }>;
  pull: (after: number, limit: number) => Promise<PullPage>;
}

/**
 * Why a request failed: no connection, no valid session, the server refusing something it was sent, or anything
 * else. As the status of a sync, "rejected" means some changes were refused and stay only on this device.
 */
export type FailureKind = "offline" | "signedOut" | "rejected" | "failed";

/**
 * A refusal that says what is wrong with the request, so the client knows it is the changes that are bad and not
 * the server that is unwell: our server names the malformed change (400), or the request was too big (413).
 */
export type Refusal = { badChange: number } | { tooBig: true };

export class TransportError extends Error {
  /** `refusal` is set exactly when `kind` is "rejected". */
  constructor(
    readonly kind: FailureKind,
    readonly refusal?: Refusal,
  ) {
    super(kind);
  }
}

/** The index of the malformed change in a 400 from our server; undefined for any other 400 (a proxy, a bug). */
async function namedChange(response: Response): Promise<number | undefined> {
  try {
    const { index } = (await response.json()) as { index?: unknown };
    return Number.isInteger(index) && (index as number) >= 0 ? (index as number) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * HTTP calls to `/api/sync/*`. A 400 that doesn't name a change is "failed", not "rejected": a proxy, a captive
 * portal or a server bug can refuse every request, and that says nothing about the changes in it.
 */
export function createHttpTransport(request: typeof fetch = (...args) => fetch(...args)): Transport {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await request(`/api/sync/${path}`, init);
    } catch {
      throw new TransportError("offline");
    }
    if (response.status === 401) throw new TransportError("signedOut");
    if (response.status === 413) throw new TransportError("rejected", { tooBig: true });
    if (response.status === 400) {
      const badChange = await namedChange(response);
      throw badChange === undefined ? new TransportError("failed") : new TransportError("rejected", { badChange });
    }
    if (!response.ok) throw new TransportError("failed");
    try {
      return (await response.json()) as T;
    } catch {
      throw new TransportError("failed");
    }
  }

  return {
    push: (changes) =>
      call("push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) }),
    pull: (after, limit) => call(`pull?after=${after}&limit=${limit}`),
  };
}

export const httpTransport = createHttpTransport();
