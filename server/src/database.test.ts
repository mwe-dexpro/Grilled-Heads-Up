import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openDatabase, transaction } from "./database.js";

const folders: string[] = [];
const freshFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "heads-up-db-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const tables = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(
    (row) => row.name,
  );
const version = (db: ReturnType<typeof openDatabase>) => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

describe("opening the database", () => {
  test("a new database has every table and is at the last version of its schema", () => {
    const db = openDatabase(":memory:");

    expect(tables(db)).toEqual(["passkeys", "sessions", "sync_fields", "users"]);
    expect(version(db)).toBe(2);
  });

  test("foreign keys are enforced: a passkey needs its user", () => {
    const db = openDatabase(":memory:");

    expect(() =>
      db.prepare("INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at) VALUES ('p', 'nobody', x'00', 0, '[]', 'now')").run(),
    ).toThrow(/FOREIGN KEY/);
  });

  test("a file is created with the folders it lives in, in WAL mode, and keeps what was written when it is opened again", () => {
    const file = join(freshFolder(), "data", "nested", "app.sqlite");
    const first = openDatabase(file);
    first.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('u1', 'h', 'now')").run();
    expect((first.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    first.close();

    expect(existsSync(file)).toBe(true);
    const second = openDatabase(file);
    expect(second.prepare("SELECT id FROM users").all()).toEqual([{ id: "u1" }]);
    expect(version(second)).toBe(2);
    second.close();
  });

  test("a database from an earlier version is brought up to date without touching its data", () => {
    const file = join(freshFolder(), "old.sqlite");
    const first = openDatabase(file);
    first.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('u1', 'h', 'now')").run();
    first.exec("DROP TABLE sync_fields");
    first.exec("PRAGMA user_version = 1");
    first.close();

    const upgraded = openDatabase(file);

    expect(tables(upgraded)).toContain("sync_fields");
    expect(version(upgraded)).toBe(2);
    expect(upgraded.prepare("SELECT id FROM users").all()).toEqual([{ id: "u1" }]);
    upgraded.close();
  });
});

describe("a transaction", () => {
  test("keeps all its writes and returns what its function returns", () => {
    const db = openDatabase(":memory:");

    const result = transaction(db, () => {
      db.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('a', 'h', 'now')").run();
      db.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('b', 'h', 'now')").run();
      return "done";
    });

    expect(result).toBe("done");
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 2 });
  });

  test("keeps none of its writes when its function throws, and throws the same error", () => {
    const db = openDatabase(":memory:");
    const failure = new Error("halfway");

    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('a', 'h', 'now')").run();
        throw failure;
      }),
    ).toThrow(failure);

    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 0 });
    // The database is usable afterwards: the failed transaction was rolled back, not left open.
    expect(transaction(db, () => db.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES ('b', 'h', 'now')").run().changes)).toBe(1);
  });
});
