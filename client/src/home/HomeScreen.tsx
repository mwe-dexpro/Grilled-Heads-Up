import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Event } from "../events/event";
import { EventRow } from "../events/EventRow";
import { useI18n } from "../i18n/I18nProvider";
import type { List } from "../lists/listStore";
import { liveList } from "../lists/lists";
import { languages, type Language } from "../i18n/i18n";
import { formatSyncState } from "../sync/formatSync";
import type { SyncState } from "../sync/engine";
import type { Task } from "../tasks/taskStore";
import type { TaskActions } from "../tasks/TaskSwipeRow";
import { hrefOf } from "../app/routes";
import { SignInSettings } from "../auth/SignInSettings";
import { ProgressRing } from "../ui/ProgressRing";
import { arrangeHome, isOverdueEmphasised, type Bucket, type Progress } from "./buckets";
import { dayOf } from "./days";
import { formatLongDay, formatShortDay, formatWeekday } from "./format";
import { TaskRow } from "./TaskRow";

interface HomeScreenProps {
  ready: boolean;
  tasks: Task[];
  events: Event[];
  lists: List[];
  now: Date;
  sync: SyncState;
  onSyncNow: () => void;
  actions: TaskActions;
  /** Each Task's Subtask count (only Tasks that have Subtasks). */
  counts: Map<string, Progress>;
}

export function HomeScreen({ ready, tasks, events, lists, now, sync, onSyncNow, actions, counts }: HomeScreenProps) {
  const { language, setLanguage, t } = useI18n();
  const buckets = arrangeHome(tasks, now, events);
  const [overdue, today, ...rest] = buckets;
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const isEmpty = (bucket: Bucket) => bucket.tasks.length === 0 && bucket.events.length === 0;

  const taskRows = (bucket: Bucket) =>
    bucket.tasks.map((task) => (
      <TaskRow
        key={task.id}
        task={task}
        bucket={bucket.kind}
        now={now}
        event={task.eventId === null ? undefined : eventsById.get(task.eventId)}
        list={liveList(task, lists)}
        eventIds={eventsById}
        actions={actions}
        subtasks={counts.get(task.id)}
      />
    ));

  // Events first: they are what the day's Tasks prepare for.
  const taskList = (bucket: Bucket) => (
    <ul className="card task-list">
      {bucket.events.map((event) => (
        <EventRow key={event.id} event={event} tasks={tasks} now={now} />
      ))}
      {taskRows(bucket)}
    </ul>
  );

  const restMeta = (bucket: Bucket): string => {
    // Progress once something is Completed, otherwise just how many Tasks the Bucket holds.
    const { done, total } = bucket.progress;
    const count =
      done > 0 ? t("home.progress", { done: String(done), total: String(total) }) : String(total + bucket.events.length);
    const { firstDay, lastDay } = bucket;
    if (bucket.kind === "tomorrow" && firstDay !== null) return `${formatShortDay(firstDay, language)} · ${count}`;
    if (bucket.kind === "nextDays" && firstDay !== null && lastDay !== null)
      return `${formatWeekday(firstDay, language)} – ${formatWeekday(lastDay, language)} · ${count}`;
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
                    className={isOverdueEmphasised(overdue) ? "count-pill strong" : "count-pill"}
                    aria-label={t("bucket.overdueCount", { count: String(overdue.open) })}
                  >
                    {overdue.open}
                  </span>
                )}
                {overdue.open > 0 && (
                  <button
                    type="button"
                    className="button-text overdue-action"
                    onClick={() => actions.reschedule(overdue.tasks.filter((task) => task.completedAt === null))}
                  >
                    {t("bucket.rescheduleAll")}
                  </button>
                )}
              </div>
              <ul className="task-list">{taskRows(overdue)}</ul>
            </section>
          )}

          <BucketSection id="bucket-today" title={t("bucket.today")} meta={t("bucket.left", { count: String(today.open) })}>
            {isEmpty(today) ? <p className="card empty">{t("bucket.todayEmpty")}</p> : taskList(today)}
          </BucketSection>

          {rest
            .filter((bucket) => !isEmpty(bucket))
            .map((bucket) => (
              <BucketSection key={bucket.kind} id={`bucket-${bucket.kind}`} title={t(`bucket.${bucket.kind}`)} meta={restMeta(bucket)}>
                {taskList(bucket)}
              </BucketSection>
            ))}
        </>
      )}

      <footer className="screen-footer">
        <div className="sync-line">
          <SyncStatus sync={sync} line={formatSyncState(sync, now, language, t)} />
          <button type="button" className="button-text" onClick={onSyncNow}>
            {t("sync.now")}
          </button>
        </div>
        <a className="footer-link" href={hrefOf({ name: "trash" })}>
          {t("home.trash")}
        </a>
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
        <SignInSettings />
      </footer>
    </div>
  );
}

/**
 * The footer's sync line. Syncs run in the background about once a minute and each one moves the time in
 * "Synced 14:32", so that text is not a live region: screen readers would speak it every minute. A separate,
 * hidden live region announces the line only when it means something new: anything but "synced" (syncing,
 * offline, failed…), and "synced" again after one of those.
 */
function SyncStatus({ sync, line }: { sync: SyncState; line: string }) {
  const [announcement, setAnnouncement] = useState("");
  const before = useRef(sync.status);
  useEffect(() => {
    if (sync.status !== "idle" || before.current !== "idle") setAnnouncement(line);
    before.current = sync.status;
  }, [sync.status, line]);

  return (
    <>
      <p className="sync-status">{line}</p>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </>
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
