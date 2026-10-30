import { describe, expect, it } from "vitest";
import type { Event } from "../events/event";
import type { Task } from "../tasks/taskStore";
import { arrangeHome, bucketOf, isLate, isOverdueEmphasised, taskMeta, type BucketKind } from "./buckets";
import { addDays, daysBetween, dayOf } from "./days";

/** Sunday 4 October 2026, 13:05 local time. */
const now = new Date(2026, 9, 4, 13, 5);
const today = "2026-10-04";

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

function bucket(kind: BucketKind, tasks: Task[]) {
  const found = arrangeHome(tasks, now).find((b) => b.kind === kind);
  if (!found) throw new Error(`no ${kind} bucket`);
  return found;
}

describe("days", () => {
  it("reads the local calendar day and adds days across month and year ends", () => {
    expect(dayOf(now)).toBe(today);
    expect(dayOf(new Date(2026, 9, 4, 0, 0))).toBe(today);
    expect(dayOf(new Date(2026, 9, 4, 23, 59, 59))).toBe(today);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // daylight-saving change in Europe
  });

  it("counts whole days between two days, also across a daylight-saving change", () => {
    expect(daysBetween("2026-10-01", "2026-10-04")).toBe(3);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-10-04", "2026-10-04")).toBe(0);
    expect(daysBetween("2026-10-04", "2026-10-01")).toBe(-3);
  });
});

describe("bucketOf", () => {
  it.each([
    ["2026-09-01", "overdue"],
    ["2026-10-03", "overdue"],
    ["2026-10-04", "today"],
    ["2026-10-05", "tomorrow"],
    ["2026-10-06", "nextDays"],
    ["2026-10-08", "nextDays"],
    ["2026-10-09", "later"],
    ["2027-01-01", "later"],
    [null, "inbox"],
  ] as const)("puts a Task dated %s into %s", (date, kind) => {
    expect(bucketOf({ date }, today)).toBe(kind);
  });

  it("moves a Task dated today into Overdue at midnight", () => {
    const t = task({ date: today });
    expect(bucketOf(t, dayOf(new Date(2026, 9, 4, 23, 59, 59)))).toBe("today");
    expect(bucketOf(t, dayOf(new Date(2026, 9, 5, 0, 0, 0)))).toBe("overdue");
  });
});

describe("isLate", () => {
  it("marks an open Task due today whose time has passed", () => {
    expect(isLate(task({ date: today, time: "13:00" }), now)).toBe(true);
    expect(isLate(task({ date: today, time: "13:04" }), now)).toBe(true);
  });

  it("does not mark a Task whose time is now or later, has no time, is completed or is not due today", () => {
    expect(isLate(task({ date: today, time: "13:05" }), now)).toBe(false);
    expect(isLate(task({ date: today, time: "18:00" }), now)).toBe(false);
    expect(isLate(task({ date: today }), now)).toBe(false);
    expect(isLate(task({ date: today, time: "09:00", completedAt: now.toISOString() }), now)).toBe(false);
    expect(isLate(task({ date: "2026-10-03", time: "09:00" }), now)).toBe(false);
    expect(isLate(task({ date: "2026-10-05", time: "09:00" }), now)).toBe(false);
  });

  it("keeps a Late Task in Today, not Overdue", () => {
    const late = task({ date: today, time: "08:00" });
    expect(bucket("today", [late]).tasks).toEqual([late]);
    expect(bucket("overdue", [late]).tasks).toEqual([]);
  });
});

