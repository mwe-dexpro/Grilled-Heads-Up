/** A calendar day without a time zone ("floating"), as `YYYY-MM-DD`. */
export type Day = string;

/** A time of day without a time zone, as `HH:MM`. */
export type TimeOfDay = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day of a moment in the device's time zone. */
export function dayOf(moment: Date): Day {
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

/** The time of day of a moment in the device's time zone. */
export function timeOf(moment: Date): TimeOfDay {
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

/** Noon on the day, in the device's time zone; noon stays on the same day across daylight-saving changes. */
export function dateAtNoon(day: Day): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

export function addDays(day: Day, days: number): Day {
  const date = dateAtNoon(day);
  date.setDate(date.getDate() + days);
  return dayOf(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((dateAtNoon(to).getTime() - dateAtNoon(from).getTime()) / 86_400_000);
}
