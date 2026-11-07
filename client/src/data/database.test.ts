import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { createSyncStores } from "../sync/syncDb";
import { defaultDatabaseName, onDatabaseOutdated, openAppDb } from "./database";

let counter = 0;
const freshName = () => `database-test-${counter++}`;

describe("App database", () => {
  it("is called grilled-heads-up on the device: another name would leave every person's data behind", () => {
    expect(defaultDatabaseName).toBe("grilled-heads-up");
  });

  it("has a store for every kind of record, and for sync", async () => {
    const db = await openAppDb(freshName());

    expect([...db.objectStoreNames].sort()).toEqual(["events", "fieldClocks", "lists", "outbox", "subtasks", "syncInfo", "tags", "tasks"]);
    db.close();
  });

  it("upgrades a database from version 3 and keeps its Tasks and Events", async () => {
    const name = freshName();
    const old = await openDB(name, 3, {
      upgrade(db) {
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("events", { keyPath: "id" });
        createSyncStores(db);
      },
    });
    await old.put("tasks", { id: "t1", title: "Kept" });
    await old.put("events", { id: "e1", title: "Party" });
    old.close();

    const db = await openAppDb(name);

    expect(await db.get("tasks", "t1")).toEqual({ id: "t1", title: "Kept" });
    expect(await db.get("events", "e1")).toEqual({ id: "e1", title: "Party" });
    expect(await db.getAll("lists")).toEqual([]);
    expect(await db.getAll("tags")).toEqual([]);
    db.close();
  });

  it("makes a device that synced on version 3 read the server's feed again from the start", async () => {
    const name = freshName();
    const old = await openDB(name, 3, {
      upgrade(db) {
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("events", { keyPath: "id" });
        createSyncStores(db);
      },
    });
    await old.put("syncInfo", 42, "cursor");
    await old.put("syncInfo", "device-a", "deviceId");
    old.close();

    const db = await openAppDb(name);

    // Version 3 skipped the Lists and Tags it did not know, and moved its cursor past them: they are pulled again.
    expect(await db.get("syncInfo", "cursor")).toBeUndefined();
    expect(await db.get("syncInfo", "deviceId")).toBe("device-a");
    db.close();
  });

  /** A database as version 4 of the app left it: Lists and Tags, no Subtasks. */
  async function versionFour(name: string) {
    return openDB(name, 4, {
      upgrade(db) {
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("events", { keyPath: "id" });
        createSyncStores(db);
        db.createObjectStore("lists", { keyPath: "id" });
        db.createObjectStore("tags", { keyPath: "id" });
      },
    });
  }

  it("upgrades a database from version 4 and keeps its Tasks, Events, Lists and Tags", async () => {
    const name = freshName();
    const old = await versionFour(name);
    await old.put("tasks", { id: "t1", title: "Kept" });
    await old.put("events", { id: "e1", title: "Party" });
    await old.put("lists", { id: "l1", name: "Basement" });
    await old.put("tags", { id: "g1", name: "Errand" });
    old.close();

    const db = await openAppDb(name);

    expect(await db.get("tasks", "t1")).toEqual({ id: "t1", title: "Kept" });
    expect(await db.get("events", "e1")).toEqual({ id: "e1", title: "Party" });
    expect(await db.get("lists", "l1")).toEqual({ id: "l1", name: "Basement" });
    expect(await db.get("tags", "g1")).toEqual({ id: "g1", name: "Errand" });
    expect(await db.getAll("subtasks")).toEqual([]);
    db.close();
  });

  it("makes a device that synced on version 4 read the server's feed again from the start", async () => {
    const name = freshName();
    const old = await versionFour(name);
    await old.put("syncInfo", 42, "cursor");
    await old.put("syncInfo", "device-a", "deviceId");
    old.close();

    const db = await openAppDb(name);

    // Version 4 skipped the Subtasks it did not know, and moved its cursor past them: they are pulled again.
    expect(await db.get("syncInfo", "cursor")).toBeUndefined();
    expect(await db.get("syncInfo", "deviceId")).toBe("device-a");
    db.close();
  });

  it("keeps the cursor of a database that is already at version 5", async () => {
    const name = freshName();
    const first = await openAppDb(name);
    await first.put("syncInfo", 42, "cursor");
    first.close();

    const again = await openAppDb(name);

    expect(await again.get("syncInfo", "cursor")).toBe(42);
    again.close();
  });

  it("steps aside for another tab that upgrades it, and says that it did", async () => {
    const name = freshName();
    const open = await openAppDb(name);
    let told = 0;
    const stop = onDatabaseOutdated(() => told++);

    // Would wait forever if the app's connection stayed open.
    const upgraded = await openDB(name, 6, { upgrade: (db) => void db.createObjectStore("later") });

    expect(told).toBe(1);
    expect(upgraded.objectStoreNames).toContain("later");
    await expect((async () => open.get("tasks", "x"))()).rejects.toThrow();
    stop();
    upgraded.close();
  });

  it("stops telling a listener that unsubscribed", async () => {
    const name = freshName();
    await openAppDb(name);
    let told = 0;
    onDatabaseOutdated(() => told++)();

    (await openDB(name, 6)).close();

    expect(told).toBe(0);
  });
});
