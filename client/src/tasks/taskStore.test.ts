import { describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { openAppDb } from "../data/database";
import { createSyncStores } from "../sync/syncDb";
import { maxTitleLength } from "../data/limits";
import { NoTaskError, openTaskStore, taskRecordType, type Task } from "./taskStore";
import { defined } from "../testing/defined";

let dbCounter = 0;
const freshDbName = () => `tasks-test-${dbCounter++}`;

/** A clock that moves one second forward on every read. */
function tickingClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 28, 9, 0, tick++));
}

describe("Task store", () => {
  it("lists a Task added by title as open", async () => {
    const store = await openTaskStore(freshDbName());

    await store.addTask("Buy birthday present");

    const tasks = await store.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Buy birthday present");
    expect(tasks[0]?.completedAt).toBeNull();
  });

  it("marks a Task as Completed at the current time", async () => {
    const now = new Date("2026-09-28T10:30:00.000Z");
    const store = await openTaskStore(freshDbName(), { now: () => now });
    const task = await store.addTask("Send invitations");

    await store.completeTask(task.id);

    const completed = defined((await store.listTasks())[0]);
    expect(completed.completedAt).toBe("2026-09-28T10:30:00.000Z");
  });

  it("keeps Tasks and their completion when the store is opened again (reload)", async () => {
    const dbName = freshDbName();
    const before = await openTaskStore(dbName, { now: tickingClock() });
    const task = await before.addTask("Book table");
    await before.addTask("Wrap present");
    await before.completeTask(task.id);
    before.close();

    const after = await openTaskStore(dbName);

    const tasks = await after.listTasks();
    expect(tasks.map((t) => [t.title, t.completedAt !== null])).toEqual([
      ["Book table", true],
      ["Wrap present", false],
    ]);
  });

  it("lists Tasks in the order they were added", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });

    for (const title of ["First", "Second", "Third", "Fourth", "Fifth"]) {
      await store.addTask(title);
    }

    const tasks = await store.listTasks();
    expect(tasks.map((t) => t.title)).toEqual(["First", "Second", "Third", "Fourth", "Fifth"]);
  });

  it("trims the title and refuses a Task without one", async () => {
    const store = await openTaskStore(freshDbName());

    const task = await store.addTask("  Order cake  ");
    await expect(store.addTask("   ")).rejects.toThrow("A Task needs a title");

    expect(task.title).toBe("Order cake");
    expect(await store.listTasks()).toHaveLength(1);
  });

  it("ignores Complete for a Task that does not exist", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.completeTask("missing")).resolves.toBeUndefined();

    expect(await store.listTasks()).toEqual([]);
  });

  it("refuses a title longer than the limit, and takes one of exactly that length", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.addTask("x".repeat(maxTitleLength + 1))).rejects.toThrow("up to 200 characters");
    const task = await store.addTask("x".repeat(maxTitleLength));

    expect(await store.listTasks()).toEqual([task]);
  });
});

describe("Tasks that arrive in part", () => {
  it("get an empty title, no date, no Event, no List, no Tags, and are not Completed or deleted until the rest arrives", () => {
    expect(taskRecordType.withDefaults({ id: "t1" })).toEqual({
      id: "t1",
      title: "",
      date: null,
      time: null,
      eventId: null,
      offsetDays: null,
      listId: null,
      tagIds: [],
      createdAt: "",
      completedAt: null,
      deletedAt: null,
      rescheduleCount: 0,
    });
  });

  it("read a Tags field that is not a list of Tags as no Tags", () => {
    expect(taskRecordType.withDefaults({ id: "t1", tagIds: "g1" as never }).tagIds).toEqual([]);
    expect(taskRecordType.withDefaults({ id: "t1", tagIds: null as never }).tagIds).toEqual([]);
    expect(taskRecordType.withDefaults({ id: "t1", tagIds: ["g1", "g2"], listId: "l1" })).toMatchObject({ tagIds: ["g1", "g2"], listId: "l1" });
  });

  it("keep the fields they have, also ones this version doesn't know", () => {
    const partial = { id: "t1", title: "Known", completedAt: "2026-10-01T09:00:00.000Z", fromNewerVersion: 5 };

    expect(taskRecordType.withDefaults(partial)).toMatchObject(partial);
  });
});

