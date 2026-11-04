import { useState, type FormEvent } from "react";
import { addDays, type Day } from "../home/days";
import { useI18n } from "../i18n/I18nProvider";
import { chosenDay } from "./reschedule";

interface PickDateProps {
  today: Day;
  /** The earliest day that can be picked (`earliestRescheduleDay`): tomorrow for an Overdue Task. */
  earliest: Day;
  onPick(day: Day): void;
}

/** "Pick a date": a date input that starts on tomorrow and can't go before `earliest`. Leaving it empty means tomorrow. */
export function PickDate({ today, earliest, onPick }: PickDateProps) {
  const { t } = useI18n();
  const [date, setDate] = useState(() => addDays(today, 1));
  // A day typed in by hand can still be before `min`; the button waits for a day that counts.
  const allowed = date === "" || date >= earliest;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (allowed) onPick(chosenDay(date, today));
  }

  return (
    <form className="pick-date" onSubmit={handleSubmit}>
      <input type="date" aria-label={t("reschedule.date")} value={date} min={earliest} onChange={(e) => setDate(e.target.value)} />
      <button type="submit" className="button-primary" disabled={!allowed}>
        {t("reschedule.confirm")}
      </button>
    </form>
  );
}
