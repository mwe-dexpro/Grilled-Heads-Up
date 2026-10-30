import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatShortDay } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import { linkedTaskDate, type Event } from "./event";

type Direction = "before" | "onTheDay" | "after";

interface AddLinkedTaskSheetProps {
  event: Event;
  open: boolean;
  onAdd(title: string, offsetDays: number): void;
  onClose(): void;
}

/** Adds a Task to an Event at an Offset: a number of days before or after it, or on the day. */
export function AddLinkedTaskSheet({ event, open, onAdd, onClose }: AddLinkedTaskSheetProps) {
  const { language, t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState("1");
  const [direction, setDirection] = useState<Direction>("before");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const count = Math.max(0, Math.floor(Number(days) || 0));
  // `|| 0` turns "0 days before" (-0) into a plain 0.
  const offsetDays = (direction === "onTheDay" ? 0 : direction === "before" ? -count : count) || 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim() === "") return;
    onAdd(title, offsetDays);
    setTitle("");
    onClose();
  }

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="linked-task-heading" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id="linked-task-heading" className="sheet-title">
          {t("linkedTask.heading")}
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
              autoFocus
            />
          </label>
          <div className="field row-field">
            <span>{t("linkedTask.when")}</span>
            <span className="offset-inputs">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label={t("linkedTask.days")}
                value={days}
                disabled={direction === "onTheDay"}
                onChange={(e) => setDays(e.target.value)}
              />
              <select aria-label={t("linkedTask.when")} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                <option value="before">{t("linkedTask.before")}</option>
                <option value="onTheDay">{t("linkedTask.onTheDay")}</option>
                <option value="after">{t("linkedTask.after")}</option>
              </select>
            </span>
          </div>
        </div>
        <p className="hint">{t("linkedTask.resultingDate", { date: formatShortDay(linkedTaskDate(event, offsetDays), language) })}</p>
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
