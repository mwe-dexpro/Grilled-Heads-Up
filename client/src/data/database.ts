import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Event } from "../events/event";
import type { Task } from "../tasks/taskStore";

export const defaultDatabaseName = "grilled-heads-up";

export interface AppDb extends DBSchema {
  tasks: { key: string; value: Task };
  events: { key: string; value: Event };
}

/** Opens the app's IndexedDB database, adding the object stores of each version that is missing. */
export function openAppDb(name: string): Promise<IDBPDatabase<AppDb>> {
  return openDB<AppDb>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore("tasks", { keyPath: "id" });
      if (oldVersion < 2) db.createObjectStore("events", { keyPath: "id" });
    },
  });
}
