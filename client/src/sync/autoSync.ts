/** Where sync listens for the moments that call for it; the browser's window and document in the app. */
export interface AutoSyncEnvironment {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & { readonly visibilityState: string };
}

export interface AutoSyncOptions {
  /** How long after a local change the sync runs; further changes in that time restart the wait. */
  changeDelayMs?: number;
  /** How often it runs while the app is visible. */
  intervalMs?: number;
}

export interface AutoSync {
  /** A local change was made: sync shortly, once for a burst of changes. */
  afterChange(): void;
  stop(): void;
}

/**
 * Runs `sync` when the app starts, when the connection comes back, when the app returns to the foreground,
 * shortly after each local change, and once a minute while the app is visible.
 */
export function startAutoSync(
  sync: () => void,
  environment: AutoSyncEnvironment = { window, document },
  { changeDelayMs = 2000, intervalMs = 60_000 }: AutoSyncOptions = {},
): AutoSync {
  const visible = () => environment.document.visibilityState === "visible";
  const onVisibilityChange = () => {
    if (visible()) sync();
  };
  const onTimer = () => {
    if (visible()) sync();
  };
  let pending: ReturnType<typeof setTimeout> | undefined;

  environment.window.addEventListener("online", sync);
  environment.document.addEventListener("visibilitychange", onVisibilityChange);
  const interval = setInterval(onTimer, intervalMs);
  sync();

  return {
    afterChange() {
      clearTimeout(pending);
      pending = setTimeout(sync, changeDelayMs);
    },
    stop() {
      clearTimeout(pending);
      clearInterval(interval);
      environment.window.removeEventListener("online", sync);
      environment.document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
