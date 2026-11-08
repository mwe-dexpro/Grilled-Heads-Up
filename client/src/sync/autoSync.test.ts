import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAutoSync, type AutoSync } from "./autoSync";

/** A window and a document that tests can send events to. */
function fakeEnvironment() {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { window, document, hide: () => (document.visibilityState = "hidden"), show: () => (document.visibilityState = "visible") };
}

describe("Automatic sync", () => {
  let running: AutoSync | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    running?.stop();
    vi.useRealTimers();
  });

  function start() {
    const sync = vi.fn();
    const env = fakeEnvironment();
    const auto = startAutoSync(sync, env);
    running = auto;
    return { sync, env, auto };
  }

  it("syncs when it starts", () => {
    const { sync } = start();

    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("syncs when the connection comes back", () => {
    const { sync, env } = start();

    env.window.dispatchEvent(new Event("online"));

    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("syncs when the app comes back to the foreground, not when it leaves", () => {
    const { sync, env } = start();

    env.hide();
    env.document.dispatchEvent(new Event("visibilitychange"));
    expect(sync).toHaveBeenCalledTimes(1);
    env.show();
    env.document.dispatchEvent(new Event("visibilitychange"));

    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("syncs about 2 seconds after a local change, once for a burst of changes", () => {
    const { sync, auto } = start();

    auto.afterChange();
    vi.advanceTimersByTime(1500);
    auto.afterChange();
    vi.advanceTimersByTime(1999);
    expect(sync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);

    expect(sync).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("syncs once a minute while the app is visible, and not while it is hidden", () => {
    const { sync, env } = start();

    vi.advanceTimersByTime(59_999);
    expect(sync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(sync).toHaveBeenCalledTimes(2);
    env.hide();
    vi.advanceTimersByTime(180_000);
    expect(sync).toHaveBeenCalledTimes(2);
    env.show();
    vi.advanceTimersByTime(60_000);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it("stops listening and waiting when stopped", () => {
    const { sync, env, auto } = start();
    auto.afterChange();

    auto.stop();
    env.window.dispatchEvent(new Event("online"));
    env.document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(300_000);

    expect(sync).toHaveBeenCalledTimes(1);
  });
});
