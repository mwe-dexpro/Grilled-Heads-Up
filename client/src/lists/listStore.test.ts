import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { NoListError, listRecordType, openListStore } from "./listStore";

let dbCounter = 0;
const freshDbName = () => `lists-test-${dbCounter++}`;

/** A clock that moves one second forward on every read. */
function tickingClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 28, 9, 0, tick++));
}

describe("Lists that arrive in part", () => {
  it("get an empty name, are no Project and are not deleted until the rest arrives", () => {
    expect(listRecordType.withDefaults({ id: "l1" })).toEqual({ id: "l1", name: "", isProject: false, createdAt: "", deletedAt: null });
  });

  it("keep the fields they have, including a true flag and ones this version doesn't know", () => {
    const partial = { id: "l1", name: "Basement", isProject: true, fromNewerVersion: 5 };

    expect(listRecordType.withDefaults(partial)).toMatchObject(partial);
  });
});

describe("List store", () => {
  it("adds a List, no Project unless asked, and reads it back after a reopen", async () => {
    const dbName = freshDbName();
    const before = await openListStore(dbName, { now: () => new Date("2026-10-04T11:05:00.000Z") });
    const plain = await before.addList("Shopping");
    const project = await before.addList("Basement", { isProject: true });
    before.close();

    const after = await openListStore(dbName);

    expect(plain).toEqual({ id: plain.id, name: "Shopping", isProject: false, createdAt: "2026-10-04T11:05:00.000Z", deletedAt: null });
    expect(project.isProject).toBe(true);
    expect(await after.listLists()).toEqual([project, plain]);
  });

  it("trims the name and refuses an empty one, a blank one and one that is too long, taking one of exactly the limit", async () => {
    const store = await openListStore(freshDbName());

    const list = await store.addList("  Garden  ");
    await expect(store.addList("")).rejects.toThrow("A List needs a name");
    await expect(store.addList("   ")).rejects.toThrow("A List needs a name");
    await expect(store.addList("x".repeat(maxTitleLength + 1))).rejects.toThrow("up to 200 characters");
    const longest = await store.addList("y".repeat(maxTitleLength));

    expect(list.name).toBe("Garden");
    expect((await store.listLists()).map((l) => l.id).sort()).toEqual([list.id, longest.id].sort());
  });

  it("lists Lists by name, case-insensitively and by the language's alphabet", async () => {
    const store = await openListStore(freshDbName(), { now: tickingClock() });

    for (const name of ["zebra", "Ärger", "apple", "Banana"]) await store.addList(name);

    expect((await store.listLists()).map((l) => l.name)).toEqual(["apple", "Ärger", "Banana", "zebra"]);
  });

  it("renames a List, trimmed, with the same checks as when adding", async () => {
    const store = await openListStore(freshDbName());
    const list = await store.addList("Basment");

    await store.renameList(list.id, "  Basement ");
    await expect(store.renameList(list.id, "  ")).rejects.toThrow("A List needs a name");
    await expect(store.renameList(list.id, "x".repeat(maxTitleLength + 1))).rejects.toThrow("up to 200 characters");
    await expect(store.renameList("missing", "Nope")).rejects.toThrow("No List with id missing");

    expect((await store.listLists()).map((l) => l.name)).toEqual(["Basement"]);
  });

  it("marks a List as a Project and unmarks it again", async () => {
    const store = await openListStore(freshDbName());
    const list = await store.addList("Basement");

    await store.setProject(list.id, true);
    expect((await store.listLists())[0].isProject).toBe(true);
    await store.setProject(list.id, false);
    expect((await store.listLists())[0].isProject).toBe(false);
    await expect(store.setProject("missing", true)).rejects.toThrow("No List with id missing");
  });

  it("deletes a List, which stays gone after a reopen; deleting one that is missing or gone is nothing", async () => {
    const dbName = freshDbName();
    const before = await openListStore(dbName);
    const keep = await before.addList("Keep");
    const drop = await before.addList("Drop");

    await before.deleteList(drop.id);
    await expect(before.deleteList(drop.id)).resolves.toBeUndefined();
    await expect(before.deleteList("missing")).resolves.toBeUndefined();
    before.close();

    expect(await (await openListStore(dbName)).listLists()).toEqual([keep]);
  });

  it("refuses to rename or mark a List that has been deleted", async () => {
    const store = await openListStore(freshDbName());
    const list = await store.addList("Gone");
    await store.deleteList(list.id);

    await expect(store.renameList(list.id, "Back")).rejects.toThrow("No List with id");
    await expect(store.setProject(list.id, true)).rejects.toThrow("No List with id");
  });

  it("tells a List that is gone from a real failure: renaming or marking it throws a NoListError, a bad name does not", async () => {
    const store = await openListStore(freshDbName());
    const list = await store.addList("Gone");
    await store.deleteList(list.id);

    await expect(store.renameList("missing", "Nope")).rejects.toBeInstanceOf(NoListError);
    await expect(store.renameList(list.id, "Back")).rejects.toBeInstanceOf(NoListError);
    await expect(store.setProject(list.id, true)).rejects.toBeInstanceOf(NoListError);
    const live = await store.addList("Live");
    await expect(store.renameList(live.id, " ")).rejects.not.toBeInstanceOf(NoListError);
  });

  it("leaves out a List whose name has not arrived yet", async () => {
    const dbName = freshDbName();
    const store = await openListStore(dbName);
    const whole = await store.addList("Whole");
    const db = await openAppDb(dbName);
    await db.put("lists", { id: "half", isProject: true } as never);
    db.close();

    expect(await store.listLists()).toEqual([whole]);
  });
});
