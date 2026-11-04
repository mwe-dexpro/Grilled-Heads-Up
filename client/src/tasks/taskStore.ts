import { defaultDatabaseName, openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { dayOf, type Day, type TimeOfDay } from "../home/days";
import { openTable, type Patch, type RecordType } from "../sync/replica";
import { reschedulePatch } from "./reschedule";
import { isExpired } from "./trash";

export interface Task {
  id: string;
  title: string;
  /** Floating date; null puts the Task in the Inbox. */
  date: Day | null;
  /** Floating time of day; only a dated Task can have one. */
  time: TimeOfDay | null;
  /** The Event a Linked task belongs to. Its date then comes from the Event and the Offset, not from `date`. */
  eventId: string | null;
  /** Days from the Event's start day (negative = before); set exactly when `eventId` is. */
  offsetDays: number | null;
  createdAt: string;
  completedAt: string | null;
  /** How often the Task was rescheduled; synced, but not shown in v1. Last write wins, so it is a hint, not an audit. */
  rescheduleCount: number;
  /** When the Task was deleted; it then stays stored so the deletion syncs, and the Trash lists it for 30 days. */
  deletedAt: string | null;
}

export interface TaskWhen {
  date?: Day | null;
  time?: TimeOfDay | null;
  /** For a Linked task: its Event and the Offset from the Event's start day, instead of a date. */
  eventId?: string | null;
  offsetDays?: number | null;
}

export interface TaskStore {
  addTask(title: string, when?: TaskWhen): Promise<Task>;
  /** Completes a Task; one that is missing or deleted (say, by a sync a moment ago) is ignored. */
  completeTask(id: string): Promise<void>;
  /** Attaches a Task to an Event at an Offset; from then on its date comes from the Event. */
  linkTask(id: string, eventId: string, offsetDays: number): Promise<void>;
  /** Detaches a Task from its Event; it keeps `date`, the date it had while linked. */
  unlinkTask(id: string, date: Day | null): Promise<void>;
  /**
   * Gives a Task a new date (a Linked task a new Offset, from `eventStart`, the start day of the Event it belongs to)
   * and counts the Reschedule; see `reschedulePatch`. Throws for a day that is not allowed (never today for an
   * Overdue Task, never a day in the past). A Task that is missing or deleted is ignored, like in `completeTask`.
   */
  rescheduleTask(id: string, day: Day, eventStart: (eventId: string) => Day | undefined): Promise<void>;
  /** Deletes a Task: it moves to the Trash (it leaves every list and syncs as deleted). */
  deleteTask(id: string): Promise<void>;
  /**
   * Takes a Task out of the Trash, exactly as it was. Only a Task that is in the Trash (deleted, and not for 30
   * days yet) is restored; one that is live, missing or expired is left alone, without an error.
   */
  restoreTask(id: string): Promise<void>;
  /** Tasks in the order they were added; deleted ones are left out. */
  listTasks(): Promise<Task[]>;
  /** The Trash: Tasks deleted less than 30 days ago, the latest deletion first. */
  listTrash(): Promise<Task[]>;
  close(): void;
}

export interface TaskStoreOptions {
  now?: () => Date;
}

/** How Tasks sync. Tasks saved by earlier versions, or arriving in part, lack some fields. */
export const taskRecordType: RecordType<Task> = {
  type: "task",
  storeName: "tasks",
  withDefaults: (task) => ({
    ...task,
    title: task.title ?? "",
    date: task.date ?? null,
    time: task.time ?? null,
    eventId: task.eventId ?? null,
    offsetDays: task.offsetDays ?? null,
    createdAt: task.createdAt ?? "",
    completedAt: task.completedAt ?? null,
    rescheduleCount: task.rescheduleCount ?? 0,
    deletedAt: task.deletedAt ?? null,
  }),
};

/**
 * A Linked task has both its Event and its Offset. One of them can be missing for a while after a sync (the
 * fields arrive one by one); the Task then shows as a Task without an Event. Only the reading is changed.
 */
function wholeLink(task: Task): Task {
  if (task.eventId !== null && task.offsetDays === null) return { ...task, eventId: null };
  if (task.eventId === null && task.offsetDays !== null) return { ...task, offsetDays: null };
  return task;
}

export async function openTaskStore(
  dbName = defaultDatabaseName,
  { now = () => new Date() }: TaskStoreOptions = {},
): Promise<TaskStore> {
  const db = await openAppDb(dbName);
  const tasks = await openTable(db, taskRecordType, now);

  /** Changes a live Task in one transaction (see `Table.update`), so a sync landing meanwhile is not overwritten. */
  async function change(id: string, patch: Patch<Task>): Promise<void> {
    if (!(await tasks.update(id, patch))) throw new Error(`No Task with id ${id}`);
  }

  return {
    async addTask(rawTitle, { date = null, time = null, eventId = null, offsetDays = null } = {}) {
      const title = rawTitle.trim();
      if (title === "") throw new Error("A Task needs a title");
      if (title.length > maxTitleLength) throw new Error(`A Task's title can have up to ${maxTitleLength} characters`);
      if ((eventId === null) !== (offsetDays === null)) throw new Error("A Linked task needs both an Event and an Offset");
      if (eventId !== null && date !== null) throw new Error("A Linked task gets its date from its Event");
      if (time !== null && date === null && eventId === null) throw new Error("Only a dated Task can have a time");
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        date,
        time,
        eventId,
        offsetDays,
        createdAt: now().toISOString(),
        completedAt: null,
        rescheduleCount: 0,
        deletedAt: null,
      };
      await tasks.put(task);
      return task;
    },

    async completeTask(id) {
      // A Task that a sync has just deleted is gone anyway; completing it is a tap on a stale row, not an error.
      await tasks.update(id, { completedAt: now().toISOString() });
    },

    async linkTask(id, eventId, offsetDays) {
      await change(id, { eventId, offsetDays, date: null });
    },

    async unlinkTask(id, date) {
      await change(id, { eventId: null, offsetDays: null, date });
    },

    async rescheduleTask(id, day, eventStart) {
      // The rule runs on the stored Task inside the transaction, so a sync that landed meanwhile is respected.
      const today = dayOf(now());
      await tasks.update(id, (current) => reschedulePatch(current, day, eventStart, today) ?? {});
    },

    async deleteTask(id) {
      if (!(await tasks.get(id))) throw new Error(`No Task with id ${id}`);
      await tasks.delete(id);
    },

    async restoreTask(id) {
      const at = now();
      const deleted = (await tasks.listDeleted()).find((task) => task.id === id);
      if (deleted && !isExpired(deleted.deletedAt!, at)) await tasks.restore(id);
    },

    async listTasks() {
      return (await tasks.list()).map(wholeLink).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async listTrash() {
      const at = now();
      return (await tasks.listDeleted())
        .filter((task) => !isExpired(task.deletedAt!, at))
        .map(wholeLink)
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
    },

    close() {
      db.close();
    },
  };
}
