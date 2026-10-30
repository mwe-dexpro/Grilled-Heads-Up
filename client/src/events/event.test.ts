import { describe, expect, it } from "vitest";
import type { Task } from "../tasks/taskStore";
import {
  eventDays,
  eventEnd,
  eventProgress,
  eventStart,
  linkedTaskDate,
  validateEvent,
  withEventDates,
  zonedInstant,
  type Event,
  type EventFields,
} from "./event";

const timed: EventFields = {
  title: "Mom's birthday",
  allDay: false,
  startDate: "2026-10-12",
  startTime: "12:30",
  endDate: "2026-10-12",
  endTime: "15:00",
  timeZone: "Europe/Berlin",
  location: "Café Luise, Berlin",
  notes: "",
};

const allDay: EventFields = {
  ...timed,
  title: "Weekend at Anna & Tom's",
  allDay: true,
  startDate: "2026-10-17",
  startTime: null,
  endDate: "2026-10-19",
  endTime: null,
  timeZone: null,
};

function event(fields: Partial<EventFields> = {}, id = "e1"): Event {
  return { ...timed, ...fields, id, createdAt: "2026-10-01T09:00:00.000Z", externalSource: null, externalId: null };
}

let counter = 0;
function task(fields: Partial<Task> = {}): Task {
  counter++;
  return {
    id: `t${counter}`,
    title: `Task ${counter}`,
    date: null,
    time: null,
    eventId: null,
    offsetDays: null,
    createdAt: new Date(2026, 8, 1, 9, 0, counter).toISOString(),
    completedAt: null,
    ...fields,
  };
}

