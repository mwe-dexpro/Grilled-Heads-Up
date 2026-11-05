/** How long a deleted Task stays in the Trash. */
export const trashDays = 30;

const dayMs = 24 * 60 * 60 * 1000;

const ageOf = (deletedAt: string, now: Date) => now.getTime() - Date.parse(deletedAt);

/** Deleted 30 × 24 hours ago or longer: gone for good, no longer listed or restorable. Exactly 30 days is expired. */
export function isExpired(deletedAt: string, now: Date): boolean {
  return ageOf(deletedAt, now) >= trashDays * dayMs;
}

/** Whole days left before it expires, rounded up (29 days and 1 hour left is "30 days left"); 1 or more until it expires, then 0. */
export function daysLeft(deletedAt: string, now: Date): number {
  const left = Math.ceil((trashDays * dayMs - ageOf(deletedAt, now)) / dayMs);
  return Math.max(0, Math.min(trashDays, left));
}
