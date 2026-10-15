import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRunnerConfig } from "../src/runner/config.js";
import { writeConfigFile } from "../src/core/config.js";
import { Runner } from "../src/runner/runner.js";
import { clonePath, withCloneLock, withRepoLock } from "../src/runner/repos.js";

const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const config = (n = 1) => parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"\nkeep_awake = false\nmax_parallel = ${n}`, "worker");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
let root: string;
let runners: any[];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ak-parallel-"));
  vi.stubEnv("XDG_STATE_HOME", root);
  vi.stubEnv("XDG_CONFIG_HOME", root);
  vi.stubEnv("XDG_DATA_HOME", root);
  runners = [];
});
afterEach(async () => {
  for (const r of runners) { r.stopping = true; for (const slot of r.slots.values()) slot.abort.abort(); if (r.workTimer) clearTimeout(r.workTimer); await r.stateWrites; }
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
function setup(n = 2) {
  const ak = { me: { id: AID, name: "worker", paused: false }, heartbeat: vi.fn().mockResolvedValue(undefined) };
  const r: any = new Runner(ak as never, config(n));
  runners.push(r);
  r.log = vi.fn(); r.setStatus = vi.fn().mockResolvedValue(undefined); r.reportUsage = vi.fn();
  r.nextQuestion = vi.fn().mockResolvedValue(null); r.nextReview = vi.fn().mockReturnValue(null);
  const p = { project: { id: "project", slug: "shop", repo: "owner/shop" }, iAmLead: false, comment: vi.fn().mockResolvedValue(undefined), update: vi.fn() };
  r.projects = [p]; r.projectsLoadedAt = Date.now();
  const job = (id: number) => ({ project: p, ticket: { id: `t${id}`, key: `AK-${id}`, status: "in_progress", assignee_id: AID }, comments: [] });
  return { r, ak, p, job };
}

describe("parallel builds", () => {
  it("defaults to one and refuses numbers outside 1–3 with plain words", () => {
    expect(parseRunnerConfig(`agent_id = "${AID}"\nengine = "codex"`, "worker").max_parallel).toBe(1);
    for (const n of [1, 2, 3]) expect(config(n).max_parallel).toBe(n);
    expect(() => config(4)).toThrow(/at most 3 parallel builds/);
    for (const n of [0, -1, 1.5]) expect(() => config(n)).toThrow();
  });
  it.each([1, 2, 3])("fills exactly %i slots, holds them through delivery and refills after completion", async (n) => {
    const { r, job } = setup(n);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let i = 0;
    r.nextTicket = vi.fn(async () => i < 4 ? job(++i) : null);
    r.executeTicket = vi.fn(async (j: any) => gates[Number(j.ticket.id.slice(1)) - 1].promise);
    await r.work();
    expect(r.executeTicket).toHaveBeenCalledTimes(n);
    expect(r.slots.size).toBe(n);
    expect(r.holdIfIdle()).toBe(false);
    await r.work();
    expect(r.executeTicket).toHaveBeenCalledTimes(n);
    gates[0].resolve(); await drain();
    await r.work();
    expect(r.executeTicket).toHaveBeenCalledTimes(n + 1);
    r.stopping = true;
    gates.forEach((g) => g.resolve()); await drain();
    expect(r.slots.size).toBe(0);
    expect(r.holdIfIdle()).toBe(true);
  });
  it("does not launch an extra build when usage reaches 80% while claiming it", async () => {
    const { r, job } = setup(3);
    r.slots.set("t1", { job: job(1), abort: new AbortController() });
    r.nextTicket = vi.fn(async () => { r.addUsage(8640); return job(2); });
    r.executeTicket = vi.fn();
    await r.work();
    expect(r.executeTicket).not.toHaveBeenCalled();
    expect(r.ticketState().pendingBuilds.t2.key).toBe("AK-2");
    r.slots.clear();
  });
  it("keeps Captain and room work serial, and lets a queued reply drain builds first", async () => {
    const { r, job } = setup(3);
    r.projects[0].iAmLead = true;
    expect(r.parallelLimit()).toBe(1);
    r.projects[0].iAmLead = false;
    const gate = deferred();
    r.executeTicket = vi.fn(() => gate.promise);
    r.nextTicket = vi.fn().mockResolvedValueOnce(job(1)).mockResolvedValue(null);
    await r.work();
    r.queue.push({ message: { id: 1 }, notBefore: 0 });
    r.execute = vi.fn(async () => { expect(r.slots.size).toBe(0); });
    await r.work(); expect(r.execute).not.toHaveBeenCalled();
    gate.resolve(); await drain(); await r.work();
    expect(r.execute).toHaveBeenCalledTimes(1);
  });
  it("pause cancels every slot and keeps each ticket for its own resume after restart", async () => {
    const { r, ak, job } = setup();
    const aborted: string[] = [];
    r.executeTicket = vi.fn(async (j: any) => {
      const abort = new AbortController();
      r.current = { what: j.ticket.key, abort };
      await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => { aborted.push(j.ticket.id); resolve(); }, { once: true }));
      r.current = null;
    });
    r.startBuild(job(1)); r.startBuild(job(2));
    ak.me.paused = true; await r.onPauseChange(true); await drain(); await r.stateWrites;
    expect(aborted.sort()).toEqual(["t1", "t2"]);
    const restarted: any = new Runner(ak as never, config(2)); runners.push(restarted);
    expect(Object.keys(restarted.ticketState().pendingBuilds)).toEqual(["t1", "t2"]);
    expect(r.slots.size).toBe(0);
  });
  it("adds live time from every slot, steps down at 80%, and stops all at the daily limit", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 15, 12));
    const { r, job } = setup(3);
    r.addUsage(3 * 3600 * .8 - 20);
    r.runningTime.set(Symbol(), Date.now() - 10_000);
    r.runningTime.set(Symbol(), Date.now() - 10_000);
    expect(r.usedToday()).toBe(8640);
    expect(r.parallelLimit()).toBe(1);
    const slots = [1, 2, 3].map((n) => ({ job: job(n), abort: new AbortController() }));
    slots.forEach((s, i) => r.slots.set(`t${i}`, s));
    r.addUsage(2160); r.checkRunningLimits();
    expect(slots.every((s) => s.abort.signal.aborted)).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 16, 0, 1));
    r.runningTime.clear();
    expect(r.usedToday()).toBe(0);
    expect(r.parallelLimit()).toBe(3);
  });
  it("one usage-limit error stops all builds, persists retries and steps down for that day", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 15, 12));
    const { r, ak, job } = setup(3);
    const gate = deferred(); r.executeTicket = vi.fn(() => gate.promise);
    r.startBuild(job(1)); r.startBuild(job(2));
    const controllers = [...r.slots.values()].map((s: any) => s.abort);
    await r.waitForUsage({ isError: true, aborted: false, timedOut: false, finalText: "You've hit your session limit" }, "ticket", job(1));
    expect(controllers.every((c) => c.signal.aborted)).toBe(true);
    gate.resolve(); await drain(); await r.stateWrites;
    const restarted: any = new Runner(ak as never, config(3)); runners.push(restarted); restarted.projects = r.projects;
    expect(Object.keys(restarted.ticketState().pendingBuilds)).toEqual(["t1", "t2"]);
    expect(restarted.parallelLimit()).toBe(1);
    vi.setSystemTime(new Date(2026, 9, 16, 12));
    expect(restarted.parallelLimit()).toBe(3);
  });
  it("a subscription wait spanning midnight also steps down on its resume day", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 1));
    const { r } = setup(3);
    r.savedTickets = { sessions: {}, seen: {}, steppedDownDay: "2026-10-15" };
    r.limitWait = { kind: "message", until: new Date(2026, 9, 16, 0, 59).toISOString(), noticedAt: new Date(2026, 9, 15, 23).toISOString() };
    r.nextTicket = vi.fn().mockResolvedValue(null);
    await r.work();
    expect(r.parallelLimit()).toBe(1);
    expect(r.ticketState().steppedDownDay).toBe("2026-10-16");
  });
  it("passes one teammate's instructions to every running ticket it names", async () => {
    const { r, ak, p, job } = setup();
    p.project.ticket_prefix = "AK";
    ak.isHuman = () => false; ak.roomById = () => ({}); ak.nameOf = () => "Captain";
    ak.updateRun = vi.fn().mockResolvedValue(undefined); r.roomProject = () => p;
    for (const n of [1, 2]) r.slots.set(`t${n}`, { job: job(n), abort: new AbortController() });
    expect(await r.handToBuildRun({ id: 50, kind: "task", body: "AK-1 and AK-2: include keyboard checks", room_id: "room", sender_id: "captain" }, { id: 10 })).toBe(true);
    expect(r.ticketState().notes).toMatchObject({ t1: [{ id: 50 }], t2: [{ id: 50 }] });
    r.slots.clear();
  });
  it("queued writes preserve concurrent session, note and review changes in one complete file", async () => {
    const { r } = setup();
    const first = r.ticketState(); const second = r.ticketState();
    first.sessions.t1 = "session-1"; r.saveTicketState(first);
    await Promise.resolve();
    second.sessions.t2 = "session-2"; second.notes = { t1: [{ id: 1, body: "new request", from: "Captain" }] }; r.saveTicketState(second);
    first.reviews = { t3: { sha: "a", action: "review", reviews: 1 } }; r.saveTicketState(first);
    await r.stateWrites;
    expect(JSON.parse(readFileSync(r.ticketStatePath(), "utf8"))).toMatchObject({ sessions: { t1: "session-1", t2: "session-2" }, notes: { t1: [{ id: 1 }] }, reviews: { t3: { sha: "a" } } });
  });
  it("skips active or overlapping follow-ups and recovers each pending ticket once", async () => {
    const { r, p, job } = setup(3);
    const a = { ...job(1).ticket, areas: ["src/**"] };
    const b = { ...job(2).ticket, areas: ["src/index.ts"] };
    const c = { ...job(3).ticket, areas: ["docs/**"] };
    p.ticket = vi.fn(async (key: string) => [a, b, c].find((t) => t.key === key));
    p.newComments = vi.fn(async () => [a, b, c].map((ticket) => ({ ticket, comments: [], looping: false })));
    p.claimNext = vi.fn().mockResolvedValue(null);
    r.slots.set(a.id, { job: { ...job(1), ticket: a }, abort: new AbortController() });
    expect((await r.nextTicket()).ticket.id).toBe(c.id);
    r.savedTickets.pendingBuilds = { t1: { project: "shop", key: a.key, comments: [] }, t2: { project: "shop", key: b.key, comments: [] }, t3: { project: "shop", key: c.key, comments: [] } };
    expect((await r.nextTicket()).ticket.id).toBe(c.id);
    r.slots.clear();
    expect((await r.nextTicket()).ticket.id).toBe(a.id);
  });
});

