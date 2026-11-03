import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import type { EventFields } from "../events/event";
import { openEventStore, type EventStore } from "../events/eventStore";
import { openTaskStore, type TaskStore } from "../tasks/taskStore";
import { createSyncEngine, type SyncEngine } from "./engine";
import { decode } from "./hlc";
import { recordTypes } from "./recordTypes";
import { openTable, type RecordType, type Synced } from "./replica";
import { createSyncStores, type FieldClocks } from "./syncDb";
import { MemoryServer } from "./testing/memoryServer";

let dbCounter = 0;
const freshDbName = () => `sync-test-${dbCounter++}`;

/** The real time all devices live in; each device reads it through its own, possibly wrong, clock. */
class World {
  ms = Date.UTC(2026, 9, 1, 9, 0, 0);
  advance(ms = 1000) {
    this.ms += ms;
  }
  clock(offsetMs = 0) {
    return () => new Date(this.ms + offsetMs);
  }
}

interface Device {
  name: string;
  tasks: TaskStore;
  events: EventStore;
  engine: SyncEngine;
  sync(): Promise<void>;
  /** Closes everything, like closing the app; the data stays. */
  close(): void;
}

async function openDevice(world: World, server: MemoryServer, { name = freshDbName(), clockOffsetMs = 0 } = {}): Promise<Device> {
  const now = world.clock(clockOffsetMs);
  const tasks = await openTaskStore(name, { now });
  const events = await openEventStore(name, { now });
  const db = await openAppDb(name);
  const engine = await createSyncEngine({ db, types: recordTypes, transport: server.transport(), now });
  return {
    name,
    tasks,
    events,
    engine,
    sync: () => engine.syncNow(),
    close() {
      tasks.close();
      events.close();
      db.close();
    },
  };
}

/** Two phones' worth of setup: a shared world and server, and devices A and B. */
async function twoDevices(options: { serverPageSize?: number; bClockOffsetMs?: number } = {}) {
  const world = new World();
  const server = new MemoryServer({ time: () => world.ms, pageSize: options.serverPageSize });
  const a = await openDevice(world, server);
  const b = await openDevice(world, server, { clockOffsetMs: options.bClockOffsetMs });
  return { world, server, a, b };
}

const party: EventFields = {
  title: "Party",
  allDay: true,
  startDate: "2026-10-12",
  startTime: null,
  endDate: "2026-10-12",
  endTime: null,
  timeZone: null,
  location: "",
  notes: "",
};

const titles = async (device: Device) => (await device.tasks.listTasks()).map((task) => task.title);