describe("zonedInstant: a wall-clock time in a time zone", () => {
  it("converts to the right moment in summer and winter time", () => {
    expect(zonedInstant("2026-10-12", "12:30", "Europe/Berlin").toISOString()).toBe("2026-10-12T10:30:00.000Z");
    expect(zonedInstant("2026-12-12", "12:30", "Europe/Berlin").toISOString()).toBe("2026-12-12T11:30:00.000Z");
    expect(zonedInstant("2026-10-12", "12:30", "America/New_York").toISOString()).toBe("2026-10-12T16:30:00.000Z");
    expect(zonedInstant("2026-10-12", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-10-12T03:30:00.000Z");
  });

  it("handles the day the clocks change", () => {
    expect(zonedInstant("2026-10-25", "12:00", "Europe/Berlin").toISOString()).toBe("2026-10-25T11:00:00.000Z");
    // 01:30 is still summer time, but at 01:30 UTC Berlin is already on winter time: the guess needs correcting.
    expect(zonedInstant("2026-10-25", "01:30", "Europe/Berlin").toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(zonedInstant("2026-03-29", "12:00", "Europe/Berlin").toISOString()).toBe("2026-03-29T10:00:00.000Z");
  });
});

describe("Event start, end and days on this device", () => {
  it("places a timed Event by its own time zone, seen from the device's zone (Europe/Berlin)", () => {
    // 19:00 in New York is 01:00 the next morning in Berlin (but still the same day in UTC).
    const newYorkEvening = event({ startTime: "19:00", endTime: "20:00", timeZone: "America/New_York" });

    expect(eventStart(newYorkEvening).toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(eventDays(newYorkEvening)).toEqual({ first: "2026-10-13", last: "2026-10-13" });
  });

  it("keeps an all-day Event on its dates whatever the device's time zone", () => {
    expect(eventDays(event(allDay))).toEqual({ first: "2026-10-17", last: "2026-10-19" });
    expect(eventStart(event(allDay))).toEqual(new Date(2026, 9, 17));
    expect(eventEnd(event(allDay))).toEqual(new Date(2026, 9, 20));
  });

  it("does not count the next day for a timed Event that ends at midnight", () => {
    const evening = event({ startTime: "20:00", endDate: "2026-10-13", endTime: "00:00" });
    expect(eventDays(evening)).toEqual({ first: "2026-10-12", last: "2026-10-12" });
  });

  it("spans several days for a timed Event over a few days", () => {
    const trip = event({ startTime: "18:00", endDate: "2026-10-14", endTime: "10:00" });
    expect(eventDays(trip)).toEqual({ first: "2026-10-12", last: "2026-10-14" });
  });

  it("covers its start day for an Event without duration, also at midnight", () => {
    expect(eventDays(event({ endTime: "12:30" }))).toEqual({ first: "2026-10-12", last: "2026-10-12" });
    expect(eventDays(event({ startTime: "00:00", endTime: "00:00" }))).toEqual({ first: "2026-10-12", last: "2026-10-12" });
  });
});

describe("validateEvent", () => {
  it("accepts complete timed and all-day Events, also on a single day or without duration", () => {
    expect(validateEvent(timed)).toBeNull();
    expect(validateEvent(allDay)).toBeNull();
    expect(validateEvent({ ...allDay, endDate: allDay.startDate })).toBeNull();
    expect(validateEvent({ ...timed, endTime: timed.startTime })).toBeNull();
  });

  it("needs a title", () => {
    expect(validateEvent({ ...timed, title: "  " })).toBe("title");
  });

  it("refuses an end before the start", () => {
    expect(validateEvent({ ...timed, endTime: "12:00" })).toBe("end");
    expect(validateEvent({ ...allDay, endDate: "2026-10-16" })).toBe("end");
    expect(validateEvent({ ...timed, endDate: "2026-10-11", endTime: "18:00" })).toBe("end");
  });

  it("needs times and a time zone for a timed Event, and none for an all-day Event", () => {
    expect(validateEvent({ ...timed, startTime: null })).toBe("shape");
    expect(validateEvent({ ...timed, endTime: null })).toBe("shape");
    expect(validateEvent({ ...timed, timeZone: null })).toBe("shape");
    expect(validateEvent({ ...allDay, startTime: "09:00" })).toBe("shape");
    expect(validateEvent({ ...allDay, endTime: "09:00" })).toBe("shape");
    expect(validateEvent({ ...allDay, timeZone: "Europe/Berlin" })).toBe("shape");
  });
});

describe("Linked task dates come from the Event's start day plus the Offset", () => {
  it("counts days across month and year ends and daylight-saving changes", () => {
    expect(linkedTaskDate(event(), -7)).toBe("2026-10-05");
    expect(linkedTaskDate(event(), 0)).toBe("2026-10-12");
    expect(linkedTaskDate(event(), 2)).toBe("2026-10-14");
    expect(linkedTaskDate(event({ startDate: "2026-11-02" }), -7)).toBe("2026-10-26");
    expect(linkedTaskDate(event({ startDate: "2027-01-03" }), -7)).toBe("2026-12-27");
    expect(linkedTaskDate(event({ startDate: "2026-10-26" }), -1)).toBe("2026-10-25");
  });

  it("counts from the day a multi-day Event starts", () => {
    expect(linkedTaskDate(event(allDay), -1)).toBe("2026-10-16");
    expect(linkedTaskDate(event(allDay), 1)).toBe("2026-10-18");
  });

  it("counts from the Event's own start date, not the device's day of it", () => {
    const newYorkEvening = event({ startTime: "22:00", endTime: "23:00", timeZone: "America/New_York" });
    expect(linkedTaskDate(newYorkEvening, -1)).toBe("2026-10-11");
  });

  it("dates Linked tasks from their Event, so they follow when the Event changes", () => {
    const gift = task({ eventId: "e1", offsetDays: -7 });
    const plain = task({ date: "2026-10-20" });

    const before = withEventDates([gift, plain], [event()]);
    const after = withEventDates([gift, plain], [event({ startDate: "2026-10-19", endDate: "2026-10-19" })]);

    expect(before.map((t) => t.date)).toEqual(["2026-10-05", "2026-10-20"]);
    expect(after.map((t) => t.date)).toEqual(["2026-10-12", "2026-10-20"]);
  });

  it("leaves a Task undated when its Event is missing", () => {
    expect(withEventDates([task({ eventId: "gone", offsetDays: -1 })], [event()])[0].date).toBeNull();
  });
});

describe("eventProgress", () => {
  it("is Completed ÷ all Linked tasks of the Event", () => {
    const tasks = [
      task({ eventId: "e1", offsetDays: -8, completedAt: "2026-10-04T08:00:00.000Z" }),
      task({ eventId: "e1", offsetDays: -7 }),
      task({ eventId: "e1", offsetDays: 2 }),
      task({ eventId: "other", offsetDays: 0, completedAt: "2026-10-04T08:00:00.000Z" }),
      task({ date: "2026-10-12" }),
    ];

    expect(eventProgress("e1", tasks)).toEqual({ done: 1, total: 3 });
    expect(eventProgress("none", tasks)).toEqual({ done: 0, total: 0 });
  });
});
