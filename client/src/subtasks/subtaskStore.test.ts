import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { openTable } from "../sync/replica";
import { NoTaskError, openTaskStore } from "../tasks/taskStore";
import { NoSubtaskError, openSubtaskStore, subtaskRecordType, type Subtask } from "./subtaskStore";

let dbCounter = 0;
const freshDbName = () => `subtasks-test-${dbCounter++}`;

/** A clock that moves one second forward on every read. */
function tickingClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 28, 9, 0, tick++));
}

/** A Task to hang Subtasks on, and the stores over one database. */
async function open(dbName = freshDbName(), now = tickingClock()) {
  const tasks = await openTaskStore(dbName, { now });
  const subtasks = await openSubtaskStore(dbName, { now });
  const task = await tasks.addTask("Pack for the weekend");
  return { dbName, now, tasks, subtasks, task };
}

const titles = async (store: Awaited<ReturnType<typeof open>>["subtasks"], taskId?: string) =>
  (await store.listSubtasks()).filter((s) => taskId === undefined || s.taskId === taskId).map((s) => s.title);

/** The outbox entries of one Subtask's field: what a change would send to the server. */
async function queued(dbName: string, id: string, field: string) {
  const db = await openAppDb(dbName);
  const entries = (await db.getAll("outbox")).filter((entry) => entry.type === "subtask" && entry.id === id && entry.field === field);
  db.close();
  return entries;
}

/** Everything waiting to be sent to the server. */
async function outbox(dbName: string) {
  const db = await openAppDb(dbName);
  const entries = await db.getAll("outbox");
  db.close();
  return entries;
}

/** Saves Subtasks as they are, with positions and times of the test's choosing (as two devices' adds would leave them). */
async function seed(dbName: string, subtasks: Array<Pick<Subtask, "id" | "taskId" | "createdAt" | "position">>) {
  const db = await openAppDb(dbName);
  const table = await openTable(db, subtaskRecordType, () => new Date("2026-10-01T08:00:00.000Z"));
  for (const subtask of subtasks) await table.put({ title: subtask.id.toUpperCase(), completedAt: null, deletedAt: null, ...subtask });
  db.close();
}

describe("Subtasks that arrive in part", () => {
  it("get no Task, an empty title, position 0, are open and not deleted until the rest arrives", () => {
    expect(subtaskRecordType.withDefaults({ id: "s1" })).toEqual({
      id: "s1",
      taskId: "",
      title: "",
      position: 0,
      completedAt: null,
      createdAt: "",
      deletedAt: null,
    });
  });

  it("keep the fields they have, and ones this version doesn't know", () => {
    const partial = { id: "s1", taskId: "t1", title: "Boots", position: 2.5, completedAt: "2026-10-01T09:00:00.000Z", fromNewerVersion: 5 };

    expect(subtaskRecordType.withDefaults(partial)).toMatchObject(partial);
  });

  it("has no date or time field to give a Subtask a date of its own", () => {
    const fields = Object.keys(subtaskRecordType.withDefaults({ id: "s1" }));

    expect(fields.sort()).toEqual(["completedAt", "createdAt", "deletedAt", "id", "position", "taskId", "title"]);
  });
});

