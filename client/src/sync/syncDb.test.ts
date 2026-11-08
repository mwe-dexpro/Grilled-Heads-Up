import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { receiveTimestamps, createSyncStores, stampLocalChange, transactionOver, type SyncDb } from "./syncDb";

let counter = 0;
const freshName = () => `sync-db-test-${counter++}`;

/** A database with a store of records and the stores of sync, as every record type's database has. */
const open = (name: string) =>
  openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("records", { keyPath: "id" });
      createSyncStores(db);
    },
  });

const moment = new Date(Date.UTC(2026, 9, 1, 9, 0, 0));

/** Stamps a local change in a transaction of its own, as a store does. */
async function stamp(db: SyncDb, now: Date) {
  const tx = transactionOver(db, ["records"]);
  const timestamp = await stampLocalChange(tx, now);
  await tx.done;
  return timestamp;
}

describe("sync stores", () => {
  it("are made next to a record store, so that one transaction covers both", async () => {
    const db = await open(freshName());

    const tx = transactionOver(db, ["records"]);

    expect([...tx.objectStoreNames].sort()).toEqual(["fieldClocks", "outbox", "records", "syncInfo"]);
    await tx.done;
    db.close();
  });

  it("are listed once when the transaction asks for them too", async () => {
    const db = await open(freshName());

    const tx = transactionOver(db, ["records", "outbox"]);

    expect([...tx.objectStoreNames].sort()).toEqual(["fieldClocks", "outbox", "records", "syncInfo"]);
    await tx.done;
    db.close();
  });
});

describe("stamping a local change", () => {
  it("starts at the time of the device, and stamps every later change later, also when the clock stands still", async () => {
    const db = await open(freshName());

    const first = await stamp(db, moment);
    const second = await stamp(db, moment);
    const third = await stamp(db, moment);

    expect([first.wall, second.wall, third.wall]).toEqual([moment.getTime(), moment.getTime(), moment.getTime()]);
    expect([first.counter, second.counter, third.counter]).toEqual([0, 1, 2]);
    db.close();
  });

  it("never goes back when the clock of the device does", async () => {
    const db = await open(freshName());
    await stamp(db, moment);

    const later = await stamp(db, new Date(moment.getTime() - 60_000));

    expect(later.wall).toBe(moment.getTime());
    expect(later.counter).toBe(1);
    db.close();
  });

  it("belongs to a device id that is made up once and kept for good, also after the database is closed and opened again", async () => {
    const name = freshName();
    const first = await open(name);
    const before = await stamp(first, moment);
    first.close();

    const again = await open(name);
    const after = await stamp(again, new Date(moment.getTime() + 1000));

    expect(before.node).toMatch(/^[0-9a-f-]{36}$/);
    expect(after.node).toBe(before.node);
    expect(await again.get("syncInfo", "deviceId")).toBe(before.node);
    again.close();
  });

  it("keeps a device id that is stored without a clock yet, instead of making up another", async () => {
    const db = await open(freshName());
    await db.put("syncInfo", "device-from-before", "deviceId");

    const stamped = await stamp(db, moment);

    expect(stamped.node).toBe("device-from-before");
    expect(await db.get("syncInfo", "deviceId")).toBe("device-from-before");
    db.close();
  });

  it("gives two databases two device ids", async () => {
    const [one, other] = [await open(freshName()), await open(freshName())];

    expect((await stamp(one, moment)).node).not.toBe((await stamp(other, moment)).node);
    one.close();
    other.close();
  });

  it("keeps the clock in the database: the counter goes on after a reopen", async () => {
    const name = freshName();
    const first = await open(name);
    await stamp(first, moment);
    first.close();

    const again = await open(name);

    expect((await stamp(again, moment)).counter).toBe(1);
    expect(await again.get("syncInfo", "clock")).toMatchObject({ wall: moment.getTime(), counter: 1 });
    again.close();
  });
});

describe("seeing timestamps from elsewhere", () => {
  it("moves the clock past the latest of them, so a change made afterwards stamps later than all of them", async () => {
    const db = await open(freshName());
    await stamp(db, moment);
    const tx = transactionOver(db, ["records"]);
    await receiveTimestamps(
      tx,
      [
        { wall: moment.getTime() + 600_000, counter: 4 },
        { wall: moment.getTime() + 300_000, counter: 9 },
      ],
      moment,
    );
    await tx.done;

    const next = await stamp(db, moment);

    // Seen: counter 4 at +10 minutes (so 5), then an older stamp (so 6); the change itself makes it 7.
    expect(next.wall).toBe(moment.getTime() + 600_000);
    expect(next.counter).toBe(7);
    db.close();
  });

  it("keeps the clock it moved, also when nothing was stamped before", async () => {
    const name = freshName();
    const db = await open(name);
    const tx = transactionOver(db, ["records"]);
    await receiveTimestamps(tx, [{ wall: moment.getTime() + 1000, counter: 0 }], moment);
    await tx.done;
    db.close();

    const again = await open(name);

    expect(await again.get("syncInfo", "clock")).toMatchObject({ wall: moment.getTime() + 1000, counter: 1 });
    again.close();
  });
});
