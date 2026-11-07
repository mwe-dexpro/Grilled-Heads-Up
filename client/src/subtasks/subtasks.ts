import type { Progress } from "../home/buckets";
import type { Task } from "../tasks/taskStore";
import type { Subtask } from "./subtaskStore";

/** The rules of Subtasks: order, counts, where a moved one goes and when to offer Completing the Task. No IndexedDB, no React. */

/** By `position`; two with the same one (two devices adding at once) by `createdAt`, then `id`, so every device agrees. */
export function orderSubtasks(subtasks: Subtask[]): Subtask[] {
  return [...subtasks].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** One Task's Subtasks, in order. */
export function subtasksOf(taskId: string, subtasks: Subtask[]): Subtask[] {
  return orderSubtasks(subtasks.filter((subtask) => subtask.taskId === taskId));
}

/**
 * How many of one Task's Subtasks are ticked. It has the shape of `Progress`, but it is not Progress in the sense of
 * CONTEXT.md: Progress counts whole Tasks, never Subtasks.
 */
export function subtaskProgress(subtasks: Subtask[]): Progress {
  return { done: subtasks.filter((subtask) => subtask.completedAt !== null).length, total: subtasks.length };
}

/** The count of each Task that has Subtasks; a Task without any has no entry. */
export function subtaskCounts(subtasks: Subtask[]): Map<string, Progress> {
  const byTask = new Map<string, Subtask[]>();
  for (const subtask of subtasks) byTask.set(subtask.taskId, [...(byTask.get(subtask.taskId) ?? []), subtask]);
  return new Map([...byTask].map(([taskId, own]) => [taskId, subtaskProgress(own)]));
}

/** The position after the last of a Task's Subtasks (0 for the first). */
export function appendPosition(siblings: Subtask[]): number {
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((subtask) => subtask.position)) + 1;
}

/** `siblings` (one Task's Subtasks) in the order they have after `movingId` moves to `toIndex`, which is clamped to the list. */
export function movedOrder(siblings: Subtask[], movingId: string, toIndex: number): Subtask[] {
  const ordered = orderSubtasks(siblings);
  const moving = ordered.find((subtask) => subtask.id === movingId);
  if (!moving) return ordered;
  const others = ordered.filter((subtask) => subtask !== moving);
  const at = Math.min(Math.max(toIndex, 0), others.length);
  return [...others.slice(0, at), moving, ...others.slice(at)];
}

/**
 * The position that puts `movingId` at `toIndex` among its ordered siblings: halfway between its new neighbours,
 * below the first or above the last. Null when nothing needs writing (it is there already, or it is not among the
 * siblings) and also when no position fits between the neighbours (they are equal or next to each other as numbers):
 * the caller then renumbers the siblings (see `movedOrder`).
 */
export function positionAt(siblings: Subtask[], movingId: string, toIndex: number): number | null {
  const ordered = orderSubtasks(siblings);
  const from = ordered.findIndex((subtask) => subtask.id === movingId);
  if (from === -1) return null;
  const others = ordered.filter((subtask) => subtask.id !== movingId);
  const at = Math.min(Math.max(toIndex, 0), others.length);
  if (at === from) return null;

  const before = others[at - 1]?.position;
  const after = others[at]?.position;
  const position = before === undefined ? (after ?? 0) - 1 : after === undefined ? before + 1 : (before + after) / 2;
  const fits = (before === undefined || position > before) && (after === undefined || position < after);
  return fits ? position : null;
}

/**
 * Whether ticking `tickedId` would leave none of the Task's (live) Subtasks open: it is open now and every other one
 * is ticked. Asked before the tick, with the Subtasks the person sees.
 */
export function completesLastOpen(subtasks: Subtask[], tickedId: string): boolean {
  const ticked = subtasks.find((subtask) => subtask.id === tickedId);
  return ticked?.completedAt === null && subtasks.every((subtask) => subtask.id === tickedId || subtask.completedAt !== null);
}

/** Whether to offer Completing the Task after this tick: it is the last open Subtask, and the Task is still open. */
export function offersCompletion(task: Task, subtasks: Subtask[], tickedId: string): boolean {
  return task.completedAt === null && completesLastOpen(subtasks, tickedId);
}

/**
 * Where a dragged row lands: `centres` are the vertical centres of the rows in their current order, `from` is the
 * dragged row and `pointerY` where the pointer is. It lands after every other row whose centre is above the pointer,
 * so rows swap as the pointer passes their middle.
 */
export function dropIndex(centres: number[], from: number, pointerY: number): number {
  return centres.filter((centre, index) => index !== from && centre < pointerY).length;
}

/** Ticks that were asked for and are not shown yet: a Subtask's id, and the state it was asked to have (true: ticked). */
export type PendingTicks = ReadonlyMap<string, boolean>;

/**
 * The Subtasks as they will be once the ticks still being saved are in. A person can tick again before the screen shows
 * the last tick (two checks in a row, a double tap), so the decisions ("what does this tick do", "is this the last open
 * one") are made on this, not on what is shown. Where a tick is pending, `completedAt` is not the real time (it is not
 * known yet): it only tells ticked from open.
 */
export function withPendingTicks(subtasks: Subtask[], pending: PendingTicks): Subtask[] {
  return subtasks.map((subtask) => {
    const ticked = pending.get(subtask.id);
    if (ticked === undefined || ticked === (subtask.completedAt !== null)) return subtask;
    return { ...subtask, completedAt: ticked ? "" : null };
  });
}

/** The pending ticks that `subtasks` do not show yet. One that is shown, or whose Subtask is gone, is done with. */
export function stillPending(subtasks: Subtask[], pending: PendingTicks): Map<string, boolean> {
  return new Map(
    [...pending].filter(([id, ticked]) => {
      const subtask = subtasks.find((s) => s.id === id);
      return subtask !== undefined && ticked !== (subtask.completedAt !== null);
    }),
  );
}
