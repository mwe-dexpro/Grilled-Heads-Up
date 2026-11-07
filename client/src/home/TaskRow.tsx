import { Fragment } from "react";
import { hrefOf } from "../app/routes";
import type { Event } from "../events/event";
import { formatOffset } from "../events/formatEvent";
import { putsEventAtRisk } from "../events/risk";
import { useI18n } from "../i18n/I18nProvider";
import type { List } from "../lists/listStore";
import { SubtaskCount } from "../subtasks/SubtaskCount";
import { isDated, type Task } from "../tasks/taskStore";
import { TaskSwipeRow, type TaskActions } from "../tasks/TaskSwipeRow";
import { taskMeta, type BucketKind, type Progress } from "./buckets";
import { formatShortDay, formatTime } from "./format";

interface TaskRowProps {
  task: Task;
  bucket: BucketKind;
  now: Date;
  /** The Event of a Linked task; its name opens the Event view. */
  event?: Event | undefined;
  /** The Task's List; its name opens the Project view, in place of an Event name. Left out where the List is the screen. */
  list?: List | undefined;
  /** Ids of the Events on this device. */
  eventIds: { has(id: string): boolean };
  actions: TaskActions;
  /** How many of the Task's Subtasks are ticked; undefined when it has none. Ends the second line ("3/5"). */
  subtasks?: Progress | undefined;
}

export function TaskRow({ task, bucket, now, event, list, eventIds, actions, subtasks }: TaskRowProps) {
  const { language, t } = useI18n();
  const completed = task.completedAt !== null;
  const meta = taskMeta(task, bucket, now);

  let metaText: string | null = null;
  let warning = false;
  if (meta?.kind === "overdue") {
    metaText = meta.days === 1 ? t("task.overdueOne") : t("task.overdueMany", { count: String(meta.days) });
    warning = true;
  } else if (meta?.kind === "time") {
    metaText = formatTime(meta.time, language) + (meta.late ? ` · ${t("task.late")}` : "");
    warning = meta.late;
  } else if (meta?.kind === "offset") {
    metaText = formatOffset(meta.offsetDays, t);
  } else if (meta?.kind === "date") {
    metaText = [formatShortDay(meta.date, language), meta.time && formatTime(meta.time, language)].filter(Boolean).join(" · ");
  }

  // An Overdue Preparation task says it puts its Event At risk, instead of its age.
  const atRisk = event !== undefined && meta?.kind === "overdue" && isDated(task) && putsEventAtRisk(task, event, now);
  const eventLink = event && (
    <a className={atRisk ? "event-link at-risk" : "event-link"} href={hrefOf({ name: "event", id: event.id })}>
      {event.title}
    </a>
  );
  // The second line names the Event of a Linked task, else the List, else nothing (ALIGNMENT §1).
  const listLink = task.eventId === null && list && (
    <a className="event-link" href={hrefOf({ name: "list", id: list.id })}>
      {list.name}
    </a>
  );
  const place = eventLink || listLink;
  const [beforeEvent, afterEvent] = t("risk.putsAtRisk").split("{event}");

  // The second line: what the row says about the Task, then " · " and the Subtask count (ALIGNMENT §1).
  const parts = [
    ...(atRisk
      ? [
          <Fragment key="risk">
            {beforeEvent}
            {eventLink}
            {afterEvent}
          </Fragment>,
        ]
      : [place, metaText && <span className={warning ? "warning" : undefined}>{metaText}</span>]),
    subtasks && subtasks.total > 0 && <SubtaskCount progress={subtasks} />,
  ].filter(Boolean);

  const classes = ["task", completed && "completed", meta?.kind === "overdue" && "overdue"].filter(Boolean).join(" ");
  return (
    <TaskSwipeRow task={task} eventIds={eventIds} actions={actions} className={classes}>
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
        {parts.length > 0 && (
          <span className={atRisk ? "task-meta warning" : "task-meta"}>
            {parts.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </span>
        )}
        {completed && <span className="visually-hidden">{t("task.completed")}</span>}
      </div>
    </TaskSwipeRow>
  );
}
