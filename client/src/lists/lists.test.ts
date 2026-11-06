import { describe, expect, it } from "vitest";
import type { Event } from "../events/event";
import { withEventDates } from "../events/event";
import type { Tag } from "../tags/tagStore";
import type { Task } from "../tasks/taskStore";
import type { List } from "./listStore";
import {
  arrangeProjects,
  liveList,
  liveTags,
  listChanges,
  listProgress,
  listSummary,
  listTasks,
  nextTask,
  progressSegments,
  projectStatus,
  projectViewTasks,
  tagsInList,
} from "./lists";

/** Sunday 4 October 2026. */
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
    listId: "L",
    tagIds: [],
    createdAt: new Date(2026, 8, 1, 9, 0, counter).toISOString(),
    completedAt: null,
    rescheduleCount: 0,
    deletedAt: null,
    ...fields,
  };
}

const list = (name: string, fields: Partial<List> = {}): List => ({ id: name, name, isProject: false, createdAt: "", deletedAt: null, ...fields });
const tag = (name: string): Tag => ({ id: name, name, createdAt: "", deletedAt: null });
const party: Event = {
  id: "party",
  title: "Party",
  allDay: true,
  startDate: "2026-10-02",
  startTime: null,
  endDate: "2026-10-02",
  endTime: null,
  timeZone: null,
  location: "",
  notes: "",
  externalSource: null,
  externalId: null,
  createdAt: "",
  deletedAt: null,
};

const done = { completedAt: "2026-10-01T08:00:00.000Z" };
const doneToday = { completedAt: "2026-10-04T08:00:00.000Z" };
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe("listTasks", () => {
  it("keeps the Tasks of the List, Completed ones too, and no others", () => {
    const mine = task();
    const completed = task(done);
    const other = task({ listId: "M" });
    const loose = task({ listId: null });

    expect(listTasks([mine, other, completed, loose], "L")).toEqual([mine, completed]);
  });
});

describe("listProgress", () => {
  it("is Completed over all Tasks of the List, however long ago they were Completed", () => {
    const tasks = [task(done), task({ completedAt: "2025-01-01T08:00:00.000Z" }), task(), task(), task({ listId: "M", completedAt: "2026-10-01T08:00:00.000Z" })];

    expect(listProgress(tasks, "L")).toEqual({ done: 2, total: 4 });
  });

  it("is 0 of 0 for an empty List", () => {
    expect(listProgress([task({ listId: "M" })], "L")).toEqual({ done: 0, total: 0 });
  });

  it("counts a Linked task like any other", () => {
    const linked = task({ eventId: "party", offsetDays: -1, ...done });

    expect(listProgress(withEventDates([linked, task()], [party]), "L")).toEqual({ done: 1, total: 2 });
  });
});

describe("progressSegments", () => {
  it("has one segment per Task: Completed first, then Overdue, then open", () => {
    const tasks = [task({ date: "2026-10-09" }), task({ date: "2026-10-01" }), task(done), task(), task({ date: "2026-10-03" }), task(doneToday)];

    expect(progressSegments(tasks, "L", today)).toEqual(["done", "done", "overdue", "overdue", "open", "open"]);
  });

  it("calls an open Task due today or undated open, and a Completed Task with an old date done", () => {
    const tasks = [task({ date: today }), task({ date: "2026-09-01", ...done }), task({ date: null })];

    expect(progressSegments(tasks, "L", today)).toEqual(["done", "open", "open"]);
  });

  it("takes the date of a Linked task from its Event", () => {
    const tasks = withEventDates([task({ eventId: "party", offsetDays: 0 }), task({ eventId: "party", offsetDays: 5 })], [party]);

    expect(progressSegments(tasks, "L", today)).toEqual(["overdue", "open"]);
  });

  it("leaves out the Tasks of other Lists, and is empty for a List without Tasks", () => {
    expect(progressSegments([task({ listId: "M", date: "2026-10-01" })], "L", today)).toEqual([]);
  });
});

