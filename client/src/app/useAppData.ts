import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, EventFields } from "../events/event";
import { openEventStore, type EventStore } from "../events/eventStore";
import type { Day } from "../home/days";
import { openListStore, type List, type ListStore } from "../lists/listStore";
import { openTagStore, type Tag, type TagStore } from "../tags/tagStore";
import { useSync } from "../sync/useSync";
import { createListReader } from "./listReader";
import { openTaskStore, type Task, type TaskStore, type TaskWhen } from "../tasks/taskStore";

interface Stores {
  tasks: TaskStore;
  events: EventStore;
  lists: ListStore;
  tags: TagStore;
}

/**
 * The app's Tasks, Events, Lists and Tags, loaded from IndexedDB, with the actions that change them. Also keeps them in sync
 * with the Owner's other devices: each change is sent soon after, and changes from elsewhere are shown when they arrive.
 */
export function useAppData() {
  const stores = useRef<Stores | null>(null);
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trash, setTrash] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Reads from the stores as they are when it runs, so a sync that reports changes while the stores are still
  // opening is not lost: the stores are set before the first read. Screens stay mounted, so an open form
  // keeps what was typed.
  const reload = useMemo(
    () =>
      createListReader(
        async () =>
          stores.current
            ? {
                tasks: await stores.current.tasks.listTasks(),
                trash: await stores.current.tasks.listTrash(),
                events: await stores.current.events.listEvents(),
                lists: await stores.current.lists.listLists(),
                tags: await stores.current.tags.listTags(),
              }
            : null,
        (read) => {
          setTasks(read.tasks);
          setTrash(read.trash);
          setEvents(read.events);
          setLists(read.lists);
          setTags(read.tags);
        },
      ),
    [],
  );
  const sync = useSync(reload);
  const { syncSoon } = sync;

  useEffect(() => {
    let opened: Stores | null = null;
    let cancelled = false;
    Promise.all([openTaskStore(), openEventStore(), openListStore(), openTagStore()]).then(async ([taskStore, eventStore, listStore, tagStore]) => {
      opened = { tasks: taskStore, events: eventStore, lists: listStore, tags: tagStore };
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
  const changeStores = useCallback(
    async (change: (stores: Stores) => Promise<unknown>) => {
      if (!stores.current) return;
      try {
        await change(stores.current);
      } finally {
        // Also when the change failed: what the screen shows may be stale, say, a Task a sync has just deleted.
        await reload();
      }
      syncSoon();
    },
    [reload, syncSoon],
  );
  const changeTasks = useCallback((change: (store: TaskStore) => Promise<unknown>) => changeStores((s) => change(s.tasks)), [changeStores]);

  const addTask = useCallback(
    (title: string, when?: TaskWhen, listId?: string | null) => changeTasks((s) => s.addTask(title, when, listId)),
    [changeTasks],
  );
  const completeTask = useCallback((id: string) => changeTasks((s) => s.completeTask(id)), [changeTasks]);
  const linkTask = useCallback(
    (id: string, eventId: string, offsetDays: number) => changeTasks((s) => s.linkTask(id, eventId, offsetDays)),
    [changeTasks],
  );
  const unlinkTask = useCallback((id: string, date: Day | null) => changeTasks((s) => s.unlinkTask(id, date)), [changeTasks]);
  const deleteTask = useCallback((id: string) => changeTasks((s) => s.deleteTask(id)), [changeTasks]);
  const restoreTask = useCallback((id: string) => changeTasks((s) => s.restoreTask(id)), [changeTasks]);

  // A Linked task is rescheduled by changing its Offset from its Event's start day, so the Events are needed.
  const rescheduleTasks = useCallback(
    (ids: string[], day: Day) => {
      const eventStart = (eventId: string) => events.find((event) => event.id === eventId)?.startDate;
      // No catch: a stale day is taken to the earliest allowed one, so what can still fail is the store itself, and
      // that is not hidden: like every other change, the failure reaches the caller (and the console). The lists are
      // reloaded after it anyway.
      return changeTasks((s) => s.rescheduleTasks(ids, day, eventStart));
    },
    [changeTasks, events],
  );
  const rescheduleTask = useCallback((id: string, day: Day) => rescheduleTasks([id], day), [rescheduleTasks]);

  const setTaskList = useCallback((id: string, listId: string | null) => changeTasks((s) => s.setTaskList(id, listId)), [changeTasks]);
  // A Tag is typed by name: an existing one of that name is reused, else it is made. The Task then gets it.
  const addTaskTag = useCallback(
    (id: string, name: string) =>
      changeStores(async (s) => {
        const tag = await s.tags.findOrAddTag(name);
        await s.tasks.addTaskTag(id, tag.id);
      }),
    [changeStores],
  );
  const removeTaskTag = useCallback((id: string, tagId: string) => changeTasks((s) => s.removeTaskTag(id, tagId)), [changeTasks]);

  const addList = useCallback((name: string, isProject: boolean) => changeStores((s) => s.lists.addList(name, { isProject })), [changeStores]);
  const renameList = useCallback((id: string, name: string) => changeStores((s) => s.lists.renameList(id, name)), [changeStores]);
  const setListProject = useCallback((id: string, isProject: boolean) => changeStores((s) => s.lists.setProject(id, isProject)), [changeStores]);
  // The List goes first, then its Tasks lose it; a reader that sees the List gone and a Task still in it shows the Task without a List.
  const deleteList = useCallback(
    (id: string) =>
      changeStores(async (s) => {
        await s.lists.deleteList(id);
        await s.tasks.clearList(id);
      }),
    [changeStores],
  );

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

  return {
    ready,
    tasks,
    trash,
    events,
    lists,
    tags,
    sync: sync.state,
    syncNow: sync.syncNow,
    addTask,
    completeTask,
    linkTask,
    unlinkTask,
    rescheduleTask,
    rescheduleTasks,
    setTaskList,
    addTaskTag,
    removeTaskTag,
    addList,
    renameList,
    setListProject,
    deleteList,
    deleteTask,
    restoreTask,
    addEvent,
    updateEvent,
  };
}

export type AppData = ReturnType<typeof useAppData>;

function close(stores: Stores) {
  stores.tasks.close();
  stores.events.close();
  stores.lists.close();
  stores.tags.close();
}
