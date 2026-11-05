import { ChevronRight, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { hrefOf } from "../app/routes";
import { dayOf } from "../home/days";
import { useI18n } from "../i18n/I18nProvider";
import type { Task } from "../tasks/taskStore";
import { SegmentedProgress } from "../ui/SegmentedProgress";
import type { List } from "./listStore";
import { arrangeProjects, listProgress, listSummary, type ProjectStatus } from "./lists";
import { NewListSheet } from "./NewListSheet";

interface ProjectsScreenProps {
  lists: List[];
  /** The live Tasks with their Events' dates (`withEventDates`). */
  tasks: Task[];
  now: Date;
  onAddList(name: string, isProject: boolean): void;
}

/** The Projects tab: Projects as cards with their Progress and next Task, the other Lists as rows below. */
export function ProjectsScreen({ lists, tasks, now, onAddList }: ProjectsScreenProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const today = dayOf(now);
  const { projects, lists: plain } = arrangeProjects(lists);

  const progressText = (list: List) => {
    const { done, total } = listProgress(tasks, list.id);
    return total === 0 ? t("project.noTasks") : t("project.progress", { done: String(done), total: String(total) });
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="large-title">{t("tabs.projects")}</h1>
        <button type="button" className="button-ghost small" onClick={() => setAdding(true)}>
          {t("projects.newList")}
        </button>
      </header>

      {lists.length === 0 && <p className="card empty">{t("projects.empty")}</p>}

      {projects.length > 0 && (
        <ul className="project-cards">
          {projects.map((list) => {
            const { progress, segments, status, next, nextOverdue } = listSummary(tasks, list.id, today);
            return (
              <li key={list.id}>
                <a className="card project-card" href={hrefOf({ name: "list", id: list.id })}>
                  <span className="project-card-head">
                    <span className="project-name">{list.name}</span>
                    <StatusLabel status={status} />
                  </span>
                  <SegmentedProgress progress={progress} segments={segments} />
                  <span className="project-card-foot">
                    <span className="task-meta">
                      {progressText(list)}
                      {next && " · "}
                      {next && (nextOverdue ? <span className="warning">{t("project.nextOverdue", { title: next.title })}</span> : next.title)}
                    </span>
                    <span className="project-open">
                      {t("project.open")}
                      <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {plain.length > 0 && (
        <section className="bucket" aria-labelledby="projects-lists">
          <div className="section-header">
            <h2 id="projects-lists" className="section-title">
              {t("projects.lists")}
            </h2>
            <span className="section-meta">{plain.length}</span>
          </div>
          <ul className="card task-list">
            {plain.map((list) => (
              <li key={list.id} className="task event-row">
                <a className="row-link" href={hrefOf({ name: "list", id: list.id })}>
                  <span className="task-text">
                    <span className="task-title">{list.name}</span>
                  </span>
                  <span className="task-meta">{progressText(list)}</span>
                  <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewListSheet open={adding} onCreate={onAddList} onClose={() => setAdding(false)} />
    </div>
  );
}

/** Overdue in amber with the warning icon, else a grey "On track" or "No deadline". ("At risk" is for Events.) */
function StatusLabel({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  if (status.kind === "overdue") {
    return (
      <span className="risk-badge at-risk">
        <TriangleAlert size={15} strokeWidth={1.5} aria-hidden="true" />
        {t("project.overdue", { count: String(status.count) })}
      </span>
    );
  }
  return <span className="risk-badge passed">{t(status.kind === "onTrack" ? "project.onTrack" : "project.noDeadline")}</span>;
}
