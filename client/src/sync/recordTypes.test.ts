import { describe, expect, it } from "vitest";
import { recordTypes } from "./recordTypes";
import type { RecordType, Synced } from "./replica";

// The server refuses a whole push with a 400 if one change has a type or field name it doesn't accept, and the
// device then sets that change aside for good. These are the server's rules, copied from `server/src/sync.ts`
// (`typePattern`, `fieldPattern`): a type registered against them can't fail silently at run time.
const typePattern = /^[a-z][a-zA-Z]{0,39}$/;
const fieldPattern = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;

/** What the server would refuse about a record type's name and the fields of its records. */
function namesTheServerRefuses({ type, withDefaults }: RecordType<Synced>): string[] {
  const fields = Object.keys(withDefaults({ id: "x" })).filter((field) => field !== "id");
  return [...(typePattern.test(type) ? [] : [`type ${type}`]), ...fields.filter((field) => !fieldPattern.test(field)).map((field) => `field ${field}`)];
}

const fakeType = (type: string, fields: string[]) =>
  ({
    type,
    storeName: "tasks",
    withDefaults: (record) => ({ deletedAt: null, ...Object.fromEntries(fields.map((field) => [field, ""])), ...record }),
  }) as RecordType<Synced>;

describe("the registered record types", () => {
  it.each(recordTypes.map((recordType) => [recordType.type, recordType] as const))(
    "%s: the type and every field are names the server takes",
    (_type, recordType) => {
      expect(namesTheServerRefuses(recordType)).toEqual([]);
      expect(Object.keys(recordType.withDefaults({ id: "x" }))).toContain("deletedAt");
    },
  );

  it("each have a name and a store of their own", () => {
    expect(new Set(recordTypes.map(({ type }) => type)).size).toBe(recordTypes.length);
    expect(new Set(recordTypes.map(({ storeName }) => storeName)).size).toBe(recordTypes.length);
  });

  describe("the check itself", () => {
    it("finds a type name and fields the server would refuse", () => {
      expect(namesTheServerRefuses(fakeType("subTask2", ["title", "due_date", "9lives", "ok"]))).toEqual(["type subTask2", "field due_date", "field 9lives"]);
      expect(namesTheServerRefuses(fakeType("Task", []))).toEqual(["type Task"]);
      expect(namesTheServerRefuses(fakeType("x".repeat(41), []))).toHaveLength(1);
      expect(namesTheServerRefuses(fakeType("x".repeat(40), ["f".repeat(64)]))).toEqual([]);
      expect(namesTheServerRefuses(fakeType("x".repeat(40), ["f".repeat(65)]))).toHaveLength(1);
    });

    it("lets through a type with plain names, whatever the fields hold", () => {
      expect(namesTheServerRefuses(fakeType("list", ["name", "sortOrder"]))).toEqual([]);
    });
  });
});
