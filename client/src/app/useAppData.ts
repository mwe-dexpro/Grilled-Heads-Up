import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, EventFields } from "../events/event";
import { openEventStore, type EventStore } from "../events/eventStore";
import type { Day } from "../home/days";
import { useSync } from "../sync/useSync";
import { createListReader } from "./listReader";
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
  const stores = useRef<Stores | null>(null);
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // Reads from the stores as they are when it runs, so a sync that reports changes while the stores are still
  // opening is not lost: the stores are set before the first read. Screens stay mounted, so an open form
  // keeps what was typed.
  const reload = useMemo(
    () =>
      createListReader(
        async () => (stores.current ? { tasks: await stores.current.tasks.listTasks(), events: await stores.current.events.listEvents() } : null),
        (lists) => {
          setTasks(lists.tasks);
          setEvents(lists.events);
        },
      ),
    [],
  );
  const sync = useSync(reload);
  const { syncSoon } = sync;

  useEffect(() => {
    let opened: Stores | null = null;
    let cancelled = false;
    Promise.all([openTaskStore(), openEventStore()]).then(async ([taskStore, eventStore]) => {
      opened = { tasks: taskStore, events: eventStore };
      if (cancelled) return close(opened);
      stores.current = opened;
      await reload();
      setReady(true);
    });
    return () => {
      cancelled = true;
      stores.current = null;
      if (opened) close(opened);
    };
  }, [reload]);

  // Each change is saved first and shown after, so a reload right after never loses what the screen showed.
  const changeTasks = useCallback(
    async (change: (store: TaskStore) => Promise<unknown>) => {
      if (!stores.current) return;
      await change(stores.current.tasks);
      await reload();
      syncSoon();
    },
    [reload, syncSoon],
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
      if (!stores.current) return null;
      const event = await stores.current.events.addEvent(fields);
      await reload();
      syncSoon();
      return event;
    },
    [reload, syncSoon],
  );
  const updateEvent = useCallback(
    async (id: string, fields: EventFields, base?: EventFields) => {
      if (!stores.current) return;
      await stores.current.events.updateEvent(id, fields, base);
      await reload();
      syncSoon();
    },
    [reload, syncSoon],
  );

  return { ready, tasks, events, sync: sync.state, syncNow: sync.syncNow, addTask, completeTask, linkTask, unlinkTask, addEvent, updateEvent };
}

export type AppData = ReturnType<typeof useAppData>;

function close(stores: Stores) {
  stores.tasks.close();
  stores.events.close();
}