describe("projectStatus", () => {
  it("counts the open Tasks that are Overdue", () => {
    const tasks = [task({ date: "2026-10-01" }), task({ date: "2026-10-03" }), task({ date: today }), task({ date: "2026-10-09" })];

    expect(projectStatus(tasks, "L", today)).toEqual({ kind: "overdue", count: 2 });
  });

  it("does not count a Completed Task with an Overdue date, nor one of another List", () => {
    const tasks = [task({ date: "2026-10-01", ...done }), task({ date: "2026-10-01", listId: "M" }), task({ date: today })];

    expect(projectStatus(tasks, "L", today)).toEqual({ kind: "onTrack" });
  });

  it("is on track when an open Task has a date, today or later", () => {
    expect(projectStatus([task({ date: today })], "L", today)).toEqual({ kind: "onTrack" });
    expect(projectStatus([task({ date: "2026-12-01" }), task()], "L", today)).toEqual({ kind: "onTrack" });
  });

  it("has no deadline when no open Task has a date: undated ones, Completed dated ones, or none at all", () => {
    expect(projectStatus([task(), task({ date: "2026-12-01", ...done })], "L", today)).toEqual({ kind: "noDeadline" });
    expect(projectStatus([], "L", today)).toEqual({ kind: "noDeadline" });
  });

  it("is Overdue through the date of a Linked task's Event", () => {
    const tasks = withEventDates([task({ eventId: "party", offsetDays: 0 })], [party]);

    expect(projectStatus(tasks, "L", today)).toEqual({ kind: "overdue", count: 1 });
  });
});

describe("nextTask", () => {
  it("is the open Task with the earliest date, an Overdue one before all others", () => {
    const later = task({ date: "2026-10-20" });
    const overdue = task({ date: "2026-09-20" });
    const soon = task({ date: "2026-10-05" });

    expect(nextTask([later, soon, overdue], "L")).toBe(overdue);
    expect(nextTask([later, soon], "L")).toBe(soon);
  });

  it("puts an untimed Task before a timed one on the same day, then goes by time, then by creation", () => {
    const timed = task({ date: "2026-10-05", time: "09:00" });
    const untimed = task({ date: "2026-10-05" });
    const early = task({ date: "2026-10-06", time: "08:00" });
    const late = task({ date: "2026-10-06", time: "18:00" });
    const first = task({ date: "2026-10-07", createdAt: "2026-09-01T09:00:00.000Z" });
    const second = task({ date: "2026-10-07", createdAt: "2026-09-02T09:00:00.000Z" });

    expect(nextTask([timed, untimed], "L")).toBe(untimed);
    expect(nextTask([late, early], "L")).toBe(early);
    expect(nextTask([second, first], "L")).toBe(first);
  });

  it("puts undated Tasks after all dated ones, by creation", () => {
    const undatedOld = task({ createdAt: "2026-08-01T09:00:00.000Z" });
    const undatedNew = task({ createdAt: "2026-09-01T09:00:00.000Z" });
    const dated = task({ date: "2030-01-01" });

    expect(nextTask([undatedNew, dated, undatedOld], "L")).toBe(dated);
    expect(nextTask([undatedNew, undatedOld], "L")).toBe(undatedOld);
  });

  it("skips Completed Tasks and other Lists' Tasks, and is undefined without an open Task", () => {
    const open = task({ date: "2026-10-30" });

    expect(nextTask([task({ date: "2026-10-01", ...done }), task({ listId: "M", date: "2026-10-01" }), open], "L")).toBe(open);
    expect(nextTask([task(done)], "L")).toBeUndefined();
    expect(nextTask([], "L")).toBeUndefined();
  });

  it("uses the date of a Linked task's Event", () => {
    const [linked, plain] = withEventDates([task({ eventId: "party", offsetDays: -3 }), task({ date: "2026-10-01" })], [party]);

    expect(nextTask([plain, linked], "L")).toBe(linked);
  });
});

