import { useState, type FormEvent } from "react";
import { useI18n } from "./i18n/I18nProvider";
import { languages, type Language } from "./i18n/i18n";
import { useTasks } from "./tasks/useTasks";

export function App() {
  const { language, setLanguage, t } = useI18n();
  const { ready, tasks, addTask, completeTask } = useTasks();
  const [title, setTitle] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") return;
    // Clear first so typing the next Task while this one is saved is not wiped out.
    setTitle("");
    await addTask(title);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t("app.title")}</h1>
        <label className="language">
          <span className="visually-hidden">{t("language.label")}</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        <form className="new-task" onSubmit={handleSubmit}>
          <label htmlFor="new-task-title" className="visually-hidden">
            {t("task.newTitle.label")}
          </label>
          <input
            id="new-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("task.newTitle.placeholder")}
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="submit" disabled={!ready || title.trim() === ""}>
            {t("task.add")}
          </button>
        </form>

        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading">{t("tasks.heading")}</h2>
          {ready && tasks.length === 0 && <p className="empty">{t("tasks.empty")}</p>}
          <ul className="tasks">
            {tasks.map((task) => {
              const completed = task.completedAt !== null;
              return (
                <li key={task.id} className={completed ? "task completed" : "task"}>
                  <label>
                    <input
                      type="checkbox"
                      checked={completed}
                      disabled={completed}
                      onChange={() => completeTask(task.id)}
                      aria-label={t("task.completeNamed", { title: task.title })}
                    />
                    <span className="task-title">{task.title}</span>
                  </label>
                  {completed && <span className="visually-hidden">{t("task.completed")}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