describe("arrangeHome", () => {
  it("returns every Bucket in home-screen order", () => {
    expect(arrangeHome([], now).map((b) => b.kind)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "nextDays",
      "later",
      "inbox",
    ]);
  });

  it("gives each Bucket its first and last day", () => {
    const days = Object.fromEntries(arrangeHome([], now).map((b) => [b.kind, [b.firstDay, b.lastDay]]));
    expect(days).toEqual({
      overdue: [null, "2026-10-03"],
      today: [today, today],
      tomorrow: ["2026-10-05", "2026-10-05"],
      nextDays: ["2026-10-06", "2026-10-08"],
      later: ["2026-10-09", null],
      inbox: [null, null],
    });
  });

  it("shows Tasks completed today in place, crossed out, and hides ones completed earlier", () => {
    const completedToday = task({ date: today, completedAt: new Date(2026, 9, 4, 8, 0).toISOString() });
    const completedYesterday = task({ date: today, completedAt: new Date(2026, 9, 3, 22, 0).toISOString() });
    const overdueCompletedToday = task({ date: "2026-10-01", completedAt: new Date(2026, 9, 4, 0, 1).toISOString() });
    const inboxCompletedLastWeek = task({ completedAt: new Date(2026, 8, 27).toISOString() });

    const home = arrangeHome([completedToday, completedYesterday, overdueCompletedToday, inboxCompletedLastWeek], now);

    expect(home.find((b) => b.kind === "today")!.tasks).toEqual([completedToday]);
    expect(home.find((b) => b.kind === "overdue")!.tasks).toEqual([overdueCompletedToday]);
    expect(home.find((b) => b.kind === "inbox")!.tasks).toEqual([]);
  });

  it("computes Progress and the open count from the Tasks a Bucket shows", () => {
    const tasks = [
      task({ date: today, completedAt: new Date(2026, 9, 4, 9).toISOString() }),
      task({ date: today }),
      task({ date: today, time: "09:00" }),
      task({ date: "2026-10-01" }),
    ];

    const todayBucket = bucket("today", tasks);
    expect(todayBucket.progress).toEqual({ done: 1, total: 3 });
    expect(todayBucket.open).toBe(2);
    expect(bucket("overdue", tasks).open).toBe(1);
    expect(bucket("inbox", tasks).progress).toEqual({ done: 0, total: 0 });
  });

  it("sorts by date, then untimed before timed, then by time, then by creation", () => {
    const later = task({ date: "2026-10-03", time: "18:00" });
    const early = task({ date: "2026-10-03", time: "07:30" });
    const untimedSecond = task({ date: "2026-10-03" });
    const older = task({ date: "2026-09-20", time: "23:00" });
    const untimedFirst = task({ date: "2026-10-03", createdAt: new Date(2026, 0, 1).toISOString() });

    expect(bucket("overdue", [later, early, untimedSecond, older, untimedFirst]).tasks).toEqual([
      older,
      untimedFirst,
      untimedSecond,
      early,
      later,
    ]);
  });

  it("puts an untimed Task before a timed one on the same day, whichever was created first", () => {
    const timed = task({ date: today, time: "07:30" });
    const untimed = task({ date: today });

    expect(bucket("today", [timed, untimed]).tasks).toEqual([untimed, timed]);
    expect(bucket("today", [untimed, timed]).tasks).toEqual([untimed, timed]);
  });

  it("keeps a Task in its place when it is Completed", () => {
    const first = task({ date: today });
    const second = task({ date: today });
    const before = bucket("today", [first, second]).tasks.map((t) => t.id);

    const after = bucket("today", [{ ...first, completedAt: now.toISOString() }, second]).tasks.map((t) => t.id);

    expect(after).toEqual(before);
  });
});

describe("Overdue badge emphasis", () => {
  const overdueTasks = (count: number) => Array.from({ length: count }, () => task({ date: "2026-10-01" }));

  it("is stronger from 5 open Overdue Tasks", () => {
    expect(isOverdueEmphasised(bucket("overdue", overdueTasks(4)))).toBe(false);
    expect(isOverdueEmphasised(bucket("overdue", overdueTasks(5)))).toBe(true);
  });

  it("does not count Overdue Tasks Completed today", () => {
    const tasks = overdueTasks(5);
    tasks[0] = { ...tasks[0], completedAt: now.toISOString() };

    expect(isOverdueEmphasised(bucket("overdue", tasks))).toBe(false);
  });
});

describe("taskMeta: the second line of a Task row", () => {
  it("shows how many days an open Overdue Task is overdue", () => {
    expect(taskMeta(task({ date: "2026-10-03" }), "overdue", now)).toEqual({ kind: "overdue", days: 1 });
    expect(taskMeta(task({ date: "2026-09-25", time: "09:00" }), "overdue", now)).toEqual({ kind: "overdue", days: 9 });
  });

  it("shows the date of an Overdue Task Completed today instead of its age", () => {
    const completed = task({ date: "2026-10-03", completedAt: now.toISOString() });
    expect(taskMeta(completed, "overdue", now)).toEqual({ kind: "date", date: "2026-10-03", time: null });
  });

  it("shows only the time in Today and Tomorrow, and marks Late in Today", () => {
    expect(taskMeta(task({ date: today }), "today", now)).toBeNull();
    expect(taskMeta(task({ date: today, time: "13:00" }), "today", now)).toEqual({ kind: "time", time: "13:00", late: true });
    expect(taskMeta(task({ date: today, time: "18:00" }), "today", now)).toEqual({ kind: "time", time: "18:00", late: false });
    expect(taskMeta(task({ date: "2026-10-05", time: "08:00" }), "tomorrow", now)).toEqual({ kind: "time", time: "08:00", late: false });
    expect(taskMeta(task({ date: "2026-10-05" }), "tomorrow", now)).toBeNull();
  });

  it("shows the date (and time) in the later Buckets, and nothing in the Inbox", () => {
    expect(taskMeta(task({ date: "2026-10-07" }), "nextDays", now)).toEqual({ kind: "date", date: "2026-10-07", time: null });
    expect(taskMeta(task({ date: "2026-11-20", time: "10:30" }), "later", now)).toEqual({ kind: "date", date: "2026-11-20", time: "10:30" });
    expect(taskMeta(task(), "inbox", now)).toBeNull();
  });
});

