import { describe, expect, it } from "vitest";
import { daysBetween, formatLongDay, formatShortDay, formatTime, formatWeekday } from "./format";

describe("date and time formats follow the selected language", () => {
  it("formats days", () => {
    expect(formatLongDay("2026-10-04", "en")).toBe("Sunday, Oct 4");
    expect(formatLongDay("2026-10-04", "de")).toBe("Sonntag, 4. Okt.");
    expect(formatShortDay("2026-10-05", "en")).toBe("Mon, Oct 5");
    expect(formatShortDay("2026-10-05", "de")).toBe("Mo., 5. Okt.");
    expect(formatWeekday("2026-10-06", "en")).toBe("Tue");
    expect(formatWeekday("2026-10-06", "de")).toBe("Di");
  });

  it("formats times", () => {
    expect(formatTime("13:00", "en")).toBe("1:00 PM");
    expect(formatTime("09:05", "en")).toBe("9:05 AM");
    expect(formatTime("13:00", "de")).toBe("13:00");
  });

  it("counts whole days, also across a daylight-saving change", () => {
    expect(daysBetween("2026-10-01", "2026-10-04")).toBe(3);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-10-04", "2026-10-04")).toBe(0);
  });
});
