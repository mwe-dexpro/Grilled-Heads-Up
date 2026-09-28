import { openDB, type DBSchema } from "idb";

export interface Task {
  id: string;
  title: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskStore {
  addTask(title: string): Promise<Task>;
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
    async addTask(rawTitle) {
      const title = rawTitle.trim();
      if (title === "") throw new Error("A Task needs a title");
      const task: Task = {
        id: crypto.randomUUID(),
        title,
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
      const tasks = await db.getAll("tasks");
      return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    close() {
      db.close();
    },
  };
}
