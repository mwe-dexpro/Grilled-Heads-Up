import { defaultDatabaseName, openAppDb } from "../data/database";
import type { Day, TimeOfDay } from "../home/days";

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
  completeTask(id: string): Promise<void>;
  /** Attaches a Task to an Event at an Offset; from then on its date comes from the Event. */
  linkTask(id: string, eventId: string, offsetDays: number): Promise<void>;
  /** Detaches a Task from its Event; it keeps `date`, the date it had while linked. */
  unlinkTask(id: string, date: Day | null): Promise<void>;
  /** Tasks in the order they were added. */
  listTasks(): Promise<Task[]>;
  close(): void;
}

export interface TaskStoreOptions {
  now?: () => Date;
}

/** Tasks saved by earlier versions lack the fields added since. */
function withDefaults(task: Task): Task {
  return {
    ...task,
    date: task.date ?? null,
    time: task.time ?? null,
    eventId: task.eventId ?? null,
    offsetDays: task.offsetDays ?? null,
  };
}

export async function openTaskStore(
  dbName = defaultDatabaseName,
  { now = () => new Date() }: TaskStoreOptions = {},
): Promise<TaskStore> {
  const db = await openAppDb(dbName);

  async function existing(id: string): Promise<Task> {
    const task = await db.get("tasks", id);
    if (!task) throw new Error(`No Task with id ${id}`);
    return withDefaults(task);
  }

  return {
    async addTask(rawTitle, { date = null, time = null, eventId = null, offsetDays = null } = {}) {
      const title = rawTitle.trim();
      if (title === "") throw new Error("A Task needs a title");
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
      };
      await db.put("tasks", task);
      return task;
    },

    async completeTask(id) {
      await db.put("tasks", { ...(await existing(id)), completedAt: now().toISOString() });
    },

    async linkTask(id, eventId, offsetDays) {
      await db.put("tasks", { ...(await existing(id)), eventId, offsetDays, date: null });
    },

    async unlinkTask(id, date) {
      await db.put("tasks", { ...(await existing(id)), eventId: null, offsetDays: null, date });
    },

    async listTasks() {
      const tasks = (await db.getAll("tasks")).map(withDefaults);
      return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    close() {
      db.close();
    },
  };
}
