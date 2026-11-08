import { useEffect, useState } from "react";
import { parseRoute, type Route } from "./routes";

/** The screen the URL hash names, kept up to date as the hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
