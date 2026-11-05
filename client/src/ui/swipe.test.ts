import { describe, expect, it } from "vitest";
import { actionWidth, canStartSwipe, dragOffset, edgeZone, settle } from "./swipe";

const width = 412;
const actionsWidth = 3 * actionWidth;

describe("swipe rules", () => {
  it("uses the design's 78 px per action, and 24 px for the edge zone", () => {
    expect(actionWidth).toBe(78);
    expect(edgeZone).toBe(24);
  });

  describe("canStartSwipe", () => {
    it("allows a swipe that starts away from both edges", () => {
      expect(canStartSwipe(200, width)).toBe(true);
    });

    it("ignores a swipe that starts in the left edge zone, up to its boundary", () => {
      expect(canStartSwipe(0, width)).toBe(false);
      expect(canStartSwipe(edgeZone - 1, width)).toBe(false);
      expect(canStartSwipe(edgeZone, width)).toBe(true);
    });

    it("ignores a swipe that starts in the right edge zone, from its boundary", () => {
      expect(canStartSwipe(width - edgeZone, width)).toBe(true);
      expect(canStartSwipe(width - edgeZone + 1, width)).toBe(false);
      expect(canStartSwipe(width, width)).toBe(false);
    });
  });

  describe("dragOffset", () => {
    it("follows a leftward drag", () => {
      expect(dragOffset(-40, 2, actionsWidth)).toBe(-40);
    });

    it("stays at 0 until the horizontal move exceeds the vertical one", () => {
      expect(dragOffset(-10, 30, actionsWidth)).toBe(0);
      expect(dragOffset(-30, 30, actionsWidth)).toBe(0);
      expect(dragOffset(-31, 30, actionsWidth)).toBe(-31);
      expect(dragOffset(0, 0, actionsWidth)).toBe(0);
    });

    it("counts a drag up or down the same", () => {
      expect(dragOffset(-40, -10, actionsWidth)).toBe(-40);
      expect(dragOffset(-10, -40, actionsWidth)).toBe(0);
    });

    it("never goes past the revealed actions", () => {
      expect(dragOffset(-actionsWidth, 0, actionsWidth)).toBe(-actionsWidth);
      expect(dragOffset(-500, 0, actionsWidth)).toBe(-actionsWidth);
    });

    it("never moves the row to the right of where it rests", () => {
      expect(dragOffset(60, 0, actionsWidth)).toBe(0);
    });

    it("moves on from an open row: a drag to the right closes it, one to the left stays open", () => {
      expect(dragOffset(100, 0, actionsWidth, -actionsWidth)).toBe(-actionsWidth + 100);
      expect(dragOffset(-50, 0, actionsWidth, -actionsWidth)).toBe(-actionsWidth);
      expect(dragOffset(500, 0, actionsWidth, -actionsWidth)).toBe(0);
    });

    it("leaves an open row where it is for a mostly vertical drag", () => {
      expect(dragOffset(20, 60, actionsWidth, -actionsWidth)).toBe(-actionsWidth);
    });
  });

  describe("settle", () => {
    it("opens when dragged left more than a third of the actions' width", () => {
      expect(settle(-actionsWidth / 3 - 1, actionsWidth)).toBe(-actionsWidth);
      expect(settle(-actionsWidth, actionsWidth)).toBe(-actionsWidth);
    });

    it("closes at a third or less", () => {
      expect(settle(-actionsWidth / 3, actionsWidth)).toBe(0);
      expect(settle(-5, actionsWidth)).toBe(0);
      expect(settle(0, actionsWidth)).toBe(0);
    });

    it("scales with the number of actions", () => {
      expect(settle(-60, 2 * actionWidth)).toBe(-2 * actionWidth);
      expect(settle(-60, 3 * actionWidth)).toBe(0);
    });
  });
});