describe("Deleting a Task", () => {
  it("takes the Task out of the list, also after a reload", async () => {
    const dbName = freshDbName();
    const before = await openTaskStore(dbName, { now: tickingClock() });
    const doomed = await before.addTask("Doomed");
    await before.addTask("Kept");

    await before.deleteTask(doomed.id);
    before.close();

    const after = await openTaskStore(dbName);
    expect((await after.listTasks()).map((t) => t.title)).toEqual(["Kept"]);
  });

  it("refuses to delete a Task that is gone, and ignores Complete for it", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName);
    const task = await store.addTask("Doomed");
    await store.deleteTask(task.id);

    await expect(store.deleteTask(task.id)).rejects.toThrow(`No Task with id ${task.id}`);
    await expect(store.completeTask(task.id)).resolves.toBeUndefined();
    await expect(store.deleteTask("missing")).rejects.toThrow("No Task with id missing");
    // The app tells "the Task is gone already" from a real failure by this class.
    await expect(store.deleteTask("missing")).rejects.toBeInstanceOf(NoTaskError);
    await expect(store.linkTask("missing", "e1", 0)).rejects.toBeInstanceOf(NoTaskError);

    expect(await store.listTasks()).toEqual([]);
    const raw = await (await openAppDb(dbName)).get("tasks", task.id);
    expect(raw).toMatchObject({ completedAt: null });
  });
});

describe("Task dates", () => {
  it("adds a Task to the Inbox by default, or with a date and an optional time", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });

    await store.addTask("Inbox idea");
    await store.addTask("Order cake", { date: "2026-10-04" });
    await store.addTask("Call the plumber", { date: "2026-10-04", time: "13:00" });

    const tasks = await store.listTasks();
    expect(tasks.map((t) => [t.title, t.date, t.time])).toEqual([
      ["Inbox idea", null, null],
      ["Order cake", "2026-10-04", null],
      ["Call the plumber", "2026-10-04", "13:00"],
    ]);
  });

  it("refuses a time without a date", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.addTask("Call", { time: "09:00" })).rejects.toThrow("Only a dated Task can have a time");
    expect(await store.listTasks()).toHaveLength(0);
  });

  it("reads Tasks saved before dates existed as undated", async () => {
    const dbName = freshDbName();
    const db = await openDB(dbName, 1, { upgrade: (d) => d.createObjectStore("tasks", { keyPath: "id" }) });
    await db.put("tasks", { id: "old", title: "Saved by the skeleton", createdAt: "2026-09-28T09:00:00.000Z", completedAt: null });
    db.close();

    const store = await openTaskStore(dbName);

    expect(await store.listTasks()).toEqual([
      {
        id: "old",
        title: "Saved by the skeleton",
        date: null,
        time: null,
        eventId: null,
        offsetDays: null,
        listId: null,
        tagIds: [],
        createdAt: "2026-09-28T09:00:00.000Z",
        completedAt: null,
        deletedAt: null,
        rescheduleCount: 0,
      },
    ]);
  });
});

describe("Linked tasks", () => {
  it("adds a Task to an Event at an Offset; its own date stays empty because the Event gives it one", async () => {
    const store = await openTaskStore(freshDbName());

    const task = await store.addTask("Buy gift", { eventId: "e1", offsetDays: -7 });

    expect(task).toMatchObject({ eventId: "e1", offsetDays: -7, date: null, time: null });
  });

  it("refuses an Offset without an Event, an Event without an Offset, and a fixed date on a Linked task", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.addTask("A", { offsetDays: -1 })).rejects.toThrow("A Linked task needs both an Event and an Offset");
    await expect(store.addTask("B", { eventId: "e1" })).rejects.toThrow("A Linked task needs both an Event and an Offset");
    await expect(store.addTask("C", { eventId: "e1", offsetDays: 0, date: "2026-10-12" })).rejects.toThrow(
      "A Linked task gets its date from its Event",
    );
    expect(await store.listTasks()).toHaveLength(0);
  });

  it("links an existing Task to an Event, and unlinks it keeping the date it had", async () => {
    const store = await openTaskStore(freshDbName());
    const task = await store.addTask("Wrap gift", { date: "2026-10-11", time: "18:00" });

    await store.linkTask(task.id, "e1", -1);
    const [linked] = await store.listTasks();
    await store.unlinkTask(task.id, "2026-10-11");
    const [unlinked] = await store.listTasks();

    expect(linked).toMatchObject({ eventId: "e1", offsetDays: -1, date: null, time: "18:00" });
    expect(unlinked).toMatchObject({ eventId: null, offsetDays: null, date: "2026-10-11", time: "18:00" });
  });

  it("refuses to link or unlink a Task that does not exist", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.linkTask("missing", "e1", 0)).rejects.toThrow("No Task with id missing");
    await expect(store.unlinkTask("missing", null)).rejects.toThrow("No Task with id missing");
  });
});

