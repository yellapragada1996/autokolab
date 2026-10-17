import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { OverviewGoal } from "../glance";

// Match the repository's hook harness: no new DOM dependency or network needed.
const hooks = vi.hoisted(() => ({ cursor: 0, states: [] as unknown[], memos: [] as { deps: unknown[]; value: unknown }[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.states)) hooks.states[slot] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[slot], (value: unknown) => { hooks.states[slot] = typeof value === "function" ? value(hooks.states[slot]) : value; }];
  },
  useRef(initial: unknown) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.states)) hooks.states[slot] = { current: initial };
    return hooks.states[slot];
  },
  useMemo(factory: () => unknown, deps: unknown[]) {
    const slot = hooks.cursor++;
    if (!hooks.memos[slot] || deps.some((d, i) => !Object.is(d, hooks.memos[slot].deps[i]))) hooks.memos[slot] = { deps, value: factory() };
    return hooks.memos[slot].value;
  },
  useId: () => "disclosure-id",
}));

import { GoalProgress } from "./GoalProgress";
import { Overview, type OverviewSnapshot } from "../Overview";
import { at, workspace } from "../fixtures";
import type { CaptainRoom } from "../useCaptainRoom";

beforeEach(() => { hooks.cursor = 0; hooks.states = []; hooks.memos = []; });
type Props = { children?: ReactNode; [key: string]: unknown };
function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap(n => isValidElement<Props>(n) ? [n, ...elements(n.props.children)] : []);
}
const goal: OverviewGoal = { id: "checkout", name: "Checkout", finished: null, tickets: [
  { key: "SH-1", title: "Saved cards", segment: "u", detail: "Birch · step 3 of 5", description: "In progress · Birch · step 3 of 5" },
] };

describe("inline review disclosure", () => {
  it("toggles its list without navigation and keeps it open when ticket data refreshes", () => {
    const highlight = vi.fn();
    const render = (value = goal) => { hooks.cursor = 0; return elements(GoalProgress({ goal: value, slug: "shop", selected: null, highlight })); };
    const initial = render();
    const button = initial.find(e => e.type === "button")!;
    const tray = initial.find(e => e.props.id === button.props["aria-controls"])!;
    expect(button.props.type).toBe("button"); // Native Enter/Space activation, one Tab stop.
    expect(button.props["aria-expanded"]).toBe(false);
    expect(tray.props.hidden).toBe(true);
    (button.props.onClick as () => void)();
    const opened = render({ ...goal, tickets: [...goal.tickets] });
    expect(opened.find(e => e.type === "button")!.props["aria-expanded"]).toBe(true);
    expect(opened.find(e => e.props.id === "disclosure-id")!.props.hidden).toBe(false);
    (opened.find(e => e.type === "button")!.props.onClick as () => void)();
    expect(render().find(e => e.props.id === "disclosure-id")!.props.hidden).toBe(true);
  });

  it("highlights the same ticket on hover and keyboard focus, and dismisses the hover label", () => {
    const highlight = vi.fn();
    const render = () => { hooks.cursor = 0; return elements(GoalProgress({ goal, slug: "shop", selected: "SH-1", highlight })); };
    const initial = render();
    const segment = initial.find(e => e.props.className === "gs u hl")!;
    (segment.props.onMouseEnter as (event: unknown) => void)({ currentTarget: {
      getBoundingClientRect: () => ({ left: 110, top: 108, width: 20 }),
      closest: () => ({ getBoundingClientRect: () => ({ left: 100, top: 100, width: 300 }) }),
    } });
    expect(highlight).toHaveBeenLastCalledWith("SH-1");
    const hovered = render();
    const tip = hovered.find(e => e.props.className === "tip show")!;
    expect(tip).toBeDefined();
    const style = { left: "", top: "", setProperty: vi.fn() };
    (tip.props.ref as (node: unknown) => void)({ offsetWidth: 120, offsetHeight: 50, style });
    expect(style).toMatchObject({ left: "-8px", top: "-52px" });
    expect(style.setProperty).toHaveBeenCalledWith("--arrow", "28px");
    (hovered.find(e => e.type === "button")!.props.onKeyDown as (e: { key: string }) => void)({ key: "Escape" });
    expect(render().some(e => e.props.className === "tip show")).toBe(false);
    const row = initial.find(e => e.props.className === "trow hl")!;
    (row.props.onFocus as () => void)(); expect(highlight).toHaveBeenLastCalledWith("SH-1");
    (row.props.onBlur as () => void)(); expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it("uses a continuous line over sixteen tickets while preserving every accessible ticket", () => {
    const many = { ...goal, tickets: Array.from({ length: 20 }, (_, i) => ({ ...goal.tickets[0], key: `SH-${i}` })) };
    const nodes = elements(GoalProgress({ goal: many, slug: "shop", selected: null, highlight: () => undefined }));
    expect(nodes.some(e => e.props.className === "gl cont")).toBe(true);
    expect(nodes.filter(e => e.props.className === "trow")).toHaveLength(20);
  });
});

describe("Overview renders across source refreshes", () => {
  it("keeps its snapshot through pending and failed refreshes and replaces it on recovery", () => {
    const ws = workspace([]);
    const room = { room: null, needs: [], plans: [], loadError: "" } as unknown as CaptainRoom;
    const render = (source: typeof ws | null, cr = room, error = "") => {
      hooks.cursor = 0;
      return Overview({ ws: source, cr, error, me: "person" }).props as { snapshot: OverviewSnapshot | null; failed: boolean };
    };
    const first = render(ws).snapshot;
    expect(first).not.toBeNull();
    expect(render(ws).snapshot).toBe(first);
    expect(render(null, { ...room, room: undefined }).snapshot).toBe(first);
    expect(render(ws, { ...room, loadError: "offline" })).toEqual({ snapshot: first, failed: true });
    const recovered = render({ ...ws });
    expect(recovered.snapshot).not.toBe(first);
    expect(recovered.failed).toBe(false);
    expect(render({ ...ws, project: { ...ws.project, id: "different" } }, { ...room, room: undefined }).snapshot).toBeNull();
  });

  it("does not introduce effects, fetching or timers when the same props render repeatedly", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(at("12:00")));
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const ws = workspace([]);
      const cr = { room: null, needs: [], plans: [], loadError: "" } as unknown as CaptainRoom;
      for (let i = 0; i < 25; i++) { hooks.cursor = 0; Overview({ ws, cr, me: "person" }); }
      expect(fetch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { fetch.mockRestore(); vi.useRealTimers(); }
  });
});
