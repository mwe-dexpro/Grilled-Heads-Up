import { describe, expect, it } from "vitest";
import { openDB } from "idb";
import { openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { openTaskStore, taskRecordType } from "./taskStore";

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
    expect(tasks[0].title).toBe("Buy birthday present");
    expect(tasks[0].completedAt).toBeNull();
  });

  it("marks a Task as Completed at the current time", async () => {
    const now = new Date("2026-09-28T10:30:00.000Z");
    const store = await openTaskStore(freshDbName(), { now: () => now });
    const task = await store.addTask("Send invitations");

    await store.completeTask(task.id);

    const [completed] = await store.listTasks();
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
  it("get an empty title, no date, no Event, and are not Completed or deleted until the rest arrives", () => {
    expect(taskRecordType.withDefaults({ id: "t1" })).toEqual({
      id: "t1",
      title: "",
      date: null,
      time: null,
      eventId: null,
      offsetDays: null,
      createdAt: "",
      completedAt: null,
      deletedAt: null,
    });
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
        createdAt: "2026-09-28T09:00:00.000Z",
        completedAt: null,
        deletedAt: null,
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
