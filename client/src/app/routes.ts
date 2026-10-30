/** Screens are addressed by the URL hash, so Android's back gesture and reloads work without a router library. */
export type Route =
  | { name: "today" }
  | { name: "calendar" }
  | { name: "projects" }
  | { name: "newEvent" }
  | { name: "event"; id: string }
  | { name: "editEvent"; id: string }
  | { name: "task"; id: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [first, second, third] = parts;
  if (parts.length === 1 && (first === "calendar" || first === "projects")) return { name: first };
  if (first === "event" && second === "new" && parts.length === 2) return { name: "newEvent" };
  if (first === "event" && parts.length === 2) return { name: "event", id: second };
  if (first === "event" && third === "edit" && parts.length === 3) return { name: "editEvent", id: second };
  if (first === "task" && parts.length === 2) return { name: "task", id: second };
  return { name: "today" };
}

export function hrefOf(route: Route): string {
  switch (route.name) {
    case "today":
      return "#/";
    case "calendar":
    case "projects":
      return `#/${route.name}`;
    case "newEvent":
      return "#/event/new";
    case "event":
      return `#/event/${encodeURIComponent(route.id)}`;
    case "editEvent":
      return `#/event/${encodeURIComponent(route.id)}/edit`;
    case "task":
      return `#/task/${encodeURIComponent(route.id)}`;
  }
}
