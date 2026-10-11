import { useEffect, useState } from "react";

// Tiny path router (02-information-architecture.md). Vercel serves index.html for every path.
//   /p/<project>                     Captain
//   /p/<project>/overview            Overview: the state, what needs you, who's doing what, today (DEC-24)
//   /p/<project>/work                Work, by agent (?group=goal by goal, ?view=backlog|all)
//   /p/<project>/work/<ticket key>   a ticket
//   /p/<project>/look/<ticket key>   Captain, with "Let me look first" on a risky merge over it
//   /p/<project>/plans/<message id>  a plan Captain proposed (S08), read-only
//   /p/<project>/room | people | decisions (?tab=guide) | settings | results | connect
// The old paths (/board, /backlog, /list, /guide, /t/<key>) redirect to these.

export type ProjectView = "captain" | "overview" | "room" | "board" | "goals" | "backlog" | "list" | "guide" | "decisions" | "people" | "connect" | "settings" | "results";
export type ShowPart = "summary" | "change" | "history";
export type ShowRoute = { key: string; part: ShowPart };

export type Route =
  | { view: "home" }
  | { view: "new-project" }
  | { view: "join"; code: string }
  | { view: ProjectView; project: string; show?: ShowRoute; look?: string }
  | { view: "ticket"; project: string; key: string; show?: ShowRoute }
  /** `plan` is the plan message's id; NaN for an address that isn't a number (the page says it's unknown). */
  | { view: "plan"; project: string; plan: number; show?: ShowRoute };

const SIMPLE = ["overview", "room", "people", "connect", "settings", "results"] as const;
const OLD = ["board", "backlog", "list", "guide", "t"];

export function parse(path: string, search = ""): Route {
  const parts = path.split("/").filter(Boolean);
  const q = new URLSearchParams(search);
  const key = q.get("show")?.trim().toUpperCase();
  const part = q.get("part");
  const sheet: { show?: ShowRoute } = key ? { show: { key, part: part === "change" || part === "history" ? part : "summary" } } : {};
  if (parts[0] === "new") return { view: "new-project" };
  if (parts[0] === "j" && parts[1]) return { view: "join", code: parts[1].toUpperCase().replace(/[^A-Z0-9]/g, "") };
  if (parts[0] !== "p" || !parts[1]) return { view: "home" };
  const project = parts[1];
  const v = parts[2];
  if (!v) return { view: "captain", project, ...sheet };
  if (v === "look") return { view: "captain", project, ...(parts[3] ? { look: parts[3].toUpperCase() } : {}), ...sheet };
  if (v === "plans" && parts[3]) return { view: "plan", project, plan: /^\d+$/.test(parts[3]) ? Number(parts[3]) : NaN, ...sheet };
  if (v === "work") {
    if (parts[3]) return { view: "ticket", project, key: parts[3].toUpperCase(), ...sheet };
    const view = q.get("view");
    if (view === "backlog") return { view: "backlog", project, ...sheet };
    if (view === "all") return { view: "list", project, ...sheet };
    return { view: q.get("group") === "goal" ? "goals" : "board", project, ...sheet };
  }
  if (v === "decisions") return { view: q.get("tab") === "guide" ? "guide" : "decisions", project, ...sheet };
  if ((SIMPLE as readonly string[]).includes(v)) return { view: v as (typeof SIMPLE)[number], project, ...sheet };
  // Old paths.
  if (v === "t" && parts[3]) return { view: "ticket", project, key: parts[3].toUpperCase(), ...sheet };
  if (["board", "backlog", "list", "guide"].includes(v)) return { view: v as "board", project, ...sheet };
  return { view: "captain", project, ...sheet };
}

/** Add the sheet to the current address without disturbing page filters or the preview. */
export function showHref(key: string, part: ShowPart = "summary"): string {
  const url = new URL(location.href);
  url.searchParams.set("show", key.toUpperCase());
  if (part === "summary") url.searchParams.delete("part");
  else url.searchParams.set("part", part);
  return url.pathname + url.search + url.hash;
}

let showOpener: HTMLElement | null = null;
export function openShow(key: string, part: ShowPart = "summary"): void {
  if (!new URLSearchParams(location.search).has("show"))
    showOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  go(showHref(key, part), false, false);
}

export function closeShow(): void {
  const url = new URL(location.href);
  url.searchParams.delete("show");
  url.searchParams.delete("part");
  go(url.pathname + url.search + url.hash, false, false);
  const opener = showOpener;
  showOpener = null;
  requestAnimationFrame(() => opener?.isConnected && opener.focus());
}

/**
 * "Let me look first" (S04): its address, or Captain's when key is null. Keeps the query (the
 * preview, for one) but not a Show-the-work sheet.
 */
export function lookHref(project: string, key: string | null): string {
  const url = new URL(location.href);
  url.searchParams.delete("show");
  url.searchParams.delete("part");
  return href({ view: "captain", project, ...(key ? { look: key.toUpperCase() } : {}) }) + url.search;
}

let lookOpener: HTMLElement | null = null;
export function openLook(project: string, key: string): void {
  lookOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  go(lookHref(project, key), false, false);
}

/**
 * Back to Captain, with focus on what opened the step ("Let me look first") when it's still there,
 * else on the element with the fallback id (the card, after it turned green).
 */
export function closeLook(project: string, fallbackId?: string): void {
  go(lookHref(project, null), false, false);
  const opener = lookOpener;
  lookOpener = null;
  requestAnimationFrame(() => {
    const el = opener?.isConnected ? opener : fallbackId ? document.getElementById(fallbackId) : null;
    el?.focus();
  });
}

export function href(r: Route): string {
  if (r.view === "home") return "/";
  if (r.view === "new-project") return "/new";
  if (r.view === "join") return `/j/${r.code}`;
  const base = `/p/${r.project}`;
  switch (r.view) {
    case "captain":
      return r.look ? `${base}/look/${r.look}` : base;
    case "ticket":
      return `${base}/work/${r.key}`;
    case "plan":
      return `${base}/plans/${r.plan}`;
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
  if (isOldPath(location.pathname)) {
    const target = new URL(href(r), location.origin);
    new URLSearchParams(location.search).forEach((value, key) => {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    });
    history.replaceState(null, "", target.pathname + target.search + location.hash);
  }
  return r;
}

const listeners = new Set<() => void>();
if (typeof window !== "undefined") window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function go(r: Route | string, replace = false, scroll = true): void {
  const to = typeof r === "string" ? r : href(r);
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  listeners.forEach((l) => l());
  if (scroll) window.scrollTo(0, 0);
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
