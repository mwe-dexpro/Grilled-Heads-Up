import { describe, expect, it } from "vitest";
import { canGoBack, depthAfterMove, depthOf } from "./historyDepth";

describe("depthOf", () => {
  it("reads the depth a history entry was marked with", () => {
    expect(depthOf({ depth: 3 })).toBe(3);
    expect(depthOf({ depth: 0 })).toBe(0);
  });

  it("is undefined for an entry that was not marked", () => {
    for (const state of [null, undefined, 4, "x", {}, { depth: "2" }, { depth: null }]) expect(depthOf(state)).toBeUndefined();
  });
});

describe("depthAfterMove", () => {
  it("is the depth of a marked entry, whatever came before (Back, Forward, a reload)", () => {
    expect(depthAfterMove({ stored: 1, current: 4, replacing: false })).toBe(1);
    expect(depthAfterMove({ stored: 0, current: 2, replacing: true })).toBe(0);
  });

  it("is one deeper for a new entry", () => {
    expect(depthAfterMove({ stored: undefined, current: 0, replacing: false })).toBe(1);
    expect(depthAfterMove({ stored: undefined, current: 2, replacing: false })).toBe(3);
  });

  it("is as deep as the entry it replaces for a replacing one", () => {
    expect(depthAfterMove({ stored: undefined, current: 0, replacing: true })).toBe(0);
    expect(depthAfterMove({ stored: undefined, current: 2, replacing: true })).toBe(2);
  });
});

describe("canGoBack", () => {
  it("is false where the app was opened, as there may be another site before it in the tab", () => {
    expect(canGoBack(0)).toBe(false);
    expect(canGoBack(1)).toBe(true);
    expect(canGoBack(5)).toBe(true);
  });
});
