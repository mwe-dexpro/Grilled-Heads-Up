import { Calendar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatShortDay } from "../home/format";
import type { Day } from "../home/days";
import { useI18n } from "../i18n/I18nProvider";
import { PickDate } from "./PickDate";
import { rescheduleOptions } from "./reschedule";

interface RescheduleSheetProps {
  open: boolean;
  /** The Task's title, or "N tasks" for Reschedule all. */
  title: string;
  today: Day;
  /** The earliest day every Task in the sheet can go to. */
  earliest: Day;
  onChoose: (day: Day) => void;
  onClose: () => void;
}

/**
 * The Reschedule sheet: Tomorrow, the day after tomorrow, next Monday, or a picked date. There is no Today, and
 * "Pick a date" starts on tomorrow, so an Overdue Task can't be pushed to today by accident. Choosing applies at once.
 */
export function RescheduleSheet({ open, title, today, earliest, onChoose, onClose }: RescheduleSheetProps) {
  const { language, t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) setPicking(false);
  }, [open]);

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="reschedule-heading" onClose={onClose}>
      <p className="eyebrow">{t("reschedule.heading")}</p>
      <h2 id="reschedule-heading" className="sheet-title">
        {title}
      </h2>
      <div className="card option-card">
        {rescheduleOptions(today).map(({ choice, day }) => (
          <button key={choice} type="button" className="option" onClick={() => onChoose(day)}>
            <span>{t(`reschedule.${choice}`)}</span>
            <span className="option-date">{formatShortDay(day, language)}</span>
          </button>
        ))}
        <button type="button" className="option pick" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <Calendar size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("reschedule.pick")}</span>
        </button>
        {picking && <PickDate today={today} earliest={earliest} onPick={onChoose} />}
      </div>
      <div className="sheet-actions">
        <button type="button" className="button-text" onClick={onClose}>
          {t("reschedule.cancel")}
        </button>
      </div>
    </dialog>
  );
}
