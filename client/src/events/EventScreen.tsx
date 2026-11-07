import { MapPin, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { hrefOf } from "../app/routes";
import { dayOf } from "../home/days";
import { formatShortDay, formatTime } from "../home/format";
import type { Progress } from "../home/buckets";
import { useI18n } from "../i18n/I18nProvider";
import { SubtaskCount } from "../subtasks/SubtaskCount";
import type { Task } from "../tasks/taskStore";
import { TaskSwipeRow, type TaskActions } from "../tasks/TaskSwipeRow";
import { NavBar } from "../ui/NavBar";
import { SegmentedProgress } from "../ui/SegmentedProgress";
import { AddLinkedTaskSheet } from "./AddLinkedTaskSheet";
import { CountdownLine } from "./CountdownLine";
import { eventDays, eventProgress, linkedTasksOf, type Event, type LinkedTask } from "./event";
import { formatEventWhen, formatOffset, formatRelativeDay, inOtherTimeZone } from "./formatEvent";
import { formatRiskExplanation } from "./formatRisk";
import { RiskBadge } from "./RiskBadge";
import { countdown, eventRisk, isOverdue, linkedRole } from "./risk";

interface EventScreenProps {
  event: Event | undefined;
  tasks: Task[];
  now: Date;
  actions: TaskActions;
  /** Each Task's Subtask count (only Tasks that have Subtasks). */
  counts: Map<string, Progress>;
  onAddTask: (title: string, offsetDays: number) => void;
}

/** The Event view: when and where, its Progress and risk, and its Preparation and Follow-up tasks with their Offsets. */
export function EventScreen({ event, tasks, now, actions, counts, onAddTask }: EventScreenProps) {
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
  const linked = linkedTasksOf(event, tasks).sort((a, b) => a.offsetDays - b.offsetDays || (a.time ?? "").localeCompare(b.time ?? "") || a.createdAt.localeCompare(b.createdAt));
  const progress = eventProgress(event.id, tasks);
  const risk = eventRisk(event, tasks, now);
  const countdownLine = countdown(event, tasks, now);
  const explanation = formatRiskExplanation(event, risk, now, t);
  const preparation = linked.filter((task) => linkedRole(task, event) === "preparation");
  const followUp = linked.filter((task) => linkedRole(task, event) === "followUp");
  const when = `${formatEventWhen(event, language)} · ${formatRelativeDay(eventDays(event).first, today, t)}`;

  // Only this Event is known here, and the Tasks listed belong to it.
  const eventIds = new Set([event.id]);
  const taskList = (list: LinkedTask[]) => (
    <ul className="card task-list">
      {list.map((task) => {
        const completed = task.completedAt !== null;
        const overdue = isOverdue(task, today);
        const subtasks = counts.get(task.id);
        const meta = [formatOffset(task.offsetDays, t), formatShortDay(task.date, language), task.time !== null ? formatTime(task.time, language) : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <TaskSwipeRow
            key={task.id}
            task={task}
            eventIds={eventIds}
            actions={actions}
            className={["task", completed && "completed", overdue && "overdue"].filter(Boolean).join(" ")}
          >
            <input
              type="checkbox"
              className="check"
              checked={completed}
              disabled={completed}
              onChange={() => actions.complete(task.id)}
              aria-label={t("task.completeNamed", { title: task.title })}
            />
            <div className="task-text">
              <a className="task-title" href={hrefOf({ name: "task", id: task.id })}>
                {task.title}
              </a>
              <span className={overdue ? "task-meta warning" : "task-meta"}>
                {meta}
                {subtasks && (
                  <>
                    {" · "}
                    <SubtaskCount progress={subtasks} />
                  </>
                )}
              </span>
            </div>
          </TaskSwipeRow>
        );
      })}
    </ul>
  );

  return (
    <div className="screen">
      <NavBar right={<a className="nav-action" href={hrefOf({ name: "editEvent", id: event.id })}>{t("nav.edit")}</a>} />
      <header className="detail-header">
        <p className="eyebrow">{when}</p>
        <h1 className="large-title">{event.title}</h1>
        {inOtherTimeZone(event) && <p className="eyebrow">{t("event.timeZone", { zone: event.timeZone })}</p>}
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
          <div className="band-header">
            <h2 id="event-progress" className="section-title">
              <span className="visually-hidden">{t("event.progress")}: </span>
              {t("home.progress", { done: String(progress.done), total: String(progress.total) })}
            </h2>
            <RiskBadge risk={risk} />
          </div>
          {countdownLine ? <CountdownLine countdown={countdownLine} eventDay={eventDays(event).first} /> : <SegmentedProgress progress={progress} />}
          {explanation !== null && <p className="band-note">{explanation}</p>}
        </section>
      )}

      {linked.length === 0 && (
        <TaskSection id="event-tasks" title={t("event.tasks")} hint={t("event.tasksHint")}>
          <p className="card empty">{t("event.noTasks")}</p>
        </TaskSection>
      )}
      {preparation.length > 0 && (
        <TaskSection id="event-preparation" title={t("event.preparation")} hint={t("event.tasksHint")}>
          {taskList(preparation)}
        </TaskSection>
      )}
      {followUp.length > 0 && (
        <TaskSection id="event-follow-up" title={t("event.followUp")}>
          {taskList(followUp)}
        </TaskSection>
      )}
      <div className="actions">
        <button type="button" className="button-primary" onClick={() => setAdding(true)}>
          <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          {t("event.addTask")}
        </button>
      </div>

      <AddLinkedTaskSheet event={event} open={adding} onAdd={onAddTask} onClose={() => setAdding(false)} />
    </div>
  );
}

function TaskSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bucket" aria-labelledby={id}>
      <div className="section-header">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {hint !== undefined && <span className="section-meta">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
