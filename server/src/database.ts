import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Opens (and creates, if missing) the server's SQLite file.
 * Later tickets add their tables as numbered migrations tracked by `user_version`.
 */
export function openDatabase(file: string): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}
