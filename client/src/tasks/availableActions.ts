import type { Task } from "./taskStore";

export type TaskAction = "reschedule" | "complete" | "delete";

/**
 * What can be done to a Task from its row (swipe, long press) and from Task detail. A Completed Task can only be
 * deleted. A Linked task whose Event is not on this device (it has not synced yet) can't be rescheduled, because
 * its date and so its new Offset can't be worked out.
 */
export function availableActions(task: Pick<Task, "eventId" | "completedAt">, eventIds: { has(id: string): boolean }): TaskAction[] {
  if (task.completedAt !== null) return ["delete"];
  if (task.eventId !== null && !eventIds.has(task.eventId)) return ["complete", "delete"];
  return ["reschedule", "complete", "delete"];
}
