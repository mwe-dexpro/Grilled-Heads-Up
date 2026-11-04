import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { openAppDb } from "../data/database";
import type { EventFields } from "../events/event";
import { eventDays, eventEnd, eventStart, validateEvent, withEventDates } from "../events/event";
import { eventRecordType, openEventStore, type EventStore } from "../events/eventStore";
import { formatEventTime, formatEventWhen, formatOffset, formatRelativeDay, inOtherTimeZone } from "../events/formatEvent";
import { formatRiskExplanation, formatRiskStatus } from "../events/formatRisk";
import { countdown, eventRisk, isOverdue, linkedRole } from "../events/risk";
import { arrangeHome } from "../home/buckets";
import { dayOf } from "../home/days";
import { translate } from "../i18n/i18n";
import { maxNotesLength } from "../data/limits";
import { openTaskStore, type TaskStore } from "../tasks/taskStore";
import { createSyncEngine, type SyncEngine } from "./engine";
import { decode } from "./hlc";
import { recordTypes } from "./recordTypes";
import { openTable, type RecordType, type Synced } from "./replica";
import { createSyncStores, type OutboxEntry, type SyncDb } from "./syncDb";
import { MemoryServer } from "./testing/memoryServer";
import { createHttpTransport, TransportError, type Transport } from "./transport";

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
  db: SyncDb;
  now: () => Date;
  tasks: TaskStore;
  events: EventStore;
  engine: SyncEngine;
  sync(): Promise<void>;
  /** Closes everything, like closing the app; the data stays. */
  close(): void;
}

interface DeviceOptions {
  name?: string;
  clockOffsetMs?: number;
  /** How the device reaches the server; the in-memory server's transport unless a test runs the real HTTP one. */
  transport?: Transport;
}

