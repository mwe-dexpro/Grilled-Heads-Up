import { describe, expect, it } from "vitest";
import { createListReader } from "./listReader";
import { defined } from "../testing/defined";

/** A read that finishes when the test says so. */
function slowRead<T>() {
  const pending: ((value: T | null) => void)[] = [];
  return {
    read: () => new Promise<T | null>((resolve) => pending.push(resolve)),
    finish: (index: number, value: T | null) => defined(pending[index])(value),
  };
}

describe("List reader", () => {
  it("hands on what a read found", async () => {
    const delivered: string[] = [];
    const reload = createListReader(
      () => Promise.resolve("lists"),
      (value) => delivered.push(value),
    );

    await reload();

    expect(delivered).toEqual(["lists"]);
  });

  it("hands on only the newest read when an older one finishes later", async () => {
    const delivered: string[] = [];
    const { read, finish } = slowRead<string>();
    const reload = createListReader(read, (value) => delivered.push(value));

    const first = reload();
    const second = reload();
    finish(1, "newer");
    finish(0, "older");
    await Promise.all([first, second]);

    expect(delivered).toEqual(["newer"]);
  });

  it("hands on nothing when there was nothing to read, and reads again later", async () => {
    const delivered: string[] = [];
    let ready = false;
    const reload = createListReader(
      () => Promise.resolve(ready ? "lists" : null),
      (value) => delivered.push(value),
    );

    await reload();
    expect(delivered).toEqual([]);

    ready = true;
    await reload();
    expect(delivered).toEqual(["lists"]);
  });

  it("ends an older read that was passed over only after the newest one has handed on its result", async () => {
    const events: string[] = [];
    const { read, finish } = slowRead<string>();
    const reload = createListReader(read, (value) => events.push(`delivered ${value}`));

    const first = reload().then(() => events.push("first ended"));
    const second = reload().then(() => events.push("second ended"));
    finish(0, "older");
    // The older read has its result, and the newer one is still reading: the older call must not end yet.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual([]);
    finish(1, "newer");
    await Promise.all([first, second]);

    expect(events[0]).toBe("delivered newer");
    expect(events.sort()).toEqual(["delivered newer", "first ended", "second ended"]);
  });

  it("does not fail an older read that was passed over when the newest one fails, and fails the newest", async () => {
    const delivered: string[] = [];
    const pending: { resolve(value: string): void; reject(error: Error): void }[] = [];
    const reload = createListReader(
      () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject })),
      (value) => delivered.push(value),
    );

    const first = reload();
    const second = reload();
    const secondRejection = second.catch((error: unknown) => error);
    defined(pending[0]).resolve("older");
    defined(pending[1]).reject(new Error("newest failed"));

    await expect(first).resolves.toBeUndefined();
    expect(await secondRejection).toMatchObject({ message: "newest failed" });
    expect(delivered).toEqual([]);
  });

  it("an older read that finds nothing, passed over by one that finds something, ends after that one", async () => {
    const delivered: string[] = [];
    const { read, finish } = slowRead<string>();
    const reload = createListReader(read, (value) => delivered.push(value));

    const first = reload();
    const second = reload();
    finish(1, "newer");
    finish(0, null);
    await Promise.all([first, second]);

    expect(delivered).toEqual(["newer"]);
  });
});