describe("parallel builds through real worktrees and agent processes", () => {
  it.each(["pause", "usage limit"])("claims separate Ready tickets, stops both processes on %s and resumes their own sessions", async (stop) => {
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
    const clone = join(root, "clone"); const remote = join(root, "remote.git");
    mkdirSync(clone);
    git(root, "init", "--bare", "-q", "-b", "main", remote);
    git(clone, "init", "-q", "-b", "main"); git(clone, "config", "user.name", "test"); git(clone, "config", "user.email", "test@example.test");
    writeFileSync(join(clone, "README.md"), "Test repo");
    git(clone, "add", "."); git(clone, "commit", "-qm", "initial"); git(clone, "remote", "add", "origin", remote); git(clone, "push", "-qu", "origin", "main");
    writeConfigFile({ repos: { "owner/shop": clone } });
    const fake = join(root, "codex.mjs");
    writeFileSync(fake, `#!/usr/bin/env node
import { writeFileSync, existsSync } from 'node:fs';
const ticket = process.env.AUTOKOLAB_TICKET;
const resumed = process.argv.includes('resume');
console.log(JSON.stringify({type:'thread.started',thread_id:'session-' + ticket}));
process.stdin.resume();
process.stdin.on('end', () => {
  writeFileSync(resumed ? 'resumed.json' : 'started.json', JSON.stringify({ticket,cwd:process.cwd(),port:process.env.AUTOKOLAB_PORT,args:process.argv}));
  const timer = setInterval(() => {
    if (!resumed && existsSync('limit')) {
      clearInterval(timer);
      console.log(JSON.stringify({type:'turn.failed',error:{message:"You've hit your session limit"}}));
      return;
    }
    if (!existsSync('finish')) return;
    clearInterval(timer);
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Work complete.'}}));
    console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:20,output_tokens:10}}));
  }, 20);
});
`, { mode: 0o755 });
    const { r, ak, p, job } = setup();
    r.cfg.codex_bin = fake;
    ak.ownerName = () => "Owner";
    p.project.name = "Shop";
    const tickets = [1, 2].map((n) => ({ ...job(n).ticket, status: "ready", title: `Task ${n}`, areas: [`area${n}/**`] }));
    p.ticket = async (key: string) => tickets.find((t) => t.key === key);
    p.tickets = async () => tickets;
    p.update = async (key: string, change: object) => Object.assign(await p.ticket(key), change);
    p.newComments = async () => [];
    p.claimNext = async (_wait: unknown, canStart: (t: unknown) => boolean) => {
      const t = tickets.find((t) => t.status === "ready" && canStart(t));
      if (t) t.status = "in_progress";
      return t ?? null;
    };
    p.loadNames = async () => undefined; p.brief = async () => ""; p.ticketText = async (key: string) => key;
    p.recordRunUsage = vi.fn().mockResolvedValue(true);
    r.modelChoice = async () => ({}); r.reportModel = () => () => undefined;
    await r.work();
    const dirs = tickets.map((t) => join(root, "autokolab", "worktrees", "worker", "owner-shop", t.key));
    await vi.waitFor(() => expect(dirs.every((d) => existsSync(join(d, "started.json")))).toBe(true));
    const launched = dirs.map((d) => JSON.parse(readFileSync(join(d, "started.json"), "utf8")));
    expect(launched.map((a) => a.ticket)).toEqual(["AK-1", "AK-2"]);
    expect(new Set(launched.map((a) => a.cwd)).size).toBe(2);
    expect(new Set(launched.map((a) => a.port)).size).toBe(2);
    expect(dirs.map((d) => git(d, "branch", "--show-current"))).toEqual(["ak-1-task-1", "ak-2-task-2"]);
    if (stop === "pause") { ak.me.paused = true; await r.onPauseChange(true); }
    else writeFileSync(join(dirs[0], "limit"), "limited");
    await vi.waitFor(() => expect(r.slots.size).toBe(0));
    expect(r.ticketState().sessions).toEqual({ t1: "session-AK-1", t2: "session-AK-2" });
    expect(Object.keys(r.ticketState().pendingBuilds)).toEqual(["t1", "t2"]);
    ak.me.paused = false;
    if (stop === "usage limit") {
      expect(r.parallelLimit()).toBe(1);
      r.saveLimitWait({ ...r.limitWait, until: new Date(Date.now() - 1).toISOString() });
      r.loadProjects = async () => undefined;
    }
    await r.work();
    for (let i = 0; i < dirs.length; i++) {
      await vi.waitFor(() => expect(existsSync(join(dirs[i], "resumed.json"))).toBe(true));
      if (stop === "usage limit" && i === 0) expect(existsSync(join(dirs[1], "resumed.json"))).toBe(false);
      const resumed = JSON.parse(readFileSync(join(dirs[i], "resumed.json"), "utf8"));
      expect(resumed.args).toContain(`session-AK-${i + 1}`);
      writeFileSync(join(dirs[i], "finish"), "done");
    }
    await vi.waitFor(() => expect(r.slots.size).toBe(0));
    expect(r.ticketState().pendingBuilds).toEqual({});
    expect(p.recordRunUsage).toHaveBeenCalledTimes(4);
    expect(p.recordRunUsage.mock.calls.slice(-2).map(([row]: any[]) => row)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "build", ticket_id: "t1", input_tokens: 80, cache_read_tokens: 20, output_tokens: 10 }),
      expect.objectContaining({ kind: "build", ticket_id: "t2", input_tokens: 80, cache_read_tokens: 20, output_tokens: 10 }),
    ]));
  });
});

