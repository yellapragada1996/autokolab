import { useEffect, useState } from "react";

// Tiny path router (02-information-architecture.md). Vercel serves index.html for every path.
//   /p/<project>                     Captain
//   /p/<project>/work                Work, by agent (?group=goal by goal, ?view=backlog|all)
//   /p/<project>/work/<ticket key>   a ticket
//   /p/<project>/room | people | decisions (?tab=guide) | settings | results | connect
// The old paths (/overview, /board, /backlog, /list, /guide, /t/<key>) redirect to these.

export type ProjectView = "overview" | "room" | "board" | "goals" | "backlog" | "list" | "guide" | "decisions" | "people" | "connect" | "settings" | "results";

export type Route =
  | { view: "home" }
  | { view: "new-project" }
  | { view: "join"; code: string }
  | { view: ProjectView; project: string }
  | { view: "ticket"; project: string; key: string };

const SIMPLE = ["room", "people", "connect", "settings", "results"] as const;
const OLD = ["overview", "board", "backlog", "list", "guide", "t"];

export function parse(path: string, search = ""): Route {
  const parts = path.split("/").filter(Boolean);
  const q = new URLSearchParams(search);
  if (parts[0] === "new") return { view: "new-project" };
  if (parts[0] === "j" && parts[1]) return { view: "join", code: parts[1].toUpperCase().replace(/[^A-Z0-9]/g, "") };
  if (parts[0] !== "p" || !parts[1]) return { view: "home" };
  const project = parts[1];
  const v = parts[2];
  if (!v) return { view: "overview", project };
  if (v === "work") {
    if (parts[3]) return { view: "ticket", project, key: parts[3].toUpperCase() };
    const view = q.get("view");
    if (view === "backlog") return { view: "backlog", project };
    if (view === "all") return { view: "list", project };
    return { view: q.get("group") === "goal" ? "goals" : "board", project };
  }
  if (v === "decisions") return { view: q.get("tab") === "guide" ? "guide" : "decisions", project };
  if ((SIMPLE as readonly string[]).includes(v)) return { view: v as (typeof SIMPLE)[number], project };
  // Old paths.
  if (v === "t" && parts[3]) return { view: "ticket", project, key: parts[3].toUpperCase() };
  if (["board", "backlog", "list", "guide"].includes(v)) return { view: v as "board", project };
  return { view: "overview", project };
}

export function href(r: Route): string {
  if (r.view === "home") return "/";
  if (r.view === "new-project") return "/new";
  if (r.view === "join") return `/j/${r.code}`;
  const base = `/p/${r.project}`;
  switch (r.view) {
    case "overview":
      return base;
    case "ticket":
      return `${base}/work/${r.key}`;
    case "board":
      return `${base}/work`;
    case "goals":
      return `${base}/work?group=goal`;
    case "backlog":
      return `${base}/work?view=backlog`;
    case "list":
      return `${base}/work?view=all`;
    case "guide":
      return `${base}/decisions?tab=guide`;
    default:
      return `${base}/${r.view}`;
  }
}

/** True for a path from before the new navigation, which should be replaced by its new address. */
export function isOldPath(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "p" && !!parts[1] && OLD.includes(parts[2] ?? "");
}

/** The route for the address bar, after replacing an old path with its new one. */
function current(): Route {
  const r = parse(location.pathname, location.search);
  if (isOldPath(location.pathname)) history.replaceState(null, "", href(r));
  return r;
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function go(r: Route | string, replace = false): void {
  const to = typeof r === "string" ? r : href(r);
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => setRoute(current());
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return route;
}

/** A link that navigates without reloading. */
export function onNav(r: Route) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(r);
  };
}
