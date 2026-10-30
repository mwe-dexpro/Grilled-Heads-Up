import { describe, expect, it } from "vitest";
import type { Task } from "../tasks/taskStore";
import { withEventDates, type Event, type EventFields } from "./event";
import { countdown, eventRisk, linkedRole, putsEventAtRisk } from "./risk";

/** Mom's birthday: Monday 12 October 2026, 12:30–15:00 in Berlin (the device's zone in tests). */
const birthdayFields: EventFields = {
  title: "Mom's birthday",
  allDay: false,
  startDate: "2026-10-12",
  startTime: "12:30",
  endDate: "2026-10-12",
  endTime: "15:00",
  timeZone: "Europe/Berlin",
  location: "",
  notes: "",
};

function event(fields: Partial<EventFields> = {}, id = "e1"): Event {
  return { ...birthdayFields, ...fields, id, createdAt: "2026-10-01T09:00:00.000Z", externalSource: null, externalId: null };
}

/** Friday 16 – Sunday 18 October 2026, all day. */
const weekend = event({ title: "Weekend", allDay: true, startDate: "2026-10-16", startTime: null, endDate: "2026-10-18", endTime: null, timeZone: null });

let counter = 0;
function linked(offsetDays: number, fields: Partial<Task> = {}): Task {
  counter++;
  return {
    id: `t${counter}`,
    title: `Task ${counter}`,
    date: null,
    time: null,
    eventId: "e1",
    offsetDays,
    createdAt: new Date(2026, 8, 1, 9, 0, counter).toISOString(),
    completedAt: null,
    ...fields,
  };
}

const done = { completedAt: "2026-10-01T08:00:00.000Z" };

/** Local time on a day in October 2026. */
const at = (day: number, hours = 13, minutes = 5) => new Date(2026, 9, day, hours, minutes);

describe("linkedRole: Preparation or Follow-up", () => {
  it("is Preparation up to and including the day the Event starts, Follow-up after it", () => {
    const e = event();
    expect(linkedRole({ date: "2026-10-05" }, e)).toBe("preparation");
    expect(linkedRole({ date: "2026-10-12" }, e)).toBe("preparation");
    expect(linkedRole({ date: "2026-10-13" }, e)).toBe("followUp");
  });

  it("counts a Task during a multi-day Event as Follow-up", () => {
    expect(linkedRole({ date: "2026-10-16" }, weekend)).toBe("preparation");
    expect(linkedRole({ date: "2026-10-17" }, weekend)).toBe("followUp");
  });

  it("changes when the Event moves past the Task's date or back", () => {
    expect(linkedRole({ date: "2026-10-13" }, event({ startDate: "2026-10-14", endDate: "2026-10-14" }))).toBe("preparation");
    expect(linkedRole({ date: "2026-10-12" }, event({ startDate: "2026-10-11", endDate: "2026-10-11" }))).toBe("followUp");
  });
});

