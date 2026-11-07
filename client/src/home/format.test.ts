import { describe, expect, it } from "vitest";
import { translate } from "../i18n/i18n";
import { formatLongDay, formatMonthDay, formatShortDay, formatSubtaskCount, formatTime, formatWeekday } from "./format";

describe("date and time formats follow the selected language", () => {
  it("formats days", () => {
    expect(formatLongDay("2026-10-04", "en")).toBe("Sunday, Oct 4");
    expect(formatLongDay("2026-10-04", "de")).toBe("Sonntag, 4. Okt.");
    expect(formatShortDay("2026-10-05", "en")).toBe("Mon, Oct 5");
    expect(formatShortDay("2026-10-05", "de")).toBe("Mo., 5. Okt.");
    expect(formatWeekday("2026-10-06", "en")).toBe("Tue");
    expect(formatWeekday("2026-10-06", "de")).toBe("Di");
    expect(formatMonthDay("2026-10-12", "en")).toBe("Oct 12");
    expect(formatMonthDay("2026-10-12", "de")).toBe("12. Okt.");
  });

  it("formats times", () => {
    expect(formatTime("13:00", "en")).toBe("1:00 PM");
    expect(formatTime("09:05", "en")).toBe("9:05 AM");
    expect(formatTime("13:00", "de")).toBe("13:00");
  });
});

describe("the count of a Task's Subtasks", () => {
  const en = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("en", key, params);
  const de = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate("de", key, params);

  it.each([
    [{ done: 3, total: 5 }, "3/5", "3 of 5 subtasks done", "3 von 5 Unteraufgaben erledigt"],
    [{ done: 0, total: 3 }, "0/3", "0 of 3 subtasks done", "0 von 3 Unteraufgaben erledigt"],
    [{ done: 5, total: 5 }, "5/5", "5 of 5 subtasks done", "5 von 5 Unteraufgaben erledigt"],
    [{ done: 1, total: 1 }, "1/1", "1 of 1 subtask done", "1 von 1 Unteraufgabe erledigt"],
    [{ done: 0, total: 1 }, "0/1", "0 of 1 subtask done", "0 von 1 Unteraufgabe erledigt"],
  ])("says %j as '%s' with the words '%s' / '%s'", (progress, short, long, german) => {
    expect(formatSubtaskCount(progress, en)).toEqual({ short, long });
    expect(formatSubtaskCount(progress, de)).toEqual({ short, long: german });
  });
});
