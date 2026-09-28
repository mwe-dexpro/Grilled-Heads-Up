import { describe, expect, it } from "vitest";
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
