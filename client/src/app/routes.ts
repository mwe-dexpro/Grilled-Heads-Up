/** Screens are addressed by the URL hash, so Android's back gesture and reloads work without a router library. */
export type Route =
  | { name: "today" }
  | { name: "calendar" }
  | { name: "projects" }
  | { name: "newEvent" }
  | { name: "event"; id: string }
  | { name: "editEvent"; id: string }
  | { name: "task"; id: string }
  | { name: "list"; id: string }
  | { name: "trash" };

export function parseRoute(hash: string): Route {
  const [first, second, third, ...more] = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (more.length > 0) return { name: "today" };
  if (second === undefined) {
    if (first === "calendar" || first === "projects" || first === "trash") return { name: first };
  } else if (third === undefined) {
    if (first === "event") return second === "new" ? { name: "newEvent" } : { name: "event", id: second };
    if (first === "task") return { name: "task", id: second };
    if (first === "list") return { name: "list", id: second };
  } else if (first === "event" && third === "edit") {
    return { name: "editEvent", id: second };
  }
  return { name: "today" };
}

export function hrefOf(route: Route): string {
  switch (route.name) {
    case "today":
      return "#/";
    case "calendar":
    case "projects":
    case "trash":
      return `#/${route.name}`;
    case "newEvent":
      return "#/event/new";
    case "event":
      return `#/event/${encodeURIComponent(route.id)}`;
    case "editEvent":
      return `#/event/${encodeURIComponent(route.id)}/edit`;
    case "task":
      return `#/task/${encodeURIComponent(route.id)}`;
    case "list":
      return `#/list/${encodeURIComponent(route.id)}`;
  }
}
