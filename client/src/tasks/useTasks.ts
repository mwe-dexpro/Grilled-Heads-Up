import { useCallback, useEffect, useState } from "react";
import { openTaskStore, type Task, type TaskStore } from "./taskStore";

export function useTasks() {
  const [store, setStore] = useState<TaskStore | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let opened: TaskStore | null = null;
    let cancelled = false;
    openTaskStore().then(async (s) => {
      if (cancelled) return s.close();
      opened = s;
      setTasks(await s.listTasks());
      setStore(s);
    });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);

  const addTask = useCallback(
    async (title: string) => {
      if (!store) return;
      await store.addTask(title);
      setTasks(await store.listTasks());
    },
    [store],
  );

  const completeTask = useCallback(
    async (id: string) => {
      if (!store) return;
      // Shown as Completed only once saved, so a reload right after never loses what the screen showed.
      await store.completeTask(id);
      setTasks(await store.listTasks());
    },
    [store],
  );

  return { ready: store !== null, tasks, addTask, completeTask };
}
