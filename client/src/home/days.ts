/** A calendar day without a time zone ("floating"), as `YYYY-MM-DD`. */
export type Day = string;

/** A time of day without a time zone, as `HH:MM`. */
export type TimeOfDay = string;

/** The year, the month (1–12) and the day of the month of a Day; NaN for a part that is missing. */
export function dayParts(day: Day): [year: number, month: number, date: number] {
  const [year = NaN, month = NaN, date = NaN] = day.split("-").map(Number);
  return [year, month, date];
}

/** The hours and the minutes of a time of day; NaN for a part that is missing. */
export function timeParts(time: TimeOfDay): [hours: number, minutes: number] {
  const [hours = NaN, minutes = NaN] = time.split(":").map(Number);
  return [hours, minutes];
}

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
  const [year, month, date] = dayParts(day);
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
