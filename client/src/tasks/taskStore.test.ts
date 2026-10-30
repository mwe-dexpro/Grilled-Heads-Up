import { describe, expect, it } from "vitest";
import { openDB } from "idb";
import { openTaskStore } from "./taskStore";

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

  it("refuses to Complete a Task that does not exist", async () => {
    const store = await openTaskStore(freshDbName());

    await expect(store.completeTask("missing")).rejects.toThrow("No Task with id missing");
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
      { id: "old", title: "Saved by the skeleton", date: null, time: null, createdAt: "2026-09-28T09:00:00.000Z", completedAt: null },
    ]);
  });
});