describe("Subtask store", () => {
  it("adds Subtasks to a Task, trimmed and each after the last, and reads them back after a reopen", async () => {
    const { dbName, subtasks, task } = await open(freshDbName(), () => new Date("2026-10-04T11:05:00.000Z"));

    const boots = await subtasks.addSubtask(task.id, "  Boots ");
    const jacket = await subtasks.addSubtask(task.id, "Rain jacket");
    subtasks.close();
    const after = await openSubtaskStore(dbName);

    expect(boots).toEqual({
      id: boots.id,
      taskId: task.id,
      title: "Boots",
      position: 0,
      completedAt: null,
      createdAt: "2026-10-04T11:05:00.000Z",
      deletedAt: null,
    });
    expect(jacket.position).toBe(1);
    expect(await after.listSubtasks()).toEqual([boots, jacket]);
  });

  it("refuses an empty, a blank and a too long title, and takes one of exactly the limit", async () => {
    const { subtasks, task } = await open();

    await expect(subtasks.addSubtask(task.id, "")).rejects.toThrow("A Subtask needs a title");
    await expect(subtasks.addSubtask(task.id, "   ")).rejects.toThrow("A Subtask needs a title");
    await expect(subtasks.addSubtask(task.id, "x".repeat(maxTitleLength + 1))).rejects.toThrow("up to 200 characters");
    await subtasks.addSubtask(task.id, "y".repeat(maxTitleLength));

    expect(await subtasks.listSubtasks()).toHaveLength(1);
  });

  it("appends after the last position of that Task only, also after a Subtask was deleted or moved", async () => {
    const { subtasks, task, tasks } = await open();
    const other = await tasks.addTask("Other");
    const a = await subtasks.addSubtask(task.id, "A");
    const b = await subtasks.addSubtask(task.id, "B");
    const x = await subtasks.addSubtask(other.id, "X");
    await subtasks.moveSubtask(a.id, 1);
    await subtasks.deleteSubtask(a.id);

    const c = await subtasks.addSubtask(task.id, "C");

    expect(x.position).toBe(0);
    expect(c.position).toBeGreaterThan(b.position);
    expect(await titles(subtasks, task.id)).toEqual(["B", "C"]);
  });

  it("keeps Subtasks added at once (typed quickly, one after another) in the order they were asked for", async () => {
    // A clock that stands still: nothing but the order of the calls can tell the Subtasks apart.
    const { subtasks, task } = await open(freshDbName(), () => new Date("2026-10-04T11:05:00.000Z"));

    await Promise.all(["Boots", "Rain jacket", "Chargers", "Swimwear"].map((title) => subtasks.addSubtask(task.id, title)));

    expect(await titles(subtasks, task.id)).toEqual(["Boots", "Rain jacket", "Chargers", "Swimwear"]);
    expect((await subtasks.listSubtasks()).map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("goes on adding after an add that failed", async () => {
    const { subtasks, task } = await open();

    const results = await Promise.allSettled([subtasks.addSubtask(task.id, ""), subtasks.addSubtask("missing", "Nope"), subtasks.addSubtask(task.id, "Boots")]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "fulfilled"]);
    expect(await titles(subtasks)).toEqual(["Boots"]);
  });

  it("adds to a Task that is missing, deleted, or not a Task at all, with a NoTaskError", async () => {
    const { subtasks, tasks, task } = await open();
    const sub = await subtasks.addSubtask(task.id, "Boots");
    const gone = await tasks.addTask("Gone");
    await tasks.deleteTask(gone.id);

    await expect(subtasks.addSubtask("missing", "Nope")).rejects.toBeInstanceOf(NoTaskError);
    await expect(subtasks.addSubtask(gone.id, "Nope")).rejects.toBeInstanceOf(NoTaskError);
    // Subtasks don't nest: a Subtask's id is not a Task's.
    await expect(subtasks.addSubtask(sub.id, "Nested")).rejects.toBeInstanceOf(NoTaskError);
    expect(await titles(subtasks)).toEqual(["Boots"]);
  });

  it("tells a title that is bad from a Task that is gone", async () => {
    const { subtasks, task } = await open();

    await expect(subtasks.addSubtask(task.id, " ")).rejects.not.toBeInstanceOf(NoTaskError);
  });

  it("renames a Subtask, trimmed, with the same checks as when adding", async () => {
    const { subtasks, task } = await open();
    const present = await subtasks.addSubtask(task.id, "Present");

    await subtasks.renameSubtask(present.id, "  Voucher ");
    await expect(subtasks.renameSubtask(present.id, "  ")).rejects.toThrow("A Subtask needs a title");
    await expect(subtasks.renameSubtask(present.id, "x".repeat(maxTitleLength + 1))).rejects.toThrow("up to 200 characters");
    await expect(subtasks.renameSubtask("missing", "Nope")).rejects.toThrow("No Subtask with id missing");

    expect(await titles(subtasks)).toEqual(["Voucher"]);
  });

  it("ticks and unticks a Subtask: the time it was ticked at, then null", async () => {
    const { subtasks, task } = await open(freshDbName(), () => new Date("2026-10-04T11:05:00.000Z"));
    const boots = await subtasks.addSubtask(task.id, "Boots");

    await subtasks.setSubtaskDone(boots.id, true);
    expect((await subtasks.listSubtasks())[0].completedAt).toBe("2026-10-04T11:05:00.000Z");
    await subtasks.setSubtaskDone(boots.id, false);

    expect((await subtasks.listSubtasks())[0].completedAt).toBeNull();
  });

  it("writes nothing for a tick of a ticked Subtask or an untick of an open one", async () => {
    const { dbName, subtasks, task } = await open();
    const boots = await subtasks.addSubtask(task.id, "Boots");
    const added = await outbox(dbName);

    await subtasks.setSubtaskDone(boots.id, false);
    expect(await outbox(dbName)).toEqual(added);
    await subtasks.setSubtaskDone(boots.id, true);
    const ticked = await outbox(dbName);
    expect(ticked).not.toEqual(added);
    await subtasks.setSubtaskDone(boots.id, true);
    expect(await outbox(dbName)).toEqual(ticked);
    await subtasks.setSubtaskDone(boots.id, false);
    const unticked = await outbox(dbName);
    expect(unticked).not.toEqual(ticked);
    await subtasks.setSubtaskDone(boots.id, false);

    expect(await outbox(dbName)).toEqual(unticked);
    expect(await queued(dbName, boots.id, "completedAt")).toMatchObject([{ value: null }]);
  });

  it("refuses to tick, rename or move a Subtask that is missing or deleted, with a NoSubtaskError", async () => {
    const { subtasks, task } = await open();
    const gone = await subtasks.addSubtask(task.id, "Gone");
    await subtasks.deleteSubtask(gone.id);

    for (const id of ["missing", gone.id]) {
      await expect(subtasks.setSubtaskDone(id, true)).rejects.toBeInstanceOf(NoSubtaskError);
      await expect(subtasks.setSubtaskDone(id, false)).rejects.toBeInstanceOf(NoSubtaskError);
      await expect(subtasks.renameSubtask(id, "Back")).rejects.toBeInstanceOf(NoSubtaskError);
      await expect(subtasks.moveSubtask(id, 0)).rejects.toBeInstanceOf(NoSubtaskError);
    }
    await expect(subtasks.renameSubtask("missing", "Nope")).rejects.toMatchObject({ name: "NoSubtaskError", message: "No Subtask with id missing" });
  });

  describe("moving", () => {
    async function four() {
      const env = await open();
      const made: Subtask[] = [];
      for (const title of ["A", "B", "C", "D"]) made.push(await env.subtasks.addSubtask(env.task.id, title));
      const [a, b, c, d] = made;
      return { ...env, a, b, c, d };
    }

    it("moves a Subtask to the top, to the bottom and into the middle, writing its position only", async () => {
      const { dbName, subtasks, task, a, b, d } = await four();

      await subtasks.moveSubtask(d.id, 0);
      expect(await titles(subtasks, task.id)).toEqual(["D", "A", "B", "C"]);
      await subtasks.moveSubtask(d.id, 3);
      expect(await titles(subtasks, task.id)).toEqual(["A", "B", "C", "D"]);
      await subtasks.moveSubtask(a.id, 2);
      expect(await titles(subtasks, task.id)).toEqual(["B", "C", "A", "D"]);

      expect((await queued(dbName, a.id, "position"))[0].value).toBe(2.5);
      expect(await queued(dbName, b.id, "position")).toHaveLength(1);
      expect(await queued(dbName, b.id, "title")).toHaveLength(1);
    });

    it("takes moves made at once one after the other, each from the order the one before left", async () => {
      const { subtasks, task, a, c } = await four();

      // A goes to the second place (B, A, C, D); then C goes to the second place of that order.
      await Promise.all([subtasks.moveSubtask(a.id, 1), subtasks.moveSubtask(c.id, 1)]);

      expect(await titles(subtasks, task.id)).toEqual(["B", "C", "A", "D"]);
    });

    it("clamps an index outside the list", async () => {
      const { subtasks, task, a, d } = await four();

      await subtasks.moveSubtask(a.id, 99);
      expect(await titles(subtasks, task.id)).toEqual(["B", "C", "D", "A"]);
      await subtasks.moveSubtask(d.id, -4);

      expect(await titles(subtasks, task.id)).toEqual(["D", "B", "C", "A"]);
    });

    it("writes nothing for a move that changes nothing", async () => {
      const { dbName, subtasks, b, d } = await four();
      const before = await outbox(dbName);

      await subtasks.moveSubtask(b.id, 1);
      await subtasks.moveSubtask(d.id, 3);
      await subtasks.moveSubtask(d.id, 40);

      expect(await outbox(dbName)).toEqual(before);
    });

    it("moves among the Subtasks of its own Task, not those of another", async () => {
      const { subtasks, tasks, task, a } = await four();
      const other = await tasks.addTask("Other");
      for (const title of ["X", "Y"]) await subtasks.addSubtask(other.id, title);

      await subtasks.moveSubtask(a.id, 1);

      expect(await titles(subtasks, task.id)).toEqual(["B", "A", "C", "D"]);
      expect(await titles(subtasks, other.id)).toEqual(["X", "Y"]);
    });

    it("moves among live Subtasks only: a deleted one does not count as a place", async () => {
      const { subtasks, task, a, b, d } = await four();
      await subtasks.deleteSubtask(b.id);

      await subtasks.moveSubtask(d.id, 1);

      expect(await titles(subtasks, task.id)).toEqual(["A", "D", "C"]);
      expect(a.title).toBe("A");
    });

    it("renumbers the Task's Subtasks when no position is left between the neighbours, each with an update of its position", async () => {
      const { dbName, subtasks, tasks } = await open();
      const task = await tasks.addTask("Tied");
      // Two devices added at the same moment: the same position, so the order falls back to createdAt.
      await seed(dbName, [
        { id: "a", taskId: task.id, createdAt: "2026-10-01T09:00:00.000Z", position: 1 },
        { id: "b", taskId: task.id, createdAt: "2026-10-01T09:00:01.000Z", position: 1 },
        { id: "c", taskId: task.id, createdAt: "2026-10-01T09:00:02.000Z", position: 1 },
      ]);
      expect(await titles(subtasks, task.id)).toEqual(["A", "B", "C"]);

      await subtasks.moveSubtask("c", 1);

      expect(await titles(subtasks, task.id)).toEqual(["A", "C", "B"]);
      expect((await subtasks.listSubtasks()).map((s) => s.position)).toEqual([0, 1, 2]);
      for (const id of ["a", "b", "c"]) expect(await queued(dbName, id, "position")).toMatchObject([{ value: ["a", "c", "b"].indexOf(id) }]);
    });

    it("keeps the other Tasks' Subtasks as they are when it renumbers", async () => {
      const { dbName, subtasks, tasks } = await open();
      const [mine, theirs] = [await tasks.addTask("Mine"), await tasks.addTask("Theirs")];
      await seed(dbName, [
        { id: "m1", taskId: mine.id, createdAt: "2026-10-01T09:00:00.000Z", position: 7 },
        { id: "m2", taskId: mine.id, createdAt: "2026-10-01T09:00:01.000Z", position: 7 },
        { id: "m3", taskId: mine.id, createdAt: "2026-10-01T09:00:01.500Z", position: 7 },
        { id: "t1", taskId: theirs.id, createdAt: "2026-10-01T09:00:02.000Z", position: 7 },
        { id: "t2", taskId: theirs.id, createdAt: "2026-10-01T09:00:03.000Z", position: 7 },
      ]);
      const before = await queued(dbName, "t1", "position");

      await subtasks.moveSubtask("m3", 1);

      expect(await titles(subtasks, mine.id)).toEqual(["M1", "M3", "M2"]);
      expect((await subtasks.listSubtasks()).filter((s) => s.taskId === theirs.id).map((s) => s.position)).toEqual([7, 7]);
      expect(await queued(dbName, "t1", "position")).toEqual(before);
    });
  });

  it("deletes a Subtask, which stays gone after a reopen; deleting one that is missing or gone is nothing", async () => {
    const { dbName, subtasks, task } = await open();
    const keep = await subtasks.addSubtask(task.id, "Keep");
    const drop = await subtasks.addSubtask(task.id, "Drop");

    await subtasks.deleteSubtask(drop.id);
    await expect(subtasks.deleteSubtask(drop.id)).resolves.toBeUndefined();
    await expect(subtasks.deleteSubtask("missing")).resolves.toBeUndefined();
    subtasks.close();

    expect(await (await openSubtaskStore(dbName)).listSubtasks()).toEqual([keep]);
  });

  it("restores a deleted Subtask exactly as it was; restoring a live or missing one changes nothing", async () => {
    const { dbName, subtasks, task } = await open();
    const boots = await subtasks.addSubtask(task.id, "Boots");
    await subtasks.setSubtaskDone(boots.id, true);
    const before = await subtasks.listSubtasks();
    await subtasks.deleteSubtask(boots.id);
    expect(await subtasks.listSubtasks()).toEqual([]);

    await subtasks.restoreSubtask(boots.id);
    const written = await queued(dbName, boots.id, "deletedAt");
    await subtasks.restoreSubtask(boots.id);
    await expect(subtasks.restoreSubtask("missing")).resolves.toBeUndefined();

    expect(await subtasks.listSubtasks()).toEqual(before);
    expect(await queued(dbName, boots.id, "deletedAt")).toEqual(written);
  });

  it("leaves out a Subtask whose Task or title has not arrived yet", async () => {
    const { dbName, subtasks, task } = await open();
    const whole = await subtasks.addSubtask(task.id, "Whole");
    const db = await openAppDb(dbName);
    await db.put("subtasks", { id: "no-task", title: "Orphan", position: 0 } as never);
    await db.put("subtasks", { id: "no-title", taskId: task.id, position: 0 } as never);
    db.close();

    expect(await subtasks.listSubtasks()).toEqual([whole]);
  });

  it("lists them in order, whichever Task they belong to", async () => {
    const { subtasks, tasks, task } = await open();
    const other = await tasks.addTask("Other");
    const a = await subtasks.addSubtask(task.id, "A");
    await subtasks.addSubtask(other.id, "X");
    await subtasks.addSubtask(task.id, "B");
    await subtasks.moveSubtask(a.id, 1);

    expect(await titles(subtasks)).toEqual(["X", "B", "A"]);
  });
});

describe("Subtasks and Tasks", () => {
  it("never show up in a Task list: a Subtask is not a Task, so Progress, which reads Tasks only, can't count it", async () => {
    const { subtasks, tasks, task } = await open();
    const boots = await subtasks.addSubtask(task.id, "Boots");
    await subtasks.setSubtaskDone(boots.id, true);

    expect((await tasks.listTasks()).map((t) => t.id)).toEqual([task.id]);
    expect(await tasks.listTrash()).toEqual([]);
  });

  it("stay when their Task is deleted, and are there again, unchanged, when it is restored", async () => {
    const { subtasks, tasks, task } = await open();
    const boots = await subtasks.addSubtask(task.id, "Boots");
    await subtasks.addSubtask(task.id, "Jacket");
    await subtasks.setSubtaskDone(boots.id, true);
    const before = await subtasks.listSubtasks();

    await tasks.deleteTask(task.id);
    expect(await subtasks.listSubtasks()).toEqual(before);
    await tasks.restoreTask(task.id);

    expect(await subtasks.listSubtasks()).toEqual(before);
  });
});
