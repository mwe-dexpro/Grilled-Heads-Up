import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import { maxTagLength } from "../data/limits";
import { openTagStore, tagRecordType } from "./tagStore";

let dbCounter = 0;
const freshDbName = () => `tags-test-${dbCounter++}`;

describe("Tags that arrive in part", () => {
  it("get an empty name and are not deleted until the rest arrives", () => {
    expect(tagRecordType.withDefaults({ id: "g1" })).toEqual({ id: "g1", name: "", createdAt: "", deletedAt: null });
  });

  it("keep the fields they have, also ones this version doesn't know", () => {
    const partial = { id: "g1", name: "Errand", fromNewerVersion: 5 };

    expect(tagRecordType.withDefaults(partial)).toMatchObject(partial);
  });
});

describe("Tag store", () => {
  it("adds a Tag with a trimmed name and reads it back after a reopen", async () => {
    const dbName = freshDbName();
    const before = await openTagStore(dbName, { now: () => new Date("2026-10-04T11:05:00.000Z") });
    const tag = await before.findOrAddTag("  Errand ");
    before.close();

    const after = await openTagStore(dbName);

    expect(tag).toEqual({ id: tag.id, name: "Errand", createdAt: "2026-10-04T11:05:00.000Z", deletedAt: null });
    expect(await after.listTags()).toEqual([tag]);
  });

  it("refuses an empty, a blank and a too long name, and takes one of exactly the limit", async () => {
    const store = await openTagStore(freshDbName());

    await expect(store.findOrAddTag("")).rejects.toThrow("A Tag needs a name");
    await expect(store.findOrAddTag("   ")).rejects.toThrow("A Tag needs a name");
    await expect(store.findOrAddTag("x".repeat(maxTagLength + 1))).rejects.toThrow("up to 50 characters");
    const longest = await store.findOrAddTag("y".repeat(maxTagLength));

    expect(await store.listTags()).toEqual([longest]);
  });

  it("reuses the Tag of the same name, whatever the case, the spaces around it and for German umlauts", async () => {
    const store = await openTagStore(freshDbName());
    const first = await store.findOrAddTag("Errand");
    const umlaut = await store.findOrAddTag("Ärger");

    expect((await store.findOrAddTag("  errand ")).id).toBe(first.id);
    expect((await store.findOrAddTag("ERRAND")).id).toBe(first.id);
    expect((await store.findOrAddTag("ärger")).id).toBe(umlaut.id);
    expect(await store.listTags()).toHaveLength(2);
  });

  it("does not take a different name for the same, nor an accent for none", async () => {
    const store = await openTagStore(freshDbName());
    const plain = await store.findOrAddTag("Cafe");

    const accent = await store.findOrAddTag("Café");
    const longer = await store.findOrAddTag("Cafes");

    expect(new Set([plain.id, accent.id, longer.id]).size).toBe(3);
  });

  it("makes one Tag when the same name is added twice at once, whatever the case", async () => {
    const store = await openTagStore(freshDbName());

    const [first, second, third] = await Promise.all([store.findOrAddTag("Errand"), store.findOrAddTag("errand"), store.findOrAddTag(" ERRAND ")]);

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await store.listTags()).toEqual([first]);
  });

  it("lists Tags by name, case-insensitively", async () => {
    const store = await openTagStore(freshDbName());

    for (const name of ["zoo", "Ärger", "apple", "Banana"]) await store.findOrAddTag(name);

    expect((await store.listTags()).map((tag) => tag.name)).toEqual(["apple", "Ärger", "Banana", "zoo"]);
  });

  it("leaves out a Tag whose name has not arrived yet, and does not reuse it", async () => {
    const dbName = freshDbName();
    const store = await openTagStore(dbName);
    const db = await openAppDb(dbName);
    await db.put("tags", { id: "half" } as never);
    db.close();

    const tag = await store.findOrAddTag("Whole");

    expect(await store.listTags()).toEqual([tag]);
  });
});
