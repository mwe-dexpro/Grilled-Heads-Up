import { defaultDatabaseName, openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { openTable, type RecordType } from "../sync/replica";
import { NoTaskError, taskRecordType } from "../tasks/taskStore";
import { appendPosition, movedOrder, orderSubtasks, positionAt, subtasksOf } from "./subtasks";

/** A checklist entry inside a Task: one level only, and no date or time of its own. */
export interface Subtask {
  id: string;
  /** The Task it belongs to. A Subtask never belongs to a Subtask (there is no such field), and never changes Task. */
  taskId: string;
  /** Trimmed, 1 to `maxTitleLength` characters (the same cap as a Task's title). */
  title: string;
  /** Order within its Task: ascending; two with the same position (two devices adding at once) by `createdAt`, then `id`. */
  position: number;
  /** When it was ticked; null while open. Unticking writes null. */
  completedAt: string | null;
  createdAt: string;
  /** When it was deleted; it then stays stored so the deletion syncs. The undo toast restores it; the Trash does not list it. */
  deletedAt: string | null;
}

/** A change was asked for a Subtask that is not there (never was, or a sync has deleted it). Other failures are not this. */
export class NoSubtaskError extends Error {
  constructor(id: string) {
    super(`No Subtask with id ${id}`);
    this.name = "NoSubtaskError";
  }
}

export interface SubtaskStore {
  /**
   * Adds a Subtask after the Task's last one. Throws `NoTaskError` when the Task is missing or deleted (also when
   * `taskId` is a Subtask's id: Subtasks don't nest), and for an empty or too long title.
   */
  addSubtask: (taskId: string, title: string) => Promise<Subtask>;
  /** Same title checks as `addSubtask`; a Subtask that is missing or deleted throws `NoSubtaskError`. */
  renameSubtask: (id: string, title: string) => Promise<void>;
  /**
   * Ticks a Subtask (`completedAt` = now) or unticks it (null). One that is in that state already changes nothing: no
   * write, nothing to sync. Missing or deleted: `NoSubtaskError`.
   */
  setSubtaskDone: (id: string, done: boolean) => Promise<void>;
  /**
   * Moves a Subtask to `toIndex` among its Task's live Subtasks (clamped to them). Only its `position` is written,
   * or, when no position is left between its new neighbours, the Task's Subtasks are renumbered 0 to n-1 in their
   * new order. A move that changes nothing writes nothing. Missing or deleted: `NoSubtaskError`.
   */
  moveSubtask: (id: string, toIndex: number) => Promise<void>;
  /**
   * Moves a Subtask `by` places (negative: up) from where it is when the move runs, clamped like `moveSubtask`. A
   * key press means this: it does not depend on the order the screen shows, which a held key outruns. Moves asked
   * for at once run one after the other, so each counts. Missing or deleted: `NoSubtaskError`.
   */
  moveSubtaskBy: (id: string, by: number) => Promise<void>;
  /**
   * Deletes a Subtask (it leaves the lists and syncs as deleted) and says it did. One that is missing or deleted
   * already is ignored, and says false: there is nothing to offer an undo of.
   */
  deleteSubtask: (id: string) => Promise<boolean>;
  /** Takes a Subtask back after a delete (the undo toast), exactly as it was; one that is live or missing is left alone. */
  restoreSubtask: (id: string) => Promise<void>;
  /** Live Subtasks that have a Task and a title, in order; the caller groups them by Task. */
  listSubtasks: () => Promise<Subtask[]>;
  close: () => void;
}

export interface SubtaskStoreOptions {
  now?: () => Date;
}

/** How Subtasks sync. One arriving in part gets placeholders until its other fields arrive. */
export const subtaskRecordType: RecordType<Subtask> = {
  type: "subtask",
  storeName: "subtasks",
  withDefaults: (subtask) => ({
    ...subtask,
    taskId: subtask.taskId ?? "",
    title: subtask.title ?? "",
    position: subtask.position ?? 0,
    completedAt: subtask.completedAt ?? null,
    createdAt: subtask.createdAt ?? "",
    deletedAt: subtask.deletedAt ?? null,
  }),
};

function checkedTitle(raw: string): string {
  const title = raw.trim();
  if (title === "") throw new Error("A Subtask needs a title");
  if (title.length > maxTitleLength) throw new Error(`A Subtask's title can have up to ${maxTitleLength} characters`);
  return title;
}

export async function openSubtaskStore(dbName = defaultDatabaseName, { now = () => new Date() }: SubtaskStoreOptions = {}): Promise<SubtaskStore> {
  const db = await openAppDb(dbName);
  const subtasks = await openTable(db, subtaskRecordType, now);
  const tasks = await openTable(db, taskRecordType, now);

  /** Live Subtasks with a Task and a title, in order. */
  const listed = async () => orderSubtasks((await subtasks.list()).filter((subtask) => subtask.taskId !== "" && subtask.title !== ""));

  // Adds and moves run one after the other: each reads the order the one before left, which is there only once that
  // one is saved (a person typing a packing list adds faster than a save, and a held arrow key moves faster still).
  let last: Promise<unknown> = Promise.resolve();
  function inOrder<T>(run: () => Promise<T>): Promise<T> {
    const result = last.then(run);
    last = result.catch(() => undefined);
    return result;
  }

  async function add(taskId: string, title: string): Promise<Subtask> {
    // `get` finds a record of the Task table only, so the id of a Subtask (or any other record) is no parent.
    if (!(await tasks.get(taskId))) throw new NoTaskError(taskId);
    const subtask: Subtask = {
      id: crypto.randomUUID(),
      taskId,
      title,
      position: appendPosition(subtasksOf(taskId, await listed())),
      completedAt: null,
      createdAt: now().toISOString(),
      deletedAt: null,
    };
    await subtasks.put(subtask);
    return subtask;
  }

  /** Moves the Subtask to the index that `target` names, given the index it has now among its Task's Subtasks. */
  async function move(id: string, target: (from: number) => number): Promise<void> {
    const all = await listed();
    const moving = all.find((subtask) => subtask.id === id);
    if (!moving) throw new NoSubtaskError(id);
    const siblings = subtasksOf(moving.taskId, all);
    const toIndex = target(siblings.findIndex((subtask) => subtask.id === id));
    const order = movedOrder(siblings, id, toIndex);
    if (order.every((subtask, index) => subtask.id === siblings[index]?.id)) return;

    const position = positionAt(siblings, id, toIndex);
    if (position !== null) {
      if (!(await subtasks.update(id, { position }))) throw new NoSubtaskError(id);
      return;
    }
    // Nothing fits between the neighbours: number the Task's Subtasks again, in their new order.
    for (const [index, subtask] of order.entries()) {
      await subtasks.update(subtask.id, (current) => (current.position === index ? {} : { position: index }));
    }
  }

  return {
    async addSubtask(taskId, rawTitle) {
      const title = checkedTitle(rawTitle);
      return inOrder(() => add(taskId, title));
    },

    async renameSubtask(id, title) {
      if (!(await subtasks.update(id, { title: checkedTitle(title) }))) throw new NoSubtaskError(id);
    },

    async setSubtaskDone(id, done) {
      // Decided on the stored Subtask inside the transaction; one that is there already writes nothing.
      const changed = await subtasks.update(id, (current) => {
        if (done) return current.completedAt === null ? { completedAt: now().toISOString() } : {};
        return current.completedAt === null ? {} : { completedAt: null };
      });
      if (!changed) throw new NoSubtaskError(id);
    },

    moveSubtask: (id, toIndex) => inOrder(() => move(id, () => toIndex)),

    moveSubtaskBy: (id, by) => inOrder(() => move(id, (from) => from + by)),

    async deleteSubtask(id) {
      // The table decides inside its transaction, so of two deletes at once only one says it deleted.
      return subtasks.delete(id);
    },

    async restoreSubtask(id) {
      await subtasks.restore(id);
    },

    listSubtasks: listed,

    close() {
      db.close();
    },
  };
}
