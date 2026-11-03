import { describe, expect, it } from "vitest";
import { createListReader } from "./listReader";

/** A read that finishes when the test says so. */
function slowRead<T>() {
  const pending: Array<(value: T | null) => void> = [];
  return {
    read: () => new Promise<T | null>((resolve) => pending.push(resolve)),
    finish: (index: number, value: T | null) => pending[index](value),
  };
}

describe("List reader", () => {
  it("hands on what a read found", async () => {
    const delivered: string[] = [];
    const reload = createListReader(async () => "lists", (value) => delivered.push(value));

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
    const reload = createListReader(async () => (ready ? "lists" : null), (value) => delivered.push(value));

    await reload();
    expect(delivered).toEqual([]);

    ready = true;
    await reload();
    expect(delivered).toEqual(["lists"]);
  });
});
