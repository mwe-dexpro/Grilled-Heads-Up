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
      // Show it Completed right away; the controlled checkbox would otherwise flick back until the write lands.
      const completedAt = new Date().toISOString();
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, completedAt } : task)));
      await store.completeTask(id);
      setTasks(await store.listTasks());
    },
    [store],
  );

  return { ready: store !== null, tasks, addTask, completeTask };
}
