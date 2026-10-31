import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** The schema changes in order; a database at `user_version` n has had the first n applied. */
const migrations = [
  // 1: sign-in. v1 has exactly one user, the owner; records will carry an owner so sharing can come later.
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     recovery_code_hash TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE passkeys (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users (id),
     public_key BLOB NOT NULL,
     counter INTEGER NOT NULL,
     transports TEXT NOT NULL,
     created_at TEXT NOT NULL,
     last_used_at TEXT
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users (id),
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   );`,
];

/**
 * Opens (and creates, if missing) the server's SQLite file and brings its schema up to date.
 * `:memory:` opens a fresh in-memory database (used by the tests).
 */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (const [index, sql] of migrations.entries()) {
    if (index < version) continue;
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    });
  }
}

/** Runs `change` all or nothing. */
export function transaction<T>(db: DatabaseSync, change: () => T): T {
  db.exec("BEGIN");
  try {
    const result = change();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
