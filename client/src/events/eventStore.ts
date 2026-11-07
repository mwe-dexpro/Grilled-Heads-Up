import { defaultDatabaseName, openAppDb } from "../data/database";
import { openTable, type RecordType } from "../sync/replica";
import { validateEvent, type Event, type EventFields } from "./event";

export interface EventStore {
  addEvent: (fields: EventFields) => Promise<Event>;
  /**
   * Changes what a person can edit; Linked tasks follow because their dates come from the Event. Only fields that
   * differ from `base` are written (`base` defaults to the stored Event), so a form opened before another
   * device's edit arrived doesn't write that edit's fields back with its stale values: pass the fields the form
   * was opened with. The exception is when the Event's time changes (see `whenFields`): then all of those fields are
   * written, so that two devices' competing edits of when the Event is never mixed into one that neither made.
   */
  updateEvent: (id: string, fields: EventFields, base?: EventFields) => Promise<Event>;
  /**
   * Events in the order they were created; deleted ones are left out, and so is one that has not fully arrived
   * from another device yet (no title, start date or end date), until it has.
   */
  listEvents: () => Promise<Event[]>;
  close: () => void;
}

export interface EventStoreOptions {
  now?: () => Date;
}

/**
 * What `withDefaults` puts in a date that has not arrived (an Event built from Changes that arrived in part). Not a
 * date, so it can't be mistaken for one: `listEvents` leaves such an Event out until it has its dates.
 */
const notArrived = "";

/**
 * How Events sync. Events saved by earlier versions lack `deletedAt`; one arriving in part gets placeholders
 * until its other fields arrive.
 */
export const eventRecordType: RecordType<Event> = {
  type: "event",
  storeName: "events",
  withDefaults: (event) => ({
    ...event,
    title: event.title ?? "",
    allDay: event.allDay ?? true,
    startDate: event.startDate ?? notArrived,
    startTime: event.startTime ?? null,
    endDate: event.endDate ?? notArrived,
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
 * Whether an Event has what no screen can do without: a title (a saved Event always has one) and its dates. An Event
 * that has not, because its fields arrive one by one, is left out of the lists, and its Linked tasks show as undated
 * (`withEventDates`), instead of standing on a made-up day with their dates and Overdue counts made up from it.
 */
const arrived = (event: Event) => event.title !== "" && event.startDate !== notArrived && event.endDate !== notArrived;

/**
 * What screens may rely on: a timed Event has a start time, an end time and a time zone, an all-day Event has none.
 * A synced Event can break that for a while (its fields arrive one by one); until it is whole it shows as an
 * all-day Event. Only the reading is changed, never what is stored or synced.
 */
function wholeShape(event: Event): Event {
  const timed = !event.allDay && event.startTime !== null && event.endTime !== null && event.timeZone !== null;
  return timed || (event.allDay && event.startTime === null && event.endTime === null && event.timeZone === null)
    ? event
    : { ...event, allDay: true, startTime: null, endTime: null, timeZone: null };
}

/**
 * The fields that say when the Event is, and that only make sense together: a timed Event needs its times and zone,
 * an all-day one has none, and the end must not be before the start. They are written, and so won or lost, as a unit.
 */
const whenFields = ["allDay", "startDate", "startTime", "endDate", "endTime", "timeZone"] as const;

function checked(fields: EventFields): EventFields {
  const clean = { ...fields, title: fields.title.trim(), location: fields.location.trim(), notes: fields.notes.trim() };
  const problem = validateEvent(clean);
  if (problem) throw new Error(`Invalid Event: ${problem}`);
  return clean;
}

export async function openEventStore(dbName = defaultDatabaseName, { now = () => new Date() }: EventStoreOptions = {}): Promise<EventStore> {
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
        const changed = (Object.keys(clean) as (keyof EventFields)[]).filter((field) => clean[field] !== from[field]);
        // Any change to when the Event is writes all of it, so that it is won or lost as a unit.
        const written = changed.some((field) => (whenFields as readonly string[]).includes(field)) ? [...new Set([...changed, ...whenFields])] : changed;
        return Object.fromEntries(written.map((field) => [field, clean[field]]));
      });
      if (!event) throw new Error(`No Event with id ${id}`);
      return event;
    },

    async listEvents() {
      return (await events.list())
        .filter(arrived)
        .map(wholeShape)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    close() {
      db.close();
    },
  };
}
