import { Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { SubtaskRow } from "./SubtaskRow";
import type { Subtask } from "./subtaskStore";
import { subtaskProgress } from "./subtasks";
import { useCompletionOffer } from "./useCompletionOffer";
import { useRowDrag } from "./useRowDrag";

interface SubtasksSectionProps {
  task: Task;
  /** The Task's live Subtasks, in order. */
  subtasks: Subtask[];
  onAdd: (taskId: string, title: string) => void;
  onRename: (id: string, title: string) => void;
  /** Saves the tick; a promise that fails tells the section that it did not happen. */
  onSetDone: (id: string, done: boolean) => Promise<void> | void;
  /** Moves the Subtask to that index (a drop). */
  onMove: (id: string, toIndex: number) => Promise<void> | void;
  /** Moves the Subtask that many places from where it is when the move runs (an arrow key: it must not depend on the order shown). */
  onMoveBy: (id: string, by: number) => Promise<void> | void;
  /** Deletes the Subtask and offers to undo it. */
  onDelete: (subtask: Subtask) => void;
  /** Completes the Task, like the sticky button of Task detail. */
  onCompleteTask: (taskId: string) => void;
}

/**
 * The Subtasks section of Task detail (design 4c): "N of M" with a bar, a card of rows (tick, rename, reorder, delete),
 * an "Add subtask" row and, when the last open one was just ticked, the offer to Complete the Task.
 */
export function SubtasksSection({ task, subtasks, onAdd, onRename, onSetDone, onMove, onMoveBy, onDelete, onCompleteTask }: SubtasksSectionProps) {
  const { t } = useI18n();
  const [newTitle, setNewTitle] = useState("");
  // What a screen reader is told (a live region). `n` makes the same words new again: pressing at the end twice says it twice.
  const [announcement, setAnnouncement] = useState({ text: "", n: 0 });
  // The Subtask whose "Move up" and "Move down" buttons are shown (a way to move it with a tap, for a screen reader on a phone).
  const [movingId, setMovingId] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const addInput = useRef<HTMLInputElement>(null);
  // The control that moved a row (its handle, or one of its Move buttons) keeps the keyboard focus, however the row was
  // moved in the page; `from` is where the announcement of the move starts from, `at` where the row will be once the
  // presses made so far have run (the order shown may be behind a key held down).
  const refocus = useRef<{ id: string; control: string; from: number; at: number } | null>(null);

  const progress = subtaskProgress(subtasks);
  const offer = useCompletionOffer({ task, subtasks, onSetDone, rows, addInput });
  const drag = useRowDrag({ subtasks, list, rows, onMove, onDragged: () => setMovingId(null) });

  useLayoutEffect(() => {
    const moved = refocus.current;
    if (moved !== null) {
      rows.current.get(moved.id)?.querySelector<HTMLElement>(moved.control)?.focus();
      const to = subtasks.findIndex((s) => s.id === moved.id);
      const landed = subtasks[to];
      if (landed !== undefined && to !== moved.from) announce(t("subtask.moved", { title: landed.title, position: String(to + 1), total: String(subtasks.length) }));
    }
    refocus.current = null;
  }, [subtasks]);

  function announce(text: string) {
    setAnnouncement((current) => ({ text, n: current.n + 1 }));
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (title === "") return;
    onAdd(task.id, title);
    setNewTitle("");
  }

  function remove(subtask: Subtask, index: number) {
    // The row goes when the deletion is saved; the focus moves to a row that stays, else to "Add subtask".
    const next = subtasks[index + 1] ?? subtasks[index - 1];
    const title = next && rows.current.get(next.id)?.querySelector<HTMLElement>(".subtask-title");
    (title || addInput.current)?.focus();
    onDelete(subtask);
  }

  /** One place up or down, from where the Subtask is when the move runs: the order shown may be behind a held key or a quick tap. */
  function moveBy(subtask: Subtask, index: number, by: number, control: string) {
    const pending = refocus.current?.id === subtask.id ? refocus.current : null;
    const from = pending?.from ?? index;
    const at = pending?.at ?? index;
    const to = Math.min(Math.max(at + by, 0), subtasks.length - 1);
    refocus.current = { id: subtask.id, control, from, at: to };
    // A press that cannot move the row (the first one up, the last one down) says so: it is not a dead press.
    if (to === at) announce(t(by < 0 ? "subtask.first" : "subtask.last", { title: subtask.title }));
    // The store clamps by itself, from where the Subtask is when the move runs.
    void onMoveBy(subtask.id, by);
  }

  return (
    <section className="bucket subtasks" aria-labelledby="subtasks-heading">
      <div className="section-header">
        <h2 id="subtasks-heading" className="section-title">
          {t("subtask.heading")}
        </h2>
        {progress.total > 0 && (
          <span className="section-meta subtasks-count">{t("subtask.count", { done: String(progress.done), total: String(progress.total) })}</span>
        )}
      </div>
      {progress.total > 0 && (
        <div
          className="subtask-bar"
          role="progressbar"
          aria-label={t("subtask.progressLabel")}
          aria-valuemin={0}
          aria-valuenow={progress.done}
          aria-valuemax={progress.total}
          aria-valuetext={t("subtask.count", { done: String(progress.done), total: String(progress.total) })}
        >
          <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      <div className="card subtask-card">
        {subtasks.length > 0 && (
          <ul ref={list} className="task-list subtask-list">
            {subtasks.map((subtask, index) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                rowRef={(node) => {
                  if (node) rows.current.set(subtask.id, node);
                  else rows.current.delete(subtask.id);
                }}
                drag={drag.rowState(subtask, index)}
                handleProps={drag.handleProps(subtask, index)}
                endsDrag={drag.endsDrag}
                moving={movingId === subtask.id}
                onToggleMoving={() => setMovingId(movingId === subtask.id ? null : subtask.id)}
                onCloseMoving={() => setMovingId(null)}
                onTick={() => offer.tick(subtask)}
                onRename={(title) => onRename(subtask.id, title)}
                onDelete={() => remove(subtask, index)}
                onMoveBy={(by, control) => moveBy(subtask, index, by, control)}
              />
            ))}
          </ul>
        )}
        {/* Not a list item: a screen reader counts the Subtasks only. */}
        <form className="subtask subtask-add" onSubmit={add}>
          <Plus size={22} strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={addInput}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("subtask.add")}
            aria-label={t("subtask.add")}
            maxLength={maxTitleLength}
            autoComplete="off"
            enterKeyHint="done"
          />
        </form>
      </div>
      <span id="subtask-reorder-hint" className="visually-hidden">
        {t("subtask.reorderHint")}
      </span>
      {/* Says where a Subtask went after an arrow key or a Move button moved it, or that it is at the end already; a live region, not role="status": the sync line is the page's one status. */}
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        <span key={announcement.n}>{announcement.text}</span>
      </span>

      {offer.offering && (
        <div className="subtask-offer" role="group" aria-labelledby="subtask-offer-text">
          <p id="subtask-offer-text">{t("subtask.allDone")}</p>
          <div className="subtask-offer-actions">
            <button ref={offer.completeButton} type="button" className="button-primary small" onClick={() => onCompleteTask(task.id)}>
              {t("subtask.completeTask")}
            </button>
            <button type="button" className="button-ghost small" onClick={offer.dismiss}>
              {t("subtask.notNow")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
