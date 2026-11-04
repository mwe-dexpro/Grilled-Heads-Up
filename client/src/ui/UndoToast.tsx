import { useI18n } from "../i18n/I18nProvider";

/** How long the toast offers the undo. */
export const undoToastMs = 5000;

/**
 * "Task deleted · Undo". It sits in the row of the "+" button, to its left, above the tab bar, so it never covers
 * the button or the tabs. It is only in the page while it is shown, so the page has one status region more only then.
 */
export function UndoToast({ visible, onUndo }: { visible: boolean; onUndo(): void }) {
  const { t } = useI18n();
  if (!visible) return null;
  return (
    <div className="undo-toast" role="status">
      <span>{t("toast.taskDeleted")}</span>
      <button type="button" className="undo-button" onClick={onUndo}>
        {t("toast.undo")}
      </button>
    </div>
  );
}
