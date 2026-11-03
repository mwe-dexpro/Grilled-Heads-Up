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
  push(changes: Change[]): Promise<{ serverTime: number }>;
  pull(after: number, limit: number): Promise<PullPage>;
}

/** Why a request failed: no connection, no valid session, or anything else. */
export type FailureKind = "offline" | "signedOut" | "failed";

export class TransportError extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/sync/${path}`, init);
  } catch {
    throw new TransportError("offline");
  }
  if (response.status === 401) throw new TransportError("signedOut");
  if (!response.ok) throw new TransportError("failed");
  try {
    return (await response.json()) as T;
  } catch {
    throw new TransportError("failed");
  }
}

export const httpTransport: Transport = {
  push: (changes) =>
    call("push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) }),
  pull: (after, limit) => call(`pull?after=${after}&limit=${limit}`),
};
