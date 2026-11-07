import { Check, Clock, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TaskAction } from "./availableActions";

interface TaskActionsSheetProps {
  open: boolean;
  title: string;
  /** What can be done to this Task (see `availableActions`). */
  actions: TaskAction[];
  onSelect: (action: TaskAction) => void;
  onClose: () => void;
}

const icons: Record<TaskAction, LucideIcon> = { reschedule: Clock, complete: Check, delete: Trash2 };

/** The Task actions sheet, opened by a long press (or a right click): Complete, Reschedule and Delete without swiping. */
export function TaskActionsSheet({ open, title, actions, onSelect, onClose }: TaskActionsSheetProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // The order of the sheet, as in the design's swipe: Complete first, being the usual choice.
  const order: TaskAction[] = ["complete", "reschedule", "delete"];

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="task-actions-heading" onClose={onClose}>
      <h2 id="task-actions-heading" className="sheet-title">
        {title}
      </h2>
      <div className="card option-card">
        {order
          .filter((action) => actions.includes(action))
          .map((action) => {
            const Icon = icons[action];
            return (
              <button key={action} type="button" className={action === "delete" ? "option danger" : "option"} onClick={() => onSelect(action)}>
                <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>{t(`task.${action}`)}</span>
              </button>
            );
          })}
      </div>
      <div className="sheet-actions">
        <button type="button" className="button-text" onClick={onClose}>
          {t("taskActions.cancel")}
        </button>
      </div>
    </dialog>
  );
}
