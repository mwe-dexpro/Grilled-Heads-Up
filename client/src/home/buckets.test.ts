import { describe, expect, it } from "vitest";
import type { Task } from "../tasks/taskStore";
import { arrangeHome, bucketOf, isLate, type BucketKind } from "./buckets";
import { addDays, dayOf } from "./days";

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

  it("keeps a Task in its place when it is Completed", () => {
    const first = task({ date: today });
    const second = task({ date: today });
    const before = bucket("today", [first, second]).tasks.map((t) => t.id);

    const after = bucket("today", [{ ...first, completedAt: now.toISOString() }, second]).tasks.map((t) => t.id);

    expect(after).toEqual(before);
  });
});