describe("clone lock", () => {
  it("serializes the same clone, lets another clone proceed, and releases after a failure", async () => {
    const clone = join(root, "repo"); const other = join(root, "other");
    const gate = deferred(); const events: string[] = [];
    const a = withCloneLock(clone, async () => { events.push("first"); await gate.promise; events.push("released"); });
    const b = withCloneLock(clone, async () => { events.push("second"); throw new Error("fetch failed"); }).catch((e) => e.message);
    await withCloneLock(other, async () => { events.push("other"); });
    expect(events).toEqual(["first", "other"]);
    gate.resolve(); await a; expect(await b).toBe("fetch failed");
    await withCloneLock(clone, () => events.push("third"));
    expect(events).toEqual(["first", "other", "released", "second", "third"]);
  });
  it("pause cancels a slot waiting for the clone without running its git commands", async () => {
    const clone = join(root, "repo"); const gate = deferred();
    const holder = withCloneLock(clone, () => gate.promise);
    const abort = new AbortController(); const git = vi.fn();
    const waiting = withCloneLock(clone, git, abort.signal);
    abort.abort();
    await expect(waiting).rejects.toThrow(/stopped while waiting/);
    expect(git).not.toHaveBeenCalled();
    gate.resolve(); await holder;
  });
  it("locks the managed clone when a configured checkout has disappeared", async () => {
    const repo = "owner/missing";
    writeConfigFile({ repos: { [repo]: join(root, "deleted-checkout") } });
    const gate = deferred();
    const holder = withCloneLock(clonePath(repo), () => gate.promise);
    const enter = vi.fn();
    const waiter = withRepoLock(repo, enter);
    await drain(); expect(enter).not.toHaveBeenCalled();
    gate.resolve(); await holder; await waiter;
    expect(enter).toHaveBeenCalledTimes(1);
  });
  it("reclaims a lock left by a dead helper", async () => {
    const clone = join(root, "repo"); const lock = `${clone}.autokolab-lock`;
    mkdirSync(lock); writeFileSync(join(lock, "pid"), "2147483647");
    expect(await withCloneLock(clone, () => "ready")).toBe("ready");
  });
});
