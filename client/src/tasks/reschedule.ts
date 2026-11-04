import { addDays, dateAtNoon, daysBetween, type Day } from "../home/days";
import type { Patch } from "../sync/replica";
import type { Task } from "./taskStore";

export type RescheduleChoice = "tomorrow" | "dayAfter" | "nextWeek";

export interface RescheduleOption {
  choice: RescheduleChoice;
  day: Day;
}

/** The Monday after `today` (today a Monday: a week on; today a Sunday: tomorrow). Weeks start on Monday. */
export function nextMonday(today: Day): Day {
  const weekday = dateAtNoon(today).getDay();
  return addDays(today, weekday === 0 ? 1 : 8 - weekday);
}

/** Tomorrow, the day after tomorrow, next Monday: the quick ways to Reschedule, in this order (Tomorrow first). Never Today. */
export function rescheduleOptions(today: Day): RescheduleOption[] {
  return [
    { choice: "tomorrow", day: addDays(today, 1) },
    { choice: "dayAfter", day: addDays(today, 2) },
    { choice: "nextWeek", day: nextMonday(today) },
  ];
}

/**
 * The earliest day a Task may be rescheduled to: tomorrow for an Overdue Task (open and dated before today; an
 * Overdue Task is never pushed to today by accident), else today. `task.date` is the Task's effective date, so a
 * Linked task has its Event's date applied (see `withEventDates`).
 */
export function earliestRescheduleDay(task: Pick<Task, "date" | "completedAt">, today: Day): Day {
  const overdue = task.completedAt === null && task.date !== null && task.date < today;
  return addDays(today, overdue ? 1 : 0);
}

/** "Reschedule without a chosen date means tomorrow." */
export function chosenDay(day: Day | undefined | "", today: Day): Day {
  return day === undefined || day === "" ? addDays(today, 1) : day;
}

/**
 * The fields a Reschedule of `task` (as stored) to `day` writes, or null when nothing is to be written. Throws
 * for a day before `earliestRescheduleDay` (never a past day; never today for an Overdue Task).
 *
 * A Linked task keeps following its Event (ADR-0003): its Offset changes, and `eventId`, `offsetDays` and `date`
 * are written together so that the link wins or loses as a unit when devices disagree (README, Sync). Its Event
 * start comes from `eventStart`; when the Event is not on this device nothing can be worked out and nothing is written.
 *
 * The count goes up by one for a Task that had a date (dated, or Linked). An Inbox Task getting its first date is
 * being scheduled, not rescheduled, so its count stays.
 */
export function reschedulePatch(
  task: Task,
  day: Day,
  eventStart: (eventId: string) => Day | undefined,
  today: Day,
): Patch<Task> | null {
  if (day < today) throw new Error(`Cannot reschedule to ${day}: it is in the past`);

  let current: Day | null = task.date;
  let start: Day | undefined;
  if (task.eventId !== null) {
    start = eventStart(task.eventId);
    if (start === undefined) return null;
    current = addDays(start, task.offsetDays ?? 0);
  }
  if (day < earliestRescheduleDay({ date: current, completedAt: task.completedAt }, today)) {
    throw new Error(`Cannot reschedule an Overdue Task to ${day}: the earliest day is tomorrow`);
  }
  if (day === current) return null;

  const rescheduleCount = current === null ? task.rescheduleCount : task.rescheduleCount + 1;
  if (start === undefined) return { date: day, rescheduleCount };
  return { eventId: task.eventId!, offsetDays: daysBetween(start, day), date: null, rescheduleCount };
}
