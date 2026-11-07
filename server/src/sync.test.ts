import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";
import { TestBrowser } from "./testing/testBrowser.js";
import { TestPasskey } from "./testing/testPasskey.js";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const db = openDatabase(":memory:");
  server = createApp({ db, origins: ["http://localhost:3000"] }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

/** Encodes a timestamp the way the client does: wall clock, counter, device. */
const hlc = (wall: number, counter = 0, node = "device-a") => `${String(wall).padStart(15, "0")}-${String(counter).padStart(5, "0")}-${node}`;

const change = (field: string, value: unknown, at: string, id = "t1", type = "task") => ({ type, id, field, value, hlc: at });

async function signedInOwner() {
  const phone = new TestBrowser(baseUrl);
  expect((await phone.registerPasskey(new TestPasskey())).status).toBe(200);
  return phone;
}

type Pulled = { changes: ReturnType<typeof change>[]; cursor: number; more: boolean; serverTime: number };
const pull = async (phone: TestBrowser, query = ""): Promise<Pulled> => (await (await phone.get(`/api/sync/pull${query}`)).json()) as Pulled;
const push = (phone: TestBrowser, changes: unknown) => phone.post("/api/sync/push", { changes });
const fieldsOf = (page: Pulled) => page.changes.map((c) => [c.field, c.value]);

describe("sync routes", () => {
  test("refuse requests without a session", async () => {
    const stranger = new TestBrowser(baseUrl);
    await signedInOwner();

    expect((await push(stranger, [change("title", "x", hlc(1))])).status).toBe(401);
    expect((await stranger.get("/api/sync/pull")).status).toBe(401);
  });

  test("hand back what was pushed, with the server's time", async () => {
    const phone = await signedInOwner();
    const before = Date.now();

    const pushed = await push(phone, [change("title", "Buy gift", hlc(10)), change("date", null, hlc(10))]);
    const page = await pull(phone);

    expect(pushed.status).toBe(200);
    expect(((await pushed.json()) as { serverTime: number }).serverTime).toBeGreaterThanOrEqual(before);
    expect(page.changes).toEqual([change("title", "Buy gift", hlc(10)), change("date", null, hlc(10))]);
    expect(page.cursor).toBe(2);
    expect(page.more).toBe(false);
    expect(page.serverTime).toBeGreaterThanOrEqual(before);
  });

  test("keep any JSON value as it was sent, and never rewrite the clock", async () => {
    const phone = await signedInOwner();
    const value = { nested: [1, "two", null], flag: false };

    await push(phone, [change("blob", value, hlc(5, 3, "x-1"))]);

    expect((await pull(phone)).changes).toEqual([change("blob", value, hlc(5, 3, "x-1"))]);
  });

  test("ignore an older or equal clock for a field", async () => {
    const phone = await signedInOwner();
    await push(phone, [change("title", "new", hlc(20))]);

    await push(phone, [change("title", "older", hlc(10)), change("title", "same clock", hlc(20))]);

    const page = await pull(phone);
    expect(fieldsOf(page)).toEqual([["title", "new"]]);
    expect(page.cursor).toBe(1);
  });

  test("let a later clock replace the value and move the field to the end of the feed", async () => {
    const phone = await signedInOwner();
    await push(phone, [change("title", "first", hlc(10)), change("date", "2026-10-04", hlc(10))]);
    const seen = (await pull(phone)).cursor;

    await push(phone, [change("title", "second", hlc(11))]);

    expect(fieldsOf(await pull(phone))).toEqual([
      ["date", "2026-10-04"],
      ["title", "second"],
    ]);
    expect(fieldsOf(await pull(phone, `?after=${seen}`))).toEqual([["title", "second"]]);
  });

  test("a clock tie between two devices is broken by the device id", async () => {
    const phone = await signedInOwner();

    await push(phone, [change("title", "from b", hlc(10, 0, "device-b"))]);
    await push(phone, [change("title", "from a", hlc(10, 0, "device-a"))]);

    expect(fieldsOf(await pull(phone))).toEqual([["title", "from b"]]);
  });

  test("keep different fields of one record, and the same field of different records or types apart", async () => {
    const phone = await signedInOwner();

    await push(phone, [
      change("title", "A", hlc(1), "t1"),
      change("date", "2026-10-04", hlc(2), "t1"),
      change("title", "B", hlc(1), "t2"),
      change("title", "Event", hlc(1), "t1", "event"),
    ]);

    expect(fieldsOf(await pull(phone))).toEqual([
      ["title", "A"],
      ["date", "2026-10-04"],
      ["title", "B"],
      ["title", "Event"],
    ]);
  });

  test("page through the feed with after, limit, more and cursor", async () => {
    const phone = await signedInOwner();
    await push(phone, ["a", "b", "c", "d", "e"].map((field) => change(field, field, hlc(1))));

    const first = await pull(phone, "?limit=2");
    const second = await pull(phone, `?after=${first.cursor}&limit=2`);
    const last = await pull(phone, `?after=${second.cursor}&limit=2`);
    const none = await pull(phone, `?after=${last.cursor}`);

    expect([first, second, last].map((p) => p.changes.map((c) => c.field).join(""))).toEqual(["ab", "cd", "e"]);
    expect([first.more, second.more, last.more]).toEqual([true, true, false]);
    expect([first.cursor, second.cursor, last.cursor]).toEqual([2, 4, 5]);
    expect(none).toMatchObject({ changes: [], cursor: 5, more: false });
  });

  test("refuse a malformed batch whole, storing nothing", async () => {
    const phone = await signedInOwner();
    const good = change("title", "ok", hlc(1));
    const bad: unknown[] = [
      { ...good, type: "Task" },
      { ...good, type: "" },
      { ...good, id: "" },
      { ...good, id: "x".repeat(101) },
      { ...good, id: 5 },
      { ...good, field: "id" },
      { ...good, field: "9lives" },
      { ...good, field: "with space" },
      { ...good, hlc: "now" },
      { ...good, hlc: "1-1-x" },
      { type: "task", id: "t1", field: "title", hlc: hlc(1) },
      null,
      "text",
    ];

    for (const broken of bad) expect((await push(phone, [good, broken])).status).toBe(400);

    expect((await push(phone, "nope")).status).toBe(400);
    expect((await phone.post("/api/sync/push", {})).status).toBe(400);
    expect((await pull(phone)).changes).toEqual([]);
  });

  test("name the first malformed change in the refusal, and none when the request as a whole is wrong", async () => {
    const phone = await signedInOwner();
    const good = change("title", "ok", hlc(1));
    const bad = { ...good, field: "id" };
    const indexOf = async (response: Response) => ((await response.json()) as { index?: number }).index;

    expect(await indexOf(await push(phone, [good, good, bad, bad]))).toBe(2);
    expect(await indexOf(await push(phone, [bad]))).toBe(0);
    expect(await indexOf(await push(phone, "nope"))).toBeUndefined();
    expect(await indexOf(await push(phone, Array.from({ length: 501 }, () => good)))).toBeUndefined();
  });

  test("accept a null value and the longest allowed names", async () => {
    const phone = await signedInOwner();

    const response = await push(phone, [change("f".repeat(64), null, hlc(1), "i".repeat(100), "t".repeat(40))]);

    expect(response.status).toBe(200);
    expect((await pull(phone)).changes).toHaveLength(1);
  });

  test("refuse more than 500 changes in one request, and take exactly 500", async () => {
    const phone = await signedInOwner();
    const many = (count: number) => Array.from({ length: count }, (_, i) => change("title", "x", hlc(1), `t${i}`));

    expect((await push(phone, many(501))).status).toBe(400);
    expect((await pull(phone)).changes).toEqual([]);
    expect((await push(phone, many(500))).status).toBe(200);
    expect((await pull(phone)).changes).toHaveLength(500);
  });

  test("take a request of the size the client sends at most (400 KB), and refuse one over 1 MB with 413, storing nothing", async () => {
    const phone = await signedInOwner();

    // The client sets a change aside only for a lone value it sent that is over 100 KB and was answered with 413.
    const batch = (bytes: number) => [change("notes", "x".repeat(bytes), hlc(1))];
    expect((await push(phone, batch(400_000))).status).toBe(200);
    expect((await push(phone, batch(1_100_000))).status).toBe(413);
    expect((await push(phone, [...batch(600_000), change("title", "y".repeat(600_000), hlc(1))])).status).toBe(413);

    const stored = await pull(phone);
    expect(stored.changes).toHaveLength(1);
    expect(stored.changes[0]?.value).toHaveLength(400_000);
  });

  test("refuse a bad after or limit", async () => {
    const phone = await signedInOwner();

    for (const query of ["?after=-1", "?after=x", "?after=1.5", "?limit=0", "?limit=501", "?limit=x", "?after=1&after=2"]) {
      expect((await phone.get(`/api/sync/pull${query}`)).status, query).toBe(400);
    }
    expect((await phone.get("/api/sync/pull?limit=500")).status).toBe(200);
    expect((await phone.get("/api/sync/pull?after=0&limit=1")).status).toBe(200);
  });
});
