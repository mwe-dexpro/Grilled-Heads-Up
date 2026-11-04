import { dayOf, timeOf } from "../home/days";
import { formatMonthDay, formatTime } from "../home/format";
import type { Language } from "../i18n/i18n";
import type { Translate } from "../events/formatEvent";
import type { SyncState } from "./engine";

/** When a sync happened: the time today, the date and time before that ("14:32", "Oct 3 · 14:32"). */
function formatSyncedAt(at: number, now: Date, language: Language): string {
  const moment = new Date(at);
  const time = formatTime(timeOf(moment), language);
  return dayOf(moment) === dayOf(now) ? time : `${formatMonthDay(dayOf(moment), language)} · ${time}`;
}

/** The footer's sync line: "Synced 14:32", "Offline · last synced 14:32", "Sync failed" and so on. */
export function formatSyncState({ status, lastSyncedAt }: SyncState, now: Date, language: Language, t: Translate): string {
  switch (status) {
    case "syncing":
      return t("sync.syncing");
    case "signedOut":
      return t("sync.signedOut");
    case "failed":
      return t("sync.failed");
    case "rejected":
      return t("sync.rejected");
    case "offline":
      return lastSyncedAt === null ? t("sync.offline") : t("sync.offlineSince", { time: formatSyncedAt(lastSyncedAt, now, language) });
    case "idle":
      return lastSyncedAt === null ? t("sync.never") : t("sync.synced", { time: formatSyncedAt(lastSyncedAt, now, language) });
  }
}