function event(fields: Partial<Event> = {}): Event {
  counter++;
  return {
    id: `e${counter}`,
    title: `Event ${counter}`,
    allDay: true,
    startDate: today,
    startTime: null,
    endDate: today,
    endTime: null,
    timeZone: null,
    location: "",
    notes: "",
    externalSource: null,
    externalId: null,
    createdAt: new Date(2026, 8, 1, 9, 0, counter).toISOString(),
    ...fields,
  };
}

describe("Events on the home screen", () => {
  const eventsIn = (kind: BucketKind, events: Event[]) =>
    arrangeHome([], now, events).find((b) => b.kind === kind)!.events.map((e) => e.title);

  it("puts an Event into the Bucket of the day it starts", () => {
    const events = [
      event({ title: "Today", startDate: today, endDate: today }),
      event({ title: "Tomorrow", startDate: "2026-10-05", endDate: "2026-10-05" }),
      event({ title: "In 3 days", startDate: "2026-10-07", endDate: "2026-10-07" }),
      event({ title: "Later", startDate: "2026-10-12", endDate: "2026-10-12" }),
    ];

    expect(eventsIn("today", events)).toEqual(["Today"]);
    expect(eventsIn("tomorrow", events)).toEqual(["Tomorrow"]);
    expect(eventsIn("nextDays", events)).toEqual(["In 3 days"]);
    expect(eventsIn("later", events)).toEqual(["Later"]);
  });

  it("shows an Event that is still going on in Today, and none that has passed", () => {
    const events = [
      event({ title: "Ongoing", startDate: "2026-10-02", endDate: "2026-10-05" }),
      event({ title: "Ends today", startDate: "2026-10-03", endDate: today }),
      event({ title: "Passed", startDate: "2026-10-01", endDate: "2026-10-03" }),
    ];

    expect(eventsIn("today", events)).toEqual(["Ongoing", "Ends today"]);
    expect(arrangeHome([], now, events).flatMap((b) => b.events).map((e) => e.title)).not.toContain("Passed");
  });

  it("orders a Bucket's Events by when they start", () => {
    const events = [
      event({ title: "Evening", allDay: false, startTime: "19:00", endTime: "20:00", timeZone: "Europe/Berlin" }),
      event({ title: "All day" }),
      event({ title: "Morning", allDay: false, startTime: "08:00", endTime: "09:00", timeZone: "Europe/Berlin" }),
    ];

    expect(eventsIn("today", events)).toEqual(["All day", "Morning", "Evening"]);
  });

  it("dates Linked tasks from their Event before sorting them into Buckets", () => {
    const birthday = event({ startDate: "2026-10-12", endDate: "2026-10-12" });
    const gift = task({ eventId: birthday.id, offsetDays: -7 });
    const cake = task({ eventId: birthday.id, offsetDays: -8 });

    const home = arrangeHome([gift, cake], now, [birthday]);

    expect(home.find((b) => b.kind === "today")!.tasks.map((t) => [t.id, t.date])).toEqual([[cake.id, today]]);
    expect(home.find((b) => b.kind === "tomorrow")!.tasks.map((t) => t.id)).toEqual([gift.id]);
  });
});

describe("taskMeta for Linked tasks", () => {
  it("shows the Offset instead of the date", () => {
    const linked = task({ date: "2026-10-07", eventId: "e", offsetDays: -5 });
    expect(taskMeta(linked, "nextDays", now)).toEqual({ kind: "offset", offsetDays: -5 });
    expect(taskMeta({ ...linked, date: today }, "today", now)).toEqual({ kind: "offset", offsetDays: -5 });
  });

  it("still shows how long it is overdue, and its time and Late in Today", () => {
    const linked = { eventId: "e", offsetDays: -5 };
    expect(taskMeta(task({ ...linked, date: "2026-10-02" }), "overdue", now)).toEqual({ kind: "overdue", days: 2 });
    expect(taskMeta(task({ ...linked, date: today, time: "09:00" }), "today", now)).toEqual({ kind: "time", time: "09:00", late: true });
  });
});
