import { useCallback, useEffect, useRef, useState } from "react";
import { defaultDatabaseName, openAppDb } from "../data/database";
import { startAutoSync, type AutoSync } from "./autoSync";
import { createSyncEngine, type SyncEngine, type SyncState } from "./engine";
import { recordTypes } from "./recordTypes";
import { httpTransport } from "./transport";

/**
 * Keeps this device in sync with the server while the component is mounted (the app is signed in then):
 * on start, when the connection or the app comes back, after local changes and once a minute (`autoSync.ts`).
 * `onRemoteChanges` is called when another device's changes were saved here, so screens can reload.
 */
export function useSync(onRemoteChanges: () => void) {
  const [state, setState] = useState<SyncState>({ status: "idle", lastSyncedAt: null });
  const engine = useRef<SyncEngine | null>(null);
  const auto = useRef<AutoSync | null>(null);
  const remoteChanges = useRef(onRemoteChanges);
  useEffect(() => {
    remoteChanges.current = onRemoteChanges;
  });

  useEffect(() => {
    let cancelled = false;
    let stop: () => void = () => {
      /* nothing to stop until the engine is open */
    };
    void openAppDb(defaultDatabaseName).then(async (db) => {
      const opened = await createSyncEngine({ db, types: recordTypes, transport: httpTransport });
      if (cancelled) {
        db.close();
        return;
      }
      engine.current = opened;
      setState(opened.state());
      const stopState = opened.subscribe(setState);
      const stopRemote = opened.onRemoteChanges(() => remoteChanges.current());
      auto.current = startAutoSync(() => void opened.syncNow());
      stop = () => {
        auto.current?.stop();
        stopState();
        stopRemote();
        engine.current = null;
        auto.current = null;
        db.close();
      };
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  /** For the Sync now button: shows "Syncing…" while it runs. */
  const syncNow = useCallback(() => void engine.current?.syncNow({ showProgress: true }), []);
  /** To call after each local change. */
  const syncSoon = useCallback(() => auto.current?.afterChange(), []);

  return { state, syncNow, syncSoon };
}
