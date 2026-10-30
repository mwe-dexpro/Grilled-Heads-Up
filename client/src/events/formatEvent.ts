import { daysBetween, timeOf, type Day } from "../home/days";
import { formatLongDay, formatShortDay, formatTime } from "../home/format";
import type { Language, TranslationKey } from "../i18n/i18n";
import { deviceTimeZone, eventDays, eventEnd, eventStart, type Event, type EventFields } from "./event";

type Translate = (key: TranslationKey, params?: Record<string, string>) => string;

/** "7 days before", "on the day", "2 days after". */
export function formatOffset(offsetDays: number, t: Translate): string {
  const count = String(Math.abs(offsetDays));
  if (offsetDays === 0) return t("offset.onTheDay");
  if (offsetDays < 0) return offsetDays === -1 ? t("offset.beforeOne") : t("offset.beforeMany", { count });
  return offsetDays === 1 ? t("offset.afterOne") : t("offset.afterMany", { count });
}

/** "today", "tomorrow", "in 8 days", "yesterday", "3 days ago". */
export function formatRelativeDay(day: Day, today: Day, t: Translate): string {
  const days = daysBetween(today, day);
  if (days === 0) return t("relative.today");
  if (days === 1) return t("relative.tomorrow");
  if (days === -1) return t("relative.yesterday");
  const count = String(Math.abs(days));
  return days > 0 ? t("relative.inDays", { count }) : t("relative.daysAgo", { count });
}

/**
 * When the Event happens, as this device shows it: "Sunday, Oct 12 · 12:30 PM", "Fri, Oct 17 – Sun, Oct 19",
 * "Mon, Oct 12 · 6:00 PM – Wed, Oct 14 · 10:00 AM".
 */
export function formatEventWhen(event: EventFields, language: Language): string {
  const { first, last } = eventDays(event);
  if (event.allDay) {
    return first === last ? formatLongDay(first, language) : `${formatShortDay(first, language)} – ${formatShortDay(last, language)}`;
  }
  const startTime = formatTime(timeOf(eventStart(event)), language);
  const endTime = formatTime(timeOf(eventEnd(event)), language);
  if (first === last) return `${formatLongDay(first, language)} · ${startTime}`;
  return `${formatShortDay(first, language)} · ${startTime} – ${formatShortDay(last, language)} · ${endTime}`;
}

/** The time a timed Event starts on this device, or "All day". */
export function formatEventTime(event: Event, language: Language, t: Translate): string {
  return event.allDay ? t("event.allDay") : formatTime(timeOf(eventStart(event)), language);
}

/** Whether the Event's times are in another zone than the device's, so the screen should say which. */
export function inOtherTimeZone(event: EventFields): boolean {
  return !event.allDay && event.timeZone !== deviceTimeZone();
}

