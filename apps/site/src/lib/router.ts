import { useEffect, useState } from "react";

// Tiny path router: /p/<project>/<view>[/<ticket key>]. Vercel serves index.html for every path.

export type Route =
  | { view: "home" }
  | { view: "new-project" }
  | { view: "join"; code: string }
  | { view: "overview" | "room" | "board" | "backlog" | "list" | "guide" | "decisions" | "people" | "connect"; project: string }
  | { view: "ticket"; project: string; key: string };

export function parse(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return { view: "new-project" };
  if (parts[0] === "j" && parts[1]) return { view: "join", code: parts[1].toUpperCase().replace(/[^A-Z0-9]/g, "") };
  if (parts[0] !== "p" || !parts[1]) return { view: "home" };
  const project = parts[1];
  const v = parts[2] ?? "overview";
  if (v === "t" && parts[3]) return { view: "ticket", project, key: parts[3].toUpperCase() };
  if (["overview", "room", "board", "backlog", "list", "guide", "decisions", "people", "connect"].includes(v)) return { view: v as "board", project };
  return { view: "overview", project };
}

export function href(r: Route): string {
  if (r.view === "home") return "/";
  if (r.view === "new-project") return "/new";
  if (r.view === "join") return `/j/${r.code}`;
  if (r.view === "ticket") return `/p/${r.project}/t/${r.key}`;
  return `/p/${r.project}/${r.view}`;
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function go(r: Route | string, replace = false): void {
  const to = typeof r === "string" ? r : href(r);
  if (to === location.pathname) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname));
  useEffect(() => {
    const on = () => setRoute(parse(location.pathname));
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
