import { Calendar, ChevronRight } from "lucide-react";
import { useState } from "react";
import { hrefOf } from "../app/routes";
import { eventDays, eventProgress, withEventDates, type Event } from "../events/event";
import { formatEventWhen, formatOffset } from "../events/formatEvent";
import { dayOf, daysBetween } from "../home/days";
import { formatShortDay, formatTime } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import { NavBar } from "../ui/NavBar";
import type { Task } from "./taskStore";

interface TaskScreenProps {
  task: Task | undefined;
  tasks: Task[];
  events: Event[];
  now: Date;
  onComplete(id: string): void;
  onLink(id: string, eventId: string, offsetDays: number): void;
  onUnlink(id: string, date: string | null): void;
}

/** Task detail: when it's due and, for a Linked task, the Event it is part of. */
export function TaskScreen({ task: rawTask, tasks, events, now, onComplete, onLink, onUnlink }: TaskScreenProps) {
  const { language, t } = useI18n();
  const [chosenEventId, setChosenEventId] = useState("");

  if (!rawTask) {
    return (
      <div className="screen">
        <NavBar />
        <p className="calm">{t("task.notFound")}</p>
      </div>
    );
  }

  const [task] = withEventDates([rawTask], events);
  const event = task.eventId === null ? undefined : events.find((e) => e.id === task.eventId);
  const completed = task.completedAt !== null;
  const today = dayOf(now);
  const due =
    task.date === null
      ? t("task.noDate")
      : t("task.due", { date: [formatShortDay(task.date, language), task.time && formatTime(task.time, language)].filter(Boolean).join(" · ") });
  const upcoming = events.filter((e) => eventDays(e).last >= today);

  function link() {
    const chosen = events.find((e) => e.id === chosenEventId);
    if (!chosen) return;
    // A dated Task keeps its date; an undated one lands on the Event's day.
    onLink(task.id, chosen.id, task.date === null ? 0 : daysBetween(chosen.startDate, task.date));
  }

  return (
    <div className="screen">
      <NavBar />
      <header className="detail-header task-header">
        <input
          type="checkbox"
          className="check large"
          checked={completed}
          disabled={completed}
          onChange={() => onComplete(task.id)}
          aria-label={t("task.completeNamed", { title: task.title })}
        />
        <div>
          <h1 className={completed ? "large-title completed" : "large-title"}>{task.title}</h1>
          <p className="eyebrow">{due}</p>
        </div>
      </header>

      {event ? (
        <>
          <a className="card part-of" href={hrefOf({ name: "event", id: event.id })}>
            <span className="icon-tile" aria-hidden="true">
              <Calendar size={20} strokeWidth={1.5} />
            </span>
            <span className="task-text">
              <span className="part-of-label">
                {t("task.partOf")} · {formatOffset(task.offsetDays!, t)}
              </span>
              <span className="event-title">{event.title}</span>
              <span className="task-meta">
                {formatEventWhen(event, language)} ·{" "}
                {t("home.progress", {
                  done: String(eventProgress(event.id, tasks).done),
                  total: String(eventProgress(event.id, tasks).total),
                })}
              </span>
            </span>
            <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
          </a>
          <div className="actions">
            <button type="button" className="button-ghost" onClick={() => onUnlink(task.id, task.date)}>
              {t("task.unlink")}
            </button>
          </div>
        </>
      ) : (
        <section className="bucket" aria-labelledby="link-heading">
          <div className="section-header">
            <h2 id="link-heading" className="section-title">
              {t("task.linkHeading")}
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="card empty">{t("task.noEvents")}</p>
          ) : (
            <div className="link-event">
              <select aria-label={t("task.linkEvent")} value={chosenEventId} onChange={(e) => setChosenEventId(e.target.value)}>
                <option value="">{t("task.linkChoose")}</option>
                {upcoming.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {formatShortDay(eventDays(e).first, language)}
                  </option>
                ))}
              </select>
              <button type="button" className="button-primary" disabled={!chosenEventId} onClick={link}>
                {t("task.link")}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
