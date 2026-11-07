import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";
import type { Subtask } from "./subtaskStore";
import type { RowDragState } from "./useRowDrag";

interface SubtaskRowProps {
  subtask: Subtask;
  /** The row's element, for the section: where the focus goes, where the places are. */
  rowRef: (node: HTMLLIElement | null) => void;
  drag: RowDragState;
  /** The pointer handlers of the handle (a drag). */
  handleProps: {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => void;
  };
  /** Whether a click on the handle ends a drag (and is no tap). */
  endsDrag: (e: MouseEvent) => boolean;
  /** The Move up and Move down buttons are shown. */
  moving: boolean;
  onToggleMoving: () => void;
  onCloseMoving: () => void;
  onTick: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** One place up or down, from the control (a selector in the row) that asked, which keeps the focus. */
  onMoveBy: (by: number, control: string) => void;
}

/** One Subtask of the list: tick, title (an input while it is renamed), handle, delete, and the Move buttons when they are shown. */
export function SubtaskRow({ subtask, rowRef, drag, handleProps, endsDrag, moving, onToggleMoving, onCloseMoving, onTick, onRename, onDelete, onMoveBy }: SubtaskRowProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  // After a rename ended with a key, the title button gets the focus back (the input that had it is gone).
  const refocusTitle = useRef(false);
  const li = useRef<HTMLLIElement | null>(null);
  const done = subtask.completedAt !== null;

  useLayoutEffect(() => {
    if (!editing && refocusTitle.current) li.current?.querySelector<HTMLElement>(".subtask-title")?.focus();
    refocusTitle.current = false;
  }, [editing]);

  /** ArrowUp and ArrowDown on the handle or a Move button move the row; Escape closes the Move buttons. */
  function moveWithKeys(e: KeyboardEvent, control: string) {
    if (e.key === "Escape" && moving) {
      e.preventDefault();
      onCloseMoving();
      li.current?.querySelector<HTMLElement>(".subtask-handle")?.focus();
      return;
    }
    const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (by === 0) return;
    e.preventDefault();
    onMoveBy(by, control);
  }

  return (
    <li
      ref={(node) => {
        li.current = node;
        rowRef(node);
      }}
      className={["subtask", done && "done", drag.reordering && "reordering", drag.dragged && "dragging"].filter(Boolean).join(" ")}
      style={drag.style}
    >
      <input type="checkbox" className="check" checked={done} onChange={onTick} aria-label={subtask.title} />
      {editing ? (
        <SubtaskTitleInput
          subtask={subtask}
          onSave={(title, withKey) => {
            if (withKey) refocusTitle.current = true;
            setEditing(false);
            if (title !== null) onRename(title);
          }}
          onCancel={() => {
            refocusTitle.current = true;
            setEditing(false);
          }}
        />
      ) : (
        <button type="button" className="subtask-title" aria-label={t("subtask.rename", { title: subtask.title })} onClick={() => setEditing(true)}>
          {subtask.title}
        </button>
      )}
      <button
        type="button"
        className="subtask-handle"
        aria-label={t("subtask.reorder", { title: subtask.title })}
        aria-describedby="subtask-reorder-hint"
        aria-expanded={moving}
        aria-controls={moving ? `subtask-moves-${subtask.id}` : undefined}
        onKeyDown={(e) => moveWithKeys(e, ".subtask-handle")}
        // A tap (or Enter, or Space) shows the Move buttons; the click that ends a mouse drag is none.
        onClick={(e) => {
          if (!endsDrag(e)) onToggleMoving();
        }}
        {...handleProps}
      >
        <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className="subtask-delete" aria-label={t("subtask.delete", { title: subtask.title })} onClick={onDelete}>
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {moving && (
        <div id={`subtask-moves-${subtask.id}`} className="subtask-moves">
          <button
            type="button"
            className="subtask-move subtask-move-up"
            aria-label={t("subtask.moveUp", { title: subtask.title })}
            onClick={() => onMoveBy(-1, ".subtask-move-up")}
            onKeyDown={(e) => moveWithKeys(e, ".subtask-move-up")}
          >
            <ChevronUp size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="subtask-move subtask-move-down"
            aria-label={t("subtask.moveDown", { title: subtask.title })}
            onClick={() => onMoveBy(1, ".subtask-move-down")}
            onKeyDown={(e) => moveWithKeys(e, ".subtask-move-down")}
          >
            <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
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
  onSave: (title: string | null, withKey: boolean) => void;
  onCancel: () => void;
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
