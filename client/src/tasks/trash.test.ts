import { describe, expect, it } from "vitest";
import { daysLeft, isExpired, trashDays } from "./trash";

const deletedAt = "2026-10-01T09:00:00.000Z";
const after = (ms: number) => new Date(Date.parse(deletedAt) + ms);
const hour = 3_600_000;
const day = 24 * hour;

describe("the Trash", () => {
  it("keeps deleted Tasks for 30 days", () => {
    expect(trashDays).toBe(30);
  });

  describe("isExpired", () => {
    it("is false right after the deletion and for the first 30 days", () => {
      expect(isExpired(deletedAt, after(0))).toBe(false);
      expect(isExpired(deletedAt, after(day))).toBe(false);
      expect(isExpired(deletedAt, after(30 * day - 1))).toBe(false);
    });

    it("is true from exactly 30 days (30 x 24 hours) on", () => {
      expect(isExpired(deletedAt, after(30 * day))).toBe(true);
      expect(isExpired(deletedAt, after(30 * day + 1))).toBe(true);
      expect(isExpired(deletedAt, after(400 * day))).toBe(true);
    });

    it("counts 24-hour days, not calendar days: 29 days 23 hours 59 minutes is still in the Trash", () => {
      expect(isExpired(deletedAt, after(29 * day + 23 * hour + 59 * 60_000))).toBe(false);
    });

    it("is false for a deletion that lies in the future (a clock that was ahead)", () => {
      expect(isExpired(deletedAt, after(-5 * day))).toBe(false);
    });
  });

  describe("daysLeft", () => {
    it("is 30 on the day of the deletion", () => {
      expect(daysLeft(deletedAt, after(0))).toBe(30);
      expect(daysLeft(deletedAt, after(hour))).toBe(30);
    });

    it("rounds up: 29 days left until a full day has passed", () => {
      expect(daysLeft(deletedAt, after(day - 1))).toBe(30);
      expect(daysLeft(deletedAt, after(day))).toBe(29);
      expect(daysLeft(deletedAt, after(day + 1))).toBe(29);
    });

    it("is 1 for the whole last day, and never 0 while the Task is in the Trash", () => {
      expect(daysLeft(deletedAt, after(29 * day))).toBe(1);
      expect(daysLeft(deletedAt, after(30 * day - 1))).toBe(1);
    });

    it("is 0 once expired", () => {
      expect(daysLeft(deletedAt, after(30 * day))).toBe(0);
      expect(daysLeft(deletedAt, after(100 * day))).toBe(0);
    });

    it("is never more than 30, for a deletion that lies in the future", () => {
      expect(daysLeft(deletedAt, after(-5 * day))).toBe(30);
    });
  });
});