describe("Rescheduling a Task", () => {
  /** Sunday 4 October 2026, 13:05 in the device's time zone, moving on a second at every read (so Tasks keep their order). */
  const clock = () => {
    let second = 0;
    return () => new Date(2026, 9, 4, 13, 5, second++);
  };
  const noEvents = () => undefined;

  it("gives the Task its new date, keeps its time and counts the Reschedule", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const task = await store.addTask("Call the plumber", { date: "2026-10-06", time: "09:30" });

    await store.rescheduleTask(task.id, "2026-10-09", noEvents);

    const [rescheduled] = await store.listTasks();
    expect(rescheduled).toMatchObject({ date: "2026-10-09", time: "09:30", rescheduleCount: 1 });
  });

  it("counts every Reschedule, and keeps the date and the count across a reload", async () => {
    const dbName = freshDbName();
    const before = await openTaskStore(dbName, { now: clock() });
    const task = await before.addTask("Pay invoice", { date: "2026-10-06" });
    await before.rescheduleTask(task.id, "2026-10-07", noEvents);
    await before.rescheduleTask(task.id, "2026-10-12", noEvents);
    before.close();

    const after = await openTaskStore(dbName, { now: clock() });

    expect(await after.listTasks()).toEqual([expect.objectContaining({ date: "2026-10-12", rescheduleCount: 2 })]);
  });

  it("counts nothing when the Task is already on that day, and when an Inbox Task gets its first date", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const dated = await store.addTask("Dated", { date: "2026-10-06" });
    const inbox = await store.addTask("Inbox");

    await store.rescheduleTask(dated.id, "2026-10-06", noEvents);
    await store.rescheduleTask(inbox.id, "2026-10-08", noEvents);

    const [datedAfter, inboxAfter] = await store.listTasks();
    expect(datedAfter).toMatchObject({ date: "2026-10-06", rescheduleCount: 0 });
    expect(inboxAfter).toMatchObject({ date: "2026-10-08", rescheduleCount: 0 });
  });

  it("changes the Offset of a Linked task, so it keeps following its Event", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const task = await store.addTask("Buy gift", { eventId: "e1", offsetDays: -7 });

    await store.rescheduleTask(task.id, "2026-10-06", (id) => (id === "e1" ? "2026-10-12" : undefined));

    const [rescheduled] = await store.listTasks();
    expect(rescheduled).toMatchObject({ eventId: "e1", offsetDays: -6, date: null, rescheduleCount: 1 });
  });

  it("leaves a Linked task alone when its Event is not on this device", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const task = await store.addTask("Buy gift", { eventId: "e1", offsetDays: -7 });

    await store.rescheduleTask(task.id, "2026-10-09", noEvents);

    expect(defined((await store.listTasks())[0])).toMatchObject({ offsetDays: -7, rescheduleCount: 0 });
  });

  it("refuses to take an Overdue Task to today, or any Task to a day in the past, and changes nothing", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const overdue = await store.addTask("Overdue", { date: "2026-10-01" });
    const later = await store.addTask("Later", { date: "2026-10-09" });

    await expect(store.rescheduleTask(overdue.id, "2026-10-04", noEvents)).rejects.toThrow();
    await expect(store.rescheduleTask(later.id, "2026-10-03", noEvents)).rejects.toThrow();

    expect((await store.listTasks()).map((t) => [t.date, t.rescheduleCount])).toEqual([
      ["2026-10-01", 0],
      ["2026-10-09", 0],
    ]);
    await store.rescheduleTask(overdue.id, "2026-10-05", noEvents);
    expect(defined((await store.listTasks())[0]).date).toBe("2026-10-05");
  });

  it("judges Overdue by the device's day when the Task is rescheduled", async () => {
    let current = new Date(2026, 9, 4, 23, 59);
    const store = await openTaskStore(freshDbName(), { now: () => current });
    const task = await store.addTask("Due today", { date: "2026-10-04" });

    await store.rescheduleTask(task.id, "2026-10-04", noEvents);
    current = new Date(2026, 9, 5, 0, 1);

    // At 00:01 the Task is Overdue: tomorrow (Oct 6) is the earliest day, today (Oct 5) is not allowed.
    await expect(store.rescheduleTask(task.id, "2026-10-05", noEvents)).rejects.toThrow();
    await store.rescheduleTask(task.id, "2026-10-06", noEvents);
    expect(defined((await store.listTasks())[0])).toMatchObject({ date: "2026-10-06", rescheduleCount: 1 });
  });

  it("judges a Task whose Event has arrived but not its Offset as the lists show it: a Task due on its date", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: clock() });
    const task = await store.addTask("Half", { date: "2026-10-09" });
    const db = await openAppDb(dbName);
    await db.put("tasks", { ...(await db.get("tasks", task.id))!, eventId: "e1", offsetDays: null });
    db.close();
    // The Event started on 2026-10-01: were the Task taken for a Linked task, it would be Overdue and could not come to today.
    const eventStart = () => "2026-10-01";

    await store.rescheduleTask(task.id, "2026-10-04", eventStart);
    await store.rescheduleTask(task.id, "2026-10-10", eventStart);

    expect(defined((await store.listTasks())[0])).toMatchObject({ date: "2026-10-10", eventId: null, offsetDays: null, rescheduleCount: 2 });
  });

  describe("several at once", () => {
    // Midnight has passed since the Reschedule sheet was opened: it offered "Tomorrow" for the 4th, and it is the 4th now.
    const afterMidnight = () => new Date(2026, 9, 4, 0, 0, 5);

    it("takes every Task to the earliest day it may have when the chosen day has become too early, and none stops the others", async () => {
      const store = await openTaskStore(freshDbName(), { now: afterMidnight });
      const [a, b, c] = [await store.addTask("A", { date: "2026-10-01" }), await store.addTask("B", { date: "2026-10-02" }), await store.addTask("C", { date: "2026-10-09" })];

      await store.rescheduleTasks([a.id, b.id, c.id], "2026-10-04", noEvents);

      // A and B were Overdue (the 5th is the earliest); C was not, and may come to today.
      const byTitle = (await store.listTasks()).sort((x, y) => x.title.localeCompare(y.title));
      expect(byTitle.map((t) => [t.title, t.date, t.rescheduleCount])).toEqual([
        ["A", "2026-10-05", 1],
        ["B", "2026-10-05", 1],
        ["C", "2026-10-04", 1],
      ]);
    });

    it("moves a Linked task's Offset to the earliest day, and skips what is missing, deleted or has no Event here", async () => {
      const store = await openTaskStore(freshDbName(), { now: afterMidnight });
      const linked = await store.addTask("Linked", { eventId: "e1", offsetDays: -3 });
      const away = await store.addTask("Away", { eventId: "e2", offsetDays: -3 });
      const doomed = await store.addTask("Doomed", { date: "2026-10-01" });
      await store.deleteTask(doomed.id);
      // e1 starts on the 5th, so Linked is due on the 2nd: Overdue.
      const eventStart = (id: string) => (id === "e1" ? "2026-10-05" : undefined);

      await store.rescheduleTasks(["missing", doomed.id, away.id, linked.id], "2026-10-04", eventStart);

      const byTitle = (await store.listTasks()).sort((x, y) => x.title.localeCompare(y.title));
      expect(byTitle.map((t) => [t.title, t.eventId, t.offsetDays, t.date])).toEqual([
        ["Away", "e2", -3, null],
        ["Linked", "e1", 0, null],
      ]);
    });

    it("still takes a later day as it is, and counts one Reschedule per Task", async () => {
      const store = await openTaskStore(freshDbName(), { now: afterMidnight });
      const [a, b] = [await store.addTask("A", { date: "2026-10-01" }), await store.addTask("B", { date: "2026-10-02" })];

      await store.rescheduleTasks([a.id, b.id], "2026-10-12", noEvents);

      expect((await store.listTasks()).map((t) => [t.date, t.rescheduleCount])).toEqual([
        ["2026-10-12", 1],
        ["2026-10-12", 1],
      ]);
    });
  });

  it("ignores a Task that is missing or deleted, like Complete does", async () => {
    const store = await openTaskStore(freshDbName(), { now: clock() });
    const task = await store.addTask("Doomed", { date: "2026-10-06" });
    await store.deleteTask(task.id);

    await expect(store.rescheduleTask("missing", "2026-10-09", noEvents)).resolves.toBeUndefined();
    await expect(store.rescheduleTask(task.id, "2026-10-09", noEvents)).resolves.toBeUndefined();

    expect(await store.listTasks()).toEqual([]);
    expect(defined((await store.listTrash())[0])).toMatchObject({ date: "2026-10-06", rescheduleCount: 0 });
  });
});

