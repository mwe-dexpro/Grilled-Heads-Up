import { describe, expect, it } from "vitest";
import { availableActions } from "./availableActions";

const onDevice = new Set(["e1"]);

describe("availableActions", () => {
  it("offers Reschedule, Complete and Delete for an open Task", () => {
    expect(availableActions({ eventId: null, completedAt: null }, onDevice)).toEqual(["reschedule", "complete", "delete"]);
  });

  it("offers a Linked task the same, when its Event is on this device", () => {
    expect(availableActions({ eventId: "e1", completedAt: null }, onDevice)).toEqual(["reschedule", "complete", "delete"]);
  });

  it("offers a Linked task whose Event is not on this device no Reschedule: its date can't be worked out", () => {
    expect(availableActions({ eventId: "e2", completedAt: null }, onDevice)).toEqual(["complete", "delete"]);
  });

  it("offers a Completed Task Delete only", () => {
    expect(availableActions({ eventId: null, completedAt: "2026-10-04T08:00:00.000Z" }, onDevice)).toEqual(["delete"]);
    expect(availableActions({ eventId: "e1", completedAt: "2026-10-04T08:00:00.000Z" }, onDevice)).toEqual(["delete"]);
  });
});
