import express from "express";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./database.js";

/**
 * One field of one record, as it was set at `hlc` (ADR-0004, ADR-0010). The server stores the winning value
 * per field and knows nothing about what a record type means.
 */
interface Change {
  type: string;
  id: string;
  field: string;
  value: unknown;
  hlc: string;
}

export const maxChangesPerRequest = 500;

// The client checks every registered record type against copies of these two patterns
// (`client/src/sync/recordTypes.test.ts`); change them in both places.
const typePattern = /^[a-z][a-zA-Z]{0,39}$/;
const fieldPattern = /^[a-zA-Z][a-zA-Z0-9]{0,63}$/;
/** Fixed-width wall clock, counter and device id, so comparing the strings compares the timestamps. */
const hlcPattern = /^\d{15}-\d{5}-[A-Za-z0-9-]{1,64}$/;

function isChange(value: unknown): value is Change {
  if (typeof value !== "object" || value === null) return false;
  const { type, id, field, hlc } = value as Record<string, unknown>;
  return (
    typeof type === "string" &&
    typePattern.test(type) &&
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 100 &&
    typeof field === "string" &&
    fieldPattern.test(field) &&
    field !== "id" &&
    typeof hlc === "string" &&
    hlcPattern.test(hlc) &&
    "value" in value &&
    (value as Record<string, unknown>)["value"] !== undefined
  );
}

/** A non-negative whole number from a query string, or the fallback when absent; null when it isn't one. */
function wholeNumber(raw: unknown, fallback: number): number | null {
  if (raw === undefined) return fallback;
  return typeof raw === "string" && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
}

/** Routes under `/api/sync`; mount them behind the sign-in check, which sets `res.locals.userId`. */
export function createSyncRoutes(db: DatabaseSync): express.Router {
  const routes = express.Router();
  routes.use(express.json({ limit: "1mb" }));

  const lastSeq = db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_fields WHERE owner_id = ?");
  // A change replaces the stored one only when its clock is strictly later; an equal clock is the same change again.
  const upsert = db.prepare(
    `INSERT INTO sync_fields (owner_id, record_type, record_id, field, value, hlc, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_id, record_type, record_id, field)
     DO UPDATE SET value = excluded.value, hlc = excluded.hlc, seq = excluded.seq
     WHERE excluded.hlc > sync_fields.hlc`,
  );
  const feed = db.prepare(
    `SELECT record_type AS type, record_id AS id, field, value, hlc, seq
     FROM sync_fields WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
  );

  routes.post("/push", (req, res) => {
    const changes: unknown = req.body?.changes;
    if (!Array.isArray(changes) || changes.length > maxChangesPerRequest) {
      res.status(400).json({ error: `Send an array of at most ${maxChangesPerRequest} changes.` });
      return;
    }
    // Names the first malformed change, so a client can tell a change that is certainly bad from a request
    // refused as a whole for any other reason (a stricter deploy, a proxy), and set aside only that change.
    const index = changes.findIndex((change) => !isChange(change));
    if (index !== -1) {
      res.status(400).json({ error: `Change ${index} is malformed.`, index });
      return;
    }
    const ownerId = res.locals["userId"] as string;
    transaction(db, () => {
      let seq = (lastSeq.get(ownerId) as { seq: number }).seq;
      for (const { type, id, field, value, hlc } of changes) {
        const { changes: written } = upsert.run(ownerId, type, id, field, JSON.stringify(value), hlc, seq + 1);
        if (written > 0) seq += 1;
      }
    });
    res.json({ serverTime: Date.now() });
  });

  routes.get("/pull", (req, res) => {
    const after = wholeNumber(req.query["after"], 0);
    const limit = wholeNumber(req.query["limit"], maxChangesPerRequest);
    if (after === null || limit === null || limit < 1 || limit > maxChangesPerRequest) {
      res.status(400).json({ error: "after must be a whole number and limit between 1 and 500." });
      return;
    }
    const rows = feed.all(res.locals["userId"] as string, after, limit + 1) as unknown as Array<Change & { value: string; seq: number }>;
    const page = rows.slice(0, limit);
    res.json({
      changes: page.map(({ type, id, field, value, hlc }) => ({ type, id, field, value: JSON.parse(value), hlc })),
      cursor: page.length > 0 ? page[page.length - 1].seq : after,
      more: rows.length > limit,
      serverTime: Date.now(),
    });
  });

  return routes;
}
