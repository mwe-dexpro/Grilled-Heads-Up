import { describe, expect, it } from "vitest";
import type { Task } from "../tasks/taskStore";
import {
  appendPosition,
  completesLastOpen,
  dropIndex,
  movedOrder,
  offersCompletion,
  orderSubtasks,
  positionAt,
  stillPending,
  subtaskCounts,
  subtaskProgress,
  subtasksOf,
  withPendingTicks,
} from "./subtasks";
import type { Subtask } from "./subtaskStore";
import { defined } from "../testing/defined";

let counter = 0;
/** A Subtask of Task "t1", open, at `position`; made in the order the tests call this unless `createdAt` says otherwise. */
function subtask(fields: Partial<Subtask> = {}): Subtask {
  counter++;
  return {
    id: `s${counter}`,
    taskId: "t1",
    title: `Subtask ${counter}`,
    position: 0,
    completedAt: null,
    createdAt: `2026-10-01T09:00:${String(counter % 60).padStart(2, "0")}.000Z`,
    deletedAt: null,
    ...fields,
  };
}

const ids = (subtasks: Subtask[]) => subtasks.map((s) => s.id);
const done = "2026-10-02T10:00:00.000Z";

describe("orderSubtasks", () => {
  it("orders by position", () => {
    const [a, b, c] = [subtask({ id: "a", position: 2 }), subtask({ id: "b", position: 0 }), subtask({ id: "c", position: 1 })];

    expect(ids(orderSubtasks([a, b, c]))).toEqual(["b", "c", "a"]);
  });

  it("puts fractional and negative positions in their place", () => {
    const list = [subtask({ id: "a", position: 1 }), subtask({ id: "b", position: 0.5 }), subtask({ id: "c", position: -1 })];

    expect(ids(orderSubtasks(list))).toEqual(["c", "b", "a"]);
  });

  it("breaks a tie of position by createdAt, then by id (two devices adding at once)", () => {
    const early = subtask({ id: "z", position: 3, createdAt: "2026-10-01T09:00:00.000Z" });
    const late = subtask({ id: "a", position: 3, createdAt: "2026-10-01T09:00:05.000Z" });
    const sameTimeA = subtask({ id: "m", position: 3, createdAt: "2026-10-01T09:00:05.000Z" });

    expect(ids(orderSubtasks([sameTimeA, late, early]))).toEqual(["z", "a", "m"]);
  });

  it("does not change the list it is given", () => {
    const list = [subtask({ id: "a", position: 1 }), subtask({ id: "b", position: 0 })];

    orderSubtasks(list);

    expect(ids(list)).toEqual(["a", "b"]);
  });
});

describe("subtasksOf", () => {
  it("is one Task's Subtasks, in order", () => {
    const list = [
      subtask({ id: "a", taskId: "t1", position: 1 }),
      subtask({ id: "x", taskId: "t2", position: 0 }),
      subtask({ id: "b", taskId: "t1", position: 0 }),
    ];

    expect(ids(subtasksOf("t1", list))).toEqual(["b", "a"]);
    expect(ids(subtasksOf("t2", list))).toEqual(["x"]);
    expect(subtasksOf("nobody", list)).toEqual([]);
  });
});

