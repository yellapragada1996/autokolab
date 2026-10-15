import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "../lib/data";

// The site has no DOM test dependency. Run the hook's state and effects across renders,
// including dependency changes and cleanup; network promises are controlled by each test.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as unknown[],
  effects: [] as { deps: readonly unknown[]; cleanup?: () => void }[],
  pending: [] as (() => void)[],
}));
const readTicket = vi.hoisted(() => vi.fn<(id: string) => Promise<Ticket>>());
vi.mock("../lib/data", () => ({ ticketRecord: readTicket }));
vi.mock("../lib/errors", () => ({ reportError: (e: Error) => e.message }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.states)) hooks.states[slot] = initial;
    return [hooks.states[slot], (next: unknown) => {
      hooks.states[slot] = typeof next === "function" ? next(hooks.states[slot]) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const slot = hooks.cursor++;
    const previous = hooks.effects[slot];
    if (previous && deps.length === previous.deps.length && deps.every((d, i) => Object.is(d, previous.deps[i]))) return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects[slot] = { deps, cleanup: effect() ?? undefined };
    });
  },
}));

import { useFullTicket } from "./useFullTicket";
import { ticket } from "./fixtures";

function render(listed: Ticket | undefined, demo = false) {
  hooks.cursor = 0;
  const view = useFullTicket(listed, demo);
  for (const run of hooks.pending.splice(0)) run();
  return view;
}

function deferred() {
  let resolve!: (ticket: Ticket) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Ticket>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  for (const effect of hooks.effects) effect?.cleanup?.();
  hooks.cursor = 0; hooks.states = []; hooks.effects = []; hooks.pending = [];
  readTicket.mockReset();
});

describe("an open ticket across workspace refreshes", () => {
  it("stays loaded when a workspace reload creates a new object for the same unchanged ticket", async () => {
    const listed = ticket({ key: "SH-1", description: undefined, done_means: undefined });
    const full = { ...listed, description: "The brief", done_means: ["Keep the draft"] };
    readTicket.mockResolvedValue(full);
    expect(render(listed).loading).toBe(true);
    await vi.waitFor(() => expect(render(listed).loading).toBe(false));
    const before = render(listed);
    for (let i = 0; i < 3; i++) {
      const after = render({ ...listed });
      expect(after.loading).toBe(false);
      expect(after.ticket).toBe(before.ticket);
      expect(after.ticket?.done_means).toBe(full.done_means);
    }
    expect(readTicket).toHaveBeenCalledExactlyOnceWith(listed.id);
  });

  it("keeps the previous full record mounted while its changed revision loads", async () => {
    const listed = ticket({ key: "SH-1", description: undefined });
    const full = { ...listed, description: "The original brief", done_means: ["Existing check"] };
    readTicket.mockResolvedValueOnce(full);
    render(listed);
    await vi.waitFor(() => expect(render(listed).loading).toBe(false));
    const pending = deferred();
    readTicket.mockReturnValueOnce(pending.promise);
    const changed = { ...listed, status: "review" as const, updated_at: "2026-10-15T22:00:00Z" };
    expect(render(changed)).toMatchObject({ loading: false, ticket: full });
    expect(render({ ...changed }).ticket).toBe(full);
    expect(readTicket).toHaveBeenCalledTimes(2);
    const fresh = { ...full, status: changed.status, updated_at: changed.updated_at, description: "The updated brief" };
    pending.resolve(fresh);
    await vi.waitFor(() => expect(render(changed).ticket).toBe(fresh));
    expect(render(changed).loading).toBe(false);
  });

  it("keeps cached content on a failed background read and reports the failure", async () => {
    const listed = ticket({ key: "SH-1", description: undefined });
    const full = { ...listed, description: "The brief" };
    readTicket.mockResolvedValueOnce(full);
    render(listed);
    await vi.waitFor(() => expect(render(listed).loading).toBe(false));
    const changed = { ...listed, updated_at: "2026-10-15T22:00:00Z" };
    readTicket.mockRejectedValueOnce(new Error("Temporarily offline"));
    render(changed);
    await vi.waitFor(() => expect(render(changed).error).toBe("Temporarily offline"));
    expect(render(changed)).toMatchObject({ ticket: full, loading: false });
  });

  it("loads a different ticket without showing the previous one or accepting its late response", async () => {
    const first = ticket({ key: "SH-1", description: undefined });
    const second = ticket({ key: "SH-2", description: undefined });
    const pending = deferred();
    readTicket.mockReturnValueOnce(pending.promise);
    expect(render(first).loading).toBe(true);
    const secondFull = { ...second, description: "Second brief" };
    readTicket.mockResolvedValueOnce(secondFull);
    expect(render(second)).toMatchObject({ ticket: second, loading: true });
    await vi.waitFor(() => expect(render(second).ticket).toBe(secondFull));
    pending.resolve({ ...first, description: "Old response" });
    await pending.promise;
    expect(render(second).ticket).toBe(secondFull);
  });

  it("keeps the newest revision when background requests finish out of order", async () => {
    const listed = ticket({ key: "SH-1", description: undefined });
    const old = deferred();
    readTicket.mockReturnValueOnce(old.promise);
    render(listed);
    const changed = { ...listed, updated_at: "2026-10-15T22:00:00Z" };
    const latest = { ...changed, description: "The latest brief" };
    readTicket.mockResolvedValueOnce(latest);
    render(changed);
    await vi.waitFor(() => expect(render(changed).ticket).toBe(latest));
    old.resolve({ ...listed, description: "Outdated brief" });
    await old.promise;
    expect(render(changed).ticket).toBe(latest);
  });

  it("uses complete and preview records directly and tolerates a missing ticket", () => {
    const full = ticket({ key: "SH-1", description: "Complete" });
    expect(render(full)).toMatchObject({ ticket: full, loading: false, error: "" });
    const preview = { ...full, description: undefined };
    expect(render(preview, true)).toMatchObject({ ticket: preview, loading: false });
    expect(render(undefined)).toMatchObject({ ticket: undefined, loading: false });
    expect(readTicket).not.toHaveBeenCalled();
  });
});
