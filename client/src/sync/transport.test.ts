import { afterEach, describe, expect, it, vi } from "vitest";
import { httpTransport, TransportError } from "./transport";

function answer(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))));
}

const kindOf = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    return error instanceof TransportError ? error.kind : "not a transport error";
  }
  return "no error";
};

const refusalOf = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    if (error instanceof TransportError) return { kind: error.kind, refusal: error.refusal };
  }
  return "no transport error";
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
    [500, "failed"],
    [404, "failed"],
  ])("tells a %i answer as %s", async (status, kind) => {
    answer(status);

    expect(await kindOf(() => httpTransport.push([]))).toBe(kind);
  });

  it("tells a 400 that names a malformed change as a refusal of that change", async () => {
    answer(400, { error: "Change 3 is malformed.", index: 3 });

    expect(await refusalOf(() => httpTransport.push([]))).toEqual({ kind: "rejected", refusal: { badChange: 3 } });
  });

  it("tells a 413 as a refusal for being too big", async () => {
    answer(413);

    expect(await refusalOf(() => httpTransport.push([]))).toEqual({ kind: "rejected", refusal: { tooBig: true } });
  });

  it.each([
    ["an empty body, like a proxy's", ""],
    ["a page", "<html>Bad gateway</html>"],
    ["JSON that names no change", JSON.stringify({ error: "Send an array of at most 500 changes." })],
    ["an index that is not a position", JSON.stringify({ index: "3" })],
    ["a negative index", JSON.stringify({ index: -1 })],
  ])("tells a 400 with %s as a failure, which says nothing about the changes in the request", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(body, { status: 400 }))));

    expect(await refusalOf(() => httpTransport.push([]))).toEqual({ kind: "failed", refusal: undefined });
  });

  it("tells a missing connection as offline, and an answer that isn't JSON as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await kindOf(() => httpTransport.pull(0, 500))).toBe("offline");

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<html>", { status: 200 }))));
    expect(await kindOf(() => httpTransport.pull(0, 500))).toBe("failed");
  });
});
