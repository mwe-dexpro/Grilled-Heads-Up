import { useLayoutEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/i18n";

/** How long the toast offers the undo. */
const undoToastMs = 5000;

/**
 * "Task deleted · Undo" (or "Subtask deleted · Undo"). It sits in the row of the "+" button, to its left, above the tab bar, so it never covers
 * the button or the tabs. It goes after `undoToastMs`, except while the Undo button has the keyboard focus or a mouse
 * is over it: someone who is reaching for it must not have it taken away. The five seconds then start anew. A
 * finger does not hold it for good: a touch pointer leaves when the finger is lifted, so the toast still goes.
 *
 * Screen readers announce what is added to a live region that is already in the page; one that arrives together
 * with its text is often not read. So the region is always there (empty while no toast is shown) and the toast is
 * put into it. It is a live region (`aria-live`), not `role="status"`, so the page still has one status line only:
 * the sync line. The toast is keyed by the deleted Task or Subtask, so a second delete while the first toast is up is a new
 * toast, is announced again and has its own five seconds.
 */
export function UndoToast({
  deletedId,
  message,
  onUndo,
  onExpire,
}: {
  /** The id of what was just deleted, or null while there is no toast. */
  deletedId: string | null;
  /** What the toast says: `toast.taskDeleted` or `toast.subtaskDeleted`. */
  message: TranslationKey;
  onUndo: () => void;
  onExpire: () => void;
}) {
  return (
    <div className="undo-region" aria-live="polite" aria-atomic="true">
      {deletedId !== null && <Toast key={deletedId} message={message} onUndo={onUndo} onExpire={onExpire} />}
    </div>
  );
}

function Toast({ message, onUndo, onExpire }: { message: TranslationKey; onUndo: () => void; onExpire: () => void }) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const held = focused || hovered;

  // A layout effect, so that the timer is set in the same commit that shows `data-held`: whoever sees the toast
  // released (the end-to-end tests do) knows its five seconds are running.
  useLayoutEffect(() => {
    if (held) return;
    const timer = setTimeout(onExpire, undoToastMs);
    return () => clearTimeout(timer);
  }, [held, onExpire]);

  return (
    <div className="undo-toast" data-held={held ? "" : undefined} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <span>{t(message)}</span>
      <button type="button" className="undo-button" onClick={onUndo} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        {t("toast.undo")}
      </button>
    </div>
  );
}
