import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Event } from "../events/event";
import type { List } from "../lists/listStore";
import { createSyncStores, type FieldClocks, type OutboxEntry } from "../sync/syncDb";
import type { Tag } from "../tags/tagStore";
import type { Task } from "../tasks/taskStore";

export const defaultDatabaseName = "grilled-heads-up";

export interface AppDb extends DBSchema {
  tasks: { key: string; value: Task };
  events: { key: string; value: Event };
  lists: { key: string; value: List };
  tags: { key: string; value: Tag };
  fieldClocks: { key: [string, string]; value: FieldClocks };
  outbox: { key: [string, string, string]; value: OutboxEntry };
  syncInfo: { key: string; value: unknown };
}

const outdatedListeners = new Set<() => void>();

/**
 * Called when another tab has upgraded the database and this tab's connections were closed to let it: nothing
 * can be saved or synced here any more, so the app asks the person to reload. Returns how to stop listening.
 */
export function onDatabaseOutdated(listener: () => void): () => void {
  outdatedListeners.add(listener);
  return () => void outdatedListeners.delete(listener);
}

/**
 * Opens the app's IndexedDB database, adding the object stores of each version that is missing.
 * To sync a new kind of record, add its object store here in a new version (see "Adding a record type" in the README).
 */
export async function openAppDb(name: string): Promise<IDBPDatabase<AppDb>> {
  const db = await openDB<AppDb>(name, 4, {
    upgrade(upgrading, oldVersion) {
      if (oldVersion < 1) upgrading.createObjectStore("tasks", { keyPath: "id" });
      if (oldVersion < 2) upgrading.createObjectStore("events", { keyPath: "id" });
      if (oldVersion < 3) createSyncStores(upgrading);
      if (oldVersion < 4) {
        upgrading.createObjectStore("lists", { keyPath: "id" });
        upgrading.createObjectStore("tags", { keyPath: "id" });
      }
    },
    // Another tab (a newer version of the app) wants to upgrade: step aside, or it would wait forever. This
    // connection is then dead, so the app says so (see `onDatabaseOutdated`) rather than failing silently.
    blocking: () => {
      db.close();
      for (const listener of outdatedListeners) listener();
    },
  });
  return db;
}
