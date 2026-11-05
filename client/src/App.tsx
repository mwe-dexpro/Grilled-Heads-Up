import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { goBack, navigate, useRoute } from "./app/navigation";
import type { Route } from "./app/routes";
import { useAppData } from "./app/useAppData";
import { useSignedIn } from "./auth/AuthGate";
import { useDatabaseOutdated } from "./data/useDatabaseOutdated";
import { EventForm } from "./events/EventForm";
import { EventScreen } from "./events/EventScreen";
import { withEventDates } from "./events/event";
import { dayOf } from "./home/days";
import { HomeScreen } from "./home/HomeScreen";
import { useNow } from "./home/useNow";
import { useI18n } from "./i18n/I18nProvider";
import { availableActions, type TaskAction } from "./tasks/availableActions";
import { earliestRescheduleDay } from "./tasks/reschedule";
import { RescheduleSheet } from "./tasks/RescheduleSheet";
import { TaskActionsSheet } from "./tasks/TaskActionsSheet";
import { TaskScreen } from "./tasks/TaskScreen";
import { NoTaskError } from "./tasks/taskStore";
import type { TaskActions } from "./tasks/TaskSwipeRow";
import { TrashScreen } from "./tasks/TrashScreen";
import { NewTaskSheet } from "./ui/NewTaskSheet";
import { TabBar, type Tab } from "./ui/TabBar";
import { UndoToast } from "./ui/UndoToast";

const tabs: Tab[] = ["today", "calendar", "projects"];

export function App() {
  const { t } = useI18n();
  const data = useAppData();
  const now = useNow();
  const route = useRoute();
  const [adding, setAdding] = useState(false);
  // The Task whose actions sheet is open, the Tasks the Reschedule sheet is open for, and the Task just deleted
  // (the undo toast). They live here, not in the screens, so that the toast outlives Task detail.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rescheduleIds, setRescheduleIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<{ taskId: string } | null>(null);
  const currentTab = tabs.find((tab) => tab === route.name);

  // The server no longer knows this session (it expired): go and sign in again. Local data stays; sync resumes after.
  const { recheck } = useSignedIn();
  const signedOut = data.sync.status === "signedOut";
  useEffect(() => {
    if (signedOut) void recheck();
  }, [signedOut, recheck]);

  const closeToast = useCallback(() => setDeleted(null), []);

  // Linked tasks need their Events' dates to be told when they are due (Overdue, earliest day to Reschedule to).
  const datedTasks = useMemo(() => withEventDates(data.tasks, data.events), [data.tasks, data.events]);
  const eventIds = useMemo(() => new Set(data.events.map((event) => event.id)), [data.events]);
  const today = dayOf(now);

  const { deleteTask, restoreTask, completeTask, rescheduleTasks } = data;
  const actions: TaskActions = {
    complete: completeTask,
    reschedule: (tasks) => setRescheduleIds(tasks.map((task) => task.id)),
    remove: async (task) => {
      try {
        await deleteTask(task.id);
        setDeleted({ taskId: task.id });
      } catch (error) {
        // The Task is gone already (a sync deleted it a moment ago): nothing to delete, nothing to undo.
        // Any other failure is a real one, and is not hidden.
        if (!(error instanceof NoTaskError)) throw error;
      }
    },
    openMenu: (task) => setMenuId(task.id),
  };

  const menuTask = datedTasks.find((task) => task.id === menuId);
  const reschedulingTasks = rescheduleIds.flatMap((id) => datedTasks.filter((task) => task.id === id));
  const earliest = reschedulingTasks.map((task) => earliestRescheduleDay(task, today)).reduce((a, b) => (a > b ? a : b), today);

  function selectFromMenu(action: TaskAction) {
    if (!menuTask) return;
    setMenuId(null);
    if (action === "complete") completeTask(menuTask.id);
    else if (action === "reschedule") setRescheduleIds([menuTask.id]);
    else void actions.remove(menuTask);
  }

  const outdated = useDatabaseOutdated();
  if (outdated) return <ReloadScreen />;

  return (
    <div className="app">
      <main>{data.ready || route.name === "today" ? <Screen route={route} data={data} now={now} actions={actions} /> : null}</main>

      {/* Quick add sits on every screen. */}
      <button type="button" className="fab" aria-label={t("newTask.open")} disabled={!data.ready} onClick={() => setAdding(true)}>
        <Plus size={26} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <NewTaskSheet
        open={adding}
        onAdd={data.addTask}
        onNewEvent={() => navigate({ name: "newEvent" })}
        onClose={() => setAdding(false)}
      />
      <TaskActionsSheet
        open={menuTask !== undefined}
        title={menuTask?.title ?? ""}
        actions={menuTask ? availableActions(menuTask, eventIds) : []}
        onSelect={selectFromMenu}
        onClose={() => setMenuId(null)}
      />
      <RescheduleSheet
        open={reschedulingTasks.length > 0}
        title={reschedulingTasks.length === 1 ? reschedulingTasks[0].title : t("reschedule.tasks", { count: String(reschedulingTasks.length) })}
        today={today}
        earliest={earliest}
        onChoose={(day) => {
          const ids = reschedulingTasks.map((task) => task.id);
          setRescheduleIds([]);
          void rescheduleTasks(ids, day);
        }}
        onClose={() => setRescheduleIds([])}
      />
      <UndoToast
        deletedTaskId={deleted?.taskId ?? null}
        onUndo={() => {
          if (!deleted) return;
          setDeleted(null);
          void restoreTask(deleted.taskId);
        }}
        onExpire={closeToast}
      />
      <TabBar current={currentTab} onSelect={(tab) => navigate({ name: tab })} />
    </div>
  );
}