describe("eventRisk", () => {
  it("is calm when all Preparation tasks are on time", () => {
    const risk = eventRisk(event(), [linked(-7), linked(-1)], at(4));
    expect(risk).toMatchObject({ status: "none", openPreparation: 2, overdue: [], daysUntil: 8 });
  });

  it("is At risk once a Preparation task is Overdue", () => {
    const gift = linked(-7);
    const risk = eventRisk(event(), [linked(-8, done), gift, linked(-1)], at(6));
    expect(risk).toMatchObject({ status: "atRisk", openPreparation: 2, daysUntil: 6 });
    expect(risk.overdue.map((t) => t.id)).toEqual([gift.id]);
    expect(risk.overdue[0].date).toBe("2026-10-05");
  });

  it("lists the most Overdue Preparation task first", () => {
    const gift = linked(-7);
    const cake = linked(-8);
    expect(eventRisk(event(), [gift, cake], at(10)).overdue.map((t) => t.id)).toEqual([cake.id, gift.id]);
  });

  it("is not At risk because of a Completed Task, another Event's Task or a Task that isn't linked", () => {
    const tasks = [linked(-7, done), linked(-7, { eventId: "other" }), linked(0, { eventId: null, offsetDays: null, date: "2026-10-05" })];
    expect(eventRisk(event(), tasks, at(10))).toMatchObject({ status: "none", openPreparation: 0 });
  });

  it("turns At risk at midnight, when the Preparation task becomes Overdue", () => {
    const tasks = [linked(-7)];
    expect(eventRisk(event(), tasks, at(5, 23, 59)).status).toBe("none");
    expect(eventRisk(event(), tasks, at(6, 0, 0)).status).toBe("atRisk");
  });

  describe("Critical: the Event starts today or tomorrow with open Preparation tasks", () => {
    const tasks = [linked(0)];

    it("the day before tomorrow: not yet", () => {
      expect(eventRisk(event(), tasks, at(10, 23, 59)).status).toBe("none");
    });

    it("from midnight the day before", () => {
      expect(eventRisk(event(), tasks, at(11, 0, 0))).toMatchObject({ status: "critical", openPreparation: 1, daysUntil: 1 });
    });

    it("on the day, also after the Event's start time", () => {
      expect(eventRisk(event(), tasks, at(12, 8))).toMatchObject({ status: "critical", daysUntil: 0 });
      expect(eventRisk(event(), tasks, at(12, 23, 59))).toMatchObject({ status: "critical", daysUntil: 0 });
    });

    it("not when every Preparation task is Completed", () => {
      expect(eventRisk(event(), [linked(0, done), linked(-1, done)], at(11)).status).toBe("none");
    });

    it("takes precedence over At risk", () => {
      const risk = eventRisk(event(), [linked(-3), linked(0)], at(11));
      expect(risk).toMatchObject({ status: "critical", openPreparation: 2 });
      expect(risk.overdue).toHaveLength(1);
    });
  });

  it("never lets Follow-up tasks trigger At risk or Critical", () => {
    const thankYou = [linked(1), linked(2)];
    expect(eventRisk(event(), thankYou, at(11)).status).toBe("none");
    expect(eventRisk(event(), thankYou, at(12)).status).toBe("none");
    // Even an Overdue Follow-up task of a multi-day Event that is still going on.
    expect(eventRisk(weekend, [linked(1)], at(18)).status).toBe("none");
  });

  describe("once the Event has passed", () => {
    it("ends the risk status and notes the open Preparation tasks, from midnight after its last day", () => {
      const tasks = [linked(-7), linked(0), linked(-1, done), linked(2)];
      expect(eventRisk(event(), tasks, at(12, 23, 59)).status).toBe("critical");
      expect(eventRisk(event(), tasks, at(13, 0, 0))).toMatchObject({ status: "passed", openPreparation: 2, daysUntil: -1 });
    });

    it("is calm when nothing was left open", () => {
      expect(eventRisk(event(), [linked(-1, done), linked(2)], at(20)).status).toBe("none");
    });
  });

  describe("a multi-day Event", () => {
    const tasks = [linked(-3), linked(0)];

    it("is Critical the day before and the day it starts", () => {
      expect(eventRisk(weekend, tasks, at(15)).status).toBe("critical");
      expect(eventRisk(weekend, tasks, at(16)).status).toBe("critical");
    });

    it("stays At risk while it is going on, and passes after its last day", () => {
      expect(eventRisk(weekend, tasks, at(17))).toMatchObject({ status: "atRisk", daysUntil: -1 });
      expect(eventRisk(weekend, tasks, at(18, 23, 59)).status).toBe("atRisk");
      expect(eventRisk(weekend, tasks, at(19, 0, 0))).toMatchObject({ status: "passed", openPreparation: 2 });
    });
  });

  describe("an Event in another time zone counts by its own dates, like its Tasks", () => {
    it("behind the device: 19:00 in New York on the 12th is 01:00 on the 13th in Berlin", () => {
      const newYork = event({ startTime: "19:00", endTime: "20:00", timeZone: "America/New_York" });
      expect(eventRisk(newYork, [linked(0)], at(10)).status).toBe("none");
      expect(eventRisk(newYork, [linked(0)], at(11))).toMatchObject({ status: "critical", daysUntil: 1 });
      expect(eventRisk(newYork, [linked(0)], at(12))).toMatchObject({ status: "critical", daysUntil: 0 });
      expect(eventRisk(newYork, [linked(0)], at(13)).status).toBe("passed");
    });

    it("ahead of the device: 06:00 in Tokyo on the 12th is 23:00 on the 11th in Berlin", () => {
      const tokyo = event({ startTime: "06:00", endTime: "07:00", timeZone: "Asia/Tokyo" });
      const onTheDay = linked(0);
      expect(eventRisk(tokyo, [onTheDay], at(11))).toMatchObject({ status: "critical", daysUntil: 1 });
      // Its Task is due today, so it is not passed yet.
      expect(eventRisk(tokyo, [onTheDay], at(12))).toMatchObject({ status: "critical", daysUntil: 0, overdue: [] });
      expect(eventRisk(tokyo, [onTheDay], at(13)).status).toBe("passed");
      expect(putsEventAtRisk(withEventDates([onTheDay], [tokyo])[0], tokyo, at(13))).toBe(false);
    });
  });

  it("doesn't count the next day for a timed Event that ends at midnight", () => {
    const evening = event({ startTime: "20:00", endDate: "2026-10-13", endTime: "00:00" });
    expect(eventRisk(evening, [linked(-1)], at(13)).status).toBe("passed");
    const overnight = event({ startTime: "20:00", endDate: "2026-10-13", endTime: "02:00" });
    expect(eventRisk(overnight, [linked(-1)], at(13)).status).toBe("atRisk");
    const atMidnight = event({ startTime: "00:00", endTime: "00:00" });
    expect(eventRisk(atMidnight, [linked(0)], at(12)).status).toBe("critical");
  });
});

