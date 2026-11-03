import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import { taskRecordType, type Task } from "../tasks/taskStore";
import { decode } from "./hlc";
import { openTable } from "./replica";
import type { FieldClocks, OutboxEntry } from "./syncDb";

let dbCounter = 0;

/** A clock that moves one second on every read. */
function tickingClock() {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 9, 1, 9, 0, seconds++));
}

async function open() {
  const db = await openAppDb(`replica-test-${dbCounter++}`);
  const tasks = await openTable(db, taskRecordType, tickingClock());
  const outbox = async () => ((await db.getAll("outbox")) as OutboxEntry[]).map(({ field, value, hlc }) => ({ field, value, hlc }));
  const clocksOf = async (id: string) => ((await db.get("fieldClocks", ["task", id])) as FieldClocks | undefined)?.clocks;
  return { db, tasks, outbox, clocksOf };
}

const task = (fields: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Buy gift",
  date: null,
  time: null,
  eventId: null,
  offsetDays: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  ...fields,
});

describe("Replica table", () => {
  it("queues every field of a new record, all under one clock, and none for the id", async () => {
    const { tasks, outbox, clocksOf } = await open();

    await tasks.put(task());

    const entries = await outbox();
    expect(entries.map((e) => e.field).sort()).toEqual(["completedAt", "createdAt", "date", "deletedAt", "eventId", "offsetDays", "time", "title"]);
    expect(new Set(entries.map((e) => e.hlc)).size).toBe(1);
    expect(entries.find((e) => e.field === "title")?.value).toBe("Buy gift");
    expect(Object.keys((await clocksOf("t1"))!)).toHaveLength(8);
  });

  it("queues only the fields that changed, and a newer edit of a field replaces its pending one", async () => {
    const { tasks, outbox, clocksOf } = await open();
    await tasks.put(task());
    const first = await clocksOf("t1");

    await tasks.put(task({ completedAt: "2026-10-01T10:00:00.000Z" }));
    await tasks.put(task({ completedAt: "2026-10-01T11:00:00.000Z" }));

    const entries = await outbox();
    expect(entries.filter((e) => e.field === "completedAt")).toEqual([{ field: "completedAt", value: "2026-10-01T11:00:00.000Z", hlc: expect.any(String) }]);
    expect(entries).toHaveLength(8);
    const clocks = (await clocksOf("t1"))!;
    expect(clocks.title).toBe(first!.title);
    expect(clocks.completedAt > first!.title).toBe(true);
    expect(entries.find((e) => e.field === "completedAt")!.hlc).toBe(clocks.completedAt);
  });

  it("does nothing for a save that changes nothing", async () => {
    const { tasks, outbox, db } = await open();
    await tasks.put(task());
    const before = await outbox();
    const clock = await db.get("syncInfo", "clock");

    await tasks.put(task());

    expect(await outbox()).toEqual(before);
    expect(await db.get("syncInfo", "clock")).toEqual(clock);
  });

  it("stamps later changes later, and keeps one device id", async () => {
    const { tasks, db, clocksOf } = await open();
    await tasks.put(task());
    await tasks.put(task({ title: "Buy a gift" }));

    const clocks = (await clocksOf("t1"))!;

    expect(clocks.title > clocks.date).toBe(true);
    expect(decode(clocks.title).node).toBe(await db.get("syncInfo", "deviceId"));
    expect(decode(clocks.date).node).toBe(decode(clocks.title).node);
  });

  it("deletes by setting deletedAt, keeps the record stored and leaves it out of get and list", async () => {
    const { tasks, outbox, db, clocksOf } = await open();
    await tasks.put(task());

    await tasks.delete("t1");

    expect(await tasks.get("t1")).toBeUndefined();
    expect(await tasks.list()).toEqual([]);
    expect(((await db.get("tasks", "t1")) as Task).deletedAt).toBe("2026-10-01T09:00:01.000Z");
    expect((await outbox()).find((e) => e.field === "deletedAt")?.value).toBe("2026-10-01T09:00:01.000Z");
    expect((await clocksOf("t1"))!.deletedAt > (await clocksOf("t1"))!.title).toBe(true);
  });

  it("ignores deleting a record that is missing or already deleted", async () => {
    const { tasks, outbox } = await open();

    await tasks.delete("missing");
    await tasks.put(task());
    await tasks.delete("t1");
    const after = await outbox();
    await tasks.delete("t1");

    expect(await outbox()).toEqual(after);
  });

  it("gets a record and lists live ones", async () => {
    const { tasks } = await open();
    await tasks.put(task());
    await tasks.put(task({ id: "t2", title: "Other" }));
    await tasks.delete("t2");

    expect(await tasks.get("t1")).toEqual(task());
    expect((await tasks.list()).map((t) => t.id)).toEqual(["t1"]);
  });
});
