import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Task } from "../tasks/taskStore";
import type { Subtask } from "./subtaskStore";
import { offersCompletion, stillPending, subtaskProgress, withPendingTicks } from "./subtasks";

interface CompletionOfferOptions {
  task: Task;
  /** The Task's live Subtasks, in order. */
  subtasks: Subtask[];
  /** Saves the tick; a promise that fails tells the hook that it did not happen. */
  onSetDone: (id: string, done: boolean) => Promise<void> | void;
  /** The row elements and the "Add subtask" input: where the focus goes when the offer's button goes. */
  rows: RefObject<Map<string, HTMLLIElement>>;
  addInput: RefObject<HTMLInputElement | null>;
}

/**
 * Ticking Subtasks, and the offer to Complete the Task that ticking the last open one makes. The offer holds while the
 * tick that made it is shown, takes the keyboard focus when it appears, and gives it back when it goes.
 */
export function useCompletionOffer({ task, subtasks, onSetDone, rows, addInput }: CompletionOfferOptions) {
  // The Subtask whose tick made the offer (it is the last open one); the offer holds while that tick is shown.
  const [offered, setOffered] = useState<string | null>(null);
  const completeButton = useRef<HTMLButtonElement>(null);
  // Ticks asked for and not shown yet: a second tick before the first is shown goes on from the first.
  const pendingTicks = useRef<Map<string, boolean>>(new Map());
  // The Subtask the offer was last made for: where the focus goes when the offer goes by itself.
  const offeredFor = useRef<string | null>(null);

  const progress = subtaskProgress(subtasks);
  const allDone = progress.total > 0 && progress.done === progress.total;
  const offeredSubtask = subtasks.find((s) => s.id === offered);
  const offering = offeredSubtask !== undefined && offeredSubtask.completedAt !== null && allDone && task.completedAt === null;

  useLayoutEffect(() => {
    pendingTicks.current = stillPending(subtasks, pendingTicks.current);
    // The tick that made the offer is over (it failed, or was undone) and the offer does not hold: forget it.
    if (offered !== null && !offering && !pendingTicks.current.has(offered)) setOffered(null);
  }, [subtasks, offered, offering]);
  useLayoutEffect(() => {
    if (offering) {
      completeButton.current?.focus();
      offeredFor.current = offered;
    } else if (offeredFor.current !== null) {
      // The offer went by itself (a Subtask was unticked or added, or the Task was Completed elsewhere). If it held the
      // focus, the button that had it is gone: the ticked Subtask's check gets it.
      if (document.activeElement === document.body || document.activeElement === null) {
        const check = rows.current.get(offeredFor.current)?.querySelector<HTMLElement>(".check");
        (check ?? addInput.current)?.focus();
      }
      offeredFor.current = null;
    }
  }, [offering]);

  function tick(subtask: Subtask) {
    // What the tick does, and whether it is the last open one, is decided on the Subtasks with the ticks still being saved.
    const ahead = withPendingTicks(subtasks, pendingTicks.current);
    const done = ahead.find((s) => s.id === subtask.id)?.completedAt === null;
    if (done && offersCompletion(task, ahead, subtask.id)) setOffered(subtask.id);
    // An untick of the Subtask that made the offer withdraws it at once, also while that untick is still being saved.
    else if (!done && subtask.id === offered) setOffered(null);
    pendingTicks.current.set(subtask.id, done);
    // A save that fails for a real reason (the Subtask being gone ends calmly, without a rejection) has not happened: the
    // tick stops being pending, or the next tap on this check would take it for done and do the opposite.
    Promise.resolve(onSetDone(subtask.id, done)).catch((error: unknown) => {
      if (pendingTicks.current.get(subtask.id) === done) pendingTicks.current.delete(subtask.id);
      setOffered((current) => (current === subtask.id ? null : current));
      throw error;
    });
  }

  /** "Not now": the offer goes, and with it the button that has the focus: the ticked Subtask's check gets it. */
  function dismiss() {
    if (offered !== null) rows.current.get(offered)?.querySelector<HTMLElement>(".check")?.focus();
    setOffered(null);
  }

  return { offering, completeButton, tick, dismiss };
}
