import { describe, expect, it } from "vitest";
import { todayFrom } from "./today.js";

const noon = new Date("2026-11-07T12:00:00Z");

describe("todayFrom", () => {
  it("is the day of the clock, in UTC, as YYYY-MM-DD", () => {
    expect(todayFrom([], noon)).toBe("2026-11-07");
    expect(todayFrom([], new Date("2026-11-07T23:59:59Z"))).toBe("2026-11-07");
    expect(todayFrom([], new Date("2026-11-08T00:00:00Z"))).toBe("2026-11-08");
  });

  it("is the day an argument names, so that a test can look at a later day", () => {
    expect(todayFrom(["--today=2030-01-02"], noon)).toBe("2030-01-02");
    expect(todayFrom(["other", "--today=2030-01-02", "more"], noon)).toBe("2030-01-02");
  });

  it("refuses a day that is no day, rather than checking against the wrong one", () => {
    expect(() => todayFrom(["--today=tomorrow"], noon)).toThrow('"tomorrow" is not a day as YYYY-MM-DD');
    expect(() => todayFrom(["--today=2026-02-30"], noon)).toThrow('"2026-02-30" is not a day as YYYY-MM-DD');
    for (const text of ["2026-11-071", "x2026-11-07", "2026-11-07 ", "2026-1-7", "07.11.2026", "2026-11-07T10:00:00Z"]) {
      expect(() => todayFrom([`--today=${text}`], noon), text).toThrow(`"${text}" is not a day as YYYY-MM-DD`);
    }
  });
});
