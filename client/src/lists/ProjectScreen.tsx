import { useState } from "react";
import { navigate } from "../app/navigation";
import { bucketOf } from "../home/buckets";
import { dayOf } from "../home/days";
import { TaskRow } from "../home/TaskRow";
import { useI18n } from "../i18n/I18nProvider";
import type { Event } from "../events/event";
import type { Tag } from "../tags/tagStore";
import type { Task } from "../tasks/taskStore";
import type { TaskActions } from "../tasks/TaskSwipeRow";
import { NavBar } from "../ui/NavBar";
import { SegmentedProgress } from "../ui/SegmentedProgress";
import { EditListSheet } from "./EditListSheet";
import type { List } from "./listStore";
import { listProgress, listTasks, progressSegments, projectViewTasks, tagsInList } from "./lists";

interface ProjectScreenProps {
  list: List | undefined;
  /** The live Tasks with their Events' dates (`withEventDates`). */
  tasks: Task[];
  events: Event[];
  tags: Tag[];
  now: Date;
  actions: TaskActions;
  onRename(id: string, name: string): Promise<void> | void;
  onSetProject(id: string, isProject: boolean): Promise<void> | void;
  onDelete(id: string): Promise<void> | void;
}

/** The Project view: one List or Project with its open Tasks and Progress, "Show completed" and a Tag filter. */
export function ProjectScreen({ list, tasks, events, tags, now, actions, onRename, onSetProject, onDelete }: ProjectScreenProps) {
  const { t } = useI18n();
  const [showCompleted, setShowCompleted] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!list) {
    return (
      <div className="screen">
        <NavBar />
        <p className="calm">{t("list.notFound")}</p>
      </div>
    );
  }

  const today = dayOf(now);
  const progress = listProgress(tasks, list.id);
  const chips = tagsInList(tasks, list.id, tags);
  // A chosen Tag that no Task of the List has any more (removed meanwhile) filters nothing out of a view it can't show.
  const chosen = chips.some((tag) => tag.id === tagId) ? tagId : null;
  const shown = projectViewTasks(tasks, list.id, { showCompleted, tagId: chosen }, today);
  const eventsById = new Map(events.map((event) => [event.id, event]));

  return (
    <div className="screen">
      <NavBar
        right={
          <button type="button" className="nav-action" onClick={() => setEditing(true)}>
            {t("nav.edit")}
          </button>
        }
      />
      <header className="detail-header">
        <p className="eyebrow">{t(list.isProject ? "list.kindProject" : "list.kindList")}</p>
        <h1 className="large-title">{list.name}</h1>
      </header>

      {progress.total > 0 && (
        <section className="band" aria-labelledby="list-progress">
          <div className="band-header">
            <h2 id="list-progress" className="section-title">
              <span className="visually-hidden">{t("event.progress")}: </span>
              {t("home.progress", { done: String(progress.done), total: String(progress.total) })}
            </h2>
          </div>
          <SegmentedProgress progress={progress} segments={progressSegments(tasks, list.id, today)} />
        </section>
      )}

      {chips.length > 0 && (
        <div className="chips tag-filter" role="group" aria-label={t("list.filterLabel")}>
          <button type="button" className="chip" aria-pressed={chosen === null} onClick={() => setTagId(null)}>
            {t("list.filterAll")}
          </button>
          {chips.map((tag) => (
            <button key={tag.id} type="button" className="chip" aria-pressed={chosen === tag.id} onClick={() => setTagId(tag.id)}>
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <section className="bucket" aria-label={list.name}>
        {shown.length === 0 ? (
          <p className="card empty">{t("list.noOpenTasks")}</p>
        ) : (
          <ul className="card task-list">
            {shown.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                bucket={bucketOf(task, today)}
                now={now}
                event={task.eventId === null ? undefined : eventsById.get(task.eventId)}
                eventIds={eventsById}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="actions">
        <button type="button" className="chip" aria-pressed={showCompleted} onClick={() => setShowCompleted(!showCompleted)}>
          {t("list.showCompleted")}
        </button>
      </div>

      {editing && (
        <EditListSheet
          list={list}
          taskCount={listTasks(tasks, list.id).length}
          onSave={async (name, isProject) => {
            if (name.trim() !== list.name) await onRename(list.id, name);
            if (isProject !== list.isProject) await onSetProject(list.id, isProject);
          }}
          onDelete={async () => {
            setEditing(false);
            await onDelete(list.id);
            // Replace the entry, so that Back does not return to a List that is gone.
            navigate({ name: "projects" }, { replace: true });
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
