import { addDays, dayOf, daysBetween, type Day } from "../home/days";
import type { Task } from "../tasks/taskStore";
import { withEventDates, type Event } from "./event";

/** Preparation tasks are dated on or before the day their Event starts; Follow-up tasks after it. */
export type LinkedRole = "preparation" | "followUp";

/**
 * Risk is judged on the Event's own dates, the ones its Linked tasks' dates count from (ADR-0003), so an
 * Event in another time zone can't pass while its Preparation tasks are still due today.
 *
 * - **critical**: starts today or tomorrow and still has open Preparation tasks; wins over At risk.
 * - **atRisk**: at least one Preparation task is Overdue.
 * - **passed**: the Event is over with Preparation tasks still open; it has no risk status any more.
 * - **none**: nothing to warn about.
 */
export type RiskStatus = "critical" | "atRisk" | "passed" | "none";

export interface EventRisk {
  status: RiskStatus;
  /** Preparation tasks not Completed yet. */
  openPreparation: number;
  /** Overdue Preparation tasks, dated, the most Overdue first. */
  overdue: Task[];
  /** Days from today to the Event's start date; negative once it has started. */
  daysUntil: number;
}

/**
 * Counted from the Event's own start date, like the Offset, so a Task "on the day" is always Preparation.
 * The Task must be dated (see `withEventDates`).
 */
export function linkedRole(task: Pick<Task, "date">, event: Pick<Event, "startDate">): LinkedRole {
  return task.date! <= event.startDate ? "preparation" : "followUp";
}

const isOpen = (task: Task) => task.completedAt === null;
/** Not Completed and dated before today; the Task must be dated. */
export const isOverdue = (task: Task, today: Day) => isOpen(task) && task.date! < today;

/** The Event's Linked tasks with their dates, Preparation ones only. */
function preparationTasks(event: Event, tasks: Task[]): Task[] {
  return withEventDates(
    tasks.filter((task) => task.eventId === event.id),
    [event],
  ).filter((task) => linkedRole(task, event) === "preparation");
}

/** The Event is over once its own last day is before today. A timed Event ending at midnight doesn't cover the next day. */
function hasPassed(event: Event, today: Day): boolean {
  const endsAtMidnight = !event.allDay && event.endTime === "00:00" && event.endDate > event.startDate;
  return (endsAtMidnight ? addDays(event.endDate, -1) : event.endDate) < today;
}

/** Whether the Event is At risk or Critical at `now`, from its Linked tasks (all Tasks may be passed in). */
export function eventRisk(event: Event, tasks: Task[], now: Date): EventRisk {
  const today = dayOf(now);
  const preparation = preparationTasks(event, tasks);
  const openPreparation = preparation.filter(isOpen).length;
  const overdue = preparation.filter((task) => isOverdue(task, today)).sort((a, b) => a.date!.localeCompare(b.date!));
  const daysUntil = daysBetween(today, event.startDate);

  let status: RiskStatus = "none";
  if (hasPassed(event, today)) status = openPreparation > 0 ? "passed" : "none";
  else if (daysUntil >= 0 && daysUntil <= 1 && openPreparation > 0) status = "critical";
  else if (overdue.length > 0) status = "atRisk";

  return { status, openPreparation, overdue, daysUntil };
}

/** A dated Linked task that makes its Event At risk: an Overdue Preparation task of an Event that hasn't passed. */
export function putsEventAtRisk(task: Task, event: Event, now: Date): boolean {
  const today = dayOf(now);
  return linkedRole(task, event) === "preparation" && isOverdue(task, today) && !hasPassed(event, today);
}

export interface CountdownMark {
  offsetDays: number;
  /** 0 = left end of the line, 1 = the Event. */
  position: number;
  /** The Preparation tasks on that day. */
  tasks: Task[];
  /** Overdue if any of them is, else open if any is, else done. */
  state: "overdue" | "open" | "done";
}

export interface Countdown {
  marks: CountdownMark[];
  /** Where today is on the line. */
  todayPosition: number;
}

/** Tasks on the Event's day sit this far along the line, just before the Event itself. */
const eventDayPosition = 0.9;

/**
 * The Event's Preparation tasks and today on a line that ends at the Event, placed by Offset.
 * Null when there is nothing to count down to: no Preparation tasks, or the Event started on an earlier day.
 */
export function countdown(event: Event, tasks: Task[], now: Date): Countdown | null {
  const today = dayOf(now);
  const todayOffset = daysBetween(event.startDate, today);
  const preparation = preparationTasks(event, tasks);
  if (preparation.length === 0 || todayOffset > 0) return null;

  const start = Math.min(todayOffset, ...preparation.map((task) => task.offsetDays!));
  const position = (offsetDays: number) => (start === 0 ? 1 : (offsetDays - start) / -start) * eventDayPosition;

  const byOffset = new Map<number, Task[]>();
  for (const task of preparation) byOffset.set(task.offsetDays!, [...(byOffset.get(task.offsetDays!) ?? []), task]);

  const marks = [...byOffset]
    .sort(([a], [b]) => a - b)
    .map(([offsetDays, dayTasks]): CountdownMark => ({
      offsetDays,
      position: position(offsetDays),
      tasks: dayTasks,
      state: dayTasks.some((task) => isOverdue(task, today)) ? "overdue" : dayTasks.some(isOpen) ? "open" : "done",
    }));

  return { marks, todayPosition: position(todayOffset) };
}
