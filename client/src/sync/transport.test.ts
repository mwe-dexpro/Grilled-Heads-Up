import { afterEach, describe, expect, it, vi } from "vitest";
import { httpTransport, TransportError } from "./transport";

function answer(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

const kindOf = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    return error instanceof TransportError ? error.kind : "not a transport error";
  }
  return "no error";
};

describe("HTTP transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the changes and reads the server time", async () => {
    answer(200, { serverTime: 42 });

    expect(await httpTransport.push([{ type: "task", id: "t1", field: "title", value: "x", hlc: "h" }])).toEqual({ serverTime: 42 });

    expect(fetch).toHaveBeenCalledWith("/api/sync/push", expect.objectContaining({ method: "POST", body: expect.stringContaining('"title"') }));
  });

  it("asks for a page after a position", async () => {
    answer(200, { changes: [], cursor: 7, more: false, serverTime: 1 });

    await httpTransport.pull(7, 500);

    expect(fetch).toHaveBeenCalledWith("/api/sync/pull?after=7&limit=500", undefined);
  });

  it.each([
    [401, "signedOut"],
    [400, "rejected"],
    [413, "rejected"],
    [500, "failed"],
    [404, "failed"],
  ])("tells a %i answer as %s", async (status, kind) => {
    answer(status);

    expect(await kindOf(() => httpTransport.push([]))).toBe(kind);
  });

  it("tells a missing connection as offline, and an answer that isn't JSON as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await kindOf(() => httpTransport.pull(0, 500))).toBe("offline");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await kindOf(() => httpTransport.pull(0, 500))).toBe("failed");
  });
});
