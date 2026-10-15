import { describe, expect, it, vi } from "vitest";
import { ProjectView, type Project } from "../src/core/projects.js";
import { Runner } from "../src/runner/runner.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const view = (sb: unknown, id: string) => Object.assign(Object.create(ProjectView.prototype), {
  sb, meId: "agent", project: { id } as Project,
}) as ProjectView;

describe("project status reports", () => {
  it("includes the project and the model", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await view({ rpc }, "second").status("planning", "Reading", null, { model: "opus", effort: "high" });
    expect(rpc).toHaveBeenCalledWith("agent_status", { p_status: "planning", p_note: "Reading", p_ticket: null, p_project: "second", p_model: "opus", p_effort: "high" });
  });
  it("retries without project on old databases while keeping the model", async () => {
    const calls: Record<string, unknown>[] = [];
    const sb = { rpc: async (_: string, args: Record<string, unknown>) => {
      calls.push({ ...args });
      return { error: "p_project" in args ? { message: "Could not find the function agent_status(p_project)" } : null };
    } };
    await view(sb, "second").status("building", "Building", "ticket", { model: "opus", effort: "high" });
    expect(calls.map((x) => x.p_project)).toEqual(["second", undefined]);
    expect(calls[1]).toMatchObject({ p_model: "opus", p_ticket: "ticket" });
  });
  it("also retries without model on databases before schema 11", async () => {
    const calls: Record<string, unknown>[] = [];
    const sb = { rpc: async (_: string, args: Record<string, unknown>) => {
      calls.push({ ...args });
      return { error: "p_project" in args || "p_model" in args ? { message: "Could not find the function agent_status" } : null };
    } };
    await view(sb, "second").status("building", "Building", "ticket", { model: "opus", effort: "high" });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({ p_status: "building", p_note: "Building", p_ticket: "ticket" });
  });
  it("does not retry a membership refusal", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "AUTOKOLAB_NOT_MEMBER: you are not a member" } });
    await expect(view({ rpc }, "second").status("planning")).rejects.toThrow(/not a member/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

function runnerFixture(project: string | null | undefined) {
  const data = { status: "planning", status_note: "Reading here", current_ticket_id: null, status_project_id: project };
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data }) };
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const sb = { from: vi.fn(() => query), rpc } as unknown as SupabaseClient;
  const first = view(sb, "first");
  const second = view(sb, "second");
  const firstStatus = vi.spyOn(first, "status");
  const secondStatus = vi.spyOn(second, "status");
  const runner = Object.assign(Object.create(Runner.prototype), {
    ak: { sb, me: { id: "agent" } }, isAgentRow: true, projects: [first, second],
    statusQueue: Promise.resolve(), log: vi.fn(),
  });
  return { runner, rpc, firstStatus, secondStatus };
}

describe("runner re-reports", () => {
  it("keeps a second project's status on heartbeats and model reports", async () => {
    const { runner, firstStatus, secondStatus, rpc } = runnerFixture("second");
    await runner.touchAgent();
    const onModel = runner.reportModel({ model: "opus", effort: "high" });
    await runner.statusQueue;
    onModel("actual-model");
    await runner.statusQueue;
    expect(firstStatus).not.toHaveBeenCalled();
    expect(secondStatus).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.every(([, args]) => args.p_project === "second")).toBe(true);
    expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_note: "Reading here", p_model: "actual-model" });
  });
  it.each([null, undefined])("keeps unscoped status unscoped (%s), including old databases", async (project) => {
    const { runner, firstStatus, rpc } = runnerFixture(project);
    await runner.touchAgent();
    runner.reportModel({ model: "opus", effort: "high" });
    await runner.statusQueue;
    expect(firstStatus).not.toHaveBeenCalled();
    expect(rpc.mock.calls.every(([, args]) => args.p_project === null)).toBe(true);
  });
});

describe("parallel build reports", () => {
  it("sends every run with its own project, and clears the list explicitly when finished", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const runs = [{ ticket_id: "t1", project_id: "first" }, { ticket_id: "t2", project_id: "second" }];
    await view({ rpc }, "second").status("building", null, "t2", undefined, runs);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_running_tickets: runs, p_project: "second", p_ticket: "t2" });
    await view({ rpc }, "second").status("idle", null, null, undefined, []);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_running_tickets: [], p_status: "idle" });
  });
  it("keeps project and model reporting when the database cannot record multiple builds yet", async () => {
    const calls: Record<string, unknown>[] = [];
    const sb = { rpc: async (_: string, args: Record<string, unknown>) => {
      calls.push({ ...args });
      return { error: "p_running_tickets" in args ? { message: "Could not find the function agent_status(p_running_tickets)" } : null };
    } };
    await view(sb, "second").status("building", null, "t2", { model: "opus", effort: "high" }, [{ ticket_id: "t2", project_id: "second" }]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ p_status: "building", p_note: null, p_ticket: "t2", p_project: "second", p_model: "opus", p_effort: "high" });
  });
  it("does not retry a refused run list without validation", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "AUTOKOLAB_BAD_TICKET: The ticket is not assigned to you." } });
    await expect(view({ rpc }, "second").status("building", null, "t2", undefined, [{ ticket_id: "t2", project_id: "second" }])).rejects.toThrow(/not assigned/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
