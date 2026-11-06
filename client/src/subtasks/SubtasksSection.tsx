import { GripVertical, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import type { Subtask } from "./subtaskStore";
import { dropIndex, offersCompletion, subtaskProgress } from "./subtasks";

interface SubtasksSectionProps {
  task: Task;
  /** The Task's live Subtasks, in order. */
  subtasks: Subtask[];
  onAdd(taskId: string, title: string): void;
  onRename(id: string, title: string): void;
  onSetDone(id: string, done: boolean): void;
  /** Moves the Subtask to that index; the section waits for it to settle before it trusts the order it shows. */
  onMove(id: string, toIndex: number): Promise<void> | void;
  /** Deletes the Subtask and offers to undo it. */
  onDelete(subtask: Subtask): void;
  /** Completes the Task, like the sticky button of Task detail. */
  onCompleteTask(taskId: string): void;
}

/** A row being dragged by its handle: where it started, where it would land, how far the pointer moved, how tall it is. */
interface Drag {
  id: string;
  from: number;
  target: number;
  dy: number;
  height: number;
  pointerId: number;
  startY: number;
  centres: number[];
  /** Let go over another place: the rows stay as they were dragged until the saved order arrives. */
  dropped?: boolean;
}

/**
 * The Subtasks section of Task detail (design 4c): "N of M" with a bar, a card of rows (tick, rename, reorder, delete),
 * an "Add subtask" row and, when the last open one was just ticked, the offer to Complete the Task.
 */
export function SubtasksSection({ task, subtasks, onAdd, onRename, onSetDone, onMove, onDelete, onCompleteTask }: SubtasksSectionProps) {
  const { t } = useI18n();
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [offered, setOffered] = useState(false);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  // Moves still being saved, and where the last one put its Subtask: a key held down moves again before the saved
  // order is shown, and each press goes on from where the one before left the Subtask.
  const moving = useRef({ count: 0, id: "", index: 0 });
  const completeButton = useRef<HTMLButtonElement>(null);

  const completed = task.completedAt !== null;
  const progress = subtaskProgress(subtasks);
  const allDone = progress.total > 0 && progress.done === progress.total;
  // The offer is made by a tick (`offersCompletion`, decided before the tick); it ends when it no longer holds.
  const offering = offered && allDone && !completed;
  // The saved order is what the screen shows: a dragged row waits where it was dropped until it arrives.
  useEffect(() => setDrag(null), [subtasks]);
  useEffect(() => {
    if (!allDone || completed) setOffered(false);
  }, [allDone, completed]);
  useEffect(() => {
    if (offering) completeButton.current?.focus();
  }, [offering]);
  // A moved row's handle keeps the keyboard focus, however the row was moved in the page.
  useLayoutEffect(() => {
    if (refocus.current !== null) handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [subtasks]);

  function tick(subtask: Subtask) {
    const done = subtask.completedAt === null;
    if (done && offersCompletion(task, subtasks, subtask.id)) setOffered(true);
    onSetDone(subtask.id, done);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (title === "") return;
    onAdd(task.id, title);
    setNewTitle("");
  }

  function move(id: string, to: number) {
    moving.current = { count: moving.current.count + 1, id, index: to };
    void Promise.resolve(onMove(id, to)).finally(() => {
      moving.current.count--;
    });
  }

  function moveWithKeys(e: KeyboardEvent, subtask: Subtask, index: number) {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const from = moving.current.count > 0 && moving.current.id === subtask.id ? moving.current.index : index;
    const to = from + step;
    if (to < 0 || to >= subtasks.length) return;
    refocus.current = subtask.id;
    move(subtask.id, to);
  }

  function startDrag(e: PointerEvent<HTMLButtonElement>, subtask: Subtask, index: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = rows.current.get(subtask.id);
    if (!row) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const centres = subtasks.map((s) => {
      const box = rows.current.get(s.id)!.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    setDrag({ id: subtask.id, from: index, target: index, dy: 0, height: row.getBoundingClientRect().height, pointerId: e.pointerId, startY: e.clientY, centres });
  }

  function dragTo(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointerId || drag.dropped) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY, target: dropIndex(drag.centres, drag.from, e.clientY) });
  }

  function endDrag(e: PointerEvent<HTMLButtonElement>, drop: boolean) {
    if (!drag || e.pointerId !== drag.pointerId || drag.dropped) return;
    if (drop && drag.target !== drag.from) {
      setDrag({ ...drag, dropped: true });
      move(drag.id, drag.target);
    } else {
      setDrag(null);
    }
  }

  /** Where a row sits while another is dragged: those the dragged row passes make room for it. */
  function shift(index: number): number {
    if (!drag || index === drag.from) return 0;
    if (index > drag.from && index <= drag.target) return -drag.height;
    if (index < drag.from && index >= drag.target) return drag.height;
    return 0;
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

      <ul className="card task-list subtask-list">
        {subtasks.map((subtask, index) => {
          const done = subtask.completedAt !== null;
          const dragging = drag?.id === subtask.id;
          return (
            <li
              key={subtask.id}
              ref={(node) => {
                if (node) rows.current.set(subtask.id, node);
                else rows.current.delete(subtask.id);
              }}
              className={["subtask", done && "done", dragging && "dragging"].filter(Boolean).join(" ")}
              style={drag ? { transform: `translateY(${dragging ? (drag.dropped ? (drag.target - drag.from) * drag.height : drag.dy) : shift(index)}px)`, transition: dragging && !drag.dropped ? "none" : undefined } : undefined}
            >
              <input type="checkbox" className="check" checked={done} onChange={() => tick(subtask)} aria-label={subtask.title} />
              {editingId === subtask.id ? (
                <SubtaskTitleInput
                  subtask={subtask}
                  onSave={(title) => {
                    setEditingId(null);
                    if (title !== subtask.title) onRename(subtask.id, title);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button type="button" className="subtask-title" aria-label={t("subtask.rename", { title: subtask.title })} onClick={() => setEditingId(subtask.id)}>
                  {subtask.title}
                </button>
              )}
              <button
                type="button"
                className="subtask-handle"
                ref={(node) => {
                  if (node) handles.current.set(subtask.id, node);
                  else handles.current.delete(subtask.id);
                }}
                aria-label={t("subtask.reorder", { title: subtask.title })}
                onKeyDown={(e) => moveWithKeys(e, subtask, index)}
                onPointerDown={(e) => startDrag(e, subtask, index)}
                onPointerMove={dragTo}
                onPointerUp={(e) => endDrag(e, true)}
                onPointerCancel={(e) => endDrag(e, false)}
              >
                <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button type="button" className="subtask-delete" aria-label={t("subtask.delete", { title: subtask.title })} onClick={() => onDelete(subtask)}>
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        <li className="subtask subtask-add">
          <form onSubmit={add}>
            <Plus size={22} strokeWidth={1.5} aria-hidden="true" />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("subtask.add")}
              aria-label={t("subtask.add")}
              maxLength={maxTitleLength}
              autoComplete="off"
              enterKeyHint="done"
            />
          </form>
        </li>
      </ul>

      {offering && (
        <div className="subtask-offer" role="group" aria-labelledby="subtask-offer-text">
          <p id="subtask-offer-text">{t("subtask.allDone")}</p>
          <div className="subtask-offer-actions">
            <button ref={completeButton} type="button" className="button-primary small" onClick={() => onCompleteTask(task.id)}>
              {t("subtask.completeTask")}
            </button>
            <button type="button" className="button-ghost small" onClick={() => setOffered(false)}>
              {t("subtask.notNow")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The title as an input: Enter or leaving it saves, Escape cancels, and a blank title is not saved. */
function SubtaskTitleInput({ subtask, onSave, onCancel }: { subtask: Subtask; onSave(title: string): void; onCancel(): void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(subtask.title);
  // Enter and Escape end the editing, and the input going away may still blur: that must not save or cancel twice.
  const ended = useRef(false);

  function save() {
    if (ended.current) return;
    ended.current = true;
    onSave(title.trim() === "" ? subtask.title : title.trim());
  }

  return (
    <input
      className="subtask-title-input"
      value={title}
      autoFocus
      maxLength={maxTitleLength}
      aria-label={t("subtask.rename", { title: subtask.title })}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          ended.current = true;
          onCancel();
        }
      }}
    />
  );
}
