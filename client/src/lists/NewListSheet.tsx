import { useEffect, useRef, useState, type FormEvent } from "react";
import { maxTitleLength } from "../data/limits";
import { useI18n } from "../i18n/I18nProvider";

interface NewListSheetProps {
  open: boolean;
  onCreate(name: string, isProject: boolean): void;
  onClose(): void;
}

/** A name, and whether the List is a Project. The new List shows on the Projects tab. */
export function NewListSheet({ open, onCreate, onClose }: NewListSheetProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [isProject, setIsProject] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    onCreate(name, isProject);
    setName("");
    setIsProject(false);
    onClose();
  }

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="new-list-heading" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id="new-list-heading" className="sheet-title">
          {t("list.new")}
        </h2>
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
          <button type="button" className="button-ghost" onClick={onClose}>
            {t("list.cancel")}
          </button>
          <button type="submit" className="button-primary" disabled={name.trim() === ""}>
            {t("list.create")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
