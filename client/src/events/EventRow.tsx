import { Calendar, ChevronRight } from "lucide-react";
import { hrefOf } from "../app/routes";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { eventProgress, type Event } from "./event";
import { formatEventTime } from "./formatEvent";

/** An Event inside a home-screen Bucket: title, time and Progress; opens the Event view. */
export function EventRow({ event, tasks }: { event: Event; tasks: Task[] }) {
  const { language, t } = useI18n();
  const progress = eventProgress(event.id, tasks);
  const meta = [
    formatEventTime(event, language, t),
    progress.total > 0 && t("home.progress", { done: String(progress.done), total: String(progress.total) }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="task event-row">
      <a className="row-link" href={hrefOf({ name: "event", id: event.id })}>
        <span className="icon-tile" aria-hidden="true">
          <Calendar size={20} strokeWidth={1.5} />
        </span>
        <span className="task-text">
          <span className="event-title">{event.title}</span>
          <span className="task-meta">{meta}</span>
        </span>
        <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
      </a>
    </li>
  );
}
