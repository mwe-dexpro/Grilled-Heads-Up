import { useCallback, useEffect, useState } from "react";
import type { Event, EventFields } from "../events/event";
import { openEventStore, type EventStore } from "../events/eventStore";
import type { Day } from "../home/days";
import { openTaskStore, type Task, type TaskStore, type TaskWhen } from "../tasks/taskStore";

interface Stores {
  tasks: TaskStore;
  events: EventStore;
}

/** The app's Tasks and Events, loaded from IndexedDB, with the actions that change them. */
export function useAppData() {
  const [stores, setStores] = useState<Stores | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let opened: Stores | null = null;
    let cancelled = false;
    Promise.all([openTaskStore(), openEventStore()]).then(async ([taskStore, eventStore]) => {
      const s = { tasks: taskStore, events: eventStore };
      if (cancelled) return close(s);
      opened = s;
      setTasks(await taskStore.listTasks());
      setEvents(await eventStore.listEvents());
      setStores(s);
    });
    return () => {
      cancelled = true;
      if (opened) close(opened);
    };
  }, []);

  // Each change is saved first and shown after, so a reload right after never loses what the screen showed.
  const changeTasks = useCallback(
    async (change: (store: TaskStore) => Promise<unknown>) => {
      if (!stores) return;
      await change(stores.tasks);
      setTasks(await stores.tasks.listTasks());
    },
    [stores],
  );

  const addTask = useCallback((title: string, when?: TaskWhen) => changeTasks((s) => s.addTask(title, when)), [changeTasks]);
  const completeTask = useCallback((id: string) => changeTasks((s) => s.completeTask(id)), [changeTasks]);
  const linkTask = useCallback(
    (id: string, eventId: string, offsetDays: number) => changeTasks((s) => s.linkTask(id, eventId, offsetDays)),
    [changeTasks],
  );
  const unlinkTask = useCallback((id: string, date: Day | null) => changeTasks((s) => s.unlinkTask(id, date)), [changeTasks]);

  const addEvent = useCallback(
    async (fields: EventFields): Promise<Event | null> => {
      if (!stores) return null;
      const event = await stores.events.addEvent(fields);
      setEvents(await stores.events.listEvents());
      return event;
    },
    [stores],
  );
  const updateEvent = useCallback(
    async (id: string, fields: EventFields) => {
      if (!stores) return;
      await stores.events.updateEvent(id, fields);
      setEvents(await stores.events.listEvents());
    },
    [stores],
  );

  return { ready: stores !== null, tasks, events, addTask, completeTask, linkTask, unlinkTask, addEvent, updateEvent };
}

export type AppData = ReturnType<typeof useAppData>;

function close(stores: Stores) {
  stores.tasks.close();
  stores.events.close();
}
