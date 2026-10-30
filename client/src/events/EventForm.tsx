import { useState, type FormEvent } from "react";
import { goBack } from "../app/navigation";
import { dayOf } from "../home/days";
import { useI18n } from "../i18n/I18nProvider";
import { NavBar } from "../ui/NavBar";
import { deviceTimeZone, validateEvent, type Event, type EventFields } from "./event";
import { inOtherTimeZone } from "./formatEvent";

interface EventFormProps {
  /** The Event to edit; a new Event when missing. */
  event?: Event;
  now: Date;
  onSave(fields: EventFields): Promise<void>;
}

function newEventFields(now: Date): EventFields {
  const today = dayOf(now);
  return {
    title: "",
    allDay: false,
    startDate: today,
    startTime: "09:00",
    endDate: today,
    endTime: "10:00",
    timeZone: deviceTimeZone(),
    location: "",
    notes: "",
  };
}

function fieldsOf(event: Event): EventFields {
  const { title, allDay, startDate, startTime, endDate, endTime, timeZone, location, notes } = event;
  return { title, allDay, startDate, startTime, endDate, endTime, timeZone, location, notes };
}

/** Creates or edits an Event. Changing its dates moves its Linked tasks with it (they keep their Offsets). */
export function EventForm({ event, now, onSave }: EventFormProps) {
  const { t } = useI18n();
  const [fields, setFields] = useState<EventFields>(() => (event ? fieldsOf(event) : newEventFields(now)));
  const [showProblem, setShowProblem] = useState(false);
  const problem = validateEvent(fields);

  const update = (change: Partial<EventFields>) => setFields((current) => ({ ...current, ...change }));

  function setAllDay(allDay: boolean) {
    update(
      allDay
        ? { allDay, startTime: null, endTime: null, timeZone: null }
        : { allDay, startTime: "09:00", endTime: "10:00", timeZone: event?.timeZone ?? deviceTimeZone() },
    );
  }

  function setStartDate(startDate: string) {
    if (!startDate) return;
    // Keep the end from landing before the new start.
    update({ startDate, endDate: fields.endDate < startDate ? startDate : fields.endDate });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setShowProblem(true);
      return;
    }
    await onSave(fields);
  }

  return (
    <form className="screen" onSubmit={handleSubmit} noValidate>
      <NavBar
        left={
          <button type="button" className="nav-action" onClick={goBack}>
            {t("eventForm.cancel")}
          </button>
        }
        title={event ? t("eventForm.edit") : t("eventForm.new")}
        right={
          <button type="submit" className="nav-action strong">
            {event ? t("eventForm.save") : t("eventForm.add")}
          </button>
        }
      />

      <div className="card form-card">
        <label className="field">
          <span className="visually-hidden">{t("eventForm.title")}</span>
          <input
            className="title-input"
            value={fields.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder={t("eventForm.titlePlaceholder")}
            autoComplete="off"
            autoFocus={!event}
          />
        </label>
        <label className="field row-field">
          {t("eventForm.allDay")}
          <input type="checkbox" className="switch" checked={fields.allDay} onChange={(e) => setAllDay(e.target.checked)} />
        </label>
        <div className="field row-field">
          <span>{t("eventForm.starts")}</span>
          <span className="date-time">
            <input type="date" aria-label={t("eventForm.startDate")} value={fields.startDate} onChange={(e) => setStartDate(e.target.value)} />
            {!fields.allDay && (
              <input
                type="time"
                aria-label={t("eventForm.startTime")}
                value={fields.startTime ?? ""}
                onChange={(e) => update({ startTime: e.target.value || null })}
              />
            )}
          </span>
        </div>
        <div className="field row-field">
          <span>{t("eventForm.ends")}</span>
          <span className="date-time">
            <input
              type="date"
              aria-label={t("eventForm.endDate")}
              value={fields.endDate}
              min={fields.startDate}
              onChange={(e) => e.target.value && update({ endDate: e.target.value })}
            />
            {!fields.allDay && (
              <input
                type="time"
                aria-label={t("eventForm.endTime")}
                value={fields.endTime ?? ""}
                onChange={(e) => update({ endTime: e.target.value || null })}
              />
            )}
          </span>
        </div>
      </div>
      {inOtherTimeZone(fields) && <p className="hint">{t("event.timeZone", { zone: fields.timeZone! })}</p>}

      <div className="card form-card spaced">
        <label className="field">
          <span className="visually-hidden">{t("eventForm.location")}</span>
          <input value={fields.location} onChange={(e) => update({ location: e.target.value })} placeholder={t("eventForm.location")} />
        </label>
        <label className="field">
          <span className="visually-hidden">{t("eventForm.notes")}</span>
          <textarea rows={3} value={fields.notes} onChange={(e) => update({ notes: e.target.value })} placeholder={t("eventForm.notes")} />
        </label>
      </div>

      {showProblem && problem && (
        <p className="problem" role="alert">
          {t(`eventForm.problem.${problem}`)}
        </p>
      )}
    </form>
  );
}
