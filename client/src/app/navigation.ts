import { useEffect, useState } from "react";
import { canGoBack, depthAfterMove, depthOf } from "./historyDepth";
import { hrefOf, parseRoute, type Route } from "./routes";

// The depth of the current history entry (see `historyDepth.ts`), kept in each entry's `history.state` so that it
// survives reloads and Back / Forward.
let depth = depthOf(window.history.state) ?? 0;
if (depthOf(window.history.state) === undefined) window.history.replaceState({ depth }, "");
// `navigate({ replace: true })` replaces an entry: the new one is as deep as the one it replaces, not one deeper.
let replacing = false;

// Every move to another hash lands here, whether from `navigate`, a link or the browser's Back and Forward.
window.addEventListener("hashchange", () => {
  const stored = depthOf(window.history.state);
  depth = depthAfterMove({ stored, current: depth, replacing });
  if (stored === undefined) window.history.replaceState({ depth }, "");
  replacing = false;
});

export function navigate(route: Route, { replace = false } = {}): void {
  const href = hrefOf(route);
  if (replace) {
    // Going to the hash it is on changes nothing, and fires nothing.
    replacing = window.location.hash !== href;
    window.location.replace(href);
  } else window.location.hash = href;
}

/**
 * Back within the app. Where the app was opened directly (a link, a bookmark, a reload of it) there is no step of
 * the app behind: Back would leave the app for whatever came before in the tab, and an undo toast with it. It goes
 * to Today instead.
 */
export function goBack(): void {
  if (canGoBack(depth)) window.history.back();
  else navigate({ name: "today" }, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