describe("The Trash", () => {
  const day = 24 * 60 * 60 * 1000;
  const start = Date.UTC(2026, 9, 1, 9, 0, 0);
  /** A clock the test moves by hand. */
  function clock() {
    const state = { ms: start };
    return { state, now: () => new Date(state.ms) };
  }

  it("lists a deleted Task in the Trash and not in the Tasks", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });
    const doomed = await store.addTask("Doomed", { date: "2026-10-06" });
    await store.addTask("Kept");

    await store.deleteTask(doomed.id);

    expect((await store.listTasks()).map((t) => t.title)).toEqual(["Kept"]);
    expect(await store.listTrash()).toEqual([expect.objectContaining({ id: doomed.id, title: "Doomed", date: "2026-10-06" })]);
  });

  /** Adds Tasks under these ids, so a test can choose the order the ids are stored in (the keys of the Tasks). */
  async function addWithIds<T>(ids: string[], add: () => Promise<T>): Promise<T> {
    const spy = vi.spyOn(crypto, "randomUUID");
    for (const id of ids) spy.mockReturnValueOnce(id as ReturnType<typeof crypto.randomUUID>);
    try {
      return await add();
    } finally {
      spy.mockRestore();
    }
  }

  it("lists the Trash newest deletion first, whatever order the ids are stored in", async () => {
    const { state, now } = clock();
    const store = await openTaskStore(freshDbName(), { now });
    const added = await addWithIds(["k1", "k2", "k3", "k4"], async (): Promise<[Task, Task, Task, Task]> => [
      await store.addTask("one"),
      await store.addTask("two"),
      await store.addTask("three"),
      await store.addTask("four"),
    ]);
    const [one, two, three, four] = added;

    // Deleted in the order two, four, one, three: no way the Tasks' keys (k1..k4) list them like that by chance.
    for (const task of [two, four, one, three]) {
      state.ms += 1000;
      await store.deleteTask(task.id);
    }

    expect((await store.listTrash()).map((t) => t.title)).toEqual(["three", "one", "four", "two"]);
  });

  it("restores a Task exactly as it was", async () => {
    const { state, now } = clock();
    const store = await openTaskStore(freshDbName(), { now });
    const task = await store.addTask("Buy gift", { date: "2026-10-06", time: "09:30" });
    state.ms += 1000;
    await store.rescheduleTask(task.id, "2026-10-09", () => undefined);
    state.ms += 1000;
    await store.completeTask(task.id);
    const before = defined((await store.listTasks())[0]);

    state.ms += 1000;
    await store.deleteTask(task.id);
    state.ms += 1000;
    await store.restoreTask(task.id);

    expect(await store.listTasks()).toEqual([before]);
    expect(before).toMatchObject({ date: "2026-10-09", time: "09:30", rescheduleCount: 1 });
    expect(await store.listTrash()).toEqual([]);
  });

  it("restores a Linked task with its Event and Offset", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });
    const task = await store.addTask("Buy gift", { eventId: "e1", offsetDays: -7 });
    const before = defined((await store.listTasks())[0]);

    await store.deleteTask(task.id);
    await store.restoreTask(task.id);

    expect(await store.listTasks()).toEqual([before]);
  });

  it("keeps a deleted Task in the Trash, and a restored Task out of it, across a reload", async () => {
    const dbName = freshDbName();
    const before = await openTaskStore(dbName, { now: tickingClock() });
    const a = await before.addTask("A");
    const b = await before.addTask("B");
    await before.deleteTask(a.id);
    await before.deleteTask(b.id);
    await before.restoreTask(b.id);
    before.close();

    const after = await openTaskStore(dbName, { now: tickingClock() });

    expect((await after.listTrash()).map((t) => t.title)).toEqual(["A"]);
    expect((await after.listTasks()).map((t) => t.title)).toEqual(["B"]);
  });

  it("does not list a Task deleted 30 days ago or longer, and cannot restore it", async () => {
    const { state, now } = clock();
    const store = await openTaskStore(freshDbName(), { now });
    const task = await store.addTask("Old news");
    await store.deleteTask(task.id);

    state.ms += 30 * day - 1;
    expect((await store.listTrash()).map((t) => t.title)).toEqual(["Old news"]);

    state.ms += 1;
    expect(await store.listTrash()).toEqual([]);
    await expect(store.restoreTask(task.id)).resolves.toBeUndefined();
    expect(await store.listTasks()).toEqual([]);
    expect(await store.listTrash()).toEqual([]);
  });

  it("judges the expiry of the Task it is asked for, not of another one in the Trash", async () => {
    const { state, now } = clock();
    const store = await openTaskStore(freshDbName(), { now });
    // k1 is stored before k2 in both pairs; in the first pair the expired Task is the second one, in the other the first.
    const [oldLate, freshEarly, oldEarly, freshLate] = await addWithIds(["k2", "k1", "k3", "k4"], async (): Promise<[Task, Task, Task, Task]> => [
      await store.addTask("old, key k2"),
      await store.addTask("fresh, key k1"),
      await store.addTask("old, key k3"),
      await store.addTask("fresh, key k4"),
    ]);
    for (const task of [oldLate, oldEarly]) await store.deleteTask(task.id);
    state.ms += 20 * day;
    for (const task of [freshEarly, freshLate]) await store.deleteTask(task.id);
    state.ms += 15 * day;

    await store.restoreTask(oldLate.id);
    await store.restoreTask(oldEarly.id);
    expect(await store.listTasks()).toEqual([]);

    await store.restoreTask(freshLate.id);
    await store.restoreTask(freshEarly.id);
    expect((await store.listTasks()).map((t) => t.title).sort()).toEqual(["fresh, key k1", "fresh, key k4"]);
    expect(await store.listTrash()).toEqual([]);
  });

  it("restores a Task on the last day", async () => {
    const { state, now } = clock();
    const store = await openTaskStore(freshDbName(), { now });
    const task = await store.addTask("Just in time");
    await store.deleteTask(task.id);

    state.ms += 30 * day - 1;
    await store.restoreTask(task.id);

    expect((await store.listTasks()).map((t) => t.title)).toEqual(["Just in time"]);
  });

  it("ignores a restore of a Task that is live or missing", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });
    const task = await store.addTask("Alive");

    await expect(store.restoreTask(task.id)).resolves.toBeUndefined();
    await expect(store.restoreTask("missing")).resolves.toBeUndefined();

    expect((await store.listTasks()).map((t) => t.title)).toEqual(["Alive"]);
  });

  it("reads Tasks saved before Reschedule counting as rescheduled 0 times, in the Trash too", async () => {
    const dbName = freshDbName();
    const db = await openDB(dbName, 1, { upgrade: (d) => d.createObjectStore("tasks", { keyPath: "id" }) });
    await db.put("tasks", { id: "old", title: "Old", createdAt: "2026-09-28T09:00:00.000Z", completedAt: null });
    await db.put("tasks", { id: "gone", title: "Gone", createdAt: "2026-09-28T09:00:00.000Z", completedAt: null, deletedAt: "2026-10-01T09:00:00.000Z" });
    db.close();

    const store = await openTaskStore(dbName, { now: () => new Date("2026-10-02T09:00:00.000Z") });

    expect((await store.listTasks()).map((t) => [t.title, t.rescheduleCount])).toEqual([["Old", 0]]);
    expect((await store.listTrash()).map((t) => [t.title, t.rescheduleCount])).toEqual([["Gone", 0]]);
  });

  it("shows a Linked task whose Offset has not arrived as a Task without an Event, like the lists do", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: tickingClock() });
    const task = await store.addTask("Half");
    await store.deleteTask(task.id);
    const db = await openAppDb(dbName);
    await db.put("tasks", { ...(await db.get("tasks", task.id))!, eventId: "e1", offsetDays: null });
    db.close();

    expect(defined((await store.listTrash())[0])).toMatchObject({ eventId: null, offsetDays: null });
  });
});

