import type { Task } from "../tasks/taskStore";
import { addDays, daysBetween, dayOf, timeOf, type Day, type TimeOfDay } from "./days";

export type BucketKind = "overdue" | "today" | "tomorrow" | "nextDays" | "later" | "inbox";

export interface Progress {
  done: number;
  total: number;
}

export interface Bucket {
  kind: BucketKind;
  /** First and last day the Bucket covers; null where it is open-ended or holds undated Tasks. */
  firstDay: Day | null;
  lastDay: Day | null;
  /** Open Tasks plus those Completed today, which stay in place until the end of the day. */
  tasks: Task[];
  progress: Progress;
  /** Tasks still to do; the Overdue badge and "N left" show this. */
  open: number;
}

const nextDaysCount = 3;

/** The Overdue badge gets stronger emphasis from this many open Tasks. */
export const overdueEmphasisFrom = 5;

export function isOverdueEmphasised(overdue: Pick<Bucket, "open">): boolean {
  return overdue.open >= overdueEmphasisFrom;
}

/** What the second line of a Task row says, before translation. */
export type TaskMeta =
  | { kind: "overdue"; days: number }
  | { kind: "time"; time: TimeOfDay; late: boolean }
  | { kind: "date"; date: Day; time: TimeOfDay | null }
  | null;

/**
 * Open Overdue Tasks show how long they are overdue; Today and Tomorrow show the time (if any) and Late;
 * the later Buckets show the date. Inbox Tasks have no date to show.
 */
export function taskMeta(task: Task, bucket: BucketKind, now: Date): TaskMeta {
  if (task.date === null) return null;
  if (bucket === "overdue" && task.completedAt === null) {
    return { kind: "overdue", days: daysBetween(task.date, dayOf(now)) };
  }
  if (bucket === "today" || bucket === "tomorrow") {
    return task.time === null ? null : { kind: "time", time: task.time, late: isLate(task, now) };
  }
  return { kind: "date", date: task.date, time: task.time };
}

export function bucketOf(task: Pick<Task, "date">, today: Day): BucketKind {
  if (task.date === null) return "inbox";
  if (task.date < today) return "overdue";
  if (task.date === today) return "today";
  if (task.date === addDays(today, 1)) return "tomorrow";
  if (task.date <= addDays(today, 1 + nextDaysCount)) return "nextDays";
  return "later";
}

/** Due today, its time has passed, and still open. A Late Task stays in Today; it is not Overdue. */
export function isLate(task: Task, now: Date): boolean {
  return (
    task.completedAt === null && task.date === dayOf(now) && task.time !== null && task.time < timeOf(now)
  );
}

function isShown(task: Task, today: Day): boolean {
  return task.completedAt === null || dayOf(new Date(task.completedAt)) === today;
}

/** Date, then untimed before timed, then time, then creation. Never completion, so Completing keeps a Task in place. */
function compareTasks(a: Task, b: Task): number {
  return (
    (a.date ?? "").localeCompare(b.date ?? "") ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** Groups Tasks into the home screen's Buckets, in display order, as seen at `now`. */
export function arrangeHome(tasks: Task[], now: Date): Bucket[] {
  const today = dayOf(now);
  const tomorrow = addDays(today, 1);
  const ranges: Record<BucketKind, [Day | null, Day | null]> = {
    overdue: [null, addDays(today, -1)],
    today: [today, today],
    tomorrow: [tomorrow, tomorrow],
    nextDays: [addDays(tomorrow, 1), addDays(tomorrow, nextDaysCount)],
    later: [addDays(tomorrow, nextDaysCount + 1), null],
    inbox: [null, null],
  };

  const shown = tasks.filter((task) => isShown(task, today)).sort(compareTasks);

  return (Object.keys(ranges) as BucketKind[]).map((kind) => {
    const inBucket = shown.filter((task) => bucketOf(task, today) === kind);
    const done = inBucket.filter((task) => task.completedAt !== null).length;
    return {
      kind,
      firstDay: ranges[kind][0],
      lastDay: ranges[kind][1],
      tasks: inBucket,
      progress: { done, total: inBucket.length },
      open: inBucket.length - done,
    };
  });
}
