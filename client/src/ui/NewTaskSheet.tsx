import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { TaskWhen } from "../tasks/taskStore";

interface NewTaskSheetProps {
  open: boolean;
  onAdd(title: string, when: TaskWhen): void;
  onClose(): void;
}

/** Quick add: a title, and optionally a date and time. Without a date the Task goes to the Inbox. */
export function NewTaskSheet({ open, onAdd, onClose }: NewTaskSheetProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") return;
    onAdd(title, { date: date || null, time: date && time ? time : null });
    setTitle("");
    setDate("");
    setTime("");
    onClose();
  }

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="new-task-heading" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id="new-task-heading" className="sheet-title">
          {t("newTask.heading")}
        </h2>
        <div className="card form-card">
          <label className="field">
            <span className="visually-hidden">{t("newTask.title")}</span>
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("newTask.placeholder")}
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
            />
          </label>
          <label className="field row-field">
            {t("newTask.date")}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field row-field">
            {t("newTask.time")}
            <input type="time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <p className="hint">{t("newTask.hint")}</p>
        <div className="sheet-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            {t("newTask.cancel")}
          </button>
          <button type="submit" className="button-primary" disabled={title.trim() === ""}>
            {t("newTask.add")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
