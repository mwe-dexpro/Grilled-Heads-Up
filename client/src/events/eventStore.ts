import { defaultDatabaseName, openAppDb } from "../data/database";
import { openTable, type RecordType } from "../sync/replica";
import { validateEvent, type Event, type EventFields } from "./event";

export interface EventStore {
  addEvent(fields: EventFields): Promise<Event>;
  /**
   * Changes what a person can edit; Linked tasks follow because their dates come from the Event. Only fields that
   * differ from `base` are written (`base` defaults to the stored Event), so a form opened before another
   * device's edit arrived doesn't write that edit's fields back with its stale values: pass the fields the form
   * was opened with.
   */
  updateEvent(id: string, fields: EventFields, base?: EventFields): Promise<Event>;
  /** Events in the order they were created; deleted ones are left out. */
  listEvents(): Promise<Event[]>;
  close(): void;
}

export interface EventStoreOptions {
  now?: () => Date;
}

/**
 * How Events sync. Events saved by earlier versions lack `deletedAt`; one arriving in part gets a harmless
 * all-day placeholder until its other fields arrive.
 */
export const eventRecordType: RecordType<Event> = {
  type: "event",
  storeName: "events",
  withDefaults: (event) => ({
    ...event,
    title: event.title ?? "",
    allDay: event.allDay ?? true,
    startDate: event.startDate ?? "1970-01-01",
    startTime: event.startTime ?? null,
    endDate: event.endDate ?? "1970-01-01",
    endTime: event.endTime ?? null,
    timeZone: event.timeZone ?? null,
    location: event.location ?? "",
    notes: event.notes ?? "",
    externalSource: event.externalSource ?? null,
    externalId: event.externalId ?? null,
    createdAt: event.createdAt ?? "",
    deletedAt: event.deletedAt ?? null,
  }),
};

/**
 * What screens may rely on: a timed Event has a start time, an end time and a time zone, an all-day Event has none.
 * A synced Event can break that for a while (its fields arrive one by one, and two devices can edit them at once);
 * until it is whole it shows as an all-day Event. Only the reading is changed, never what is stored or synced.
 */
function wholeShape(event: Event): Event {
  const timed = !event.allDay && event.startTime !== null && event.endTime !== null && event.timeZone !== null;
  return timed || (event.allDay && event.startTime === null && event.endTime === null && event.timeZone === null)
    ? event
    : { ...event, allDay: true, startTime: null, endTime: null, timeZone: null };
}

function checked(fields: EventFields): EventFields {
  const clean = { ...fields, title: fields.title.trim(), location: fields.location.trim(), notes: fields.notes.trim() };
  const problem = validateEvent(clean);
  if (problem) throw new Error(`Invalid Event: ${problem}`);
  return clean;
}

export async function openEventStore(
  dbName = defaultDatabaseName,
  { now = () => new Date() }: EventStoreOptions = {},
): Promise<EventStore> {
  const db = await openAppDb(dbName);
  const events = await openTable(db, eventRecordType, now);

  return {
    async addEvent(fields) {
      const event: Event = {
        ...checked(fields),
        id: crypto.randomUUID(),
        externalSource: null,
        externalId: null,
        createdAt: now().toISOString(),
        deletedAt: null,
      };
      await events.put(event);
      return event;
    },

    async updateEvent(id, fields, base) {
      const clean = checked(fields);
      const event = await events.update(id, (current) => {
        const from: EventFields = base ?? current;
        const changed = (Object.keys(clean) as Array<keyof EventFields>).filter((field) => clean[field] !== from[field]);
        return Object.fromEntries(changed.map((field) => [field, clean[field]]));
      });
      if (!event) throw new Error(`No Event with id ${id}`);
      return event;
    },

    async listEvents() {
      return (await events.list()).map(wholeShape).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    close() {
      db.close();
    },
  };
}
