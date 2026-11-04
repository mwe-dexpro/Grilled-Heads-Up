import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import { taskRecordType, type Task } from "../tasks/taskStore";
import { createSyncEngine } from "./engine";
import { decode } from "./hlc";
import { openTable } from "./replica";
import { MemoryServer } from "./testing/memoryServer";

let dbCounter = 0;

/** A clock that moves one second on every read. */
function tickingClock() {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 9, 1, 9, 0, seconds++));
}

/** A table whose changes can be pushed to an in-memory server, which is where its effects are looked at. */
async function open(now: () => Date = tickingClock()) {
  const db = await openAppDb(`replica-test-${dbCounter++}`);
  const tasks = await openTable(db, taskRecordType, now);
  const server = new MemoryServer({ time: () => Date.UTC(2026, 9, 1, 9, 0, 0) });
  const engine = await createSyncEngine({ db, types: [taskRecordType], transport: server.transport(), now });
  const push = async () => {
    await engine.syncNow();
    return server.record("task", "t1");
  };
  return { db, tasks, server, push };
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
  rescheduleCount: 0,
  deletedAt: null,
  ...fields,
});

const everyField = ["completedAt", "createdAt", "date", "deletedAt", "eventId", "offsetDays", "rescheduleCount", "time", "title"];

describe("Replica table", () => {
  it("sends every field of a new record, all under one clock, and none for the id", async () => {
    const { tasks, push } = await open();

    await tasks.put(task());

    const sent = await push();
    expect(Object.keys(sent).sort()).toEqual(everyField);
    expect(new Set(Object.values(sent).map((change) => change.hlc)).size).toBe(1);
    expect(sent.title.value).toBe("Buy gift");
  });

  it("sends only the fields that changed, and only the latest edit of a field", async () => {
    const { tasks, server, push } = await open();
    await tasks.put(task());
    const first = await push();
    const pushed = server.pushedChanges;

    await tasks.update("t1", { completedAt: "2026-10-01T10:00:00.000Z" });
    await tasks.update("t1", { completedAt: "2026-10-01T11:00:00.000Z" });
    const second = await push();

    expect(server.pushedChanges - pushed).toBe(1);
    expect(second.completedAt.value).toBe("2026-10-01T11:00:00.000Z");
    expect(second.title.hlc).toBe(first.title.hlc);
    expect(second.completedAt.hlc > first.title.hlc).toBe(true);
  });

  it("stamps a later change later even when the device clock stands still or runs backwards", async () => {
    let seconds = 100;
    const { tasks, push } = await open(() => new Date(Date.UTC(2026, 9, 1, 9, 0, seconds)));
    await tasks.put(task());
    const first = (await push()).title.hlc;

    await tasks.update("t1", { title: "Same instant" });
    const second = (await push()).title.hlc;
    seconds = 50;
    await tasks.update("t1", { title: "Clock went back" });
    const third = (await push()).title.hlc;

    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
    expect(decode(third).wall).toBeGreaterThanOrEqual(decode(second).wall);
  });

  it("sends nothing for an update that names no field", async () => {
    const { tasks, server, push } = await open();
    await tasks.put(task());
    await push();
    const pushed = server.pushedChanges;

    await tasks.update("t1", {});
    await push();

    expect(server.pushedChanges).toBe(pushed);
  });

  it("stamps later changes later, and keeps one device id", async () => {
    const { tasks, push } = await open();
    await tasks.put(task());
    await tasks.update("t1", { title: "Buy a gift" });

    const sent = await push();

    expect(sent.title.hlc > sent.date.hlc).toBe(true);
    expect(decode(sent.date.hlc).node).toBe(decode(sent.title.hlc).node);
  });

  it("deletes by setting deletedAt, keeps the record stored and leaves it out of get and list", async () => {
    const { tasks, db, push } = await open();
    await tasks.put(task());

    await tasks.delete("t1");

    expect(await tasks.get("t1")).toBeUndefined();
    expect(await tasks.list()).toEqual([]);
    expect(((await db.get("tasks", "t1")) as Task).deletedAt).toBe("2026-10-01T09:00:01.000Z");
    const sent = await push();
    expect(sent.deletedAt.value).toBe("2026-10-01T09:00:01.000Z");
    expect(sent.deletedAt.hlc > sent.title.hlc).toBe(true);
  });

  it("ignores deleting a record that is missing or already deleted", async () => {
    const { tasks, server, push } = await open();

    await tasks.delete("missing");
    await tasks.put(task());
    await tasks.delete("t1");
    const before = await push();
    const pushed = server.pushedChanges;
    await tasks.delete("t1");
    const after = await push();

    expect(server.pushedChanges).toBe(pushed);
    expect(after).toEqual(before);
  });

  it("gets a record and lists live ones", async () => {
    const { tasks } = await open();
    await tasks.put(task());
    await tasks.put(task({ id: "t2", title: "Other" }));
    await tasks.delete("t2");

    expect(await tasks.get("t1")).toEqual(task());
    expect((await tasks.list()).map((t) => t.id)).toEqual(["t1"]);
  });

  it("lists deleted records, and none that live", async () => {
    const { tasks } = await open();
    await tasks.put(task());
    await tasks.put(task({ id: "t2", title: "Doomed" }));
    await tasks.put(task({ id: "t3", title: "Also doomed" }));
    await tasks.delete("t2");
    await tasks.delete("t3");

    const deleted = await tasks.listDeleted();

    expect(deleted.map((t) => t.id).sort()).toEqual(["t2", "t3"]);
    expect(deleted.every((t) => t.deletedAt !== null)).toBe(true);
    expect(deleted.find((t) => t.id === "t2")).toMatchObject({ title: "Doomed" });
  });

  it("gets a deleted record by id, and none that lives or is missing", async () => {
    const { tasks } = await open();
    await tasks.put(task());
    await tasks.put(task({ id: "t2", title: "Doomed" }));
    await tasks.put(task({ id: "t3", title: "Also doomed" }));
    await tasks.delete("t2");
    await tasks.delete("t3");

    expect(await tasks.getDeleted("t2")).toMatchObject({ id: "t2", title: "Doomed" });
    expect(await tasks.getDeleted("t3")).toMatchObject({ id: "t3", title: "Also doomed" });
    expect(await tasks.getDeleted("t1")).toBeUndefined();
    expect(await tasks.getDeleted("missing")).toBeUndefined();
  });

  describe("restore", () => {
    it("un-deletes a deleted record, sending only deletedAt, under a clock later than the deletion", async () => {
      const { tasks, push } = await open();
      await tasks.put(task({ date: "2026-10-04" }));
      await tasks.delete("t1");
      const deleted = await push();

      const restored = await tasks.restore("t1");
      const sent = await push();

      expect(restored).toEqual(task({ date: "2026-10-04" }));
      expect(await tasks.get("t1")).toEqual(restored);
      expect(await tasks.listDeleted()).toEqual([]);
      expect(sent.deletedAt.value).toBeNull();
      expect(sent.deletedAt.hlc > deleted.deletedAt.hlc).toBe(true);
      expect(sent.title.hlc).toBe(deleted.title.hlc);
    });

    it("writes a single outbox entry", async () => {
      const { tasks, db, push } = await open();
      await tasks.put(task());
      await tasks.delete("t1");
      await push();

      await tasks.restore("t1");

      expect(await db.getAll("outbox")).toEqual([expect.objectContaining({ type: "task", id: "t1", field: "deletedAt", value: null })]);
    });

    it("returns undefined, and sends nothing, for a record that is live or missing", async () => {
      const { tasks, server, push } = await open();
      await tasks.put(task());
      await push();
      const pushed = server.pushedChanges;

      expect(await tasks.restore("t1")).toBeUndefined();
      expect(await tasks.restore("missing")).toBeUndefined();

      await push();
      expect(server.pushedChanges).toBe(pushed);
      expect(await tasks.get("t1")).toEqual(task());
    });
  });

  describe("update", () => {
    it("changes the named fields of the stored record, and returns the record as saved", async () => {
      const { tasks } = await open();
      await tasks.put(task({ date: "2026-10-04" }));

      const saved = await tasks.update("t1", { completedAt: "2026-10-01T10:00:00.000Z" });

      expect(saved).toEqual(task({ date: "2026-10-04", completedAt: "2026-10-01T10:00:00.000Z" }));
      expect(await tasks.get("t1")).toEqual(saved);
    });

    it("works out the change from the stored record", async () => {
      const { tasks } = await open();
      await tasks.put(task({ title: "Gift" }));

      await tasks.update("t1", (current) => ({ title: `${current.title}!` }));

      expect((await tasks.get("t1"))?.title).toBe("Gift!");
    });

    it("sends the fields it names even when their value stays the same, so they win or lose together", async () => {
      const { tasks, push } = await open();
      await tasks.put(task());
      const first = await push();

      await tasks.update("t1", { date: null, completedAt: "2026-10-01T10:00:00.000Z" });
      const second = await push();

      expect(second.date.hlc).toBe(second.completedAt.hlc);
      expect(second.date.hlc > first.date.hlc).toBe(true);
      expect(second.title.hlc).toBe(first.title.hlc);
    });

    it("does nothing for an empty change, a missing record or a deleted one", async () => {
      const { tasks, server, push } = await open();
      await tasks.put(task());
      await tasks.put(task({ id: "t2" }));
      await tasks.delete("t2");
      await push();
      const pushed = server.pushedChanges;

      expect(await tasks.update("t1", {})).toEqual(task());
      expect(await tasks.update("missing", { title: "x" })).toBeUndefined();
      expect(await tasks.update("t2", { title: "Back from the dead" })).toBeUndefined();

      await push();
      expect(server.pushedChanges).toBe(pushed);
      expect(await tasks.list()).toEqual([task()]);
    });
  });

  describe("put", () => {
    it("refuses an id that is taken, also by a deleted record, and leaves the stored record alone", async () => {
      const { tasks, push } = await open();
      await tasks.put(task());
      const staleCopy = (await tasks.get("t1"))!;

      await expect(tasks.put({ ...staleCopy, title: "Written from a copy" })).rejects.toThrow("exists already");
      await tasks.delete("t1");
      await expect(tasks.put({ ...staleCopy, completedAt: "2026-10-01T10:00:00.000Z" })).rejects.toThrow("exists already");

      expect(await tasks.list()).toEqual([]);
      const sent = await push();
      expect(sent.deletedAt.value).not.toBeNull();
      expect(sent.title.value).toBe("Buy gift");
      expect(sent.completedAt.value).toBeNull();
    });

    it("never writes deletedAt: only a deletion does", async () => {
      const { tasks, push } = await open();
      await tasks.put(task({ deletedAt: "2026-10-01T10:00:00.000Z" }));

      expect(await tasks.get("t1")).toEqual(task());
      expect((await push()).deletedAt.value).toBeNull();
    });
  });
});
