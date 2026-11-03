import { describe, expect, it } from "vitest";
import { decode, encode, receive, tick, type Timestamp } from "./hlc";

const at = (wall: number, counter = 0, node = "a"): Timestamp => ({ wall, counter, node });

describe("Hybrid logical clock", () => {
  it("encodes to text that sorts like the timestamps do", () => {
    const ordered = [at(9, 0), at(9, 1), at(9, 10), at(10, 0), at(1_700_000_000_000, 0), at(1_700_000_000_000, 99_999), at(1_700_000_000_001, 0)];

    const texts = ordered.map(encode);

    expect([...texts].sort()).toEqual(texts);
    expect(texts[0]).toBe("000000000000009-00000-a");
  });

  it("breaks a tie between devices by device id, so two devices never stamp equal", () => {
    expect(encode(at(5, 2, "device-a")) < encode(at(5, 2, "device-b"))).toBe(true);
    expect(encode(at(5, 2, "device-a"))).not.toBe(encode(at(5, 2, "device-b")));
  });

  it("decodes what it encoded, also for a device id with dashes", () => {
    const stamp = at(1_700_000_000_123, 42, "3f2b8c1e-0d4a-4a55-9c1b-2a7e6f5d4c3b");

    expect(decode(encode(stamp))).toEqual(stamp);
  });

  describe("tick", () => {
    it("follows the device clock when it moved on", () => {
      expect(tick(at(100, 7), 250)).toEqual(at(250, 0));
    });

    it("counts up within one millisecond", () => {
      expect(tick(at(250, 0), 250)).toEqual(at(250, 1));
    });

    it("never goes backwards when the device clock does", () => {
      expect(tick(at(250, 3), 100)).toEqual(at(250, 4));
    });

    it("moves to the next millisecond when the counter is full", () => {
      expect(tick(at(250, 99_998), 250)).toEqual(at(250, 99_999));
      expect(tick(at(250, 99_999), 250)).toEqual(at(251, 0));
    });

    it("keeps the device id", () => {
      expect(tick(at(1, 0, "me"), 2).node).toBe("me");
    });
  });

  describe("receive", () => {
    it("jumps ahead of a remote timestamp when the local clock and the device clock are behind", () => {
      const merged = receive(at(100, 0, "me"), at(900, 4), 200);

      expect(merged).toEqual(at(900, 5, "me"));
      expect(encode(tick(merged, 200)) > encode(at(900, 4, "other"))).toBe(true);
    });

    it("takes the device clock when it is ahead of both", () => {
      expect(receive(at(100, 5), at(200, 9), 300)).toEqual(at(300, 0));
    });

    it("counts past the larger counter when local and remote share the wall time", () => {
      expect(receive(at(500, 2), at(500, 8), 100)).toEqual(at(500, 9));
      expect(receive(at(500, 8), at(500, 2), 100)).toEqual(at(500, 9));
    });

    it("counts past the local counter when only the local wall time is the latest", () => {
      expect(receive(at(500, 2), at(400, 90), 100)).toEqual(at(500, 3));
    });

    it("counts past the remote counter when only the remote wall time is the latest", () => {
      expect(receive(at(400, 90), at(500, 2), 100)).toEqual(at(500, 3));
    });

    it("counts past the counter when the device clock equals the latest wall time", () => {
      expect(receive(at(300, 4), at(200, 9), 300)).toEqual(at(300, 5));
      expect(receive(at(100, 4), at(300, 9), 300)).toEqual(at(300, 10));
    });

    it("moves to the next millisecond when the counter is full", () => {
      expect(receive(at(500, 99_999), at(500, 0), 100)).toEqual(at(501, 0));
    });
  });
});
