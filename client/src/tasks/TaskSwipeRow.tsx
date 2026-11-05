import { Check, Clock, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { SwipeRow, type SwipeAction } from "../ui/SwipeRow";
import { availableActions, type TaskAction } from "./availableActions";
import type { Task } from "./taskStore";

/** What a Task row can start; the app decides what each does (sheets, the undo toast, the stores). */
export interface TaskActions {
  complete(id: string): void;
  /** Opens the Reschedule sheet for these Tasks. */
  reschedule(tasks: Task[]): void;
  /** Deletes the Task (to the Trash) and offers to undo it. */
  remove(task: Task): void;
  /** Opens the Task actions sheet: the way to the actions without swiping. */
  openMenu(task: Task): void;
}

interface TaskSwipeRowProps {
  task: Task;
  /** Ids of the Events on this device: a Linked task whose Event is missing can't be rescheduled. */
  eventIds: { has(id: string): boolean };
  actions: TaskActions;
  className: string;
  children: ReactNode;
}

/** A Task's row: swipe left for Reschedule, Complete and Delete; long press for the same in a sheet. */
export function TaskSwipeRow({ task, eventIds, actions, className, children }: TaskSwipeRowProps) {
  const { t } = useI18n();
  const make: Record<TaskAction, SwipeAction> = {
    reschedule: { id: "reschedule", label: t("task.reschedule"), icon: Clock, tone: "neutral", onSelect: () => actions.reschedule([task]) },
    complete: { id: "complete", label: t("task.complete"), icon: Check, tone: "primary", onSelect: () => actions.complete(task.id) },
    delete: { id: "delete", label: t("task.delete"), icon: Trash2, tone: "strong", onSelect: () => actions.remove(task) },
  };
  return (
    <SwipeRow actions={availableActions(task, eventIds).map((action) => make[action])} onMenu={() => actions.openMenu(task)} className={className}>
      {children}
    </SwipeRow>
  );
}
