import { describe, expect, it } from "vitest";
import { translate, type Language } from "../i18n/i18n";
import type { SyncState } from "./engine";
import { formatSyncState } from "./formatSync";

/** Saturday 4 October 2026, 15:00 on the device (Europe/Berlin in the tests). */
const now = new Date(2026, 9, 4, 15, 0);
const today1432 = new Date(2026, 9, 4, 14, 32).getTime();
const earlier = new Date(2026, 9, 3, 9, 5).getTime();

const line = (state: SyncState, language: Language = "en") => formatSyncState(state, now, language, (key, params) => translate(language, key, params));

describe("formatSyncState", () => {
  it("shows the time of the last sync today, and the date and time before that", () => {
    expect(line({ status: "idle", lastSyncedAt: today1432 })).toBe("Synced 2:32 PM");
    expect(line({ status: "idle", lastSyncedAt: earlier })).toBe("Synced Oct 3 · 9:05 AM");
  });

  it("says so before the first sync", () => {
    expect(line({ status: "idle", lastSyncedAt: null })).toBe("Not synced yet");
  });

  it("says it is syncing", () => {
    expect(line({ status: "syncing", lastSyncedAt: today1432 })).toBe("Syncing…");
  });

  it("says when the device is offline, with the last sync if there was one", () => {
    expect(line({ status: "offline", lastSyncedAt: today1432 })).toBe("Offline · last synced 2:32 PM");
    expect(line({ status: "offline", lastSyncedAt: null })).toBe("Offline");
  });

  it("says when sync failed, or when the session is gone", () => {
    expect(line({ status: "failed", lastSyncedAt: today1432 })).toBe("Sync failed");
    expect(line({ status: "signedOut", lastSyncedAt: today1432 })).toBe("Signed out – sign in to sync");
  });

  it("speaks German with 24-hour times", () => {
    expect(line({ status: "idle", lastSyncedAt: today1432 }, "de")).toBe("Synchronisiert 14:32");
    expect(line({ status: "idle", lastSyncedAt: earlier }, "de")).toBe("Synchronisiert 3. Okt. · 9:05");
    expect(line({ status: "offline", lastSyncedAt: today1432 }, "de")).toBe("Offline · zuletzt synchronisiert 14:32");
    expect(line({ status: "failed", lastSyncedAt: null }, "de")).toBe("Synchronisierung fehlgeschlagen");
    expect(line({ status: "signedOut", lastSyncedAt: null }, "de")).toBe("Abgemeldet – zum Synchronisieren anmelden");
    expect(line({ status: "syncing", lastSyncedAt: null }, "de")).toBe("Synchronisiere …");
    expect(line({ status: "idle", lastSyncedAt: null }, "de")).toBe("Noch nicht synchronisiert");
  });
});
