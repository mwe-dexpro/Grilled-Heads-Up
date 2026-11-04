import { describe, expect, it } from "vitest";
import { addDays, dateAtNoon, type Day } from "../home/days";
import { chosenDay, earliestRescheduleDay, nextMonday, rescheduleOptions, reschedulePatch } from "./reschedule";
import type { Task } from "./taskStore";

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
    createdAt: "2026-09-01T09:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    rescheduleCount: 0,
    ...fields,
  };
}

/** Sunday 4 October 2026. */
const today: Day = "2026-10-04";
const noEvents = () => undefined;
const eventStartingOn = (day: Day) => () => day;

describe("nextMonday", () => {
  it.each<[string, Day, Day]>([
    ["Monday", "2026-10-05", "2026-10-12"],
    ["Tuesday", "2026-10-06", "2026-10-12"],
    ["Wednesday", "2026-10-07", "2026-10-12"],
    ["Thursday", "2026-10-08", "2026-10-12"],
    ["Friday", "2026-10-09", "2026-10-12"],
    ["Saturday", "2026-10-10", "2026-10-12"],
    ["Sunday", "2026-10-11", "2026-10-12"],
  ])("from a %s (%s) is %s", (_weekday, from, expected) => {
    expect(nextMonday(from)).toBe(expected);
  });

  it("is always a Monday between 1 and 7 days away, also across a year end and daylight-saving changes", () => {
    for (let i = 0; i < 400; i++) {
      const from = addDays("2026-01-01", i);
      const monday = nextMonday(from);
      expect(dateAtNoon(monday).getDay()).toBe(1);
      expect(monday > from).toBe(true);
      expect(monday <= addDays(from, 7)).toBe(true);
    }
    expect(nextMonday("2026-12-28")).toBe("2027-01-04");
    expect(nextMonday("2026-03-25")).toBe("2026-03-30");
  });
});