describe("Lists and Tags of a Task", () => {
  /** The outbox entries of one Task's field: what a change would send to the server. */
  async function queued(dbName: string, id: string, field: string) {
    const db = await openAppDb(dbName);
    const entries = (await db.getAll("outbox")).filter((entry) => entry.id === id && entry.field === field);
    db.close();
    return entries;
  }

  it("adds a Task without a List and without Tags by default, or into a List", async () => {
    const store = await openTaskStore(freshDbName(), { now: tickingClock() });

    await store.addTask("Loose");
    await store.addTask("Sorted", { date: "2026-10-04" }, "l1");
    await store.addTask("In the Inbox of a List", undefined, "l1");
    await store.addTask("Explicitly none", undefined, null);

    expect((await store.listTasks()).map((t) => [t.title, t.listId, t.tagIds])).toEqual([
      ["Loose", null, []],
      ["Sorted", "l1", []],
      ["In the Inbox of a List", "l1", []],
      ["Explicitly none", null, []],
    ]);
  });

  it("puts a Task in a List and takes it out again, also after a reload", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName);
    const task = await store.addTask("Sort boxes");

    await store.setTaskList(task.id, "l1");
    store.close();
    const reopened = await openTaskStore(dbName);
    expect(defined((await reopened.listTasks())[0]).listId).toBe("l1");
    await reopened.setTaskList(task.id, null);

    expect(defined((await reopened.listTasks())[0]).listId).toBeNull();
  });

  it("refuses to put a Task that is missing or deleted in a List", async () => {
    const store = await openTaskStore(freshDbName());
    const task = await store.addTask("Gone");
    await store.deleteTask(task.id);

    await expect(store.setTaskList("missing", "l1")).rejects.toBeInstanceOf(NoTaskError);
    await expect(store.setTaskList(task.id, "l1")).rejects.toBeInstanceOf(NoTaskError);
  });

  it("adds Tags in the order they were added, each once", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName);
    const task = await store.addTask("Call");

    await store.addTaskTag(task.id, "g2");
    await store.addTaskTag(task.id, "g1");
    await store.addTaskTag(task.id, "g2");

    expect(defined((await store.listTasks())[0]).tagIds).toEqual(["g2", "g1"]);
  });

  it("removes a Tag and leaves the others; one that is not there changes nothing", async () => {
    const store = await openTaskStore(freshDbName());
    const task = await store.addTask("Call");
    for (const tagId of ["g1", "g2", "g3"]) await store.addTaskTag(task.id, tagId);

    await store.removeTaskTag(task.id, "g2");
    await store.removeTaskTag(task.id, "g9");

    expect(defined((await store.listTasks())[0]).tagIds).toEqual(["g1", "g3"]);
  });

  it("writes nothing for a Tag that is there already or one that is not there to remove", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: tickingClock() });
    const task = await store.addTask("Call");
    await store.addTaskTag(task.id, "g1");
    const before = await queued(dbName, task.id, "tagIds");

    await store.addTaskTag(task.id, "g1");
    await store.removeTaskTag(task.id, "g9");

    expect(await queued(dbName, task.id, "tagIds")).toEqual(before);
  });

  it("writes the Tags as one field, so a change is one outbox entry that replaces the last", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: tickingClock() });
    const task = await store.addTask("Call");

    await store.addTaskTag(task.id, "g1");
    await store.addTaskTag(task.id, "g2");

    const entries = await queued(dbName, task.id, "tagIds");
    expect(entries).toHaveLength(1);
    expect(defined(entries[0]).value).toEqual(["g1", "g2"]);
  });

  it("refuses Tag changes on a Task that is missing or deleted", async () => {
    const store = await openTaskStore(freshDbName());
    const task = await store.addTask("Gone");
    await store.deleteTask(task.id);

    await expect(store.addTaskTag("missing", "g1")).rejects.toBeInstanceOf(NoTaskError);
    await expect(store.addTaskTag(task.id, "g1")).rejects.toBeInstanceOf(NoTaskError);
    await expect(store.removeTaskTag("missing", "g1")).rejects.toBeInstanceOf(NoTaskError);
    await expect(store.removeTaskTag(task.id, "g1")).rejects.toBeInstanceOf(NoTaskError);
  });

  it("takes a Tag change from what is stored when it runs, not from a copy read earlier", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName);
    const task = await store.addTask("Call");
    // Another change lands (a sync, say) between the screen's read and this change.
    const db = await openAppDb(dbName);
    await db.put("tasks", { ...(await db.get("tasks", task.id))!, tagIds: ["g-from-sync"] });
    db.close();

    await store.addTaskTag(task.id, "g1");

    expect(defined((await store.listTasks())[0]).tagIds).toEqual(["g-from-sync", "g1"]);
  });

  it("clears the List of every live Task in it, and of no other", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: tickingClock() });
    const inList = await store.addTask("In", undefined, "l1");
    const done = await store.addTask("Done", undefined, "l1");
    await store.completeTask(done.id);
    await store.addTask("Elsewhere", undefined, "l2");
    await store.addTask("Nowhere");
    const deleted = await store.addTask("Deleted", undefined, "l1");
    await store.deleteTask(deleted.id);

    await store.clearList("l1");

    expect((await store.listTasks()).map((t) => [t.title, t.listId])).toEqual([
      ["In", null],
      ["Done", null],
      ["Elsewhere", "l2"],
      ["Nowhere", null],
    ]);
    // A Task in the Trash keeps its List: restoring it puts it back where it was (the List may be gone by then).
    expect(defined((await store.listTrash())[0]).listId).toBe("l1");
    expect(await queued(dbName, inList.id, "listId")).toHaveLength(1);
  });

  it("writes nothing for Tasks that are not in the List it clears", async () => {
    const dbName = freshDbName();
    const store = await openTaskStore(dbName, { now: tickingClock() });
    const other = await store.addTask("Elsewhere", undefined, "l2");
    const before = await queued(dbName, other.id, "listId");

    await store.clearList("l1");

    expect(await queued(dbName, other.id, "listId")).toEqual(before);
  });

  it("reads a Task saved by version 3, before Lists and Tags, as in no List and without Tags, and writes nothing for that", async () => {
    const dbName = freshDbName();
    const old = await openDB(dbName, 3, {
      upgrade(db) {
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("events", { keyPath: "id" });
        createSyncStores(db);
      },
    });
    await old.put("tasks", {
      id: "old",
      title: "From version 3",
      date: null,
      time: null,
      eventId: null,
      offsetDays: null,
      createdAt: "2026-09-28T09:00:00.000Z",
      completedAt: null,
      rescheduleCount: 0,
      deletedAt: null,
    });
    await old.put("syncInfo", true, "queued:task");
    old.close();

    const store = await openTaskStore(dbName);

    expect(await store.listTasks()).toMatchObject([{ id: "old", listId: null, tagIds: [] }]);
    const db = await openAppDb(dbName);
    expect(await db.getAll("outbox")).toEqual([]);
    db.close();
  });
});
