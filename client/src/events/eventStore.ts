import { defaultDatabaseName, openAppDb } from "../data/database";
import { validateEvent, type Event, type EventFields } from "./event";

export interface EventStore {
  addEvent(fields: EventFields): Promise<Event>;
  /** Changes what a person can edit; Linked tasks follow because their dates come from the Event. */
  updateEvent(id: string, fields: EventFields): Promise<Event>;
  /** Events in the order they were created. */
  listEvents(): Promise<Event[]>;
  close(): void;
}

export interface EventStoreOptions {
  now?: () => Date;
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

  return {
    async addEvent(fields) {
      const event: Event = {
        ...checked(fields),
        id: crypto.randomUUID(),
        externalSource: null,
        externalId: null,
        createdAt: now().toISOString(),
      };
      await db.put("events", event);
      return event;
    },

    async updateEvent(id, fields) {
      const existing = await db.get("events", id);
      if (!existing) throw new Error(`No Event with id ${id}`);
      const event: Event = { ...existing, ...checked(fields) };
      await db.put("events", event);
      return event;
    },

    async listEvents() {
      const events = await db.getAll("events");
      return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    close() {
      db.close();
    },
  };
}
