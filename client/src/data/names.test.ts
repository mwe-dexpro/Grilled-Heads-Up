import { describe, expect, it } from "vitest";
import { byName, sameName } from "./names";

const named = (name: string, createdAt = "") => ({ name, createdAt });

describe("Sorting by name", () => {
  it("goes by the alphabet, whatever the case, with an umlaut next to its letter", () => {
    const names = ["zebra", "Ärger", "apple", "Banana", "banana"].map((name) => named(name));

    expect(names.sort(byName).map((n) => n.name)).toEqual(["apple", "Ärger", "Banana", "banana", "zebra"]);
  });

  it("puts equal names in the order they were created", () => {
    const names = [named("Same", "2026-10-03"), named("same", "2026-10-01"), named("SAME", "2026-10-02")];

    expect(names.sort(byName).map((n) => n.createdAt)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
});

describe("The same name", () => {
  it("ignores case and the spaces around it, also for umlauts", () => {
    expect(sameName("Errand", " errand ")).toBe(true);
    expect(sameName("ÄRGER", "ärger")).toBe(true);
  });

  it("does not ignore accents or other letters", () => {
    expect(sameName("Cafe", "Café")).toBe(false);
    expect(sameName("Cafe", "Cafes")).toBe(false);
    expect(sameName("a", "b")).toBe(false);
  });

  it("takes a letter with its accent written as one character or as two as the same", () => {
    expect(sameName("Café", "Café")).toBe(true);
  });
});