async function openDevice(world: World, server: MemoryServer, { name = freshDbName(), clockOffsetMs = 0, transport = server.transport() }: DeviceOptions = {}): Promise<Device> {
  const now = world.clock(clockOffsetMs);
  const tasks = await openTaskStore(name, { now });
  const events = await openEventStore(name, { now });
  const db = await openAppDb(name);
  const engine = await createSyncEngine({ db, types: recordTypes, transport, now });
  return {
    name,
    db,
    now,
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
async function twoDevices(options: { serverPageSize?: number; bClockOffsetMs?: number; viaHttp?: boolean } = {}) {
  const world = new World();
  const server = new MemoryServer({ time: () => world.ms, pageSize: options.serverPageSize });
  // `viaHttp` runs the real transport against the server's HTTP answers, so what it makes of each status counts.
  const transport = options.viaHttp ? createHttpTransport(server.fetch) : undefined;
  const a = await openDevice(world, server, { transport });
  const b = await openDevice(world, server, { clockOffsetMs: options.bClockOffsetMs, transport });
  return { world, server, a, b };
}

/** Writes an Event's notes as an app version without the length limit would, past the store's checks. */
const writeNotesUnchecked = async (device: Device, id: string, notes: string) =>
  (await openTable(device.db, eventRecordType, device.now)).update(id, { notes });

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

  it("keeps a Task's date as set on one device and its Completion on the other", async () => {
    // A Task has no title edit yet, so the Task side of "different fields of one record" is the date and Completion.
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    const task = await a.tasks.addTask("Gift", { eventId: event.id, offsetDays: -7 });
    await a.sync();
    await b.sync();
    world.advance();

    await a.tasks.unlinkTask(task.id, "2026-10-11");
    world.advance();
    await b.tasks.completeTask(task.id);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const device of [a, b]) {
      const [synced] = await device.tasks.listTasks();
      expect(synced).toMatchObject({ date: "2026-10-11", eventId: null, offsetDays: null });
      expect(synced.completedAt).not.toBeNull();
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
  });

  it("ignores Complete for a Task that a sync has just deleted, and sends nothing for it", async () => {
    const { world, server, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Doomed");
    await a.sync();
    await b.sync();
    world.advance();
    await a.tasks.deleteTask(task.id);
    await a.sync();
    await b.sync();
    world.advance();

    await expect(b.tasks.completeTask(task.id)).resolves.toBeUndefined();
    await b.sync();
    await a.sync();

    expect(await titles(b)).toEqual([]);
    expect(server.stored("task", task.id, "completedAt")?.value).toBeNull();
    expect(server.stored("task", task.id, "deletedAt")?.value).not.toBeNull();
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

  describe("the Trash", () => {
    it("brings a Task back on B that was deleted and then restored on A, exactly as it was", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Buy gift", { date: "2026-10-04", time: "13:00" });
      await a.sync();
      await b.sync();
      const before = await b.tasks.listTasks();
      world.advance();
      await a.tasks.deleteTask(task.id);
      await a.sync();
      await b.sync();
      expect(await titles(b)).toEqual([]);
      expect((await b.tasks.listTrash()).map((t) => t.title)).toEqual(["Buy gift"]);
      world.advance();

      await a.tasks.restoreTask(task.id);
      await a.sync();
      await b.sync();

      expect(await b.tasks.listTasks()).toEqual(before);
      expect(await a.tasks.listTasks()).toEqual(before);
      expect(await b.tasks.listTrash()).toEqual([]);
    });

    it("brings the Trash to the other device too, so a Task deleted on the phone can be restored on the desktop", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Doomed");
      await a.sync();
      await b.sync();
      world.advance();
      await a.tasks.deleteTask(task.id);
      await a.sync();
      await b.sync();
      world.advance();

      await b.tasks.restoreTask(task.id);
      await b.sync();
      await a.sync();

      expect(await titles(a)).toEqual(["Doomed"]);
      expect(await a.tasks.listTrash()).toEqual([]);
    });

    it("lets a restore beat an older delete that reaches the server later from the other device", async () => {
      const { world, server, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Disputed");
      await a.sync();
      await b.sync();
      world.advance();
      await a.tasks.deleteTask(task.id);
      world.advance();
      await b.tasks.deleteTask(task.id);
      world.advance();
      await b.tasks.restoreTask(task.id);
      await b.sync();

      // A's older deletion, made while apart from B, arrives after B's restore.
      await a.sync();
      await b.sync();

      expect(await titles(a)).toEqual(["Disputed"]);
      expect(await titles(b)).toEqual(["Disputed"]);
      expect(server.stored("task", task.id, "deletedAt")?.value).toBeNull();
    });

    it("lets a later delete beat an earlier restore", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Again");
      await a.sync();
      await b.sync();
      world.advance();
      await a.tasks.deleteTask(task.id);
      world.advance();
      await a.tasks.restoreTask(task.id);
      world.advance();
      await b.tasks.deleteTask(task.id);

      await a.sync();
      await b.sync();
      await a.sync();

      expect(await titles(a)).toEqual([]);
      expect(await titles(b)).toEqual([]);
      expect((await a.tasks.listTrash()).map((t) => t.title)).toEqual(["Again"]);
    });

    it("sends a restore as the one field deletedAt", async () => {
      const { world, server, a } = await twoDevices();
      const task = await a.tasks.addTask("Doomed");
      await a.tasks.deleteTask(task.id);
      await a.sync();
      const pushed = server.pushedChanges;
      world.advance();

      await a.tasks.restoreTask(task.id);
      await a.sync();

      expect(server.pushedChanges - pushed).toBe(1);
      expect(server.stored("task", task.id, "deletedAt")?.value).toBeNull();
    });
  });

  describe("Rescheduling", () => {
    it("shows the new date and the count on the other device", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Pay invoice", { date: "2026-10-01", time: "09:00" });
      await a.sync();
      await b.sync();
      world.advance();

      await a.tasks.rescheduleTask(task.id, "2026-10-09", () => undefined);
      await a.sync();
      await b.sync();

      expect(await b.tasks.listTasks()).toEqual(await a.tasks.listTasks());
      expect((await b.tasks.listTasks())[0]).toMatchObject({ date: "2026-10-09", time: "09:00", rescheduleCount: 1 });
    });

    it("changes a Linked task's Offset on the other device too, its own date still empty, so it keeps following its Event", async () => {
      const { world, a, b } = await twoDevices();
      const event = await a.events.addEvent(party);
      const task = await a.tasks.addTask("Buy gift", { eventId: event.id, offsetDays: -7 });
      await a.sync();
      await b.sync();
      world.advance();

      await a.tasks.rescheduleTask(task.id, "2026-10-08", (id) => (id === event.id ? event.startDate : undefined));
      await a.sync();
      await b.sync();

      expect((await b.tasks.listTasks())[0]).toMatchObject({ eventId: event.id, offsetDays: -4, date: null, rescheduleCount: 1 });
      const [onB] = withEventDates(await b.tasks.listTasks(), await b.events.listEvents());
      expect(onB.date).toBe("2026-10-08");
    });

    it("keeps the Reschedule of one device and the Completion of the other", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Both", { date: "2026-10-06" });
      await a.sync();
      await b.sync();
      world.advance();

      await a.tasks.rescheduleTask(task.id, "2026-10-09", () => undefined);
      await b.tasks.completeTask(task.id);
      await a.sync();
      await b.sync();
      await a.sync();

      expect(await b.tasks.listTasks()).toEqual(await a.tasks.listTasks());
      const [both] = await a.tasks.listTasks();
      expect(both).toMatchObject({ date: "2026-10-09", rescheduleCount: 1 });
      expect(both.completedAt).not.toBeNull();
    });

    it("lets the later Reschedule win for the date and the count together, so one increment can be lost (known trade-off)", async () => {
      const { world, a, b } = await twoDevices();
      const task = await a.tasks.addTask("Pushed twice", { date: "2026-10-06" });
      await a.sync();
      await b.sync();
      world.advance();

      await a.tasks.rescheduleTask(task.id, "2026-10-07", () => undefined);
      world.advance();
      await b.tasks.rescheduleTask(task.id, "2026-10-08", () => undefined);
      await a.sync();
      await b.sync();
      await a.sync();

      expect(await a.tasks.listTasks()).toEqual(await b.tasks.listTasks());
      expect((await a.tasks.listTasks())[0]).toMatchObject({ date: "2026-10-08", rescheduleCount: 1 });
    });
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

  describe("a local change racing a pull", () => {
    const tick = () => new Promise((resolve) => setImmediate(resolve));

    // The Complete lands at some point while the pull is being applied; wherever it lands, the other device's
    // changes to the same Tasks must survive and a Task deleted there must stay deleted.
    it.each([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30])("keeps what another device changed when Complete is tapped %i ticks into a sync", async (ticks) => {
      const { world, a, b } = await twoDevices();
      const event = await a.events.addEvent(party);
      const relinked = await a.tasks.addTask("Unlinked elsewhere", { eventId: event.id, offsetDays: -7 });
      const doomed = await a.tasks.addTask("Deleted elsewhere");
      await a.sync();
      await b.sync();
      world.advance();
      await a.tasks.unlinkTask(relinked.id, "2026-10-11");
      await a.tasks.deleteTask(doomed.id);
      await a.sync();
      world.advance();

      const syncing = b.sync();
      for (let i = 0; i < ticks; i++) await tick();
      const completing = Promise.allSettled([b.tasks.completeTask(relinked.id), b.tasks.completeTask(doomed.id)]);
      await Promise.all([syncing, completing]);
      await b.sync();
      await a.sync();
      await b.sync();

      for (const device of [a, b]) {
        const tasks = await device.tasks.listTasks();
        expect(tasks.map((task) => task.title)).toEqual(["Unlinked elsewhere"]);
        expect(tasks[0]).toMatchObject({ eventId: null, offsetDays: null, date: "2026-10-11" });
        expect(tasks[0].completedAt).not.toBeNull();
      }
    });
  });

  it("keeps another device's edit of a field the form never touched, when a form opened before it is saved", async () => {
    const { world, a, b } = await twoDevices();
    const event = await a.events.addEvent(party);
    await a.sync();
    await b.sync();
    world.advance();
    const { id, createdAt, externalSource, externalId, deletedAt, ...opened } = (await a.events.listEvents())[0];

    await b.events.updateEvent(event.id, { ...party, location: "Garden" });
    await b.sync();
    await a.sync();
    world.advance();
    await a.events.updateEvent(event.id, { ...opened, title: "Birthday party" }, opened);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const device of [a, b]) {
      expect((await device.events.listEvents())[0]).toMatchObject({ title: "Birthday party", location: "Garden" });
    }
  });

  describe("an Event's time, which belongs together", () => {
    const timedParty: EventFields = { ...party, allDay: false, startTime: "09:00", endTime: "10:00", timeZone: "Europe/Berlin" };

    async function syncedEvent(fields: EventFields) {
      const devices = await twoDevices();
      const event = await devices.a.events.addEvent(fields);
      await devices.a.sync();
      await devices.b.sync();
      devices.world.advance();
      return { ...devices, id: event.id };
    }

    async function settle(a: Device, b: Device) {
      await a.sync();
      await b.sync();
      await a.sync();
    }

    it("is won as a unit: a later change of the start time from an older form doesn't leave an all-day Event with a time", async () => {
      const { world, a, b, id } = await syncedEvent(timedParty);

      await b.events.updateEvent(id, { ...party, startTime: null, endTime: null, timeZone: null }, timedParty);
      world.advance();
      await a.events.updateEvent(id, { ...timedParty, startTime: "09:30" }, timedParty);
      await settle(a, b);

      for (const device of [a, b]) {
        const [event] = await device.events.listEvents();
        expect(event).toMatchObject({ allDay: false, startTime: "09:30", endTime: "10:00", timeZone: "Europe/Berlin" });
        expect(validateEvent(event)).toBeNull();
      }
    });

    it("is won as a unit the other way round: a later switch to all-day takes the earlier start time with it", async () => {
      const { world, a, b, id } = await syncedEvent(timedParty);

      await a.events.updateEvent(id, { ...timedParty, startTime: "09:30" }, timedParty);
      world.advance();
      await b.events.updateEvent(id, { ...party, startTime: null, endTime: null, timeZone: null }, timedParty);
      await settle(a, b);

      for (const device of [a, b]) {
        const [event] = await device.events.listEvents();
        expect(event).toMatchObject({ allDay: true, startTime: null, endTime: null, timeZone: null });
        expect(validateEvent(event)).toBeNull();
      }
    });

    it("keeps the end from landing before the start: a later change of the end from an older form wins with the start it was made for", async () => {
      const { world, a, b, id } = await syncedEvent(party);

      await a.events.updateEvent(id, { ...party, startDate: "2026-10-20", endDate: "2026-10-20" }, party);
      world.advance();
      await b.events.updateEvent(id, { ...party, endDate: "2026-10-13" }, party);
      await settle(a, b);

      for (const device of [a, b]) {
        const [event] = await device.events.listEvents();
        expect(event).toMatchObject({ startDate: "2026-10-12", endDate: "2026-10-13" });
        expect(validateEvent(event)).toBeNull();
      }
    });

    it("keeps the other device's edit of the title, location and notes, which are not part of it", async () => {
      const { world, a, b, id } = await syncedEvent(timedParty);

      await b.events.updateEvent(id, { ...timedParty, title: "Birthday", location: "Garden", notes: "Cake" }, timedParty);
      world.advance();
      await a.events.updateEvent(id, { ...timedParty, endTime: "11:00" }, timedParty);
      await settle(a, b);

      for (const device of [a, b]) {
        expect((await device.events.listEvents())[0]).toMatchObject({ title: "Birthday", location: "Garden", notes: "Cake", endTime: "11:00" });
      }
    });

    it("writes all of it when the same save also changes the title", async () => {
      const { world, server, a, id } = await syncedEvent(timedParty);
      const before = server.record("event", id);
      world.advance();

      await a.events.updateEvent(id, { ...timedParty, title: "Birthday", startTime: "09:30" }, timedParty);
      await a.sync();

      const after = server.record("event", id);
      const clocks = ["allDay", "startDate", "startTime", "endDate", "endTime", "timeZone"].map((field) => after[field].hlc);
      expect(new Set(clocks).size).toBe(1);
      expect(clocks[0] > before.startTime.hlc).toBe(true);
      expect(after.title.hlc).toBe(after.startTime.hlc);
    });

    it("writes none of it for an edit of something else", async () => {
      const { world, server, a, id } = await syncedEvent(timedParty);
      const before = server.record("event", id);
      world.advance();

      await a.events.updateEvent(id, { ...timedParty, title: "Birthday" }, timedParty);
      await a.sync();

      const after = server.record("event", id);
      for (const field of ["allDay", "startDate", "startTime", "endDate", "endTime", "timeZone"]) expect(after[field].hlc).toBe(before[field].hlc);
      expect(after.title.hlc > before.title.hlc).toBe(true);
    });
  });

  it("settles a link against an unlink as a unit, also when the Task is already linked", async () => {
    const { world, a, b } = await twoDevices();
    const first = await a.events.addEvent(party);
    const second = await a.events.addEvent({ ...party, title: "Other" });
    const task = await a.tasks.addTask("Gift", { eventId: first.id, offsetDays: -7 });
    await a.sync();
    await b.sync();
    world.advance();

    await a.tasks.unlinkTask(task.id, "2026-10-11");
    world.advance();
    await b.tasks.linkTask(task.id, second.id, -3);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const device of [a, b]) {
      expect((await device.tasks.listTasks())[0]).toMatchObject({ eventId: second.id, offsetDays: -3, date: null });
    }
  });

  it("settles an unlink against a later link the other way round too: the later one wins as a unit", async () => {
    const { world, a, b } = await twoDevices();
    const first = await a.events.addEvent(party);
    const second = await a.events.addEvent({ ...party, title: "Other" });
    const task = await a.tasks.addTask("Gift", { eventId: first.id, offsetDays: -7 });
    await a.sync();
    await b.sync();
    world.advance();

    await b.tasks.linkTask(task.id, second.id, -3);
    world.advance();
    await a.tasks.unlinkTask(task.id, "2026-10-11");
    await b.sync();
    await a.sync();
    await b.sync();

    for (const device of [a, b]) {
      expect((await device.tasks.listTasks())[0]).toMatchObject({ eventId: null, offsetDays: null, date: "2026-10-11" });
    }
  });

  describe("when a record has arrived only in part", () => {
    const hlc = "000000000000001-00000-other-device";
    const arrived = (type: string, id: string, fields: Record<string, unknown>) =>
      Object.entries(fields).map(([field, value]) => ({ type, id, field, value, hlc }));

    /**
     * What the screens do with Events and their Linked tasks (EventRow, EventScreen, the home screen), in both
     * languages: none of it may throw for what the stores list, nor make up days from what has not arrived.
     */
    async function useEveryScreen(device: Device) {
      const now = new Date(Date.UTC(2026, 9, 1, 9, 0, 0));
      const today = dayOf(now);
      const events = await device.events.listEvents();
      const tasks = await device.tasks.listTasks();
      const home = arrangeHome(tasks, now, events);
      for (const language of ["en", "de"] as const) {
        const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate(language, key, params);
        for (const event of events) {
          eventStart(event);
          eventEnd(event);
          formatEventWhen(event, language);
          formatEventTime(event, language, t);
          inOtherTimeZone(event);
          formatRelativeDay(eventDays(event).first, today, t);
          const risk = eventRisk(event, tasks, now);
          countdown(event, tasks, now);
          formatRiskStatus(risk, t);
          formatRiskExplanation(event, risk, now, t);
          for (const task of withEventDates(tasks.filter((linked) => linked.eventId === event.id), [event])) {
            formatOffset(task.offsetDays!, t);
            isOverdue(task, today);
            linkedRole(task, event);
          }
        }
      }
      return { events, tasks, home };
    }

    it.each([
      ["a timed Event whose times and zone are still to come", { title: "Party", allDay: false, startDate: "2026-10-12", endDate: "2026-10-12" }],
      ["a timed Event whose zone is still to come", { title: "Party", allDay: false, startDate: "2026-10-12", startTime: "09:00", endDate: "2026-10-12", endTime: "10:00" }],
      ["an all-day Event that still has the times of its timed past", { title: "Party", allDay: true, startDate: "2026-10-12", endDate: "2026-10-12", startTime: "09:00", endTime: "10:00", timeZone: "Europe/Berlin" }],
    ])("shows %s without breaking a screen", async (_name, fields) => {
      const { server, a } = await twoDevices();
      server.inject(arrived("event", "e1", fields));

      await a.sync();

      const { events } = await useEveryScreen(a);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ title: "Party", allDay: true, startTime: null, endTime: null, timeZone: null });
    });

    it.each([
      ["a timed Event without its start time", { allDay: false, startTime: null, endTime: "10:00", timeZone: "Europe/Berlin" }],
      ["a timed Event without its end time", { allDay: false, startTime: "09:00", endTime: null, timeZone: "Europe/Berlin" }],
      ["an all-day Event with only a start time left", { allDay: true, startTime: "09:00", endTime: null, timeZone: null }],
      ["an all-day Event with only an end time left", { allDay: true, startTime: null, endTime: "10:00", timeZone: null }],
      ["an all-day Event with only a time zone left", { allDay: true, startTime: null, endTime: null, timeZone: "Europe/Berlin" }],
    ])("shows %s as an all-day Event", async (_name, times) => {
      const { server, a } = await twoDevices();
      server.inject(arrived("event", "e1", { ...party, ...times }));

      await a.sync();

      const { events } = await useEveryScreen(a);
      expect(events[0]).toMatchObject({ allDay: true, startTime: null, endTime: null, timeZone: null });
    });

    it("shows a complete timed Event as it is", async () => {
      const { server, a } = await twoDevices();
      const timed = { ...party, allDay: false, startTime: "09:00", endTime: "10:00", timeZone: "Europe/Berlin" };
      server.inject(arrived("event", "e1", timed));

      await a.sync();

      expect((await useEveryScreen(a)).events[0]).toMatchObject(timed);
    });

    it("shows a Linked task whose Offset has not arrived as a Task without an Event, and the other way round", async () => {
      const { server, a } = await twoDevices();
      server.inject(arrived("task", "t1", { title: "No offset yet", eventId: "e1" }));
      server.inject(arrived("task", "t2", { title: "No event yet", offsetDays: -3 }));
      server.inject(arrived("task", "t3", { title: "Complete", eventId: "e1", offsetDays: -3 }));

      await a.sync();

      const { tasks } = await useEveryScreen(a);
      expect(tasks.map(({ title, eventId, offsetDays }) => ({ title, eventId, offsetDays }))).toEqual([
        { title: "No offset yet", eventId: null, offsetDays: null },
        { title: "No event yet", eventId: null, offsetDays: null },
        { title: "Complete", eventId: "e1", offsetDays: -3 },
      ]);
    });

    it.each([
      ["title", { ...party, title: undefined }],
      ["start date", { ...party, startDate: undefined }],
      ["end date", { ...party, endDate: undefined }],
      ["start and end date", { ...party, startDate: undefined, endDate: undefined }],
    ])("leaves an Event out until its %s has arrived, and shows its Linked tasks as undated, not overdue", async (_name, fields) => {
      const { server, a } = await twoDevices();
      const present = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      server.inject(arrived("event", "e1", present));
      server.inject(arrived("task", "t1", { title: "Buy suit", eventId: "e1", offsetDays: -7 }));
      server.inject(arrived("task", "t2", { title: "Thank them", eventId: "e1", offsetDays: 1 }));

      await a.sync();

      const { events, tasks, home } = await useEveryScreen(a);
      expect(events).toEqual([]);
      expect(tasks.map((task) => task.title)).toEqual(["Buy suit", "Thank them"]);
      expect(home.filter((bucket) => bucket.tasks.length + bucket.events.length > 0).map((bucket) => [bucket.kind, bucket.tasks.length, bucket.events.length, bucket.open])).toEqual([["inbox", 2, 0, 2]]);
    });

    it("shows the Event, and its Linked tasks on their days, once the missing field has arrived", async () => {
      const { server, a } = await twoDevices();
      server.inject(arrived("event", "e1", { title: "Wedding", endDate: "2026-10-20" }));
      server.inject(arrived("task", "t1", { title: "Buy suit", eventId: "e1", offsetDays: -7 }));
      await a.sync();
      expect((await a.events.listEvents())).toEqual([]);

      server.inject(arrived("event", "e1", { startDate: "2026-10-19", allDay: true }).map((change) => ({ ...change, hlc: "000000000000002-00000-other-device" })));
      await a.sync();

      const { events, tasks } = await useEveryScreen(a);
      expect(events.map((event) => [event.title, event.startDate, event.endDate])).toEqual([["Wedding", "2026-10-19", "2026-10-20"]]);
      expect(withEventDates(tasks, events)[0].date).toBe("2026-10-12");
    });

    it("lets the rest of the Event arrive later, and then shows it as it is", async () => {
      const { server, a } = await twoDevices();
      server.inject(arrived("event", "e1", { title: "Party", allDay: false, startDate: "2026-10-12", endDate: "2026-10-12" }));
      await a.sync();
      expect((await a.events.listEvents())[0].allDay).toBe(true);

      server.inject(arrived("event", "e1", { startTime: "09:00", endTime: "10:00", timeZone: "Europe/Berlin" }).map((c) => ({ ...c, hlc: "000000000000002-00000-other-device" })));
      await a.sync();

      expect((await useEveryScreen(a)).events[0]).toMatchObject({ allDay: false, startTime: "09:00", endTime: "10:00", timeZone: "Europe/Berlin" });
    });
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

  it("remembers the clock of every field it applies, so an older change arriving later can't win", async () => {
    const { server, a, b } = await twoDevices();
    const task = await a.tasks.addTask("Buy gift", { date: "2026-10-04" });
    await a.sync();
    await b.sync();
    // Later, a feed delivers older changes of every field of that Task (a replay, or a slow path through the server).
    const older = Object.values(server.record("task", task.id)).map((change) => ({ ...change, value: "stale", hlc: "000000000000001-00000-old" }));
    const real = server.transport();
    const replay = await createSyncEngine({
      db: await openAppDb(b.name),
      types: recordTypes,
      now: () => new Date(),
      transport: { push: real.push, pull: async (after, limit) => ({ ...(await real.pull(after, limit)), changes: older }) },
    });

    await replay.syncNow();

    expect(await b.tasks.listTasks()).toEqual(await a.tasks.listTasks());
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
      // Only the new Task's nine fields; the old Task is not downloaded again.
      expect(server.pulledChanges - beforeReopenedSync).toBe(9);
    });
  });

  it("never moves the saved position back when a slower tab finishes after a faster one", async () => {
    const { world, server, a, b } = await twoDevices({ serverPageSize: 2 });
    for (let i = 0; i < 3; i++) {
      await a.tasks.addTask(`Task ${i}`);
      world.advance();
    }
    await a.sync();
    // A second tab of B reads the first page, then stalls until the first tab has read everything and the connection drops.
    const real = server.transport();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let pulls = 0;
    const slowTab = await createSyncEngine({
      db: await openAppDb(b.name),
      types: recordTypes,
      now: world.clock(),
      transport: {
        push: real.push,
        pull: async (after, limit) => {
          if (++pulls > 1) throw new TransportError("offline");
          const page = await real.pull(after, limit);
          await held;
          return page;
        },
      },
    });
    const slow = slowTab.syncNow();
    await b.sync();
    release();
    await slow;
    const downloaded = server.pulledChanges;

    await b.sync();

    expect(server.pulledChanges).toBe(downloaded);
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
        rescheduleCount: 0,
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

  it("brings pre-sync records to the other device when the engine runs before any store was opened", async () => {
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
    old.close();
    // Opening the database upgrades it, but no store (and so no queuing of old records) comes first, as in the app.
    const db = await openAppDb(oldName);
    const engine = await createSyncEngine({ db, types: recordTypes, transport: server.transport(), now: world.clock() });
    const other = await openDevice(world, server);

    await engine.syncNow();
    await other.sync();

    expect(await titles(other)).toEqual(["Saved by the skeleton"]);
  });

  it("looks at old records only when a record type is first opened, not again at every start", async () => {
    const world = new World();
    const server = new MemoryServer({ time: () => world.ms });
    const name = freshDbName();
    (await openDevice(world, server, { name })).close();
    const raw = await openAppDb(name);
    await raw.put("tasks", { id: "stray", title: "Put there without sync", createdAt: "2026-09-28T09:00:00.000Z", completedAt: null } as never);
    raw.close();

    const again = await openDevice(world, server, { name });
    await again.sync();
    const other = await openDevice(world, server);
    await other.sync();

    expect(await titles(other)).toEqual([]);
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
      expect(server.requests).toBe(1);
      expect(await titles(a)).toEqual(["Mine"]);
    });

    it("reports a missing session as signed out, keeps local data and syncs after signing in again", async () => {
      const { server, a, b } = await twoDevices();
      await a.tasks.addTask("Mine");
      server.signedIn = false;

      await a.sync();
      expect(a.engine.state().status).toBe("signedOut");
      expect(server.requests).toBe(1);
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

  describe("when a push is too big or refused", () => {
    const note = (length: number) => "x".repeat(length);

    it("sends changes in batches that fit the server's limit, however big the values are", async () => {
      const { world, server, a, b } = await twoDevices();
      for (let i = 0; i < 60; i++) {
        await a.events.addEvent({ ...party, title: `Event ${i}`, notes: note(maxNotesLength) });
        world.advance();
      }

      await a.sync();
      await b.sync();

      expect(a.engine.state().status).toBe("idle");
      expect(server.pushRequests).toBeGreaterThan(1);
      expect(server.refusedPushes).toBe(0);
      expect(await b.events.listEvents()).toHaveLength(60);
    });

    it("sets aside a value too big for any request, reports it, and carries on with everything else", async () => {
      const { world, a, b } = await twoDevices();
      const event = await a.events.addEvent(party);
      await writeNotesUnchecked(a, event.id, note(1_200_000));
      await a.tasks.addTask("Fine");
      world.advance();
      await b.tasks.addTask("From B");

      await a.sync();
      await b.sync();
      await a.sync();

      expect(a.engine.state().status).toBe("rejected");
      expect(await titles(b)).toEqual(["Fine", "From B"]);
      expect(await titles(a)).toEqual(["Fine", "From B"]);
      expect((await b.events.listEvents())[0]).toMatchObject({ id: event.id, title: "Party", notes: "" });
      expect((await a.events.listEvents())[0].notes).toHaveLength(1_200_000);
    });

    describe("a refusal as too big", () => {
      /** A device whose Event is already on the server, so that a note written next is a request of one change. */
      async function withSyncedEvent(maxPushBytes: number) {
        const world = new World();
        const server = new MemoryServer({ time: () => world.ms, maxPushBytes });
        const a = await openDevice(world, server, { transport: createHttpTransport(server.fetch) });
        const b = await openDevice(world, server);
        const event = await a.events.addEvent(party);
        await a.sync();
        world.advance();
        return { server, a, b, event };
      }

      it("sets aside a single value over 100 KB, and nothing else", async () => {
        const { server, a, b, event } = await withSyncedEvent(50_000);
        await writeNotesUnchecked(a, event.id, note(101_000));

        await a.sync();
        await b.sync();

        expect(server.refusedPushes).toBe(1);
        expect(a.engine.state().status).toBe("rejected");
        expect(((await a.db.getAll("outbox")) as OutboxEntry[]).filter((entry) => entry.rejectedAt !== undefined)).toHaveLength(1);
        expect((await b.events.listEvents())[0]).toMatchObject({ title: "Party", notes: "" });
      });

      it("takes a single value under 100 KB as the server's trouble: failed, nothing set aside, sent once the server is well", async () => {
        const { server, a, b, event } = await withSyncedEvent(50_000);
        await writeNotesUnchecked(a, event.id, note(99_000));

        await a.sync();

        expect(server.refusedPushes).toBe(1);
        expect(a.engine.state().status).toBe("failed");
        expect(((await a.db.getAll("outbox")) as OutboxEntry[]).some((entry) => entry.rejectedAt !== undefined)).toBe(false);

        server.maxPushBytes = 1024 * 1024;
        await a.sync();
        await b.sync();

        expect(a.engine.state().status).toBe("idle");
        expect((await b.events.listEvents())[0].notes).toHaveLength(99_000);
      });

      it("does so also when the first of several changes is over 100 KB: only a lone value is judged by its size", async () => {
        const { server, a, b, event } = await withSyncedEvent(50_000);
        // "allDay" sorts before "title" in the outbox, so the big value leads a request of two changes.
        await (await openTable(a.db, eventRecordType, a.now)).update(event.id, { allDay: note(150_000) as unknown as boolean, title: "New title" });

        await a.sync();

        expect(server.refusedPushes).toBe(1);
        expect(a.engine.state().status).toBe("failed");
        expect(((await a.db.getAll("outbox")) as OutboxEntry[]).some((entry) => entry.rejectedAt !== undefined)).toBe(false);
        await b.sync();
        expect((await b.events.listEvents())[0].title).toBe("Party");
      });

      it("takes a refusal of a request with several changes as the server's trouble, however big, and sets nothing aside", async () => {
        const world = new World();
        const server = new MemoryServer({ time: () => world.ms, maxPushBytes: 200_000 });
        const a = await openDevice(world, server, { transport: createHttpTransport(server.fetch) });
        const b = await openDevice(world, server);
        const events = [];
        for (const title of ["One", "Two"]) {
          events.push(await a.events.addEvent({ ...party, title }));
          world.advance();
        }
        await writeNotesUnchecked(a, events[0].id, note(150_000));
        await writeNotesUnchecked(a, events[1].id, note(150_000));

        await a.sync();

        expect(server.refusedPushes).toBe(1);
        expect(a.engine.state().status).toBe("failed");
        expect(((await a.db.getAll("outbox")) as OutboxEntry[]).some((entry) => entry.rejectedAt !== undefined)).toBe(false);

        server.maxPushBytes = 1024 * 1024;
        await a.sync();
        await b.sync();

        expect(a.engine.state().status).toBe("idle");
        expect((await b.events.listEvents()).map((event) => event.notes.length).sort()).toEqual([150_000, 150_000]);
      });
    });

    it("sends the value again once the person has made it smaller", async () => {
      const { world, a, b } = await twoDevices();
      const event = await a.events.addEvent(party);
      await writeNotesUnchecked(a, event.id, note(1_200_000));
      await a.sync();
      expect(a.engine.state().status).toBe("rejected");
      world.advance();

      await a.events.updateEvent(event.id, { ...party, notes: "Short" });
      await a.sync();
      await b.sync();

      expect(a.engine.state().status).toBe("idle");
      expect((await b.events.listEvents())[0].notes).toBe("Short");
    });

    it("sets aside only the change the server names as malformed, and sends the rest in one more request", async () => {
      const { server, a, b } = await twoDevices();
      server.rejects = (change) => change.field === "title" && change.value === "Poison";
      await a.tasks.addTask("Fine");
      await a.tasks.addTask("Poison");
      await a.tasks.addTask("Also fine");

      await a.sync();
      await b.sync();

      expect(a.engine.state().status).toBe("rejected");
      expect((await titles(b)).sort()).toEqual(["", "Also fine", "Fine"]);
      expect(server.refusedPushes).toBe(1);
      expect(server.pushRequests).toBe(2);
    });

    it("does not send a set-aside change again on every sync", async () => {
      const { server, a } = await twoDevices();
      server.rejects = (change) => change.field === "title" && change.value === "Poison";
      await a.tasks.addTask("Poison");
      await a.sync();
      const requests = server.pushRequests;

      await a.sync();

      expect(server.pushRequests).toBe(requests);
      expect(a.engine.state().status).toBe("rejected");
    });

    it("sends no empty request after setting aside the last change of a batch", async () => {
      const { server, a } = await twoDevices();
      server.rejects = () => true;
      await a.tasks.addTask("Everything is refused");
      const entries = ((await a.db.getAll("outbox")) as OutboxEntry[]).length;

      await a.sync();

      // One request for each change, since each answer names only the first.
      expect(server.pushRequests).toBe(entries);
      expect(a.engine.state().status).toBe("rejected");
    });

    it("doesn't set aside an edit that replaced the refused change while the request was under way", async () => {
      const world = new World();
      const server = new MemoryServer({ time: () => world.ms });
      let edit: (() => Promise<unknown>) | null = null;
      const real = server.transport();
      const racing: Transport = {
        ...real,
        push: async (changes) => {
          const title = changes.findIndex((change) => change.field === "title");
          if (edit && title !== -1) {
            const run = edit;
            edit = null;
            await run();
            throw new TransportError("rejected", { badChange: title });
          }
          return real.push(changes);
        },
      };
      const a = await openDevice(world, server, { transport: racing });
      const b = await openDevice(world, server);
      const event = await a.events.addEvent(party);
      edit = async () => {
        world.advance();
        await a.events.updateEvent(event.id, { ...party, title: "Better title" });
      };

      await a.sync();
      expect(a.engine.state().status).toBe("idle");
      await a.sync();
      await b.sync();

      expect((await b.events.listEvents())[0].title).toBe("Better title");
    });

    it("keeps a change set aside across a restart, and tries it again once the hour is over, when the server has been fixed", async () => {
      const { world, server, a, b } = await twoDevices();
      server.rejects = (change) => change.field === "title" && change.value === "Poison";
      await a.tasks.addTask("Poison");
      await a.sync();
      expect(a.engine.state().status).toBe("rejected");
      server.rejects = null;
      a.close();
      world.advance(30 * 60_000);

      const restarted = await openDevice(world, server, { name: a.name });
      const requests = server.pushRequests;
      await restarted.sync();
      expect(server.pushRequests).toBe(requests);
      expect(restarted.engine.state().status).toBe("rejected");
      world.advance(30 * 60_000);
      await restarted.sync();
      await b.sync();

      expect(restarted.engine.state().status).toBe("idle");
      expect(await titles(b)).toEqual(["Poison"]);
    });

    it("tries a set-aside change again after an hour, in an app that stays open", async () => {
      const { world, server, a, b } = await twoDevices();
      server.rejects = (change) => change.field === "title" && change.value === "Poison";
      await a.tasks.addTask("Poison");
      await a.sync();
      server.rejects = null;
      const requests = server.pushRequests;

      world.advance(59 * 60_000);
      await a.sync();
      expect(server.pushRequests).toBe(requests);
      world.advance(60_000);
      await a.sync();
      await b.sync();

      expect(a.engine.state().status).toBe("idle");
      expect(await titles(b)).toEqual(["Poison"]);
    });

    it("sets a change aside again, for another hour, when the server still refuses it", async () => {
      const { world, server, a } = await twoDevices();
      server.rejects = (change) => change.field === "title" && change.value === "Poison";
      await a.tasks.addTask("Poison");
      await a.sync();
      world.advance(60 * 60_000);
      await a.sync();
      const requests = server.pushRequests;

      world.advance(59 * 60_000);
      await a.sync();

      expect(server.pushRequests).toBe(requests);
      expect(a.engine.state().status).toBe("rejected");
    });

    describe.each([
      ["a 400 that names no change, like a proxy's or a server bug's", 400],
      ["a 413 for a request far below any real limit", 413],
    ])("when the server refuses every push with %s", (_name, status) => {
      it("sets nothing aside, stops after one request, and sends everything once the server is well again", async () => {
        const { server, a, b } = await twoDevices({ viaHttp: true });
        for (let i = 0; i < 16; i++) await a.tasks.addTask(`Task ${i}`);
        server.pushStatus = status;

        await a.sync();

        expect(a.engine.state().status).toBe("failed");
        expect(server.refusedPushes).toBe(1);

        server.pushStatus = null;
        await a.sync();
        await b.sync();

        expect(a.engine.state().status).toBe("idle");
        expect(await b.tasks.listTasks()).toHaveLength(16);
        expect((await b.tasks.listTasks()).every((task) => task.title !== "")).toBe(true);
      });
    });

    it("treats a refusal that names a change it never sent as a failure, and sets nothing aside", async () => {
      const world = new World();
      const server = new MemoryServer({ time: () => world.ms });
      const confused: Transport = {
        ...server.transport(),
        push: async () => {
          throw new TransportError("rejected", { badChange: 99 });
        },
      };
      const a = await openDevice(world, server, { transport: confused });
      await a.tasks.addTask("Fine");

      await a.sync();

      expect(a.engine.state().status).toBe("failed");
      expect(((await a.db.getAll("outbox")) as OutboxEntry[]).some((entry) => entry.rejectedAt !== undefined)).toBe(false);
    });

    it("still pulls when the push fails for another reason, and reports the failure", async () => {
      const { world, server, a, b } = await twoDevices();
      await a.tasks.addTask("From A");
      await a.sync();
      world.advance();
      await b.tasks.addTask("From B");
      server.failPushes = true;

      await b.sync();

      expect(b.engine.state().status).toBe("failed");
      expect(await titles(b)).toEqual(["From A", "From B"]);
      server.failPushes = false;
      await b.sync();
      await a.sync();
      expect(b.engine.state().status).toBe("idle");
      expect(await titles(a)).toEqual(["From A", "From B"]);
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

      await a.engine.syncNow({ showProgress: true });

      expect(seen).toEqual(["syncing:null", `idle:${world.ms}`]);
      a.close();
      const reopened = await openDevice(world, server, { name: a.name });
      expect(reopened.engine.state()).toEqual({ status: "idle", lastSyncedAt: world.ms });
    });

    it("does not report syncing during a background run, so the status line stays calm", async () => {
      const { world, a } = await twoDevices();
      await a.sync();
      world.advance();
      const seen: string[] = [];
      a.engine.subscribe((state) => seen.push(state.status));

      await a.sync();
      await a.sync();

      expect(seen).toEqual(["idle", "idle"]);
    });

    it("reports syncing for a run that someone asked for while a background run was under way", async () => {
      const { a } = await twoDevices();
      const seen: string[] = [];
      a.engine.subscribe((state) => seen.push(state.status));

      await Promise.all([a.sync(), a.engine.syncNow({ showProgress: true })]);

      expect(seen).toEqual(["idle", "syncing", "idle"]);
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
