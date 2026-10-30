import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { isLate, type BucketKind } from "./buckets";
import { dayOf } from "./days";
import { daysBetween, formatShortDay, formatTime } from "./format";

interface TaskRowProps {
  task: Task;
  bucket: BucketKind;
  now: Date;
  onComplete(id: string): void;
}

export function TaskRow({ task, bucket, now, onComplete }: TaskRowProps) {
  const { language, t } = useI18n();
  const completed = task.completedAt !== null;
  const overdue = bucket === "overdue" && !completed;
  const late = isLate(task, now);

  const time = task.time === null ? null : formatTime(task.time, language);
  let meta: string | null = null;
  if (overdue) {
    const days = daysBetween(task.date!, dayOf(now));
    meta = days === 1 ? t("task.overdueOne") : t("task.overdueMany", { count: String(days) });
  } else if (bucket === "today" || bucket === "tomorrow") {
    meta = late ? `${time} · ${t("task.late")}` : time;
  } else if (task.date !== null) {
    meta = [formatShortDay(task.date, language), time].filter(Boolean).join(" · ");
  }

  const classes = ["task", completed && "completed", overdue && "overdue"].filter(Boolean).join(" ");
  return (
    <li className={classes}>
      <input
        type="checkbox"
        className="check"
        checked={completed}
        disabled={completed}
        onChange={() => onComplete(task.id)}
        aria-label={t("task.completeNamed", { title: task.title })}
      />
      <div className="task-text">
        <span className="task-title">{task.title}</span>
        {meta && <span className={overdue || late ? "task-meta warning" : "task-meta"}>{meta}</span>}
        {completed && <span className="visually-hidden">{t("task.completed")}</span>}
      </div>
    </li>
  );
}