describe("Sync between two devices", () => {
  it("shows a Task added on A on B, with its date, time and Completion", async () => {
    const { world, a, b } = await twoDevices();
    const gift = await a.tasks.addTask("Buy gift", { date: "2026-10-04", time: "13:00" });
    world.advance();
    await a.tasks.addTask("Wrap gift");
    world.advance();
    await a.tasks.completeTask(gift.id);

    await a.sync();
    await b.sync();

    expect(await b.tasks.listTasks()).toEqual(await a.tasks.listTasks());
    expect((await b.tasks.listTasks())[0]).toMatchObject({ title: "Buy gift", date: "2026-10-04", time: "13:00" });
    expect((await b.tasks.listTasks())[0].completedAt).not.toBeNull();
  });

  it("syncs what was done offline once the connection is back", async () => {
    const { world, server, a, b } = await twoDevices();
    server.online = false;
    await a.tasks.addTask("Added in airplane mode");
    world.advance();
    await a.sync();
    expect(a.engine.state().status).toBe("offline");
    expect(await titles(b)).toEqual([]);

    server.online = true;
    await a.sync();
    await b.sync();

    expect(a.engine.state().status).toBe("idle");
    expect(await titles(b)).toEqual(["Added in airplane mode"]);
  });

  it("syncs an Event with its Linked tasks together", async () => {
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    world.advance();
    await a.tasks.addTask("Buy gift", { eventId: event.id, offsetDays: -7 });

    await a.sync();
    await b.sync();

    const [task] = await b.tasks.listTasks();
    expect(await b.events.listEvents()).toEqual([event]);
    expect(task).toMatchObject({ title: "Buy gift", eventId: event.id, offsetDays: -7, date: null });
  });

  it("syncs linking and unlinking", async () => {
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    const task = await a.tasks.addTask("Wrap gift", { date: "2026-10-11" });
    await a.sync();
    await b.sync();
    world.advance();

    await b.tasks.linkTask(task.id, event.id, -1);
    await b.sync();
    await a.sync();
    expect((await a.tasks.listTasks())[0]).toMatchObject({ eventId: event.id, offsetDays: -1, date: null });
    world.advance();
    await a.tasks.unlinkTask(task.id, "2026-10-11");
    await a.sync();
    await b.sync();

    expect((await b.tasks.listTasks())[0]).toMatchObject({ eventId: null, offsetDays: null, date: "2026-10-11" });
  });

  it("keeps an edit of the title on one device and an edit of the date on the other", async () => {
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    await a.sync();
    await b.sync();
    world.advance();

    await a.events.updateEvent(event.id, { ...party, title: "Birthday party" });
    world.advance();
    await b.events.updateEvent(event.id, { ...party, startDate: "2026-10-14", endDate: "2026-10-14" });
    await a.sync();
    await b.sync();
    await a.sync();

    for (const device of [a, b]) {
      expect((await device.events.listEvents())[0]).toMatchObject({ title: "Birthday party", startDate: "2026-10-14", endDate: "2026-10-14" });
    }
  });

  it.each([
    ["A syncs first", ["a", "b", "a"]],
    ["B syncs first", ["b", "a", "b"]],
  ] as const)("lets the later edit of the same field win on both devices when %s", async (_name, order) => {
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    await a.sync();
    await b.sync();
    world.advance();

    await a.events.updateEvent(event.id, { ...party, title: "Edited on A" });
    world.advance();
    await b.events.updateEvent(event.id, { ...party, title: "Edited on B, later" });
    for (const who of order) await (who === "a" ? a : b).sync();

    expect((await a.events.listEvents())[0].title).toBe("Edited on B, later");
    expect((await b.events.listEvents())[0].title).toBe("Edited on B, later");
  });

  it("settles competing links as a unit: the later link's Event and Offset both win", async () => {
    const { world, a, b } = await twoDevices();
    const first = await a.events.addEvent(party);
    const second = await a.events.addEvent({ ...party, title: "Other" });
    const task = await a.tasks.addTask("Gift", { date: "2026-10-01" });
    await a.sync();
    await b.sync();
    world.advance();

    await a.tasks.linkTask(task.id, first.id, -7);
    world.advance();
    await b.tasks.linkTask(task.id, second.id, -3);
    await b.sync();
    await a.sync();
    await b.sync();

    for (const device of [a, b]) {
      expect((await device.tasks.listTasks())[0]).toMatchObject({ eventId: second.id, offsetDays: -3, date: null });
    }
  });

  it("keeps a Task deleted on A deleted on B, and out of both lists", async () => {
    const { world, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Doomed");
    await a.sync();
    await b.sync();
    world.advance();

    await a.tasks.deleteTask(task.id);
    await a.sync();
    await b.sync();

    expect(await titles(a)).toEqual([]);
    expect(await titles(b)).toEqual([]);
    await expect(b.tasks.completeTask(task.id)).rejects.toThrow("No Task with id");
  });

  it("does not bring a deleted Task back through an older edit from another device", async () => {
    const { world, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Doomed");
    await a.sync();
    await b.sync();
    world.advance();

    await b.tasks.completeTask(task.id);
    world.advance();
    await a.tasks.deleteTask(task.id);
    await a.sync();
    await b.sync();
    await a.sync();

    expect(await titles(a)).toEqual([]);
    expect(await titles(b)).toEqual([]);
  });

  it("does not bring a deleted Task back through a newer edit of another field either", async () => {
    const { world, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Doomed");
    await a.sync();
    await b.sync();
    world.advance();
    await a.tasks.deleteTask(task.id);
    world.advance();

    await b.tasks.completeTask(task.id);
    await b.sync();
    await a.sync();
    await a.sync();
    await b.sync();

    expect(await titles(a)).toEqual([]);
    expect(await titles(b)).toEqual([]);
  });

  it("learns of a Task that arrives already deleted without ever showing it", async () => {
    const { world, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Short-lived");
    world.advance();
    await a.tasks.deleteTask(task.id);

    await a.sync();
    await b.sync();

    expect(await titles(b)).toEqual([]);
  });

  describe("with a wrong device clock", () => {
    it("lets an edit made after seeing another device's change win, even if the clock is 10 minutes behind", async () => {
      const tenMinutes = 10 * 60 * 1000;
      const { world, a, b } = await twoDevices({ bClockOffsetMs: -tenMinutes });
      const event = await a.events.addEvent(party);
      await a.sync();
      await b.sync();
      world.advance();
      await a.events.updateEvent(event.id, { ...party, title: "From A" });
      await a.sync();
      await b.sync();
      world.advance();

      await b.events.updateEvent(event.id, { ...party, title: "From B, after seeing A" });
      await b.sync();
      await a.sync();

      expect((await a.events.listEvents())[0].title).toBe("From B, after seeing A");
    });

    it("pulls a slow clock up to the server's time at each sync", async () => {
      const tenMinutes = 10 * 60 * 1000;
      const { world, server, b } = await twoDevices({ bClockOffsetMs: -tenMinutes });
      await b.sync();
      world.advance();

      const task = await b.tasks.addTask("Stamped with server time");
      await b.sync();

      const stamp = decode(server.stored("task", task.id, "title")!.hlc);
      expect(stamp.wall).toBeGreaterThanOrEqual(world.ms - 1000);
    });
  });

  it("does not lose an edit made while a push was in flight", async () => {
    const { world, server, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    world.advance();
    server.afterPushStored = async () => {
      world.advance();
      await a.events.updateEvent(event.id, { ...party, title: "Edited during the push" });
    };

    await a.sync();
    await a.sync();
    await b.sync();

    expect((await b.events.listEvents())[0].title).toBe("Edited during the push");
    expect(server.stored("event", event.id, "title")?.value).toBe("Edited during the push");
  });

  it("saves the clock of every field it applies, so older changes arriving later can't win", async () => {
    const { server, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Buy gift", { date: "2026-10-04" });
    await a.sync();

    await b.sync();

    const db = await openAppDb(b.name);
    const { clocks } = (await db.get("fieldClocks", ["task", task.id])) as FieldClocks;
    expect(Object.keys(clocks).sort()).toEqual(["completedAt", "createdAt", "date", "deletedAt", "eventId", "offsetDays", "time", "title"]);
    expect(clocks.title).toBe(server.stored("task", task.id, "title")!.hlc);
    db.close();
  });

  it("drops an edit still waiting in the outbox when a later change to the same field arrives", async () => {
    const { world, server, a } = await twoDevices();
    const event = await a.events.addEvent(party);
    await a.sync();
    // This device's clock runs an hour ahead, so its edit is later than anything A does now.
    const ahead = await openDevice(world, server, { clockOffsetMs: 60 * 60 * 1000 });
    await ahead.sync();
    await ahead.events.updateEvent(event.id, { ...party, title: "From the device with the fast clock" });
    await ahead.sync();
    await a.events.updateEvent(event.id, { ...party, notes: "A note" });
    server.afterPushStored = async () => {
      await a.events.updateEvent(event.id, { ...party, notes: "A note", title: "Edited on A while syncing" });
    };

    await a.sync();
    const pushedBefore = server.pushRequests;
    await a.sync();

    expect((await a.events.listEvents())[0]).toMatchObject({ title: "From the device with the fast clock", notes: "A note" });
    expect(server.pushRequests).toBe(pushedBefore);
  });

  describe("paging", () => {
    it("brings every change when the server answers in small pages", async () => {
      const { world, a, b } = await twoDevices({ serverPageSize: 7 });
      for (let i = 0; i < 6; i++) {
        await a.tasks.addTask(`Task ${i}`);
        world.advance();
      }

      await a.sync();
      await b.sync();

      expect(await titles(b)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `Task ${i}`));
    });

    it("pushes and pulls more than 500 changes in batches", async () => {
      const { world, server, a, b } = await twoDevices();
      for (let i = 0; i < 70; i++) {
        await a.tasks.addTask(`Task ${i}`);
        world.advance();
      }

      await a.sync();
      await b.sync();

      expect(a.engine.state().status).toBe("idle");
      expect(server.pushRequests).toBe(2);
      expect(server.pullRequests).toBeGreaterThanOrEqual(3);
      expect(await b.tasks.listTasks()).toHaveLength(70);
    });

    it("remembers how far it has read across a reload, and downloads nothing twice", async () => {
      const { world, server, a, b } = await twoDevices();
      await a.tasks.addTask("Old");
      await a.sync();
      await b.sync();
      b.close();
      const downloaded = server.pulledChanges;
      world.advance();

      const reopened = await openDevice(world, server, { name: b.name });
      await reopened.sync();

      expect(server.pulledChanges).toBe(downloaded);
      world.advance();
      await a.tasks.addTask("New");
      await a.sync();
      const beforeReopenedSync = server.pulledChanges;

      await reopened.sync();

      expect(await titles(reopened)).toEqual(["Old", "New"]);
      // Only the new Task's eight fields; the old Task is not downloaded again.
      expect(server.pulledChanges - beforeReopenedSync).toBe(8);
    });
  });

  it("brings Tasks and Events saved before sync existed to the other device", async () => {
    const world = new World();
    const server = new MemoryServer({ time: () => world.ms });
    const oldName = freshDbName();
    const old = await openDB(oldName, 2, {
      upgrade(db) {
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("events", { keyPath: "id" });
      },
    });
    await old.put("tasks", { id: "old-task", title: "Saved by the skeleton", createdAt: "2026-09-28T09:00:00.000Z", completedAt: null });
    await old.put("events", { ...party, id: "old-event", createdAt: "2026-09-28T09:00:00.000Z", externalSource: null, externalId: null });
    old.close();
    const upgraded = await openDevice(world, server, { name: oldName });
    const other = await openDevice(world, server);

    await upgraded.sync();
    await other.sync();

    expect(await other.tasks.listTasks()).toEqual([
      {
        id: "old-task",
        title: "Saved by the skeleton",
        date: null,
        time: null,
        eventId: null,
        offsetDays: null,
        createdAt: "2026-09-28T09:00:00.000Z",
        completedAt: null,
        deletedAt: null,
      },
    ]);
    expect(await other.events.listEvents()).toEqual([
      { ...party, id: "old-event", createdAt: "2026-09-28T09:00:00.000Z", externalSource: null, externalId: null, deletedAt: null },
    ]);
  });

  it("queues old records only once, however often the app is opened", async () => {
    const world = new World();
    const server = new MemoryServer({ time: () => world.ms });
    const name = freshDbName();
    const first = await openDevice(world, server, { name });
    await first.tasks.addTask("One");
    await first.sync();
    first.close();

    const again = await openDevice(world, server, { name });
    const pushedBefore = server.pushRequests;
    await again.sync();

    expect(server.pushRequests).toBe(pushedBefore);
  });

  it("skips a change of a record type it doesn't know, and moves on", async () => {
    const { server, b } = await twoDevices();
    server.inject([{ type: "reminder", id: "r1", field: "text", value: "Soon", hlc: "000000000000001-00000-newer-app" }]);
    server.inject([{ type: "task", id: "t1", field: "title", value: "Known", hlc: "000000000000002-00000-newer-app" }]);

    await b.sync();
    const downloaded = server.pulledChanges;
    await b.sync();

    expect(b.engine.state().status).toBe("idle");
    expect(await titles(b)).toEqual(["Known"]);
    expect(server.pulledChanges).toBe(downloaded);
  });

  describe("when the server can't be used", () => {
    it("reports no connection as offline and keeps local data", async () => {
      const { server, a } = await twoDevices();
      await a.tasks.addTask("Mine");
      server.online = false;

      await a.sync();

      expect(a.engine.state().status).toBe("offline");
      expect(await titles(a)).toEqual(["Mine"]);
    });

    it("reports a missing session as signed out, keeps local data and syncs after signing in again", async () => {
      const { server, a, b } = await twoDevices();
      await a.tasks.addTask("Mine");
      server.signedIn = false;

      await a.sync();
      expect(a.engine.state().status).toBe("signedOut");
      expect(await titles(a)).toEqual(["Mine"]);

      server.signedIn = true;
      await a.sync();
      await b.sync();
      expect(await titles(b)).toEqual(["Mine"]);
    });

    it("reports any other failure as failed", async () => {
      const { a } = await twoDevices();
      const broken = await createSyncEngine({
        db: await openAppDb(a.name),
        types: recordTypes,
        transport: {
          push: () => Promise.reject(new Error("boom")),
          pull: () => Promise.reject(new Error("boom")),
        },
      });
      await a.tasks.addTask("Mine");

      await broken.syncNow();

      expect(broken.state().status).toBe("failed");
    });
  });

  describe("the engine", () => {
    it("turns a request made during a run into exactly one more run", async () => {
      const { server, a } = await twoDevices();

      await Promise.all([a.sync(), a.sync(), a.sync(), a.sync()]);

      expect(server.pullRequests).toBe(2);
      await a.sync();
      expect(server.pullRequests).toBe(3);
    });

    it("reports syncing, then idle with the time of the last sync, which survives a reload", async () => {
      const { world, server, a } = await twoDevices();
      const seen: string[] = [];
      a.engine.subscribe((state) => seen.push(`${state.status}:${state.lastSyncedAt}`));
      expect(a.engine.state()).toEqual({ status: "idle", lastSyncedAt: null });

      await a.sync();

      expect(seen).toEqual(["syncing:null", `idle:${world.ms}`]);
      a.close();
      const reopened = await openDevice(world, server, { name: a.name });
      expect(reopened.engine.state()).toEqual({ status: "idle", lastSyncedAt: world.ms });
    });

    it("keeps the last sync time when a later sync fails", async () => {
      const { world, server, a } = await twoDevices();
      await a.sync();
      world.advance();
      server.online = false;

      await a.sync();

      expect(a.engine.state()).toEqual({ status: "offline", lastSyncedAt: world.ms - 1000 });
    });

    it("tells listeners when other devices changed something, but not when its own changes come back", async () => {
      const { world, a, b } = await twoDevices();
      let heard = 0;
      b.engine.onRemoteChanges(() => heard++);
      await b.tasks.addTask("Mine");
      await b.sync();
      expect(heard).toBe(0);
      world.advance();

      await a.tasks.addTask("Theirs");
      await a.sync();
      await b.sync();
      expect(heard).toBe(1);

      await b.sync();
      expect(heard).toBe(1);
    });

    it("stops telling a listener that unsubscribed", async () => {
      const { a, b } = await twoDevices();
      let heard = 0;
      const stop = b.engine.onRemoteChanges(() => heard++);
      const stopState = b.engine.subscribe(() => heard++);
      stop();
      stopState();
      await a.tasks.addTask("Theirs");

      await a.sync();
      await b.sync();

      expect(heard).toBe(0);
    });
  });
});

interface Note extends Synced {
  text: string;
}

describe("A record type added later", () => {
  const noteType: RecordType<Note> = {
    type: "note",
    storeName: "notes",
    withDefaults: (note) => ({ ...note, text: note.text ?? "", deletedAt: note.deletedAt ?? null }),
  };

  async function noteDevice(world: World, server: MemoryServer) {
    const name = freshDbName();
    const now = world.clock();
    const db = await openDB(name, 1, {
      upgrade(upgrading) {
        upgrading.createObjectStore("notes", { keyPath: "id" });
        createSyncStores(upgrading);
      },
    });
    const notes = await openTable(db, noteType, now);
    const engine = await createSyncEngine({ db, types: [noteType], transport: server.transport(), now });
    return { notes, engine };
  }

  it("syncs by registering it, with no change to the engine, and deletes like any other", async () => {
    const world = new World();
    const server = new MemoryServer({ time: () => world.ms });
    const a = await noteDevice(world, server);
    const b = await noteDevice(world, server);

    await a.notes.put({ id: "n1", text: "Remember", deletedAt: null });
    await a.notes.put({ id: "n2", text: "Forget", deletedAt: null });
    world.advance();
    await a.notes.delete("n2");
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(await b.notes.list()).toEqual([{ id: "n1", text: "Remember", deletedAt: null }]);
  });
});
