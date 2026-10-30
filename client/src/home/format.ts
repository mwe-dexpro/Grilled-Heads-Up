import type { Language } from "../i18n/i18n";
import { dateAtNoon, type Day, type TimeOfDay } from "./days";

/** "Saturday, Oct 4" / "Samstag, 4. Okt." */
export function formatLongDay(day: Day, language: Language): string {
  return new Intl.DateTimeFormat(language, { weekday: "long", month: "short", day: "numeric" }).format(
    dateAtNoon(day),
  );
}

/** "Sun, Oct 5" / "So., 5. Okt." */
export function formatShortDay(day: Day, language: Language): string {
  return new Intl.DateTimeFormat(language, { weekday: "short", month: "short", day: "numeric" }).format(
    dateAtNoon(day),
  );
}

/** "Oct 12" / "12. Okt." */
export function formatMonthDay(day: Day, language: Language): string {
  return new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(dateAtNoon(day));
}

/** "Mon" / "Mo." */
export function formatWeekday(day: Day, language: Language): string {
  return new Intl.DateTimeFormat(language, { weekday: "short" }).format(dateAtNoon(day));
}

/** "1:00 PM" / "13:00" */
export function formatTime(time: TimeOfDay, language: Language): string {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit" }).format(date);
}
