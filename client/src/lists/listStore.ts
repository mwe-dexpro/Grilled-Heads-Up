import { defaultDatabaseName, openAppDb } from "../data/database";
import { maxTitleLength } from "../data/limits";
import { byName } from "../data/names";
import { openTable, type RecordType } from "../sync/replica";

/** A named group of Tasks. A Project is a List the person marked as one; nothing marks a List automatically. */
export interface List {
  id: string;
  /** Trimmed, 1 to `maxTitleLength` characters. */
  name: string;
  isProject: boolean;
  createdAt: string;
  /** When the List was deleted; it then stays stored so the deletion syncs. Lists have no Trash. */
  deletedAt: string | null;
}

export interface ListStore {
  /** Throws for an empty or too long name. */
  addList(name: string, options?: { isProject?: boolean }): Promise<List>;
  /** Same checks as `addList`; a List that is missing or deleted throws. */
  renameList(id: string, name: string): Promise<void>;
  /** Marks a List as a Project, or unmarks it; a List that is missing or deleted throws. */
  setProject(id: string, isProject: boolean): Promise<void>;
  /** Deletes a List (its Tasks are the caller's business, see `TaskStore.clearList`); one that is missing is ignored. */
  deleteList(id: string): Promise<void>;
  /** Live Lists by name; one whose name has not arrived from another device yet is left out. */
  listLists(): Promise<List[]>;
  close(): void;
}

export interface ListStoreOptions {
  now?: () => Date;
}

/** How Lists sync. One arriving in part gets placeholders until its other fields arrive. */
export const listRecordType: RecordType<List> = {
  type: "list",
  storeName: "lists",
  withDefaults: (list) => ({
    ...list,
    name: list.name ?? "",
    isProject: list.isProject ?? false,
    createdAt: list.createdAt ?? "",
    deletedAt: list.deletedAt ?? null,
  }),
};

function checkedName(raw: string): string {
  const name = raw.trim();
  if (name === "") throw new Error("A List needs a name");
  if (name.length > maxTitleLength) throw new Error(`A List's name can have up to ${maxTitleLength} characters`);
  return name;
}

export async function openListStore(
  dbName = defaultDatabaseName,
  { now = () => new Date() }: ListStoreOptions = {},
): Promise<ListStore> {
  const db = await openAppDb(dbName);
  const lists = await openTable(db, listRecordType, now);

  return {
    async addList(rawName, { isProject = false } = {}) {
      const list: List = { id: crypto.randomUUID(), name: checkedName(rawName), isProject, createdAt: now().toISOString(), deletedAt: null };
      await lists.put(list);
      return list;
    },

    async renameList(id, name) {
      if (!(await lists.update(id, { name: checkedName(name) }))) throw new Error(`No List with id ${id}`);
    },

    async setProject(id, isProject) {
      if (!(await lists.update(id, { isProject }))) throw new Error(`No List with id ${id}`);
    },

    async deleteList(id) {
      await lists.delete(id);
    },

    async listLists() {
      return (await lists.list()).filter((list) => list.name !== "").sort(byName);
    },

    close() {
      db.close();
    },
  };
}
