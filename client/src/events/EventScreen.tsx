import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { hrefOf } from "../app/routes";
import { dayOf } from "../home/days";
import { formatShortDay, formatTime } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { NavBar } from "../ui/NavBar";
import { SegmentedProgress } from "../ui/SegmentedProgress";
import { AddLinkedTaskSheet } from "./AddLinkedTaskSheet";
import { eventDays, eventProgress, withEventDates, type Event } from "./event";
import { formatEventWhen, formatOffset, formatRelativeDay, inOtherTimeZone } from "./formatEvent";

interface EventScreenProps {
  event: Event | undefined;
  tasks: Task[];
  now: Date;
  onComplete(id: string): void;
  onAddTask(title: string, offsetDays: number): void;
}

/** The Event view: when and where, its Progress and its Linked tasks with their Offsets. */
export function EventScreen({ event, tasks, now, onComplete, onAddTask }: EventScreenProps) {
  const { language, t } = useI18n();
  const [adding, setAdding] = useState(false);

  if (!event) {
    return (
      <div className="screen">
        <NavBar />
        <p className="calm">{t("event.notFound")}</p>
      </div>
    );
  }

  const today = dayOf(now);
  const linked = withEventDates(
    tasks.filter((task) => task.eventId === event.id),
    [event],
  ).sort((a, b) => a.offsetDays! - b.offsetDays! || (a.time ?? "").localeCompare(b.time ?? "") || a.createdAt.localeCompare(b.createdAt));
  const progress = eventProgress(event.id, tasks);
  const when = `${formatEventWhen(event, language)} · ${formatRelativeDay(eventDays(event).first, today, t)}`;

  return (
    <div className="screen">
      <NavBar right={<a className="nav-action" href={hrefOf({ name: "editEvent", id: event.id })}>{t("nav.edit")}</a>} />
      <header className="detail-header">
        <p className="eyebrow">{when}</p>
        <h1 className="large-title">{event.title}</h1>
        {inOtherTimeZone(event) && <p className="eyebrow">{t("event.timeZone", { zone: event.timeZone! })}</p>}
        {event.location && (
          <a
            className="location"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t("event.openMaps", { location: event.location })}
          >
            <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{event.location}</span>
          </a>
        )}
        {event.notes && <p className="notes">{event.notes}</p>}
      </header>

      {progress.total > 0 && (
        <section className="band" aria-labelledby="event-progress">
          <h2 id="event-progress" className="section-title">
            <span className="visually-hidden">{t("event.progress")}: </span>
            {t("home.progress", { done: String(progress.done), total: String(progress.total) })}
          </h2>
          <SegmentedProgress progress={progress} />
        </section>
      )}

      <section className="bucket" aria-labelledby="event-tasks">
        <div className="section-header">
          <h2 id="event-tasks" className="section-title">
            {t("event.tasks")}
          </h2>
          <span className="section-meta">{t("event.tasksHint")}</span>
        </div>
        {linked.length === 0 ? (
          <p className="card empty">{t("event.noTasks")}</p>
        ) : (
          <ul className="card task-list">
            {linked.map((task) => {
              const completed = task.completedAt !== null;
              const overdue = !completed && task.date! < today;
              const meta = [formatOffset(task.offsetDays!, t), formatShortDay(task.date!, language), task.time && formatTime(task.time, language)]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={task.id} className={["task", completed && "completed", overdue && "overdue"].filter(Boolean).join(" ")}>
                  <input
                    type="checkbox"
                    className="check"
                    checked={completed}
                    disabled={completed}
                    onChange={() => onComplete(task.id)}
                    aria-label={t("task.completeNamed", { title: task.title })}
                  />
                  <div className="task-text">
                    <a className="task-title" href={hrefOf({ name: "task", id: task.id })}>
                      {task.title}
                    </a>
                    <span className={overdue ? "task-meta warning" : "task-meta"}>{meta}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="actions">
          <button type="button" className="button-primary" onClick={() => setAdding(true)}>
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
            {t("event.addTask")}
          </button>
        </div>
      </section>

      <AddLinkedTaskSheet event={event} open={adding} onAdd={onAddTask} onClose={() => setAdding(false)} />
    </div>
  );
}
