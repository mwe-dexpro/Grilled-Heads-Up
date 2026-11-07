import { GripVertical, Plus, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import type { Subtask } from "./subtaskStore";
import { dropIndex, offersCompletion, stillPending, subtaskProgress, withPendingTicks } from "./subtasks";

interface SubtasksSectionProps {
  task: Task;
  /** The Task's live Subtasks, in order. */
  subtasks: Subtask[];
  onAdd(taskId: string, title: string): void;
  onRename(id: string, title: string): void;
  onSetDone(id: string, done: boolean): void;
  /** Moves the Subtask to that index (a drop). */
  onMove(id: string, toIndex: number): Promise<void> | void;
  /** Moves the Subtask that many places from where it is when the move runs (an arrow key: it must not depend on the order shown). */
  onMoveBy(id: string, by: number): Promise<void> | void;
  /** Deletes the Subtask and offers to undo it. */
  onDelete(subtask: Subtask): void;
  /** Completes the Task, like the sticky button of Task detail. */
  onCompleteTask(taskId: string): void;
}

/** A row being dragged by its handle: where it would land, how far the pointer moved, how tall it is. */
interface Drag {
  id: string;
  target: number;
  dy: number;
  height: number;
  pointerId: number;
  startY: number;
  /** Let go over another place: the rows stay as they were dragged until the saved order arrives. */
  dropped?: boolean;
}

/**
 * The Subtasks section of Task detail (design 4c): "N of M" with a bar, a card of rows (tick, rename, reorder, delete),
 * an "Add subtask" row and, when the last open one was just ticked, the offer to Complete the Task.
 */
export function SubtasksSection({ task, subtasks, onAdd, onRename, onSetDone, onMove, onMoveBy, onDelete, onCompleteTask }: SubtasksSectionProps) {
  const { t } = useI18n();
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The Subtask whose tick made the offer (it is the last open one); the offer holds while that tick is shown.
  const [offered, setOffered] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const addInput = useRef<HTMLInputElement>(null);
  const completeButton = useRef<HTMLButtonElement>(null);
  // A moved row's handle keeps the keyboard focus, however the row was moved in the page; `movedFrom` is where the
  // announcement of the move starts from.
  const refocus = useRef<{ id: string; from: number } | null>(null);
  // After a rename ended with a key, the row's title button gets the focus back (the input that had it is gone).
  const refocusTitle = useRef<string | null>(null);
  // Ticks asked for and not shown yet: a second tick before the first is shown goes on from the first.
  const pendingTicks = useRef<Map<string, boolean>>(new Map());

  const completed = task.completedAt !== null;
  const progress = subtaskProgress(subtasks);
  const allDone = progress.total > 0 && progress.done === progress.total;
  const offeredSubtask = subtasks.find((s) => s.id === offered);
  const offering = offeredSubtask !== undefined && offeredSubtask.completedAt !== null && allDone && !completed;

  // A drag follows its Subtask, wherever a reload puts it. It ends when its Subtask is gone, and, once dropped, when the
  // saved order shows the move: in that very render the rows lose their displacement, so they never show a wrong order.
  const dragFrom = drag ? subtasks.findIndex((s) => s.id === drag.id) : -1;
  const dragging = drag !== null && dragFrom !== -1 && !(drag.dropped && dragFrom === drag.target) ? drag : null;

  useLayoutEffect(() => {
    if (drag && !dragging) setDrag(null);
  });
  useLayoutEffect(() => {
    pendingTicks.current = stillPending(subtasks, pendingTicks.current);
    // The tick that made the offer is over (it failed, or was undone) and the offer does not hold: forget it.
    if (offered !== null && !offering && !pendingTicks.current.has(offered)) setOffered(null);
  }, [subtasks, offered, offering]);
  useLayoutEffect(() => {
    if (offering) completeButton.current?.focus();
  }, [offering]);
  useLayoutEffect(() => {
    const moved = refocus.current;
    if (moved !== null) {
      handles.current.get(moved.id)?.focus();
      const to = subtasks.findIndex((s) => s.id === moved.id);
      if (to !== -1 && to !== moved.from) setAnnouncement(t("subtask.moved", { title: subtasks[to].title, position: String(to + 1), total: String(subtasks.length) }));
    }
    refocus.current = null;
  }, [subtasks]);
  useLayoutEffect(() => {
    if (editingId === null && refocusTitle.current !== null) rows.current.get(refocusTitle.current)?.querySelector<HTMLElement>(".subtask-title")?.focus();
    refocusTitle.current = null;
  }, [editingId]);

  function tick(subtask: Subtask) {
    // What the tick does, and whether it is the last open one, is decided on the Subtasks with the ticks still being saved.
    const ahead = withPendingTicks(subtasks, pendingTicks.current);
    const done = ahead.find((s) => s.id === subtask.id)?.completedAt === null;
    if (done && offersCompletion(task, ahead, subtask.id)) setOffered(subtask.id);
    pendingTicks.current.set(subtask.id, done);
    onSetDone(subtask.id, done);
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

  function moveWithKeys(e: KeyboardEvent, subtask: Subtask, index: number) {
    const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (by === 0) return;
    e.preventDefault();
    // Each press is "one place from where it is": the store reads that when it runs, and the order shown may be behind.
    refocus.current = { id: subtask.id, from: refocus.current?.id === subtask.id ? refocus.current.from : index };
    void onMoveBy(subtask.id, by);
  }

  function startDrag(e: PointerEvent<HTMLButtonElement>, subtask: Subtask, index: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = rows.current.get(subtask.id);
    if (!row) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: subtask.id, target: index, dy: 0, height: row.getBoundingClientRect().height, pointerId: e.pointerId, startY: e.clientY });
  }

  /** The vertical centre of each row's place, as it is in the page now (the layout, not where a transform has put the row). */
  function placeCentres(): number[] {
    const top = list.current ? list.current.getBoundingClientRect().top + list.current.clientTop : 0;
    return subtasks.map((s) => {
      const row = rows.current.get(s.id);
      return row ? top + row.offsetTop + row.offsetHeight / 2 : 0;
    });
  }

  function dragTo(e: PointerEvent<HTMLButtonElement>) {
    if (!dragging || e.pointerId !== dragging.pointerId || dragging.dropped) return;
    setDrag({ ...dragging, dy: e.clientY - dragging.startY, target: dropIndex(placeCentres(), dragFrom, e.clientY) });
  }

  function endDrag(e: PointerEvent<HTMLButtonElement>, drop: boolean) {
    if (!dragging || e.pointerId !== dragging.pointerId || dragging.dropped) return;
    if (drop && dragging.target !== dragFrom) {
      setDrag({ ...dragging, dropped: true });
      // A move that failed shows no new order: the row then goes back.
      Promise.resolve(onMove(dragging.id, dragging.target)).catch((error) => {
        setDrag(null);
        throw error;
      });
    } else {
      setDrag(null);
    }
  }

  /** Where a row sits while another is dragged: those the dragged row passes make room for it. */
  function shift(index: number): number {
    if (!dragging || index === dragFrom) return 0;
    if (index > dragFrom && index <= dragging.target) return -dragging.height;
    if (index < dragFrom && index >= dragging.target) return dragging.height;
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

      <div className="card subtask-card">
        {subtasks.length > 0 && (
          <ul ref={list} className="task-list subtask-list">
            {subtasks.map((subtask, index) => {
              const done = subtask.completedAt !== null;
              const dragged = dragging?.id === subtask.id;
              return (
                <li
                  key={subtask.id}
                  ref={(node) => {
                    if (node) rows.current.set(subtask.id, node);
                    else rows.current.delete(subtask.id);
                  }}
                  // The rows slide only while a drag is under way: when it ends they must not slide to where they are.
                  className={["subtask", done && "done", dragging && "reordering", dragged && "dragging"].filter(Boolean).join(" ")}
                  style={
                    dragging
                      ? {
                          transform: `translateY(${dragged ? (dragging.dropped ? (dragging.target - dragFrom) * dragging.height : dragging.dy) : shift(index)}px)`,
                          transition: dragged && !dragging.dropped ? "none" : undefined,
                        }
                      : undefined
                  }
                >
                  <input type="checkbox" className="check" checked={done} onChange={() => tick(subtask)} aria-label={subtask.title} />
                  {editingId === subtask.id ? (
                    <SubtaskTitleInput
                      subtask={subtask}
                      onSave={(title, withKey) => {
                        if (withKey) refocusTitle.current = subtask.id;
                        setEditingId(null);
                        if (title !== null) onRename(subtask.id, title);
                      }}
                      onCancel={() => {
                        refocusTitle.current = subtask.id;
                        setEditingId(null);
                      }}
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
                    aria-describedby="subtask-reorder-hint"
                    onKeyDown={(e) => moveWithKeys(e, subtask, index)}
                    onPointerDown={(e) => startDrag(e, subtask, index)}
                    onPointerMove={dragTo}
                    onPointerUp={(e) => endDrag(e, true)}
                    onPointerCancel={(e) => endDrag(e, false)}
                  >
                    <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  <button type="button" className="subtask-delete" aria-label={t("subtask.delete", { title: subtask.title })} onClick={() => remove(subtask, index)}>
                    <X size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
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
      {/* Says where a Subtask went after an arrow key moved it; a live region, not role="status": the sync line is the page's one status. */}
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>

      {offering && (
        <div className="subtask-offer" role="group" aria-labelledby="subtask-offer-text">
          <p id="subtask-offer-text">{t("subtask.allDone")}</p>
          <div className="subtask-offer-actions">
            <button ref={completeButton} type="button" className="button-primary small" onClick={() => onCompleteTask(task.id)}>
              {t("subtask.completeTask")}
            </button>
            <button
              type="button"
              className="button-ghost small"
              onClick={() => {
                // The offer goes, and with it the button that has the focus: the ticked Subtask's check gets it.
                rows.current.get(offered!)?.querySelector<HTMLElement>(".check")?.focus();
                setOffered(null);
              }}
            >
              {t("subtask.notNow")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The title as an input: Enter or leaving it saves, Escape cancels. A title that is blank, or the one the editing began
 * with, is not saved (`onSave` gets null): the title may have been renamed from another device meanwhile, and leaving
 * the input untouched must not write the old one over it. `withKey`: it ended with Enter, not by leaving the input.
 */
function SubtaskTitleInput({
  subtask,
  onSave,
  onCancel,
}: {
  subtask: Subtask;
  onSave(title: string | null, withKey: boolean): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const [started] = useState(subtask.title);
  const [title, setTitle] = useState(subtask.title);
  // Enter and Escape end the editing, and the input going away may still blur: that must not save or cancel twice.
  const ended = useRef(false);

  function save(withKey: boolean) {
    if (ended.current) return;
    ended.current = true;
    const typed = title.trim();
    onSave(typed === "" || typed === started ? null : typed, withKey);
  }

  return (
    <input
      className="subtask-title-input"
      value={title}
      autoFocus
      maxLength={maxTitleLength}
      aria-label={t("subtask.rename", { title: subtask.title })}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => save(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          ended.current = true;
          onCancel();
        }
      }}
    />
  );
}
