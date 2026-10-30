import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { taskMeta, type BucketKind } from "./buckets";
import { formatShortDay, formatTime } from "./format";

interface TaskRowProps {
  task: Task;
  bucket: BucketKind;
  now: Date;
  onComplete(id: string): void;
}

export function TaskRow({ task, bucket, now, onComplete }: TaskRowProps) {
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
  } else if (meta?.kind === "date") {
    metaText = [formatShortDay(meta.date, language), meta.time && formatTime(meta.time, language)].filter(Boolean).join(" · ");
  }

  const classes = ["task", completed && "completed", meta?.kind === "overdue" && "overdue"].filter(Boolean).join(" ");
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
        {metaText && <span className={warning ? "task-meta warning" : "task-meta"}>{metaText}</span>}
        {completed && <span className="visually-hidden">{t("task.completed")}</span>}
      </div>
    </li>
  );
}
