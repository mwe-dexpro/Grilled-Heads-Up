import { describe, expect, it } from "vitest";
import { openTaskStore } from "../tasks/taskStore";
import type { EventFields } from "./event";
import { openEventStore } from "./eventStore";

let dbCounter = 0;
const freshDbName = () => `events-test-${dbCounter++}`;

const birthday: EventFields = {
  title: " Mom's birthday ",
  allDay: false,
  startDate: "2026-10-12",
  startTime: "12:30",
  endDate: "2026-10-12",
  endTime: "15:00",
  timeZone: "Europe/Berlin",
  location: " Café Luise, Berlin ",
  notes: " Table for 8 ",
};

describe("Event store", () => {
  it("saves an Event created in the app, with no external source, and reads it back after a reopen", async () => {
    const dbName = freshDbName();
    const before = await openEventStore(dbName, { now: () => new Date("2026-10-04T11:05:00.000Z") });
    const created = await before.addEvent(birthday);
    before.close();

    const after = await openEventStore(dbName);

    expect(await after.listEvents()).toEqual([
      {
        ...birthday,
        title: "Mom's birthday",
        location: "Café Luise, Berlin",
        notes: "Table for 8",
        id: created.id,
        createdAt: "2026-10-04T11:05:00.000Z",
        externalSource: null,
        externalId: null,
      },
    ]);
  });

  it("lists Events in the order they were created", async () => {
    let tick = 0;
    const store = await openEventStore(freshDbName(), { now: () => new Date(Date.UTC(2026, 9, 4, 9, 0, 10 - tick++)) });
    // The clock runs backwards here, so creation order differs from the order of the ids and the inserts.
    for (const title of ["First", "Second", "Third"]) await store.addEvent({ ...birthday, title });

    expect((await store.listEvents()).map((e) => e.title)).toEqual(["Third", "Second", "First"]);
  });

  it("refuses an invalid Event and saves nothing", async () => {
    const store = await openEventStore(freshDbName());

    await expect(store.addEvent({ ...birthday, title: "" })).rejects.toThrow("Invalid Event: title");
    await expect(store.addEvent({ ...birthday, endTime: "11:00" })).rejects.toThrow("Invalid Event: end");
    expect(await store.listEvents()).toEqual([]);
  });

  it("updates an Event's fields and keeps its identity", async () => {
    const store = await openEventStore(freshDbName());
    const created = await store.addEvent(birthday);

    await store.updateEvent(created.id, { ...birthday, startDate: "2026-10-13", endDate: "2026-10-13" });

    const [updated] = await store.listEvents();
    expect(updated).toMatchObject({ id: created.id, createdAt: created.createdAt, startDate: "2026-10-13" });
  });

  it("refuses an invalid update and an unknown Event", async () => {
    const store = await openEventStore(freshDbName());
    const created = await store.addEvent(birthday);

    await expect(store.updateEvent(created.id, { ...birthday, endDate: "2026-10-11" })).rejects.toThrow("Invalid Event: end");
    await expect(store.updateEvent("missing", birthday)).rejects.toThrow("No Event with id missing");
    expect((await store.listEvents())[0].endDate).toBe("2026-10-12");
  });

  it("shares one database with the Task store", async () => {
    const dbName = freshDbName();
    const tasks = await openTaskStore(dbName);
    const events = await openEventStore(dbName);

    await tasks.addTask("Buy gift");
    await events.addEvent(birthday);

    expect(await tasks.listTasks()).toHaveLength(1);
    expect(await events.listEvents()).toHaveLength(1);
  });
});
