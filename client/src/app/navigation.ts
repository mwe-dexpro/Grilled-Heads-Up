import { useEffect, useState } from "react";
import { hrefOf, parseRoute, type Route } from "./routes";

export function navigate(route: Route, { replace = false } = {}): void {
  if (replace) window.location.replace(hrefOf(route));
  else window.location.hash = hrefOf(route);
}

/** Back within the app; a screen opened directly (no history) goes to Today instead of leaving the app. */
export function goBack(): void {
  if (window.history.length > 1) window.history.back();
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