describe("subtaskProgress", () => {
  it("counts the ticked ones of the Subtasks it is given", () => {
    expect(subtaskProgress([subtask({ completedAt: done }), subtask(), subtask({ completedAt: done })])).toEqual({ done: 2, total: 3 });
  });

  it("is 0 of 0 for none", () => {
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("subtaskCounts", () => {
  it("has an entry for each Task that has Subtasks, and only for those", () => {
    const list = [subtask({ taskId: "t1", completedAt: done }), subtask({ taskId: "t1" }), subtask({ taskId: "t2", completedAt: done })];

    const counts = subtaskCounts(list);

    expect([...counts.keys()].sort()).toEqual(["t1", "t2"]);
    expect(counts.get("t1")).toEqual({ done: 1, total: 2 });
    expect(counts.get("t2")).toEqual({ done: 1, total: 1 });
    expect(counts.get("t3")).toBeUndefined();
  });

  it("is empty when there are no Subtasks", () => {
    expect(subtaskCounts([]).size).toBe(0);
  });
});

describe("appendPosition", () => {
  it("is 0 for the first Subtask", () => {
    expect(appendPosition([])).toBe(0);
  });

  it("is one after the highest position, whatever the order the list is in", () => {
    expect(appendPosition([subtask({ position: 4 }), subtask({ position: 2 })])).toBe(5);
    expect(appendPosition([subtask({ position: 0.5 })])).toBe(1.5);
  });

  it("works below zero", () => {
    expect(appendPosition([subtask({ position: -3 }), subtask({ position: -2 })])).toBe(-1);
  });
});

describe("positionAt and movedOrder", () => {
  const abcd = (): [Subtask, Subtask, Subtask, Subtask] => [
    subtask({ id: "a", position: 0 }),
    subtask({ id: "b", position: 1 }),
    subtask({ id: "c", position: 2 }),
    subtask({ id: "d", position: 3 }),
  ];

  it("puts a Subtask between its new neighbours, halfway", () => {
    expect(positionAt(abcd(), "d", 1)).toBe(0.5);
    expect(positionAt(abcd(), "a", 2)).toBe(2.5);
    expect(positionAt(abcd(), "b", 3)).toBe(4);
  });

  it("puts it below the first when it goes to the top", () => {
    expect(positionAt(abcd(), "c", 0)).toBe(-1);
  });

  it("puts it above the last when it goes to the bottom", () => {
    expect(positionAt(abcd(), "a", 3)).toBe(4);
  });

  it("takes the list in any order", () => {
    const [a, b, c, d] = abcd();

    expect(positionAt([d, b, a, c], "d", 1)).toBe(0.5);
  });

  it("needs no write for the index it is at", () => {
    expect(positionAt(abcd(), "b", 1)).toBeNull();
    expect(positionAt(abcd(), "a", 0)).toBeNull();
    expect(positionAt(abcd(), "d", 3)).toBeNull();
  });

  it("clamps an index outside the list, and needs no write when that is where it is", () => {
    expect(positionAt(abcd(), "a", 99)).toBe(4);
    expect(positionAt(abcd(), "d", 99)).toBeNull();
    expect(positionAt(abcd(), "c", -5)).toBe(-1);
    expect(positionAt(abcd(), "a", -5)).toBeNull();
  });

  it("needs no write for the only Subtask", () => {
    expect(positionAt([subtask({ id: "a" })], "a", 3)).toBeNull();
  });

  it("is null for a Subtask that is not among the siblings", () => {
    expect(positionAt(abcd(), "nobody", 1)).toBeNull();
  });

  it("says null when the neighbours leave no position between them (equal positions), so the store renumbers", () => {
    const tied = [subtask({ id: "a", position: 1 }), subtask({ id: "b", position: 1 }), subtask({ id: "c", position: 5 })];

    expect(positionAt(tied, "c", 1)).toBeNull();
    expect(ids(movedOrder(tied, "c", 1))).toEqual(["a", "c", "b"]);
  });

  it("says null when the neighbours are adjacent floats", () => {
    const next = 1 + Number.EPSILON;
    const close = [subtask({ id: "a", position: 1 }), subtask({ id: "b", position: next }), subtask({ id: "c", position: 9 })];

    expect(positionAt(close, "c", 1)).toBeNull();
    expect(positionAt(close, "c", 0)).toBe(0);
  });

  it("says null when there is no representable position above the last or below the first", () => {
    const big = [subtask({ id: "a", position: 1e20 }), subtask({ id: "b", position: 1e20 })];

    expect(positionAt(big, "a", 1)).toBeNull();
    expect(positionAt(big, "b", 0)).toBeNull();
  });

  it("leaves a lone move to a tied neighbour at the top or bottom well defined", () => {
    const tied = [subtask({ id: "a", position: 2 }), subtask({ id: "b", position: 2 })];

    expect(positionAt(tied, "b", 0)).toBe(1);
    expect(positionAt(tied, "a", 1)).toBe(3);
  });

  it("gives a position that really sorts the Subtask where it was sent", () => {
    for (const [id, to] of [
      ["d", 0],
      ["a", 3],
      ["b", 2],
      ["c", 1],
      ["d", 2],
    ] as const) {
      const list = abcd();
      const position = defined(positionAt(list, id, to), "position");
      const moved = list.map((s) => (s.id === id ? { ...s, position } : s));

      expect(ids(orderSubtasks(moved))).toEqual(ids(movedOrder(list, id, to)));
      expect(ids(orderSubtasks(moved)).indexOf(id)).toBe(to);
    }
  });

  describe("movedOrder", () => {
    it("is the order after the move, with the index clamped", () => {
      expect(ids(movedOrder(abcd(), "d", 0))).toEqual(["d", "a", "b", "c"]);
      expect(ids(movedOrder(abcd(), "a", 99))).toEqual(["b", "c", "d", "a"]);
      expect(ids(movedOrder(abcd(), "c", -1))).toEqual(["c", "a", "b", "d"]);
      expect(ids(movedOrder(abcd(), "b", 1))).toEqual(["a", "b", "c", "d"]);
    });

    it("leaves the order as it is for a Subtask that is not there", () => {
      expect(ids(movedOrder(abcd(), "nobody", 0))).toEqual(["a", "b", "c", "d"]);
    });
  });
});

describe("completesLastOpen", () => {
  it("is true when the ticked Subtask is the last open one", () => {
    const list = [subtask({ id: "a", completedAt: done }), subtask({ id: "b" })];

    expect(completesLastOpen(list, "b")).toBe(true);
  });

  it("is true for a Task's only Subtask", () => {
    expect(completesLastOpen([subtask({ id: "a" })], "a")).toBe(true);
  });

  it("is false while another one is still open", () => {
    const list = [subtask({ id: "a" }), subtask({ id: "b" }), subtask({ id: "c", completedAt: done })];

    expect(completesLastOpen(list, "b")).toBe(false);
  });

  it("is false for one that is ticked already (unticking, or a second tick, completes nothing)", () => {
    const list = [subtask({ id: "a", completedAt: done }), subtask({ id: "b", completedAt: done })];

    expect(completesLastOpen(list, "b")).toBe(false);
  });

  it("is false for a Subtask that is not in the list", () => {
    expect(completesLastOpen([subtask({ id: "a", completedAt: done })], "nobody")).toBe(false);
    expect(completesLastOpen([], "nobody")).toBe(false);
  });
});

describe("offersCompletion", () => {
  const task = (fields: Partial<Task> = {}): Task => ({
    id: "t1",
    title: "Pack",
    date: null,
    time: null,
    eventId: null,
    offsetDays: null,
    listId: null,
    tagIds: [],
    createdAt: "2026-10-01T09:00:00.000Z",
    completedAt: null,
    rescheduleCount: 0,
    deletedAt: null,
    ...fields,
  });
  const lastOpen = () => [subtask({ id: "a", completedAt: done }), subtask({ id: "b" })];

  it("offers it for the last open Subtask of an open Task", () => {
    expect(offersCompletion(task(), lastOpen(), "b")).toBe(true);
  });

  it("offers it for the only Subtask of an open Task", () => {
    expect(offersCompletion(task(), [subtask({ id: "a" })], "a")).toBe(true);
  });

  it("offers nothing while Subtasks are open", () => {
    expect(offersCompletion(task(), [subtask({ id: "a" }), subtask({ id: "b" })], "a")).toBe(false);
  });

  it("offers nothing for a Completed Task", () => {
    expect(offersCompletion(task({ completedAt: done }), lastOpen(), "b")).toBe(false);
  });

  it("offers nothing for unticking, or for a Subtask that is ticked already", () => {
    expect(offersCompletion(task(), lastOpen(), "a")).toBe(false);
  });
});

describe("dropIndex", () => {
  // Three rows, 50px tall, from y = 100: centres 125, 175, 225.
  const centres = [125, 175, 225];

  it("is the index the dragged row ends up at: the number of other rows whose centre is above the pointer", () => {
    expect(dropIndex(centres, 0, 0)).toBe(0);
    expect(dropIndex(centres, 0, 180)).toBe(1);
    expect(dropIndex(centres, 0, 260)).toBe(2);
    expect(dropIndex(centres, 2, 100)).toBe(0);
    expect(dropIndex(centres, 2, 150)).toBe(1);
    expect(dropIndex(centres, 1, 100)).toBe(0);
    expect(dropIndex(centres, 1, 300)).toBe(2);
  });

  it("stays where it is while the pointer is over its own row", () => {
    expect(dropIndex(centres, 1, 175)).toBe(1);
    expect(dropIndex(centres, 1, 160)).toBe(1);
    expect(dropIndex(centres, 1, 190)).toBe(1);
  });

  it("changes place at the middle of the row it passes", () => {
    expect(dropIndex(centres, 0, 175)).toBe(0);
    expect(dropIndex(centres, 0, 176)).toBe(1);
    expect(dropIndex(centres, 2, 176)).toBe(2);
    expect(dropIndex(centres, 2, 175)).toBe(1);
  });

  it("is 0 for a lone row", () => {
    expect(dropIndex([125], 0, 900)).toBe(0);
  });
});

describe("withPendingTicks", () => {
  const list = (): [Subtask, Subtask, Subtask] => [subtask({ id: "a", completedAt: done }), subtask({ id: "b" }), subtask({ id: "c" })];

  it("shows a Subtask as ticked or open as it was asked to be, and the others as they are", () => {
    const shown = withPendingTicks(
      list(),
      new Map([
        ["b", true],
        ["a", false],
      ]),
    );

    expect(shown.map((s) => s.completedAt !== null)).toEqual([false, true, false]);
  });

  it("returns a Subtask that already is as asked unchanged, with its real time", () => {
    const [a, b] = list();

    const shown = withPendingTicks(
      [a, b],
      new Map([
        ["a", true],
        ["b", false],
      ]),
    );

    expect(shown[0]).toBe(a);
    expect(shown[1]).toBe(b);
    expect(defined(shown[0]).completedAt).toBe(done);
  });

  it("changes nothing without pending ticks, and does not change the Subtasks it was given", () => {
    const given = list();

    expect(withPendingTicks(given, new Map())).toEqual(given);
    withPendingTicks(given, new Map([["b", true]]));
    expect(defined(given[1]).completedAt).toBeNull();
  });

  it("makes the decisions of a second tick that comes before the first is shown: the last open one then offers the Task", () => {
    const task: Task = {
      id: "t1",
      title: "Pack",
      date: null,
      time: null,
      eventId: null,
      offsetDays: null,
      listId: null,
      tagIds: [],
      createdAt: "2026-10-01T09:00:00.000Z",
      completedAt: null,
      rescheduleCount: 0,
      deletedAt: null,
    };
    const shown = [subtask({ id: "x" }), subtask({ id: "y" })];

    // Neither tick is shown yet; "x" was asked for, so "y" is the last open one.
    expect(offersCompletion(task, shown, "y")).toBe(false);
    expect(offersCompletion(task, withPendingTicks(shown, new Map([["x", true]])), "y")).toBe(true);
  });
});

describe("stillPending", () => {
  it("keeps the ticks that are not shown yet", () => {
    const shown = [subtask({ id: "a" }), subtask({ id: "b", completedAt: done })];

    const left = stillPending(
      shown,
      new Map([
        ["a", true],
        ["b", false],
      ]),
    );

    expect([...left]).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("drops a tick that is shown, and one whose Subtask is gone", () => {
    const shown = [subtask({ id: "a", completedAt: done }), subtask({ id: "b" })];

    const left = stillPending(
      shown,
      new Map([
        ["a", true],
        ["b", false],
        ["gone", true],
      ]),
    );

    expect(left.size).toBe(0);
  });

  it("does not change the map it was given", () => {
    const pending = new Map([["a", true]]);

    stillPending([subtask({ id: "a", completedAt: done })], pending);

    expect([...pending]).toEqual([["a", true]]);
  });
});
