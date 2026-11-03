import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { onDatabaseOutdated, openAppDb } from "./database";

let counter = 0;
const freshName = () => `database-test-${counter++}`;

describe("App database", () => {
  it("steps aside for another tab that upgrades it, and says that it did", async () => {
    const name = freshName();
    const open = await openAppDb(name);
    let told = 0;
    const stop = onDatabaseOutdated(() => told++);

    // Would wait forever if the app's connection stayed open.
    const upgraded = await openDB(name, 4, { upgrade: (db) => void db.createObjectStore("lists") });

    expect(told).toBe(1);
    expect(upgraded.objectStoreNames).toContain("lists");
    await expect((async () => open.get("tasks", "x"))()).rejects.toThrow();
    stop();
    upgraded.close();
  });

  it("stops telling a listener that unsubscribed", async () => {
    const name = freshName();
    await openAppDb(name);
    let told = 0;
    onDatabaseOutdated(() => told++)();

    (await openDB(name, 4)).close();

    expect(told).toBe(0);
  });
});
