import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { languages, type Language } from "../i18n/i18n";
import type { Task } from "../tasks/taskStore";
import { ProgressRing } from "../ui/ProgressRing";
import { arrangeHome, type Bucket } from "./buckets";
import { dayOf } from "./days";
import { formatLongDay, formatShortDay, formatWeekday } from "./format";
import { TaskRow } from "./TaskRow";

/** Overdue becomes louder from this many Tasks. */
const overdueEmphasisFrom = 5;

interface HomeScreenProps {
  ready: boolean;
  tasks: Task[];
  now: Date;
  onComplete(id: string): void;
}

export function HomeScreen({ ready, tasks, now, onComplete }: HomeScreenProps) {
  const { language, setLanguage, t } = useI18n();
  const buckets = arrangeHome(tasks, now);
  const [overdue, today, ...rest] = buckets;

  const taskList = (bucket: Bucket) => (
    <ul className="card task-list">
      {bucket.tasks.map((task) => (
        <TaskRow key={task.id} task={task} bucket={bucket.kind} now={now} onComplete={onComplete} />
      ))}
    </ul>
  );

  const restMeta = (bucket: Bucket): string => {
    // Progress once something is Completed, otherwise just how many Tasks the Bucket holds.
    const { done, total } = bucket.progress;
    const count = done > 0 ? t("home.progress", { done: String(done), total: String(total) }) : String(total);
    if (bucket.kind === "tomorrow") return `${formatShortDay(bucket.firstDay!, language)} · ${count}`;
    if (bucket.kind === "nextDays")
      return `${formatWeekday(bucket.firstDay!, language)} – ${formatWeekday(bucket.lastDay!, language)} · ${count}`;
    return count;
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">{formatLongDay(dayOf(now), language)}</p>
          <h1 className="large-title">{t("home.title")}</h1>
        </div>
        {today.progress.total > 0 && (
          <p className="progress-summary">
            <ProgressRing progress={today.progress} />
            {t("home.progress", { done: String(today.progress.done), total: String(today.progress.total) })}
          </p>
        )}
      </header>

      {ready && (
        <>
          {overdue.tasks.length === 0 ? (
            <p className="calm">{t("bucket.overdueEmpty")}</p>
          ) : (
            <section className="card overdue-card" aria-labelledby="bucket-overdue">
              <div className="overdue-header">
                <span className="dot" aria-hidden="true" />
                <h2 id="bucket-overdue" className="card-title">
                  {t("bucket.overdue")}
                </h2>
                {overdue.open > 0 && (
                  <span
                    className={overdue.open >= overdueEmphasisFrom ? "count-pill strong" : "count-pill"}
                    aria-label={t("bucket.overdueCount", { count: String(overdue.open) })}
                  >
                    {overdue.open}
                  </span>
                )}
              </div>
              <ul className="task-list">
                {overdue.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} bucket="overdue" now={now} onComplete={onComplete} />
                ))}
              </ul>
            </section>
          )}

          <BucketSection id="bucket-today" title={t("bucket.today")} meta={t("bucket.left", { count: String(today.open) })}>
            {today.tasks.length === 0 ? <p className="card empty">{t("bucket.todayEmpty")}</p> : taskList(today)}
          </BucketSection>

          {rest
            .filter((bucket) => bucket.tasks.length > 0)
            .map((bucket) => (
              <BucketSection key={bucket.kind} id={`bucket-${bucket.kind}`} title={t(`bucket.${bucket.kind}`)} meta={restMeta(bucket)}>
                {taskList(bucket)}
              </BucketSection>
            ))}
        </>
      )}

      <footer className="screen-footer">
        <label className="language">
          {t("language.label")}
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </div>
  );
}

function BucketSection({ id, title, meta, children }: { id: string; title: string; meta: string; children: ReactNode }) {
  return (
    <section className="bucket" aria-labelledby={id}>
      <div className="section-header">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        <span className="section-meta">{meta}</span>
      </div>
      {children}
    </section>
  );
}
