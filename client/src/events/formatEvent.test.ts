import { describe, expect, it } from "vitest";
import { translate } from "../i18n/i18n";
import type { Event, EventFields } from "./event";
import { formatEventTime, formatEventWhen, formatOffset, formatRelativeDay, inOtherTimeZone } from "./formatEvent";

const en = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("en", key, params);
const de = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("de", key, params);

const timed: EventFields = {
  title: "Mom's birthday",
  allDay: false,
  startDate: "2026-10-12",
  startTime: "12:30",
  endDate: "2026-10-12",
  endTime: "15:00",
  timeZone: "Europe/Berlin",
  location: "",
  notes: "",
};

describe("formatOffset", () => {
  it.each([
    [-7, "7 days before", "7 Tage vorher"],
    [-1, "1 day before", "1 Tag vorher"],
    [0, "on the day", "am Tag"],
    [1, "1 day after", "1 Tag danach"],
    [2, "2 days after", "2 Tage danach"],
  ])("says %i days as '%s'", (days, english, german) => {
    expect(formatOffset(days, en)).toBe(english);
    expect(formatOffset(days, de)).toBe(german);
  });
});

describe("formatRelativeDay", () => {
  it.each([
    ["2026-10-04", "today"],
    ["2026-10-05", "tomorrow"],
    ["2026-10-12", "in 8 days"],
    ["2026-10-03", "yesterday"],
    ["2026-10-01", "3 days ago"],
  ])("says %s as '%s' on Oct 4", (day, text) => {
    expect(formatRelativeDay(day, "2026-10-04", en)).toBe(text);
  });
});

describe("formatEventWhen", () => {
  it("shows a timed Event on one day with its start time", () => {
    expect(formatEventWhen(timed, "en")).toBe("Monday, Oct 12 · 12:30 PM");
    expect(formatEventWhen(timed, "de")).toBe("Montag, 12. Okt. · 12:30");
  });

  it("shows an Event in another time zone at this device's time (Europe/Berlin)", () => {
    expect(formatEventWhen({ ...timed, timeZone: "America/New_York" }, "en")).toBe("Monday, Oct 12 · 6:30 PM");
  });

  it("shows the range of a multi-day Event", () => {
    const weekend = { ...timed, allDay: true, startDate: "2026-10-17", endDate: "2026-10-19", startTime: null, endTime: null, timeZone: null };
    expect(formatEventWhen(weekend, "en")).toBe("Sat, Oct 17 – Mon, Oct 19");
    expect(formatEventWhen({ ...weekend, endDate: "2026-10-17" }, "en")).toBe("Saturday, Oct 17");
    expect(formatEventWhen({ ...timed, startTime: "18:00", endDate: "2026-10-14", endTime: "10:00" }, "en")).toBe(
      "Mon, Oct 12 · 6:00 PM – Wed, Oct 14 · 10:00 AM",
    );
  });

  it("knows when an Event's times are in another zone than the device's", () => {
    expect(inOtherTimeZone(timed)).toBe(false);
    expect(inOtherTimeZone({ ...timed, timeZone: "America/New_York" })).toBe(true);
    expect(inOtherTimeZone({ ...timed, allDay: true, timeZone: null })).toBe(false);
  });
});

describe("formatEventTime", () => {
  const event = (fields: Partial<EventFields>): Event => ({
    ...timed,
    ...fields,
    id: "e",
    createdAt: "",
    externalSource: null,
    externalId: null,
  });

  it("shows the start time on this device, or All day", () => {
    expect(formatEventTime(event({}), "en", en)).toBe("12:30 PM");
    expect(formatEventTime(event({ timeZone: "America/New_York" }), "de", de)).toBe("18:30");
    expect(formatEventTime(event({ allDay: true, startTime: null, endTime: null, timeZone: null }), "de", de)).toBe("Ganztägig");
  });
});
