import { Plus } from "lucide-react";
import { useState } from "react";
import { HomeScreen } from "./home/HomeScreen";
import { useNow } from "./home/useNow";
import { useI18n } from "./i18n/I18nProvider";
import { useTasks } from "./tasks/useTasks";
import { NewTaskSheet } from "./ui/NewTaskSheet";
import { TabBar, type Tab } from "./ui/TabBar";

export function App() {
  const { t } = useI18n();
  const { ready, tasks, addTask, completeTask } = useTasks();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("today");
  const [adding, setAdding] = useState(false);

  return (
    <div className="app">
      <main>
        {tab === "today" ? (
          <HomeScreen ready={ready} tasks={tasks} now={now} onComplete={completeTask} />
        ) : (
          <div className="screen">
            <header className="screen-header">
              <h1 className="large-title">{t(`tabs.${tab}`)}</h1>
            </header>
            <p className="calm">{t("screen.notBuilt")}</p>
          </div>
        )}
      </main>

      {/* Quick add sits on every screen. */}
      <button type="button" className="fab" aria-label={t("newTask.open")} disabled={!ready} onClick={() => setAdding(true)}>
        <Plus size={26} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <NewTaskSheet open={adding} onAdd={addTask} onClose={() => setAdding(false)} />
      <TabBar current={tab} onSelect={setTab} />
    </div>
  );
}
