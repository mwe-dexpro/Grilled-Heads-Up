import { openDB, type DBSchema } from "idb";
import type { Day, TimeOfDay } from "../home/days";

export interface Task {
  id: string;
  title: string;
  /** Floating date; null puts the Task in the Inbox. */
  date: Day | null;
  /** Floating time of day; only a dated Task can have one. */
  time: TimeOfDay | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskWhen {
  date?: Day | null;
  time?: TimeOfDay | null;
}

export interface TaskStore {
  addTask(title: string, when?: TaskWhen): Promise<Task>;
  completeTask(id: string): Promise<void>;
  /** Tasks in the order they were added. */
  listTasks(): Promise<Task[]>;
  close(): void;
}

export interface TaskStoreOptions {
  now?: () => Date;
}

interface TaskDb extends DBSchema {
  tasks: { key: string; value: Task };
}

/** Tasks saved before dates existed have no date or time fields. */
function withDefaults(task: Task): Task {
  return { ...task, date: task.date ?? null, time: task.time ?? null };
}

export async function openTaskStore(
  dbName = "grilled-heads-up",
  { now = () => new Date() }: TaskStoreOptions = {},
): Promise<TaskStore> {
  const db = await openDB<TaskDb>(dbName, 1, {
    upgrade(db) {
      db.createObjectStore("tasks", { keyPath: "id" });
    },
  });

  return {
    async addTask(rawTitle, { date = null, time = null } = {}) {
      const title = rawTitle.trim();
      if (title === "") throw new Error("A Task needs a title");
      if (time !== null && date === null) throw new Error("Only a dated Task can have a time");
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        date,
        time,
        createdAt: now().toISOString(),
        completedAt: null,
      };
      await db.put("tasks", task);
      return task;
    },

    async completeTask(id) {
      const task = await db.get("tasks", id);
      if (!task) throw new Error(`No Task with id ${id}`);
      await db.put("tasks", { ...task, completedAt: now().toISOString() });
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