/** Another tab upgraded the database and this tab let go of it; nothing could be saved here any more. */
function ReloadScreen() {
  const { t } = useI18n();
  return (
    <div className="screen auth-screen">
      <header className="detail-header">
        <p className="eyebrow">{t("app.title")}</p>
        <h1 className="large-title">{t("outdated.title")}</h1>
      </header>
      <p className="auth-text" role="alert">
        {t("outdated.text")}
      </p>
      <div className="actions">
        <button type="button" className="button-primary" onClick={() => window.location.reload()}>
          {t("outdated.reload")}
        </button>
      </div>
    </div>
  );
}

function Screen({ route, data, now, actions }: { route: Route; data: ReturnType<typeof useAppData>; now: Date; actions: TaskActions }) {
  const { t } = useI18n();
  switch (route.name) {
    case "today":
      return (
        <HomeScreen
          ready={data.ready}
          tasks={data.tasks}
          events={data.events}
          now={now}
          sync={data.sync}
          onSyncNow={data.syncNow}
          actions={actions}
        />
      );
    case "calendar":
    case "projects":
      return (
        <div className="screen">
          <header className="screen-header">
            <h1 className="large-title">{t(`tabs.${route.name}`)}</h1>
          </header>
          <p className="calm">{t("screen.notBuilt")}</p>
        </div>
      );
    case "newEvent":
      return (
        <EventForm
          now={now}
          onSave={async (fields) => {
            const event = await data.addEvent(fields);
            // Replace the form in the history, so Back from the new Event goes where the form was opened from.
            if (event) navigate({ name: "event", id: event.id }, { replace: true });
          }}
        />
      );
    case "editEvent": {
      const event = data.events.find((e) => e.id === route.id);
      if (!event) return <EventScreen event={undefined} tasks={[]} now={now} actions={actions} onAddTask={() => {}} />;
      return (
        <EventForm
          key={event.id}
          event={event}
          now={now}
          onSave={async (fields, base) => {
            await data.updateEvent(event.id, fields, base);
            goBack();
          }}
        />
      );
    }
    case "event":
      return (
        <EventScreen
          event={data.events.find((e) => e.id === route.id)}
          tasks={data.tasks}
          now={now}
          actions={actions}
          onAddTask={(title, offsetDays) => data.addTask(title, { eventId: route.id, offsetDays })}
        />
      );
    case "task":
      return (
        <TaskScreen
          key={route.id}
          task={data.tasks.find((task) => task.id === route.id)}
          tasks={data.tasks}
          events={data.events}
          now={now}
          onComplete={data.completeTask}
          onReschedule={(id, day) => void data.rescheduleTask(id, day)}
          onDelete={(task) => {
            void actions.remove(task);
            goBack();
          }}
          onLink={data.linkTask}
          onUnlink={data.unlinkTask}
        />
      );
    case "trash":
      return <TrashScreen tasks={data.trash} now={now} onRestore={data.restoreTask} />;
  }
}
