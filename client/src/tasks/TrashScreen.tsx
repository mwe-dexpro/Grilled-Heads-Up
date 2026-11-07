import { dayOf } from "../home/days";
import { formatMonthDay } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import { NavBar } from "../ui/NavBar";
import type { DeletedTask } from "./taskStore";
import { daysLeft, isExpired } from "./trash";

interface TrashScreenProps {
  /** Deleted Tasks, the latest deletion first. */
  tasks: DeletedTask[];
  now: Date;
  onRestore(id: string): void;
}

/** The Trash: Tasks deleted in the last 30 days, each with "Restore". Older ones are gone for good. */
export function TrashScreen({ tasks, now, onRestore }: TrashScreenProps) {
  const { language, t } = useI18n();
  const inTrash = tasks.filter((task) => !isExpired(task.deletedAt, now));

  return (
    <div className="screen">
      <NavBar />
      <header className="detail-header">
        <h1 className="large-title">{t("trash.title")}</h1>
      </header>
      {inTrash.length === 0 ? (
        <p className="calm">{t("trash.empty")}</p>
      ) : (
        <ul className="card task-list">
          {inTrash.map((task) => {
            const left = daysLeft(task.deletedAt, now);
            const meta = [
              t("trash.deleted", { date: formatMonthDay(dayOf(new Date(task.deletedAt)), language) }),
              left === 1 ? t("trash.daysLeftOne") : t("trash.daysLeft", { count: String(left) }),
            ].join(" · ");
            return (
              <li key={task.id} className="task trash-row">
                <div className="task-text">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">{meta}</span>
                </div>
                <button type="button" className="button-ghost small" aria-label={t("trash.restoreNamed", { title: task.title })} onClick={() => onRestore(task.id)}>
                  {t("trash.restore")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">{t("trash.hint")}</p>
    </div>
  );
}
