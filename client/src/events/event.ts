import type { Progress } from "../home/buckets";
import { addDays, dayOf, type Day, type TimeOfDay } from "../home/days";
import type { Task } from "../tasks/taskStore";

/**
 * An Event in the shape of an Outlook/iCalendar event (ADR-0002), so Outlook sync can map onto it after v1.
 *
 * - **Timed**: start and end are wall-clock times in the Event's own `timeZone` (IANA name, like iCalendar's
 *   `DTSTART;TZID=`). It shows at the matching moment on a device in another zone.
 * - **All-day**: one or more whole days, inclusive, with no time and no time zone ("floating", like
 *   iCalendar `VALUE=DATE`). It stays on its dates whatever the device's zone.
 */
export interface Event {
  id: string;
  title: string;
  allDay: boolean;
  startDate: Day;
  /** Null for an all-day Event. */
  startTime: TimeOfDay | null;
  /** Inclusive last day for an all-day Event. */
  endDate: Day;
  /** Null for an all-day Event. */
  endTime: TimeOfDay | null;
  /** Null for an all-day Event. */
  timeZone: string | null;
  location: string;
  notes: string;
  /** Where the Event was imported from (e.g. "outlook") and its id there; both null for Events created in the app. */
  externalSource: string | null;
  externalId: string | null;
  createdAt: string;
}

/** What a person enters for an Event. */
export type EventFields = Omit<Event, "id" | "createdAt" | "externalSource" | "externalId">;

export type EventProblem = "title" | "end" | "shape";

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** How many minutes `timeZone` is ahead of UTC at that moment. */
function zoneOffsetMinutes(moment: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(moment)
      .map((part) => [part.type, Number(part.value)]),
  );
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wallClockAsUtc - moment.getTime()) / 60_000);
}

/** The moment a wall-clock time in a time zone stands for. */
export function zonedInstant(day: Day, time: TimeOfDay, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, date, hours, minutes);
  // The offset at the guess can differ from the one at the real moment near a clock change, so check once more.
  const firstGuess = asUtc - zoneOffsetMinutes(new Date(asUtc), timeZone) * 60_000;
  return new Date(asUtc - zoneOffsetMinutes(new Date(firstGuess), timeZone) * 60_000);
}

function localMidnight(day: Day): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function eventStart(event: EventFields): Date {
  return event.allDay ? localMidnight(event.startDate) : zonedInstant(event.startDate, event.startTime!, event.timeZone!);
}

export function eventEnd(event: EventFields): Date {
  return event.allDay ? localMidnight(addDays(event.endDate, 1)) : zonedInstant(event.endDate, event.endTime!, event.timeZone!);
}

/** First and last day the Event covers on this device. An Event ending exactly at midnight doesn't cover the next day. */
export function eventDays(event: EventFields): { first: Day; last: Day } {
  const start = eventStart(event);
  const end = eventEnd(event);
  const lastMoment = end > start ? new Date(end.getTime() - 1) : start;
  return { first: dayOf(start), last: dayOf(lastMoment) };
}

export function validateEvent(fields: EventFields): EventProblem | null {
  if (fields.title.trim() === "") return "title";
  const timesGiven = [fields.startTime, fields.endTime, fields.timeZone].map((value) => value !== null);
  if (fields.allDay ? timesGiven.some(Boolean) : !timesGiven.every(Boolean)) return "shape";
  if (fields.allDay ? fields.endDate < fields.startDate : eventEnd(fields) < eventStart(fields)) return "end";
  return null;
}

/**
 * A Linked task's date: its Event's start date plus the Offset (ADR-0003). It counts from the date the Event
 * starts in its own time zone, so a trip abroad doesn't move the Task.
 */
export function linkedTaskDate(event: Pick<Event, "startDate">, offsetDays: number): Day {
  return addDays(event.startDate, offsetDays);
}

/** Gives every Linked task the date its Event and Offset make; a Task whose Event is missing has no date. */
export function withEventDates(tasks: Task[], events: Event[]): Task[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return tasks.map((task) => {
    if (task.eventId === null) return task;
    const event = byId.get(task.eventId);
    return { ...task, date: event ? linkedTaskDate(event, task.offsetDays ?? 0) : null };
  });
}

/** Completed ÷ all Linked tasks of the Event. */
export function eventProgress(eventId: string, tasks: Task[]): Progress {
  const linked = tasks.filter((task) => task.eventId === eventId);
  return { done: linked.filter((task) => task.completedAt !== null).length, total: linked.length };
}