describe("rescheduleOptions", () => {
  it("offers Tomorrow, the day after tomorrow and next Monday, in this order, and no Today", () => {
    expect(rescheduleOptions("2026-10-07")).toEqual([
      { choice: "tomorrow", day: "2026-10-08" },
      { choice: "dayAfter", day: "2026-10-09" },
      { choice: "nextWeek", day: "2026-10-12" },
    ]);
  });

  it("counts across a month end, a year end and the daylight-saving change", () => {
    expect(rescheduleOptions("2026-10-30").map((o) => o.day)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(rescheduleOptions("2026-12-31").map((o) => o.day)).toEqual(["2027-01-01", "2027-01-02", "2027-01-04"]);
    expect(rescheduleOptions("2026-03-28").map((o) => o.day)).toEqual(["2026-03-29", "2026-03-30", "2026-03-30"]);
    expect(rescheduleOptions("2026-10-24").map((o) => o.day)).toEqual(["2026-10-25", "2026-10-26", "2026-10-26"]);
  });

  it("makes next week the following Monday, one week on from today when today is a Monday", () => {
    expect(rescheduleOptions("2026-10-05")[2]).toEqual({ choice: "nextWeek", day: "2026-10-12" });
    expect(rescheduleOptions("2026-10-04")[2]).toEqual({ choice: "nextWeek", day: "2026-10-05" });
  });
});

describe("earliestRescheduleDay", () => {
  it("is tomorrow for an Overdue Task: open and dated before today", () => {
    expect(earliestRescheduleDay(task({ date: "2026-10-03" }), today)).toBe("2026-10-05");
    expect(earliestRescheduleDay(task({ date: "2020-01-01" }), today)).toBe("2026-10-05");
  });

  it("is today for a Task that is not Overdue: due today, later, undated, or Completed", () => {
    expect(earliestRescheduleDay(task({ date: today }), today)).toBe(today);
    expect(earliestRescheduleDay(task({ date: "2026-10-05" }), today)).toBe(today);
    expect(earliestRescheduleDay(task(), today)).toBe(today);
    expect(earliestRescheduleDay(task({ date: "2026-10-01", completedAt: "2026-10-02T09:00:00.000Z" }), today)).toBe(today);
  });
});

describe("chosenDay", () => {
  it("means tomorrow when no day was chosen", () => {
    expect(chosenDay(undefined, today)).toBe("2026-10-05");
    expect(chosenDay("", today)).toBe("2026-10-05");
  });

  it("is the chosen day otherwise", () => {
    expect(chosenDay("2026-10-20", today)).toBe("2026-10-20");
    expect(chosenDay(today, today)).toBe(today);
  });
});

describe("reschedulePatch", () => {
  describe("a Task with a date", () => {
    it("writes the new date and counts the Reschedule, keeping its time", () => {
      const patch = reschedulePatch(task({ date: "2026-10-06", time: "09:30", rescheduleCount: 2 }), "2026-10-09", noEvents, today);

      expect(patch).toEqual({ date: "2026-10-09", rescheduleCount: 3 });
    });

    it("takes an Overdue Task to tomorrow or any later day", () => {
      const overdue = task({ date: "2026-10-01" });

      expect(reschedulePatch(overdue, "2026-10-05", noEvents, today)).toEqual({ date: "2026-10-05", rescheduleCount: 1 });
      expect(reschedulePatch(overdue, "2027-01-01", noEvents, today)).toEqual({ date: "2027-01-01", rescheduleCount: 1 });
    });

    it("never takes an Overdue Task to today", () => {
      expect(() => reschedulePatch(task({ date: "2026-10-03" }), today, noEvents, today)).toThrow();
    });

    it("never takes a Task to a day in the past", () => {
      expect(() => reschedulePatch(task({ date: "2026-10-06" }), "2026-10-03", noEvents, today)).toThrow();
      expect(() => reschedulePatch(task(), "2026-10-03", noEvents, today)).toThrow();
    });

    it("lets a Task due later come back to today", () => {
      expect(reschedulePatch(task({ date: "2026-10-09" }), today, noEvents, today)).toEqual({ date: today, rescheduleCount: 1 });
    });

    it("writes nothing for the day the Task already has", () => {
      expect(reschedulePatch(task({ date: "2026-10-09" }), "2026-10-09", noEvents, today)).toBeNull();
    });

    it("counts a Task Completed after it was overdue as an ordinary one: today is allowed", () => {
      const completed = task({ date: "2026-10-01", completedAt: "2026-10-02T09:00:00.000Z" });

      expect(reschedulePatch(completed, today, noEvents, today)).toEqual({ date: today, rescheduleCount: 1 });
    });
  });

  describe("an Inbox Task", () => {
    it("gets its first date without counting a Reschedule", () => {
      expect(reschedulePatch(task({ rescheduleCount: 1 }), "2026-10-09", noEvents, today)).toEqual({ date: "2026-10-09", rescheduleCount: 1 });
      expect(reschedulePatch(task(), today, noEvents, today)).toEqual({ date: today, rescheduleCount: 0 });
    });
  });

  describe("a Linked task", () => {
    const linked = (fields: Partial<Task> = {}) => task({ eventId: "e1", offsetDays: -7, ...fields });

    it("changes its Offset, so it keeps following the Event, and writes the link fields together", () => {
      // The Event starts on 2026-10-12; the Task, 7 days before, is due on 2026-10-05 (tomorrow).
      const patch = reschedulePatch(linked(), "2026-10-06", eventStartingOn("2026-10-12"), today);

      expect(patch).toEqual({ eventId: "e1", offsetDays: -6, date: null, rescheduleCount: 1 });
    });

    it("can take the Task past its Event: a positive Offset", () => {
      const patch = reschedulePatch(linked(), "2026-10-15", eventStartingOn("2026-10-12"), today);

      expect(patch).toMatchObject({ offsetDays: 3, date: null });
    });

    it("counts the Offset from the Event's start day across a month end", () => {
      const patch = reschedulePatch(linked({ offsetDays: -20 }), "2026-11-03", eventStartingOn("2026-11-05"), today);

      expect(patch).toMatchObject({ offsetDays: -2 });
    });

    it("never takes a Task that its Event made Overdue to today", () => {
      // The Event was on 2026-10-03; the Task, 1 day before, is due on 2026-10-02: Overdue.
      expect(() => reschedulePatch(linked({ offsetDays: -1 }), today, eventStartingOn("2026-10-03"), today)).toThrow();
      expect(reschedulePatch(linked({ offsetDays: -1 }), "2026-10-05", eventStartingOn("2026-10-03"), today)).toMatchObject({
        offsetDays: 2,
      });
    });

    it("writes nothing for the day it is already on", () => {
      expect(reschedulePatch(linked(), "2026-10-05", eventStartingOn("2026-10-12"), today)).toBeNull();
    });

    it("writes nothing when its Event is not on this device", () => {
      expect(reschedulePatch(linked(), "2026-10-09", noEvents, today)).toBeNull();
    });

    it("asks for the Event the Task belongs to", () => {
      const asked: string[] = [];

      reschedulePatch(linked(), "2026-10-09", (id) => (asked.push(id), "2026-10-12"), today);

      expect(asked).toEqual(["e1"]);
    });

    it("keeps counting from the Task's count", () => {
      const patch = reschedulePatch(linked({ rescheduleCount: 4 }), "2026-10-09", eventStartingOn("2026-10-12"), today);

      expect(patch).toMatchObject({ rescheduleCount: 5 });
    });
  });
});
