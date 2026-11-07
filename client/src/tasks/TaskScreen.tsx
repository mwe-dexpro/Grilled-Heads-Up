import { Calendar, Check, ChevronRight, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { hrefOf } from "../app/routes";
import { maxTagLength } from "../data/limits";
import { eventDays, eventProgress, withEventDate, type Event } from "../events/event";
import { formatEventWhen, formatOffset } from "../events/formatEvent";
import { dayOf, daysBetween, type Day } from "../home/days";
import { formatShortDay, formatTime } from "../home/format";
import { useI18n } from "../i18n/I18nProvider";
import type { List } from "../lists/listStore";
import { liveList, liveTags } from "../lists/lists";
import type { Subtask } from "../subtasks/subtaskStore";
import { subtasksOf } from "../subtasks/subtasks";
import { SubtasksSection } from "../subtasks/SubtasksSection";
import type { Tag } from "../tags/tagStore";
import { NavBar } from "../ui/NavBar";
import { availableActions } from "./availableActions";
import { PickDate } from "./PickDate";
import { earliestRescheduleDay, rescheduleOptions } from "./reschedule";
import type { Task } from "./taskStore";

interface TaskScreenProps {
  task: Task | undefined;
  tasks: Task[];
  events: Event[];
  /** The live Lists and Tags on this device. */
  lists: List[];
  tags: Tag[];
  /** Every live Subtask on this device; the screen shows the Task's own. */
  subtasks: Subtask[];
  now: Date;
  onComplete(id: string): void;
  onReschedule(id: string, day: Day): void;
  /** Deletes the Task (to the Trash), offers to undo it and goes back. */
  onDelete(task: Task): void;
  onLink(id: string, eventId: string, offsetDays: number): void;
  onUnlink(id: string, date: string | null): void;
  /** Puts the Task in a List, or in none (null). */
  onSetList(id: string, listId: string | null): void;
  /** Adds the Tag of that name, making it if there is none. */
  onAddTag(id: string, name: string): void;
  onRemoveTag(id: string, tagId: string): void;
  onAddSubtask(taskId: string, title: string): void;
  onRenameSubtask(id: string, title: string): void;
  onSetSubtaskDone(id: string, done: boolean): Promise<void> | void;
  onMoveSubtask(id: string, toIndex: number): Promise<void> | void;
  onMoveSubtaskBy(id: string, by: number): Promise<void> | void;
  /** Deletes the Subtask and offers to undo it; the screen stays. */
  onDeleteSubtask(subtask: Subtask): void;
}

/** Task detail: when it's due, its Subtasks, List and Tags, Reschedule, Delete and Complete, and for a Linked task the Event it is part of. */
export function TaskScreen({
  task: rawTask,
  tasks,
  events,
  lists,
  tags,
  subtasks,
  now,
  onComplete,
  onReschedule,
  onDelete,
  onLink,
  onUnlink,
  onSetList,
  onAddTag,
  onRemoveTag,
  onAddSubtask,
  onRenameSubtask,
  onSetSubtaskDone,
  onMoveSubtask,
  onMoveSubtaskBy,
  onDeleteSubtask,
}: TaskScreenProps) {
  const { language, t } = useI18n();
  const [chosenEventId, setChosenEventId] = useState("");
  const [picking, setPicking] = useState(false);
  const [newTag, setNewTag] = useState("");
  // This Task's Subtasks; the same array until a reload brings new ones (the Subtasks section tells a reload by it).
  const ownSubtasks = useMemo(() => subtasksOf(rawTask?.id ?? "", subtasks), [rawTask?.id, subtasks]);
  // Delete goes back, and a second tap before the screen has gone would go back once more (and delete again).
  const leaving = useRef(false);
  // Completing the Task from the Subtasks' offer takes the offer away, and the sticky button with it: the heading gets the focus.
  const heading = useRef<HTMLHeadingElement>(null);

  if (!rawTask) {
    return (
      <div className="screen">
        <NavBar />
        <p className="calm">{t("task.notFound")}</p>
      </div>
    );
  }

  const event = rawTask.eventId === null ? undefined : events.find((e) => e.id === rawTask.eventId);
  const task = withEventDate(rawTask, event);
  const taskTags = liveTags(task, tags);
  const completed = task.completedAt !== null;
  const today = dayOf(now);
  const due =
    task.date === null
      ? t("task.noDate")
      : t("task.due", { date: [formatShortDay(task.date, language), task.time && formatTime(task.time, language)].filter(Boolean).join(" · ") });
  const upcoming = events.filter((e) => eventDays(e).last >= today);
  const actions = availableActions(task, new Set(events.map((e) => e.id)));

  function addTag(e: FormEvent) {
    e.preventDefault();
    if (newTag.trim() === "") return;
    onAddTag(task.id, newTag);
    setNewTag("");
  }

  function link() {
    const chosen = events.find((e) => e.id === chosenEventId);
    if (!chosen) return;
    // A dated Task keeps its date; an undated one lands on the Event's day.
    onLink(task.id, chosen.id, task.date === null ? 0 : daysBetween(chosen.startDate, task.date));
  }

  return (
    <div className="screen">
      <NavBar />
      <header className="detail-header task-header">
        <input
          type="checkbox"
          className="check large"
          checked={completed}
          disabled={completed}
          onChange={() => onComplete(task.id)}
          aria-label={t("task.completeNamed", { title: task.title })}
        />
        <div>
          <h1 ref={heading} tabIndex={-1} className={completed ? "large-title completed" : "large-title"}>
            {task.title}
          </h1>
          <p className="eyebrow">{due}</p>
        </div>
      </header>

      {event ? (
        <>
          <a className="card part-of" href={hrefOf({ name: "event", id: event.id })}>
            <span className="icon-tile" aria-hidden="true">
              <Calendar size={20} strokeWidth={1.5} />
            </span>
            <span className="task-text">
              <span className="part-of-label">
                {t("task.partOf")} · {formatOffset(task.offsetDays!, t)}
              </span>
              <span className="event-title">{event.title}</span>
              <span className="task-meta">
                {formatEventWhen(event, language)} ·{" "}
                {t("home.progress", {
                  done: String(eventProgress(event.id, tasks).done),
                  total: String(eventProgress(event.id, tasks).total),
                })}
              </span>
            </span>
            <ChevronRight className="chevron" size={16} strokeWidth={1.5} aria-hidden="true" />
          </a>
          <div className="actions">
            <button type="button" className="button-ghost" onClick={() => onUnlink(task.id, task.date)}>
              {t("task.unlink")}
            </button>
          </div>
        </>
      ) : (
        <section className="bucket" aria-labelledby="link-heading">
          <div className="section-header">
            <h2 id="link-heading" className="section-title">
              {t("task.linkHeading")}
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="card empty">{t("task.noEvents")}</p>
          ) : (
            <div className="link-event">
              <select aria-label={t("task.linkEvent")} value={chosenEventId} onChange={(e) => setChosenEventId(e.target.value)}>
                <option value="">{t("task.linkChoose")}</option>
                {upcoming.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {formatShortDay(eventDays(e).first, language)}
                  </option>
                ))}
              </select>
              <button type="button" className="button-primary" disabled={!chosenEventId} onClick={link}>
                {t("task.link")}
              </button>
            </div>
          )}
        </section>
      )}

      <SubtasksSection
        task={task}
        subtasks={ownSubtasks}
        onAdd={onAddSubtask}
        onRename={onRenameSubtask}
        onSetDone={onSetSubtaskDone}
        onMove={onMoveSubtask}
        onMoveBy={onMoveSubtaskBy}
        onDelete={onDeleteSubtask}
        onCompleteTask={(id) => {
          heading.current?.focus();
          onComplete(id);
        }}
      />

      <section className="bucket" aria-labelledby="task-list-heading">
        <div className="section-header">
          <h2 id="task-list-heading" className="section-title">
            {t("task.listHeading")}
          </h2>
        </div>
        <div className="link-event">
          {/* A List that is not live on this device (deleted elsewhere, not arrived yet) counts as none. */}
          <select aria-label={t("task.listHeading")} value={liveList(task, lists)?.id ?? ""} onChange={(e) => onSetList(task.id, e.target.value || null)}>
            <option value="">{t("task.noList")}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bucket" aria-labelledby="task-tags-heading">
        <div className="section-header">
          <h2 id="task-tags-heading" className="section-title">
            {t("task.tagsHeading")}
          </h2>
        </div>
        {taskTags.length > 0 && (
          <ul className="chips tag-chips">
            {taskTags.map((tag) => (
              <li key={tag.id} className="chip">
                {tag.name}
                <button type="button" className="chip-remove" aria-label={t("task.removeTag", { name: tag.name })} onClick={() => onRemoveTag(task.id, tag.id)}>
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="link-event" onSubmit={addTag}>
          <input
            className="tag-input"
            list="tag-names"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t("task.addTag")}
            aria-label={t("task.addTag")}
            maxLength={maxTagLength}
            autoComplete="off"
            enterKeyHint="done"
          />
          <datalist id="tag-names">
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <button type="submit" className="button-primary" disabled={newTag.trim() === ""}>
            {t("task.addTagButton")}
          </button>
        </form>
      </section>

      {actions.includes("reschedule") && (
        <section className="bucket" aria-labelledby="task-reschedule-heading">
          <div className="section-header">
            <h2 id="task-reschedule-heading" className="section-title">
              {t("reschedule.heading")}
            </h2>
          </div>
          <div className="chips">
            {rescheduleOptions(today).map(({ choice, day }) => (
              <button key={choice} type="button" className="chip" onClick={() => onReschedule(task.id, day)}>
                {t(`reschedule.${choice}`)}
              </button>
            ))}
            <button type="button" className="chip" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              <Calendar size={16} strokeWidth={1.5} aria-hidden="true" />
              {t("reschedule.pick")}
            </button>
          </div>
          {picking && <PickDate today={today} earliest={earliestRescheduleDay(task, today)} onPick={(day) => onReschedule(task.id, day)} />}
        </section>
      )}

      <div className="actions">
        <button
          type="button"
          className="button-delete"
          onClick={() => {
            if (leaving.current) return;
            leaving.current = true;
            onDelete(rawTask);
          }}
        >
          <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
          {t("task.delete")}
        </button>
      </div>

      {!completed && (
        <div className="sticky-action">
          <button type="button" className="button-primary wide" onClick={() => onComplete(task.id)}>
            <Check size={18} strokeWidth={1.5} aria-hidden="true" />
            {t("task.complete")}
          </button>
        </div>
      )}
    </div>
  );
}