describe("listSummary", () => {
  it("has the Progress, segments, status and next Task of the List in one place", () => {
    const next = task({ date: "2026-10-01" });
    const tasks = [task(done), next, task({ date: "2026-10-09" })];

    expect(listSummary(tasks, "L", today)).toEqual({
      progress: { done: 1, total: 3 },
      segments: ["done", "overdue", "open"],
      status: { kind: "overdue", count: 1 },
      next,
      nextOverdue: true,
    });
  });

  it("says whether the next Task is Overdue only when it is dated before today", () => {
    expect(listSummary([task({ date: today })], "L", today).nextOverdue).toBe(false);
    expect(listSummary([task({ date: "2026-10-05" })], "L", today).nextOverdue).toBe(false);
    expect(listSummary([task()], "L", today).nextOverdue).toBe(false);
    expect(listSummary([], "L", today)).toMatchObject({ next: undefined, nextOverdue: false });
  });
});

describe("projectViewTasks", () => {
  const view = (tasks: Task[], options: { showCompleted?: boolean; tagId?: string | null } = {}) =>
    projectViewTasks(tasks, "L", { showCompleted: false, ...options }, today);

  it("shows open Tasks and those Completed today, not those Completed on an earlier day", () => {
    const open = task();
    const today1 = task(doneToday);
    const earlier = task(done);

    expect(view([open, earlier, today1])).toEqual([open, today1]);
  });

  it("shows every Completed Task when asked to", () => {
    const earlier = task({ ...done, date: "2026-09-01" });
    const open = task({ date: "2026-10-09" });

    expect(view([open, earlier], { showCompleted: true })).toEqual([earlier, open]);
  });

  it("leaves out the Tasks of other Lists and those without a List", () => {
    const mine = task();

    expect(view([task({ listId: "M" }), task({ listId: null }), mine])).toEqual([mine]);
  });

  it("shows only the Tasks with the Tag when one is chosen, and all of them for none", () => {
    const urgent = task({ tagIds: ["g1", "g2"] });
    const calm = task({ tagIds: ["g2"] });
    const bare = task();

    expect(view([urgent, calm, bare], { tagId: "g1" })).toEqual([urgent]);
    expect(view([urgent, calm, bare], { tagId: "g2" })).toEqual([urgent, calm]);
    expect(view([urgent, calm, bare], { tagId: null })).toEqual([urgent, calm, bare]);
    expect(view([urgent, calm, bare])).toEqual([urgent, calm, bare]);
  });

  it("applies the Tag filter to Completed Tasks too", () => {
    const tagged = task({ ...done, tagIds: ["g1"] });
    const untagged = task(done);

    expect(view([tagged, untagged], { showCompleted: true, tagId: "g1" })).toEqual([tagged]);
  });

  it("sorts by date, untimed before timed, by time, then creation; undated last", () => {
    const undated = task({ createdAt: "2026-09-01T09:00:00.000Z" });
    const lateDay = task({ date: "2026-10-09" });
    const timed = task({ date: "2026-10-05", time: "09:00" });
    const untimed = task({ date: "2026-10-05" });
    const overdue = task({ date: "2026-09-20" });
    const secondOfDay = task({ date: "2026-10-07", createdAt: "2026-09-02T09:00:00.000Z" });
    const firstOfDay = task({ date: "2026-10-07", createdAt: "2026-09-01T09:00:00.000Z" });
    const undatedLater = task({ createdAt: "2026-09-02T09:00:00.000Z" });

    expect(view([undatedLater, lateDay, timed, secondOfDay, undated, untimed, overdue, firstOfDay])).toEqual([
      overdue,
      untimed,
      timed,
      firstOfDay,
      secondOfDay,
      lateDay,
      undated,
      undatedLater,
    ]);
  });

  it("keeps a Task where it is when it is Completed, whatever the date of its completion", () => {
    const first = task({ date: "2026-10-05" });
    const second = task({ date: "2026-10-06" });
    const third = task({ date: "2026-10-07" });

    const before = view([first, second, third]);
    const after = view([first, { ...second, completedAt: "2026-10-04T08:00:00.000Z" }, third]);

    expect(ids(after)).toEqual(ids(before));
  });

  it("uses the date of a Linked task's Event, and does not change the Tasks it is given", () => {
    const tasks = withEventDates([task({ date: "2026-10-03" }), task({ eventId: "party", offsetDays: -1 })], [party]);
    const copy = [...tasks];

    expect(view(tasks).map((t) => t.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(tasks).toEqual(copy);
  });

  it("goes by the day of completion in the device's time zone", () => {
    const lateToday = task({ completedAt: new Date(2026, 9, 4, 23, 59).toISOString() });
    const earlyToday = task({ completedAt: new Date(2026, 9, 4, 0, 1).toISOString() });
    const lateYesterday = task({ completedAt: new Date(2026, 9, 3, 23, 59).toISOString() });

    expect(ids(view([lateYesterday, lateToday, earlyToday]))).toEqual(ids([lateToday, earlyToday]));
  });
});

describe("tagsInList", () => {
  const tags = [tag("Errand"), tag("urgent"), tag("Ärger"), tag("unused")];

  it("lists the Tags the List's Tasks use, by name, once each", () => {
    const tasks = [task({ tagIds: ["urgent", "Errand"] }), task({ tagIds: ["urgent"] }), task({ ...done, tagIds: ["Ärger"] })];

    expect(tagsInList(tasks, "L", tags).map((t) => t.name)).toEqual(["Ärger", "Errand", "urgent"]);
  });

  it("ignores the Tags of other Lists' Tasks, and Tag ids that are not live Tags", () => {
    const tasks = [task({ listId: "M", tagIds: ["Errand"] }), task({ tagIds: ["urgent", "deleted-elsewhere"] })];

    expect(tagsInList(tasks, "L", tags).map((t) => t.name)).toEqual(["urgent"]);
  });

  it("is empty when no Task has a Tag", () => {
    expect(tagsInList([task()], "L", tags)).toEqual([]);
  });
});

describe("arrangeProjects", () => {
  it("splits Projects from plain Lists and sorts each by name", () => {
    const lists = [list("zeta"), list("Basement", { isProject: true }), list("apple"), list("Äther", { isProject: true }), list("Cabin", { isProject: true })];

    const arranged = arrangeProjects(lists);

    expect(arranged.projects.map((l) => l.name)).toEqual(["Äther", "Basement", "Cabin"]);
    expect(arranged.lists.map((l) => l.name)).toEqual(["apple", "zeta"]);
  });

  it("has nothing for no Lists", () => {
    expect(arrangeProjects([])).toEqual({ projects: [], lists: [] });
  });
});

describe("liveList and liveTags", () => {
  const lists = [list("Basement"), list("Cabin")];
  const tags = [tag("a"), tag("b"), tag("c")];

  it("finds the List of a Task", () => {
    expect(liveList(task({ listId: "Cabin" }), lists)).toBe(lists[1]);
  });

  it("finds no List for a Task without one, or whose List is not live on this device", () => {
    expect(liveList(task({ listId: null }), lists)).toBeUndefined();
    expect(liveList(task({ listId: "deleted-elsewhere" }), lists)).toBeUndefined();
    expect(liveList(task({ listId: "Basement" }), [])).toBeUndefined();
  });

  it("finds the Tags of a Task in the order they were added, leaving out unknown ones", () => {
    expect(liveTags(task({ tagIds: ["c", "gone", "a"] }), tags)).toEqual([tags[2], tags[0]]);
    expect(liveTags(task(), tags)).toEqual([]);
  });
});

describe("listChanges", () => {
  const initial = { name: "Basement", isProject: false };

  it("names nothing when nothing was changed, also when only spaces were added around the name", () => {
    expect(listChanges(initial, { name: "Basement", isProject: false })).toEqual({});
    expect(listChanges(initial, { name: "  Basement ", isProject: false })).toEqual({});
  });

  it("names only the name when only the name was changed", () => {
    expect(listChanges(initial, { name: "Cellar", isProject: false })).toEqual({ name: "Cellar" });
  });

  it("names only the Project flag when only the flag was changed, and the other way round", () => {
    expect(listChanges(initial, { name: "Basement", isProject: true })).toEqual({ isProject: true });
    expect(listChanges({ name: "Basement", isProject: true }, { name: "Basement", isProject: false })).toEqual({ isProject: false });
  });

  it("names both when both were changed", () => {
    expect(listChanges(initial, { name: "Cellar", isProject: true })).toEqual({ name: "Cellar", isProject: true });
  });
});
