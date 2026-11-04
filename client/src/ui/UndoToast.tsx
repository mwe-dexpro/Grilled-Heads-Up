import { useI18n } from "../i18n/I18nProvider";

/** How long the toast offers the undo. */
export const undoToastMs = 5000;

/**
 * "Task deleted · Undo". It sits in the row of the "+" button, to its left, above the tab bar, so it never covers
 * the button or the tabs.
 *
 * Screen readers announce what is added to a live region that is already in the page; one that arrives together
 * with its text is often not read. So the region is always there (empty while no toast is shown) and the toast is
 * put into it. It is a live region (`aria-live`), not `role="status"`, so the page still has one status line only:
 * the sync line. The toast is keyed by the deleted Task, so a second delete while the first toast is up is a new
 * toast, and is announced again.
 */
export function UndoToast({ deletedTaskId, onUndo }: { deletedTaskId: string | null; onUndo(): void }) {
  const { t } = useI18n();
  return (
    <div className="undo-region" aria-live="polite" aria-atomic="true">
      {deletedTaskId !== null && (
        <div key={deletedTaskId} className="undo-toast">
          <span>{t("toast.taskDeleted")}</span>
          <button type="button" className="undo-button" onClick={onUndo}>
            {t("toast.undo")}
          </button>
        </div>
      )}
    </div>
  );
}
