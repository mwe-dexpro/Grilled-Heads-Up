import { Plus } from "lucide-react";
import { useState } from "react";
import { goBack, navigate, useRoute } from "./app/navigation";
import type { Route } from "./app/routes";
import { useAppData } from "./app/useAppData";
import { EventForm } from "./events/EventForm";
import { EventScreen } from "./events/EventScreen";
import { HomeScreen } from "./home/HomeScreen";
import { useNow } from "./home/useNow";
import { useI18n } from "./i18n/I18nProvider";
import { TaskScreen } from "./tasks/TaskScreen";
import { NewTaskSheet } from "./ui/NewTaskSheet";
import { TabBar, type Tab } from "./ui/TabBar";

const tabs: Tab[] = ["today", "calendar", "projects"];

export function App() {
  const { t } = useI18n();
  const data = useAppData();
  const now = useNow();
  const route = useRoute();
  const [adding, setAdding] = useState(false);
  const currentTab = tabs.find((tab) => tab === route.name);

  return (
    <div className="app">
      <main>{data.ready || route.name === "today" ? <Screen route={route} data={data} now={now} /> : null}</main>

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
      <TabBar current={currentTab} onSelect={(tab) => navigate({ name: tab })} />
    </div>
  );
}

function Screen({ route, data, now }: { route: Route; data: ReturnType<typeof useAppData>; now: Date }) {
  const { t } = useI18n();
  switch (route.name) {
    case "today":
      return <HomeScreen ready={data.ready} tasks={data.tasks} events={data.events} now={now} onComplete={data.completeTask} />;
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
      if (!event) return <EventScreen event={undefined} tasks={[]} now={now} onComplete={data.completeTask} onAddTask={() => {}} />;
      return (
        <EventForm
          key={event.id}
          event={event}
          now={now}
          onSave={async (fields) => {
            await data.updateEvent(event.id, fields);
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
          onComplete={data.completeTask}
          onAddTask={(title, offsetDays) => data.addTask(title, { eventId: route.id, offsetDays })}
        />
      );
    case "task":
      return (
        <TaskScreen
          task={data.tasks.find((task) => task.id === route.id)}
          tasks={data.tasks}
          events={data.events}
          now={now}
          onComplete={data.completeTask}
          onLink={data.linkTask}
          onUnlink={data.unlinkTask}
        />
      );
  }
}
