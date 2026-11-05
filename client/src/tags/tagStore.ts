import { defaultDatabaseName, openAppDb } from "../data/database";
import { maxTagLength } from "../data/limits";
import { byName, sameName } from "../data/names";
import { openTable, type RecordType } from "../sync/replica";

/** A label on a Task; a Task can have several. Shown as "Tag" in English and "Kategorie" in German. */
export interface Tag {
  id: string;
  /** Trimmed, 1 to `maxTagLength` characters. */
  name: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface TagStore {
  /**
   * The live Tag with this name (spaces around it and case ignored), or a new one. Throws for an empty or too long
   * name. Two devices adding the same name while apart each make a Tag; both then show, and each Task keeps its own.
   */
  findOrAddTag(name: string): Promise<Tag>;
  /** Live Tags by name; one whose name has not arrived from another device yet is left out. */
  listTags(): Promise<Tag[]>;
  close(): void;
}

export interface TagStoreOptions {
  now?: () => Date;
}

/** How Tags sync. One arriving in part gets placeholders until its other fields arrive. */
export const tagRecordType: RecordType<Tag> = {
  type: "tag",
  storeName: "tags",
  withDefaults: (tag) => ({
    ...tag,
    name: tag.name ?? "",
    createdAt: tag.createdAt ?? "",
    deletedAt: tag.deletedAt ?? null,
  }),
};

export async function openTagStore(
  dbName = defaultDatabaseName,
  { now = () => new Date() }: TagStoreOptions = {},
): Promise<TagStore> {
  const db = await openAppDb(dbName);
  const tags = await openTable(db, tagRecordType, now);

  const named = async () => (await tags.list()).filter((tag) => tag.name !== "").sort(byName);

  return {
    async findOrAddTag(rawName) {
      const name = rawName.trim();
      if (name === "") throw new Error("A Tag needs a name");
      if (name.length > maxTagLength) throw new Error(`A Tag's name can have up to ${maxTagLength} characters`);
      const existing = (await named()).find((tag) => sameName(tag.name, name));
      if (existing) return existing;
      const tag: Tag = { id: crypto.randomUUID(), name, createdAt: now().toISOString(), deletedAt: null };
      await tags.put(tag);
      return tag;
    },

    listTags: named,

    close() {
      db.close();
    },
  };
}
