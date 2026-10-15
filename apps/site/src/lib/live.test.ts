import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  handlers: [] as { filter: Record<string, string>; run: (payload: unknown) => void }[],
  queries: [] as { table: string; calls: [string, ...unknown[]][] }[],
  answers: [] as { data: unknown; error: unknown }[],
  removeChannel: vi.fn(),
}));
vi.mock("./session", () => ({ supabase: {
  channel: () => {
    const channel = {
      on: (_event: string, filter: Record<string, string>, run: (payload: unknown) => void) => { mock.handlers.push({ filter, run }); return channel; },
      subscribe: () => channel,
    };
    return channel;
  },
  removeChannel: mock.removeChannel,
  from: (table: string) => {
    const entry = { table, calls: [] as [string, ...unknown[]][] };
    mock.queries.push(entry);
    const query: unknown = new Proxy({}, { get: (_, key: string) => {
      if (key === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(mock.answers.shift() ?? { data: [], error: null }).then(ok);
      return (...args: unknown[]) => { entry.calls.push([key, ...args]); return query; };
    } });
    return query;
  },
} }));

import { tickets, ticketRecord, watchProject } from "./data";
import { mergeRoomMember, roomFeed, roomMessages, watchRoom, type Room } from "./room";
import { SAFETY_POLL_MS, visiblePoll } from "./poll";

let visibility: string;
let documentEvents: EventTarget;
const emit = (table: string, row: Record<string, unknown>, eventType = "UPDATE", old = {}) => {
  for (const { filter, run } of mock.handlers.filter((h) => h.filter.table === table)) run({ eventType, new: row, old });
};

beforeEach(() => {
  vi.useFakeTimers();
  mock.handlers = []; mock.queries = []; mock.answers = [];
  mock.removeChannel.mockClear();
  visibility = "visible";
  documentEvents = new EventTarget();
  vi.stubGlobal("document", {
    get visibilityState() { return visibility; },
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("project realtime", () => {
  it("routes heartbeats only to the project's agent rows, without reads or workspace reloads", () => {
    const onChange = vi.fn(), onAgent = vi.fn();
    const stop = watchProject("p1", { onChange, onAgent, ticketIds: () => new Set(["t1"]), agentIds: () => new Set(["a1"]), decisionIds: () => new Set(["d1"]) });
    emit("agents", { id: "a1", last_seen_at: "now", status: "building" });
    emit("agents", { id: "another-project-agent", last_seen_at: "now" });
    vi.advanceTimersByTime(200);
    expect(onAgent).toHaveBeenCalledExactlyOnceWith({ id: "a1", last_seen_at: "now", status: "building" }, false);
    expect(onChange).not.toHaveBeenCalled();
    expect(mock.queries).toEqual([]);
    stop();
  });

  it("ignores other projects, handles own child rows and primary-key-only deletes, and debounces", () => {
    const onChange = vi.fn();
    const stop = watchProject("p1", { onChange, onAgent: vi.fn(), ticketIds: () => new Set(["t1"]), agentIds: () => new Set(), decisionIds: () => new Set(["d1"]) });
    for (const table of ["ticket_steps", "ticket_links", "ticket_comments"]) emit(table, { ticket_id: "other" });
    for (const table of ["tickets", "decisions", "project_guides", "project_members", "ticket_events"]) {
      expect(mock.handlers.find((h) => h.filter.table === table)?.filter.filter).toBe("project_id=eq.p1");
      emit(table, { project_id: "other", id: "other" });
      emit(table, {}, "DELETE", { id: "other" });
    }
    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
    emit("ticket_steps", { ticket_id: "t1" });
    emit("ticket_links", {}, "DELETE", { ticket_id: "t1", blocked_by: "t2" });
    emit("tickets", {}, "DELETE", { id: "t1" });
    emit("decisions", {}, "DELETE", { id: "d1" });
    vi.advanceTimersByTime(150);
    expect(onChange).toHaveBeenCalledTimes(1);
    emit("ticket_comments", { ticket_id: "t1" }, "INSERT");
    stop();
    vi.advanceTimersByTime(SAFETY_POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe("room reads", () => {
  it("loads history once, then reads after its last database id, including an empty poll", async () => {
    mock.answers = [{ data: [{ id: 12 }, { id: 11 }], error: null }, { data: [{ id: 13 }], error: null }, { data: [], error: null }];
    const feed = roomFeed("r1");
    expect((await feed.load()).map((r) => r.id)).toEqual([11, 12]);
    expect((await feed.load()).map((r) => r.id)).toEqual([11, 12, 13]);
    expect((await feed.load()).map((r) => r.id)).toEqual([11, 12, 13]);
    expect(mock.queries[0].calls).toContainEqual(["order", "id", { ascending: false }]);
    expect(mock.queries[1].calls).toContainEqual(["gt", "id", 12]);
    expect(mock.queries[2].calls).toContainEqual(["gt", "id", 13]);
    expect(mock.queries[1].calls).toContainEqual(["order", "id"]);
    expect(mock.queries.every((q) => q.calls.some((c) => c[0] === "eq" && c[1] === "room_id" && c[2] === "r1"))).toBe(true);
  });

  it("paginates missed messages oldest first and starts after zero when history was empty", async () => {
    mock.answers = [{ data: [{ id: 4 }, { id: 5 }], error: null }, { data: [{ id: 6 }], error: null }];
    expect((await roomMessages("r1", 2, 3)).map((m) => m.id)).toEqual([4, 5, 6]);
    expect(mock.queries[1].calls).toContainEqual(["gt", "id", 5]);
    mock.queries = [];
    const feed = roomFeed("empty");
    await feed.load(); await feed.load();
    expect(mock.queries[1].calls).toContainEqual(["gt", "id", 0]);
  });

  it("serializes concurrent reads and retries a failed cursor without skipping messages", async () => {
    mock.answers = [{ data: [{ id: 12 }], error: null }, { data: null, error: { message: "offline" } }, { data: [{ id: 13 }], error: null }];
    const feed = roomFeed("r1");
    await feed.load();
    const failed = feed.load();
    const retry = feed.load();
    await expect(failed).rejects.toEqual({ message: "offline" });
    expect((await retry).map((m) => m.id)).toEqual([12, 13]);
    expect(mock.queries[1].calls).toContainEqual(["gt", "id", 12]);
    expect(mock.queries[2].calls).toContainEqual(["gt", "id", 12]);
  });

  it("member heartbeats update only current room members and never reload messages", () => {
    const onMessages = vi.fn(), onMember = vi.fn(), onMembership = vi.fn();
    const stop = watchRoom("r1", onMessages, { memberIds: () => new Set(["a1"]), onMember, onMembership });
    emit("members", { id: "a1", runner_state: "working" });
    emit("members", { id: "other" });
    expect(onMember).toHaveBeenCalledExactlyOnceWith({ id: "a1", runner_state: "working" });
    expect(onMessages).not.toHaveBeenCalled();
    expect(onMembership).not.toHaveBeenCalled();
    expect(mock.queries).toEqual([]);
    emit("messages", { room_id: "other" }, "INSERT");
    emit("room_members", { room_id: "other" }, "INSERT");
    expect(onMessages).not.toHaveBeenCalled();
    expect(onMembership).not.toHaveBeenCalled();
    emit("messages", { room_id: "r1" }, "INSERT");
    expect(onMessages).toHaveBeenCalledTimes(1);
    emit("room_members", { room_id: "r1" }, "INSERT");
    expect(onMembership).toHaveBeenCalledTimes(1);
    const member = { id: "a1", role: "lead", can_instruct: true };
    const room = { id: "r1", members: [member], me: member } as Room;
    const updated = mergeRoomMember(room, { id: "a1", runner_state: "working" })!;
    expect(updated.members[0]).toMatchObject({ ...member, runner_state: "working" });
    expect(updated.me).toEqual(updated.members[0]);
    expect(mergeRoomMember(updated, { id: "a1", revoked: true })).toMatchObject({ members: [], me: null });
    stop();
  });
});

describe("visible safety polling", () => {
  it("uses five minutes, skips hidden polls, catches up on visibility and cleans up", () => {
    const refresh = vi.fn();
    const stop = visiblePoll(refresh);
    vi.advanceTimersByTime(30_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SAFETY_POLL_MS - 30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility = "hidden"; documentEvents.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(SAFETY_POLL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility = "visible"; documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(SAFETY_POLL_MS);
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("ticket projections", () => {
  it("omits long fields and file lists, retaining only check status and its commit", async () => {
    await tickets("p1");
    const columns = mock.queries[0].calls.find((c) => c[0] === "select")?.[1] as string;
    expect(columns.split(",")).not.toContain("*");
    for (const column of ["description", "done_means", "pr_facts", "review"]) expect(columns.split(",")).not.toContain(column);
    expect(columns).toContain("checks:pr_facts->checks");
    expect(columns).toContain("checks_sha:pr_facts->>sha");
    await ticketRecord("t1");
    expect(mock.queries[1].calls).toContainEqual(["select", "*"]);
    expect(mock.queries[1].calls).toContainEqual(["eq", "id", "t1"]);
  });

  it("reads older schemas without downloading the heavy fields as a fallback", async () => {
    mock.answers = [{ data: null, error: { code: "42703", message: "column tickets.pr_facts does not exist" } }, { data: [{ id: "t1" }], error: null }];
    expect(await tickets("p1")).toEqual([{ id: "t1" }]);
    const columns = mock.queries[1].calls.find((c) => c[0] === "select")?.[1] as string;
    expect(columns).not.toMatch(/pr_facts|description|done_means|\*/);
  });
});
