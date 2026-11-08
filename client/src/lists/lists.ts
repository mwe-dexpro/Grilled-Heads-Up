import { byName } from "../data/names";
import { dayOf, type Day } from "../home/days";
import type { Progress } from "../home/buckets";
import type { Tag } from "../tags/tagStore";
import type { Task } from "../tasks/taskStore";
import type { List } from "./listStore";

/**
 * What the Projects tab and the Project view show, worked out from the Tasks. The Tasks passed in are the app's live
 * Tasks with `withEventDates` applied, so a Linked task is dated by its Event.
 */

/** One segment of a List's Progress bar: a Completed Task, an open Overdue one, any other open one. */
export type Segment = "done" | "overdue" | "open";

export type ProjectStatus = { kind: "overdue"; count: number } | { kind: "onTrack" } | { kind: "noDeadline" };

const isOpen = (task: Task) => task.completedAt === null;
const isOverdue = (task: Task, today: Day) => isOpen(task) && task.date !== null && task.date < today;

export function listTasks(tasks: Task[], listId: string): Task[] {
  return tasks.filter((task) => task.listId === listId);
}

/** Date (undated last), then untimed before timed, then time, then creation. Never completion, so Completing keeps a Task in place. */
function compareTasks(a: Task, b: Task): number {
  return (
    Number(a.date === null) - Number(b.date === null) ||
    (a.date ?? "").localeCompare(b.date ?? "") ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** Completed ÷ all Tasks of the List, however long ago they were Completed (CONTEXT: Progress). */
export function listProgress(tasks: Task[], listId: string): Progress {
  const own = listTasks(tasks, listId);
  return { done: own.filter((task) => !isOpen(task)).length, total: own.length };
}

/** One per Task, in the order of the bar: Completed (blue), Overdue (amber), open (grey). */
export function progressSegments(tasks: Task[], listId: string, today: Day): Segment[] {
  const own = listTasks(tasks, listId);
  const overdue = own.filter((task) => isOverdue(task, today)).length;
  const done = own.filter((task) => !isOpen(task)).length;
  const open = own.length - done - overdue;
  return [...Array<Segment>(done).fill("done"), ...Array<Segment>(overdue).fill("overdue"), ...Array<Segment>(open).fill("open")];
}

/**
 * Overdue (with how many open Tasks are) when one is, else on track when an open Task has a date, else no deadline.
 * "At risk" belongs to Events and is not used for Lists.
 */
export function projectStatus(tasks: Task[], listId: string, today: Day): ProjectStatus {
  const open = listTasks(tasks, listId).filter(isOpen);
  const overdue = open.filter((task) => isOverdue(task, today)).length;
  if (overdue > 0) return { kind: "overdue", count: overdue };
  return open.some((task) => task.date !== null) ? { kind: "onTrack" } : { kind: "noDeadline" };
}

/** The open Task to do next: the earliest date (an Overdue one first), then untimed before timed, time, creation; undated last. */
export function nextTask(tasks: Task[], listId: string): Task | undefined {
  return listTasks(tasks, listId).filter(isOpen).sort(compareTasks)[0];
}

/**
 * What the person changed in the Edit sheet, compared with the List as the sheet showed it when it opened: only these
 * are saved, so a rename or Project flag that a sync brought meanwhile is not written over with the sheet's old copy.
 */
export function listChanges(
  initial: { name: string; isProject: boolean },
  edited: { name: string; isProject: boolean },
): { name?: string; isProject?: boolean } {
  return {
    ...(edited.name.trim() !== initial.name && { name: edited.name }),
    ...(edited.isProject !== initial.isProject && { isProject: edited.isProject }),
  };
}

/** What a card on the Projects tab shows. */
export interface ListSummary {
  progress: Progress;
  segments: Segment[];
  status: ProjectStatus;
  next: Task | undefined;
  /** The next Task is Overdue: the card names it in amber. */
  nextOverdue: boolean;
}

export function listSummary(tasks: Task[], listId: string, today: Day): ListSummary {
  const next = nextTask(tasks, listId);
  return {
    progress: listProgress(tasks, listId),
    segments: progressSegments(tasks, listId, today),
    status: projectStatus(tasks, listId, today),
    next,
    nextOverdue: next !== undefined && isOverdue(next, today),
  };
}

/**
 * The Tasks the Project view lists: open ones, those Completed today (they stay crossed out in place until the end of
 * the day), and all Completed ones when `showCompleted`; only those with the Tag when one is chosen.
 */
export function projectViewTasks(
  tasks: Task[],
  listId: string,
  { showCompleted, tagId = null }: { showCompleted: boolean; tagId?: string | null },
  today: Day,
): Task[] {
  return listTasks(tasks, listId)
    .filter((task) => task.completedAt === null || showCompleted || dayOf(new Date(task.completedAt)) === today)
    .filter((task) => tagId === null || task.tagIds.includes(tagId))
    .sort(compareTasks);
}

/** The live Tags the List's Tasks use, by name: the Project view's filter chips. */
export function tagsInList(tasks: Task[], listId: string, tags: Tag[]): Tag[] {
  const used = new Set(listTasks(tasks, listId).flatMap((task) => task.tagIds));
  return tags.filter((tag) => used.has(tag.id)).sort(byName);
}

/** Projects and plain Lists, each by name. */
export function arrangeProjects(lists: List[]): { projects: List[]; lists: List[] } {
  const sorted = [...lists].sort(byName);
  return { projects: sorted.filter((list) => list.isProject), lists: sorted.filter((list) => !list.isProject) };
}

/** The Task's List, if it is live on this device: one deleted elsewhere, or not arrived yet, counts as none. */
export function liveList(task: Task, lists: List[]): List | undefined {
  return lists.find((list) => list.id === task.listId);
}

/** The Task's Tags in the order they were added; ids that are not live Tags on this device are left out. */
export function liveTags(task: Task, tags: Tag[]): Tag[] {
  return task.tagIds.flatMap((id) => tags.filter((tag) => tag.id === id));
}
