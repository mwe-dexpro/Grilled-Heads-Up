import { describe, expect, it } from "vitest";
import { hrefOf, parseRoute, type Route } from "./routes";

describe("routes", () => {
  it.each<[string, Route]>([
    ["", { name: "today" }],
    ["#/", { name: "today" }],
    ["#/calendar", { name: "calendar" }],
    ["#/projects", { name: "projects" }],
    ["#/event/new", { name: "newEvent" }],
    ["#/event/abc-123", { name: "event", id: "abc-123" }],
    ["#/event/abc-123/edit", { name: "editEvent", id: "abc-123" }],
    ["#/task/t-9", { name: "task", id: "t-9" }],
  ])("reads %s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(parseRoute(hrefOf(route))).toEqual(route);
  });

  it("falls back to Today for anything it doesn't know", () => {
    for (const hash of [
      "#/nope",
      "#/event",
      "#/event/a/b/c",
      "#/event/a/b/edit",
      "#/event/new/edit/x",
      "#/x/new",
      "#/x/a/edit",
      "#/project/a",
      "#/a/b/c",
      "#/calendar/x",
      "#/task/",
      "#garbage",
    ]) {
      expect(parseRoute(hash)).toEqual({ name: "today" });
    }
  });

  it("writes Today as #/ and accepts a hash without the slash", () => {
    expect(hrefOf({ name: "today" })).toBe("#/");
    expect(parseRoute("#calendar")).toEqual({ name: "calendar" });
  });

  it("keeps ids with special characters intact", () => {
    expect(parseRoute(hrefOf({ name: "task", id: "a/b c" }))).toEqual({ name: "task", id: "a/b c" });
  });
});
