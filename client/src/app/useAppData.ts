import { useCallback, useEffect, useState } from "react";
import type { Event, EventFields } from "../events/event";
import { openEventStore, type EventStore } from "../events/eventStore";
import type { Day } from "../home/days";
import { useSync } from "../sync/useSync";
import { openTaskStore, type Task, type TaskStore, type TaskWhen } from "../tasks/taskStore";

interface Stores {
  tasks: TaskStore;
  events: EventStore;
}

/**
 * The app's Tasks and Events, loaded from IndexedDB, with the actions that change them. Also keeps them in sync
 * with the Owner's other devices: each change is sent soon after, and changes from elsewhere are shown when they arrive.
 */
export function useAppData() {
  const [stores, setStores] = useState<Stores | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // Remote changes replace the lists in place; screens stay mounted, so an open form keeps what was typed.
  const reload = useCallback(async () => {
    if (!stores) return;
    setTasks(await stores.tasks.listTasks());
    setEvents(await stores.events.listEvents());
  }, [stores]);
  const sync = useSync(reload);
  const { syncSoon } = sync;

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
      syncSoon();
    },
    [stores, syncSoon],
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
      syncSoon();
      return event;
    },
    [stores, syncSoon],
  );
  const updateEvent = useCallback(
    async (id: string, fields: EventFields, base?: EventFields) => {
      if (!stores) return;
      await stores.events.updateEvent(id, fields, base);
      setEvents(await stores.events.listEvents());
      syncSoon();
    },
    [stores, syncSoon],
  );

  return { ready: stores !== null, tasks, events, sync: sync.state, syncNow: sync.syncNow, addTask, completeTask, linkTask, unlinkTask, addEvent, updateEvent };
}

export type AppData = ReturnType<typeof useAppData>;

function close(stores: Stores) {
  stores.tasks.close();
  stores.events.close();
}
