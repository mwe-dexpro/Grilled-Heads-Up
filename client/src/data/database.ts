import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Event } from "../events/event";
import { createSyncStores, type FieldClocks, type OutboxEntry } from "../sync/syncDb";
import type { Task } from "../tasks/taskStore";

export const defaultDatabaseName = "grilled-heads-up";

export interface AppDb extends DBSchema {
  tasks: { key: string; value: Task };
  events: { key: string; value: Event };
  fieldClocks: { key: [string, string]; value: FieldClocks };
  outbox: { key: [string, string, string]; value: OutboxEntry };
  syncInfo: { key: string; value: unknown };
}

/**
 * Opens the app's IndexedDB database, adding the object stores of each version that is missing.
 * To sync a new kind of record, add its object store here in a new version (see "Adding a record type" in the README).
 */
export async function openAppDb(name: string): Promise<IDBPDatabase<AppDb>> {
  const db = await openDB<AppDb>(name, 3, {
    upgrade(upgrading, oldVersion) {
      if (oldVersion < 1) upgrading.createObjectStore("tasks", { keyPath: "id" });
      if (oldVersion < 2) upgrading.createObjectStore("events", { keyPath: "id" });
      if (oldVersion < 3) createSyncStores(upgrading);
    },
    // Another tab (a newer version of the app) wants to upgrade: step aside, or it would wait forever.
    blocking: () => db.close(),
  });
  return db;
}
