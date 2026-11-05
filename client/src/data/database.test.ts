import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { createSyncStores } from "../sync/syncDb";
import { onDatabaseOutdated, openAppDb } from "./database";

let counter = 0;
const freshName = () => `database-test-${counter++}`;

describe("App database", () => {
  it("has a store for every kind of record, and for sync", async () => {
    const db = await openAppDb(freshName());

    expect([...db.objectStoreNames].sort()).toEqual(["events", "fieldClocks", "lists", "outbox", "syncInfo", "tags", "tasks"]);
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

  it("steps aside for another tab that upgrades it, and says that it did", async () => {
    const name = freshName();
    const open = await openAppDb(name);
    let told = 0;
    const stop = onDatabaseOutdated(() => told++);

    // Would wait forever if the app's connection stayed open.
    const upgraded = await openDB(name, 5, { upgrade: (db) => void db.createObjectStore("later") });

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

    (await openDB(name, 5)).close();

    expect(told).toBe(0);
  });
});
