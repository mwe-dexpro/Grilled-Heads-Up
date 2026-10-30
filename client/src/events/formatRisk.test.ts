import { describe, expect, it } from "vitest";
import { translate } from "../i18n/i18n";
import type { Task } from "../tasks/taskStore";
import type { Event, EventFields } from "./event";
import { formatRiskExplanation, formatRiskStatus } from "./formatRisk";
import type { EventRisk } from "./risk";

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

describe("formatRiskStatus", () => {
  const risk = (fields: Partial<EventRisk>): EventRisk => ({ status: "none", openPreparation: 0, overdue: [], daysUntil: 5, ...fields });

  it("names At risk, says when a Critical Event starts and how much is open, and notes a passed Event", () => {
    expect(formatRiskStatus(risk({ status: "atRisk", openPreparation: 2 }), en)).toBe("At risk");
    expect(formatRiskStatus(risk({ status: "atRisk", openPreparation: 2 }), de)).toBe("Gefährdet");
    expect(formatRiskStatus(risk({ status: "critical", openPreparation: 2, daysUntil: 1 }), en)).toBe("Tomorrow · 2 open");
    expect(formatRiskStatus(risk({ status: "critical", openPreparation: 1, daysUntil: 0 }), de)).toBe("Heute · 1 offen");
    expect(formatRiskStatus(risk({ status: "passed", openPreparation: 1, daysUntil: -1 }), en)).toBe("Passed with 1 open task");
    expect(formatRiskStatus(risk({ status: "passed", openPreparation: 3, daysUntil: -2 }), de)).toBe("Vorbei, 3 Aufgaben offen");
  });

  it("says nothing when there is nothing to warn about", () => {
    expect(formatRiskStatus(risk({ openPreparation: 2 }), en)).toBeNull();
  });
});

describe("formatRiskExplanation", () => {
  /** Sunday 4 October 2026. */
  const now = new Date(2026, 9, 4, 13, 5);
  const birthday: Event = { ...timed, id: "e", createdAt: "", externalSource: null, externalId: null };
  const overdueTask = (title: string, date: string): Task => ({
    id: title,
    title,
    date,
    time: null,
    eventId: "e",
    offsetDays: -1,
    createdAt: "",
    completedAt: null,
  });
  const risk = (fields: Partial<EventRisk>): EventRisk => ({ status: "atRisk", openPreparation: 1, overdue: [], daysUntil: 8, ...fields });

  it("names the Overdue task and the Event", () => {
    const gift = risk({ overdue: [overdueTask("Gift", "2026-10-03")] });
    expect(formatRiskExplanation(birthday, gift, now, en)).toBe("Gift is 1 day overdue. Mom's birthday is in 8 days.");
    expect(formatRiskExplanation(birthday, gift, now, de)).toBe("Gift ist 1 Tag überfällig. Mom's birthday ist in 8 Tagen.");
    const older = risk({ overdue: [overdueTask("Gift", "2026-10-01")] });
    expect(formatRiskExplanation(birthday, older, now, en)).toBe("Gift is 3 days overdue. Mom's birthday is in 8 days.");
  });

  it("counts several Overdue tasks", () => {
    const two = risk({ overdue: [overdueTask("Cake", "2026-10-01"), overdueTask("Gift", "2026-10-03")] });
    expect(formatRiskExplanation(birthday, two, now, en)).toBe("2 tasks are overdue. Mom's birthday is in 8 days.");
  });

  it("counts the open Tasks of a Critical Event without Overdue ones", () => {
    const tomorrow = { ...birthday, startDate: "2026-10-05", endDate: "2026-10-05" };
    expect(formatRiskExplanation(tomorrow, risk({ status: "critical", openPreparation: 1, daysUntil: 1 }), now, en)).toBe(
      "1 task is still open. Mom's birthday is tomorrow.",
    );
    expect(formatRiskExplanation(tomorrow, risk({ status: "critical", openPreparation: 2, daysUntil: 1 }), now, de)).toBe(
      "2 Aufgaben sind noch offen. Mom's birthday ist morgen.",
    );
  });

  it("says when the Event is today", () => {
    const today = { ...birthday, startDate: "2026-10-04", endDate: "2026-10-04" };
    expect(formatRiskExplanation(today, risk({ status: "critical", openPreparation: 2, daysUntil: 0 }), now, en)).toBe(
      "2 tasks are still open. Mom's birthday is today.",
    );
  });

  it("says when the Event is already going on", () => {
    const started = { ...birthday, startDate: "2026-10-03", endDate: "2026-10-05" };
    const gift = risk({ overdue: [overdueTask("Gift", "2026-10-03")], daysUntil: -1 });
    expect(formatRiskExplanation(started, gift, now, en)).toBe("Gift is 1 day overdue. Mom's birthday is under way.");
  });

  it("explains nothing for a calm or passed Event", () => {
    expect(formatRiskExplanation(birthday, risk({ status: "none" }), now, en)).toBeNull();
    expect(formatRiskExplanation(birthday, risk({ status: "passed", daysUntil: -1 }), now, en)).toBeNull();
  });
});