describe("putsEventAtRisk: an Overdue Preparation task of an Event that hasn't passed", () => {
  const dated = (task: Task) => withEventDates([task], [event()])[0];

  it("is true for an Overdue Preparation task", () => {
    expect(putsEventAtRisk(dated(linked(-7)), event(), at(6))).toBe(true);
    expect(putsEventAtRisk(dated(linked(-1)), event(), at(12))).toBe(true);
  });

  it("is false for a Task on time, Completed, a Follow-up task or once the Event has passed", () => {
    expect(putsEventAtRisk(dated(linked(-7)), event(), at(5))).toBe(false);
    expect(putsEventAtRisk(dated(linked(-7, done)), event(), at(6))).toBe(false);
    expect(putsEventAtRisk(dated(linked(1)), event(), at(14))).toBe(false);
    expect(putsEventAtRisk(dated(linked(-7)), event(), at(13))).toBe(false);
    // An Overdue Follow-up task while a multi-day Event is still going on.
    expect(putsEventAtRisk(withEventDates([linked(1)], [weekend])[0], weekend, at(18))).toBe(false);
  });
});

describe("countdown: the Event's Preparation tasks on a line towards it", () => {
  it("plots the Preparation tasks and Today by Offset, with the Event at the end", () => {
    const cake = linked(-8, done);
    const gift = linked(-7);
    const wrap = linked(-1);
    const line = countdown(event(), [wrap, cake, linked(2), gift], at(6))!;

    expect(line.marks.map((m) => [m.offsetDays, m.state, m.tasks.map((t) => t.id)])).toEqual([
      [-8, "done", [cake.id]],
      [-7, "overdue", [gift.id]],
      [-1, "open", [wrap.id]],
    ]);
    expect(line.marks[0].position).toBe(0);
    expect(line.marks[2].position).toBeCloseTo((7 / 8) * 0.9);
    expect(line.todayPosition).toBeCloseTo((2 / 8) * 0.9);
  });

  it("starts the line at Today when Today comes before every Task", () => {
    const line = countdown(event(), [linked(-2)], at(2))!;
    expect(line.todayPosition).toBe(0);
    expect(line.marks[0].position).toBeCloseTo((8 / 10) * 0.9);
  });

  it("puts Tasks on the same day on one mark, showing the most pressing state", () => {
    const line = countdown(event(), [linked(-3, done), linked(-3), linked(-2, done), linked(-1, done), linked(-1)], at(10))!;
    expect(line.marks.map((m) => [m.offsetDays, m.state, m.tasks.length])).toEqual([
      [-3, "overdue", 2],
      [-2, "done", 1],
      [-1, "open", 2],
    ]);
  });

  it("puts everything at the Event on its day", () => {
    const line = countdown(event(), [linked(0)], at(12))!;
    expect(line.marks[0].position).toBe(0.9);
    expect(line.todayPosition).toBe(0.9);
  });

  it("is absent without Preparation tasks or once the Event has started on an earlier day", () => {
    expect(countdown(event(), [linked(1)], at(6))).toBeNull();
    expect(countdown(weekend, [linked(-1)], at(17))).toBeNull();
  });
});
