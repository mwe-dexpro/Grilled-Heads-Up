import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";
import type { List } from "./listStore";
import { listChanges } from "./lists";

interface EditListSheetProps {
  list: List;
  /** How many Tasks are in the List: the delete question says they stay. */
  taskCount: number;
  /** Only what the person changed in the sheet, so what a sync brought meanwhile is not written over. */
  onSave: (changes: { name?: string; isProject?: boolean }) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Rename a List, mark or unmark it as a Project, or delete it. Deleting asks first, in the sheet: the List's Tasks
 * stay, without a List. Shown only while editing, so it starts from the List as it is each time.
 */
export function EditListSheet({ list, taskCount, onSave, onDelete, onClose }: EditListSheetProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  // The List as the sheet showed it when it opened: `list` itself may change under the sheet (a sync).
  const [initial] = useState({ name: list.name, isProject: list.isProject });
  const [name, setName] = useState(initial.name);
  const [isProject, setIsProject] = useState(initial.isProject);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    onSave(listChanges(initial, { name, isProject }));
    onClose();
  }

  const question =
    taskCount === 0
      ? t("list.deleteConfirmNone", { name: list.name })
      : taskCount === 1
        ? t("list.deleteConfirmOne", { name: list.name })
        : t("list.deleteConfirmMany", { name: list.name, count: String(taskCount) });

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="edit-list-heading" onClose={onClose}>
      <h2 id="edit-list-heading" className="sheet-title">
        {t("list.edit")}
      </h2>
      {confirming ? (
        <>
          <p className="sheet-text">{question}</p>
          <div className="sheet-actions">
            <button type="button" className="button-ghost" onClick={() => setConfirming(false)}>
              {t("list.cancel")}
            </button>
            <button type="button" className="button-delete" onClick={onDelete}>
              <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              {t("list.deleteConfirm")}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card form-card">
            <label className="field">
              <span className="visually-hidden">{t("list.name")}</span>
              <input
                className="title-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("list.namePlaceholder")}
                autoComplete="off"
                maxLength={maxTitleLength}
                enterKeyHint="done"
                autoFocus
              />
            </label>
            <label className="field row-field">
              {t("list.isProject")}
              <input type="checkbox" className="switch" checked={isProject} onChange={(e) => setIsProject(e.target.checked)} />
            </label>
          </div>
          <p className="hint">{t("list.projectHint")}</p>
          <div className="sheet-actions">
            <button type="button" className="button-delete delete-start" onClick={() => setConfirming(true)}>
              <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              {t("list.delete")}
            </button>
            <button type="button" className="button-ghost" onClick={onClose}>
              {t("list.cancel")}
            </button>
            <button type="submit" className="button-primary" disabled={name.trim() === ""}>
              {t("list.save")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
