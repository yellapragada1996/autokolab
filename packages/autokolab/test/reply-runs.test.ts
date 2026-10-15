import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Message, TaskRun } from "../src/core/types.js";
import { parseRunnerConfig, runnerTemplate } from "../src/runner/config.js";
import { CLAUDE_REPLY_DENY, claudeInvocation, codexInvocation, opencodeInvocation, opencodeReplyPermissions, overTurnCap, parseEvent, runEngine, type EngineRun } from "../src/runner/engines.js";
import { buildReplyPrompt } from "../src/runner/prompt.js";
import { Runner, isReplyJob, notesText, notesToAct, ownTicketsMentioned, replyCutShort, runOutcome, type Job } from "../src/runner/runner.js";

// AK-116: a follower's reply run answers briefly, can't change anything, stops at reply_max_turns,
// and leaves the work a message asks for on its own ticket to that ticket's build run.

const mcp = { command: "/usr/bin/node", args: ["/opt/autokolab/cli.js", "mcp", "--profile", "lee-claude"] };
const AID = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const cfgFor = (extra = "", engine = "claude") => parseRunnerConfig(`agent_id = "${AID}"\nengine = "${engine}"\n${extra}`, "lee");
const freshRun = (): EngineRun => ({ sessionId: null, finalText: "", exitCode: null, timedOut: false, aborted: false, isError: false });
const arg = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
/** The values after a flag, up to the next flag. */
const list = (args: string[], flag: string) => {
  const i = args.indexOf(flag);
  const rest = args.slice(i + 1);
  const end = rest.findIndex((a) => a.startsWith("--"));
  return end < 0 ? rest : rest.slice(0, end);
};

const ME = "me-1";
const LEAD = "lead-1";
const PERSON = "p-1";
const OTHER = "other-1";
const isHuman = (id: string) => id === PERSON;
const msg = (id: number, sender: string, kind: Message["kind"], body = "", extra: Partial<Message> = {}) =>
  ({ id, room_id: "room-1", thread_id: id === 100 ? null : 100, sender_id: sender, to_id: ME, kind, body, refs: {}, created_at: "2026-10-15T10:00:00Z", ...extra }) as Message;
const ticket = (id: string, key: string, assignee_id: string | null, status: string, needs_human: string | null = null) => ({ id, key, assignee_id, status, needs_human });

describe("reply limits in the runner file", () => {
  it("reply_max_turns defaults to 15 and is in the template", () => {
    expect(cfgFor().limits.reply_max_turns).toBe(15);
    expect(cfgFor("[limits]\nreply_max_turns = 8").limits.reply_max_turns).toBe(8);
    expect(() => cfgFor("[limits]\nreply_max_turns = 0")).toThrow(/reply_max_turns/);
    const t = runnerTemplate(AID, "claude");
    expect(t).toMatch(/^reply_max_turns = 15 /m);
    expect(parseRunnerConfig(t, "x").limits.reply_max_turns).toBe(15);
  });
});

describe("which jobs are replies", () => {
  it("a follower's job about its own open ticket is a reply whatever the kind; a person's message stays work", () => {
    expect(isReplyJob([msg(1, LEAD, "task")], isHuman)).toBe(false);
    expect(isReplyJob([msg(1, LEAD, "task")], isHuman, true)).toBe(true);
    expect(isReplyJob([msg(1, LEAD, "review"), msg(2, OTHER, "chat")], isHuman, true)).toBe(true);
    expect(isReplyJob([msg(1, PERSON, "task")], isHuman, true)).toBe(false);
  });

  it("own tickets are the open ones assigned to this agent that the messages mention", () => {
    const board = [
      ticket("t-4", "SH-4", ME, "in_progress"),
      ticket("t-5", "SH-5", ME, "ready"),
      ticket("t-6", "SH-6", ME, "done"),
      ticket("t-7", "SH-7", OTHER, "in_progress"),
      ticket("t-8", "SH-8", ME, "review"),
    ];
    const ms = [msg(1, LEAD, "task", "SH-4 and SH-5 need a fix; SH-6 is done, SH-7 is Ana's"), msg(2, LEAD, "chat", "and SH-8")];
    expect(ownTicketsMentioned(ms, "SH", board, ME).map((t) => t.key)).toEqual(["SH-4", "SH-5", "SH-8"]);
    expect(ownTicketsMentioned([msg(1, LEAD, "question", "How is the cart going?")], "SH", board, ME)).toEqual([]);
  });
});

describe("read-only reply runs", () => {
  it("Claude Code: only reading tools, edits, commits and pushes denied, default permissions, the reply turn cap", () => {
    const cfg = cfgFor(`[claude]\npermission_mode = "bypassPermissions"`);
    const work = claudeInvocation(cfg, mcp, null).args;
    expect(arg(work, "--max-turns")).toBe("300");
    expect(arg(work, "--permission-mode")).toBe("bypassPermissions");
    expect(list(work, "--allowedTools")).toContain("Edit");

    const a = claudeInvocation(cfg, mcp, null, {}, { maxTurns: 15 }).args;
    expect(arg(a, "--max-turns")).toBe("15");
    expect(arg(a, "--permission-mode")).toBe("default");
    const allowed = list(a, "--allowedTools");
    for (const t of ["Edit", "Write", "Bash(git:*)", "Bash(npm:*)"]) expect(allowed).not.toContain(t);
    expect(allowed).toEqual(expect.arrayContaining(["Read", "Grep", "Bash(git diff:*)", "mcp__autokolab"]));
    const denied = list(a, "--disallowedTools");
    for (const t of ["Edit", "Write", "NotebookEdit", "Bash(git commit:*)", "Bash(git push:*)", "Bash(gh pr create:*)"]) expect(denied).toContain(t);
    // The owner's own deny rules stay.
    expect(denied).toContain("Bash(git push --force:*)");
    expect(denied).toEqual(expect.arrayContaining(CLAUDE_REPLY_DENY));
    // Plan mode is read-only already and stays.
    expect(arg(claudeInvocation(cfgFor(`[claude]\npermission_mode = "plan"`), mcp, null, {}, { maxTurns: 15 }).args, "--permission-mode")).toBe("plan");
  });

  it("Codex runs a reply in the read-only sandbox, on resume too", () => {
    const codex = cfgFor("", "codex");
    expect(codexInvocation(codex, mcp, null, "/w", {}).args).toContain('sandbox_mode="workspace-write"');
    const fresh = codexInvocation(codex, mcp, null, "/w", {}, { maxTurns: 15 }).args;
    expect(fresh).toContain('sandbox_mode="read-only"');
    expect(arg(fresh, "-s")).toBe("read-only");
    expect(codexInvocation(codex, mcp, "thread-1", "/w", {}, { maxTurns: 15 }).args).toContain('sandbox_mode="read-only"');
  });

  it("OpenCode: no edits and only commands that read", () => {
    const oc = cfgFor(`[opencode]\nprovider = "ollama"\nmodel = "ollama/qwen3"`, "opencode");
    const p = opencodeReplyPermissions(oc) as { edit: unknown; bash: Record<string, string>; read: Record<string, string>; external_directory: string };
    expect(p.edit).toBe("deny");
    expect(p.bash["*"]).toBe("deny");
    expect(p.bash["git diff*"]).toBe("allow");
    expect(p.bash["git push*"]).toBeUndefined();
    expect(p.read[".env.prod"]).toBe("deny");
    expect(p.external_directory).toBe("deny");
    const inv = opencodeInvocation(oc, mcp, null, undefined, {}, { maxTurns: 15 });
    expect(inv.env?.OPENCODE_CONFIG).toBeTruthy();
  });
});

describe("the reply turn cap", () => {
  it("Claude Code stops itself; its error_max_turns marks the run as capped", () => {
    const run = freshRun();
    parseEvent("claude", JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, num_turns: 16 }), run);
    expect(run.turnCapped).toBe(true);
    expect(overTurnCap("claude", { steps: 100 }, 15)).toBe(false);
  });

  it("Codex tool calls and OpenCode steps are counted, and past the cap the run is stopped", () => {
    const cx = freshRun();
    for (let i = 0; i < 16; i++) parseEvent("codex", JSON.stringify({ type: "item.started", item: { type: "command_execution" } }), cx);
    parseEvent("codex", JSON.stringify({ type: "item.started", item: { type: "agent_message" } }), cx);
    expect(cx.steps).toBe(16);
    expect(overTurnCap("codex", cx, 15)).toBe(true);
    expect(overTurnCap("codex", cx, undefined)).toBe(false);
    expect(overTurnCap("codex", { ...cx, turnCapped: true }, 15)).toBe(false);
    const oc = freshRun();
    for (let i = 0; i < 15; i++) parseEvent("opencode", JSON.stringify({ type: "step_finish", part: { tokens: {} } }), oc);
    expect(overTurnCap("opencode", oc, 15)).toBe(false);
    parseEvent("opencode", JSON.stringify({ type: "step_finish", part: { tokens: {} } }), oc);
    expect(overTurnCap("opencode", oc, 15)).toBe(true);
  });

  it("a capped reply is reported in one plain line; a capped work run is a plain failure", () => {
    const ctx = { messageId: 9, stopReason: "x", maxMinutes: 60 };
    const capped = { ...freshRun(), isError: true, turnCapped: true };
    expect(runOutcome(capped, "Run ended: error_max_turns", { ...ctx, replyMaxTurns: 15 })).toEqual({ state: "failed", report: replyCutShort(9, 15), quiet: false });
    expect(replyCutShort(9, 15)).toBe("My reply to #9 was cut short after 15 turns.");
    expect(runOutcome(capped, "Run ended: error_max_turns", ctx).report).toMatch(/^Failed on #9/);
  });

  it("runEngine stops an OpenCode reply that goes past the cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ak-cap-"));
    const fake = join(dir, "fake-opencode.mjs");
    writeFileSync(fake, `#!/usr/bin/env node
process.stdin.resume();
let i = 0;
const t = setInterval(() => console.log(JSON.stringify({ type: "step_finish", part: { tokens: { input: 1 } } })), 20);
setTimeout(() => { clearInterval(t); console.log(JSON.stringify({ type: "text", part: { text: "never" } })); process.exit(0); }, 20000);
`, { mode: 0o755 });
    const oc = cfgFor(`opencode_bin = "${fake}"\n[opencode]\nprovider = "ollama"\nmodel = "ollama/qwen3"`, "opencode");
    const t0 = Date.now();
    const run = await runEngine({ cfg: oc, inv: { ...opencodeInvocation(oc, mcp, null, undefined, {}, { maxTurns: 3 }), maxTurns: 3 }, cwd: dir, prompt: "hi", logFile: join(dir, "x.log"), signal: new AbortController().signal });
    expect(run.turnCapped).toBe(true);
    expect(run.steps).toBeGreaterThan(3);
    expect(Date.now() - t0).toBeLessThan(10000);
  });
});

describe("notes for a ticket's build run", () => {
  it("resumes an in-progress or in-review ticket, waits for a Ready one or one waiting on a person, drops finished ones", () => {
    const n = [{ id: 1, from: "ana-claude", body: "SH-4: also empty carts" }];
    const notes = { "t-4": n, "t-5": n, "t-6": n, "t-7": n, "t-8": n, "t-9": n };
    const board = [
      ticket("t-5", "SH-5", ME, "ready"),
      ticket("t-6", "SH-6", ME, "done"),
      ticket("t-7", "SH-7", OTHER, "in_progress"),
      ticket("t-9", "SH-9", ME, "review", "Which colour?"),
      ticket("t-4", "SH-4", ME, "in_progress"),
      ticket("t-8", "SH-8", ME, "review"),
    ];
    expect(notesToAct(notes, board, ME)).toEqual({ resume: "t-4", drop: ["t-6", "t-7"] });
    expect(notesToAct({}, board, ME)).toEqual({ resume: null, drop: [] });
    expect(notesText(n)).toBe("ana-claude (room message #1): SH-4: also empty carts");
  });
});

describe("the reply prompt about an own ticket", () => {
  const base = { myName: "lee-claude", ownerName: "lee", isLead: false, roomName: "shop", repo: "ana/shop", thread: 100, root: null, recent: [], skipped: 0, tickets: [], denyPaths: [], worktreePath: "/w", followUp: false };
  it("says the build run does the work, and stays short", () => {
    const p = buildReplyPrompt({ ...base, ownTickets: ["SH-4"], handedOver: true });
    expect(p).toContain("This is about SH-4, assigned to you. Its build run does the work, not this run");
    expect(p).toContain("passed this message on to your build run of SH-4");
    expect(p).toMatch(/ticket_comment/);
    expect(p.length).toBeLessThan(3200);
    expect(buildReplyPrompt({ ...base, ownTickets: ["SH-4"] })).toContain("say it will be done in your build run of the ticket");
    expect(buildReplyPrompt(base)).not.toContain("assigned to you");
  });
});

describe("a follower's reply run end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "ak-ak116-"));
  const oldState = process.env.XDG_STATE_HOME;
  beforeAll(() => {
    process.env.XDG_STATE_HOME = join(dir, "state");
  });
  afterAll(() => {
    if (oldState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = oldState;
  });
  // Reports the arguments it was started with and its prompt; "CAP ME" ends at the turn cap.
  const fake = join(dir, "fake-claude.mjs");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const sid = "s-" + Math.random().toString(36).slice(2, 8);
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: sid }));
  if (input.includes("CAP ME")) {
    console.log(JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, session_id: sid, num_turns: 16 }));
    return;
  }
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: sid, num_turns: 1,
    result: JSON.stringify({ args: process.argv.slice(2), prompt: input }) }));
});
`,
    { mode: 0o755 },
  );
  const board = [ticket("t-4", "SH-4", ME, "in_progress"), ticket("t-7", "SH-7", OTHER, "in_progress")];
  const setup = (thread: Message[], myRole: "lead" | "follower" = "follower") => {
    const room = { id: "room-1", name: "shop", repo: "ana/shop" };
    const members: Record<string, { id: string; name: string; kind: string; owner_id: string }> = {
      [ME]: { id: ME, name: "lee-claude", kind: "agent", owner_id: "o-lee" },
      [LEAD]: { id: LEAD, name: "ana-claude", kind: "agent", owner_id: "o-ana" },
      [OTHER]: { id: OTHER, name: "kim-codex", kind: "agent", owner_id: "o-kim" },
      [PERSON]: { id: PERSON, name: "ana", kind: "human", owner_id: PERSON },
    };
    const posts: { kind: string; body: string; to: string | null }[] = [];
    const runsIn = vi.fn(async () => [{ session_id: "long-work-session" }]);
    const ak = {
      me: { ...members[ME], paused: false },
      sb: { from: () => { throw new Error("offline"); } },
      roomById: () => room,
      memberFresh: async (id: string) => members[id],
      membership: (_r: string, id = ME) => ({ role: id === ME ? myRole : id === LEAD ? "lead" : "follower" }),
      membersOf: () => [],
      isHuman: (id: string) => members[id]?.kind === "human",
      nameOf: (id: string) => members[id]?.name ?? id,
      ownerName: () => "lee",
      runsIn,
      threadMessages: async () => thread,
      updateRun: vi.fn(async () => undefined),
      heartbeat: async () => ({}),
      room: () => ({ post: async (m: { kind: string; body: string; to: string | null }) => void posts.push(m) }),
    };
    const runner = new Runner(ak as unknown as ConstructorParameters<typeof Runner>[0], parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\nclaude_bin = "${fake}"\n[claude]\nmodel = "opus"`, "p"));
    runner["prepareWorkspace"] = () => ({ path: dir, clone: dir, branch: "ak/lee-claude/t100", base: "main", created: false });
    runner["saveTicketState"]({ sessions: {}, seen: {} });
    runner["projects"] = [{
      project: { id: "pr-1", room_id: "room-1", repo: "ana/shop", ticket_prefix: "SH" },
      iAmLead: myRole === "lead",
      tickets: async () => board,
      ticketsLight: async () => board,
      ticket: async (k: string) => board.find((t) => t.key === k),
      ticketMention: async (k: string) => `${k} [Ready] ticket title`,
      recordRunUsage: async () => undefined,
    }] as never;
    const job = (m: Message): Job => ({ run: { id: m.id, thread_root: 100 } as TaskRun, message: m, fromInstructor: true, more: [], notBefore: 0, queuedAt: 0 });
    const ran = () => JSON.parse(posts[posts.length - 1].body) as { args: string[]; prompt: string };
    const notes = () => (runner["ticketState"]() as { notes?: Record<string, { id: number }[]> }).notes ?? {};
    return { runner, ak, posts, runsIn, job, ran, notes };
  };

  it("Captain's task on my own ticket gets a short reply run that can't edit, commit or push, and the build run gets the task", async () => {
    const m = msg(301, LEAD, "task", "SH-4: also handle empty carts, then push.");
    const s = setup([msg(100, LEAD, "task", "root"), m]);
    await s.runner["execute"](s.job(m));
    const r = s.ran();
    // Not the thread's long work session, and not the full work prompt.
    expect(s.runsIn).not.toHaveBeenCalled();
    expect(arg(r.args, "--resume")).toBeNull();
    expect(arg(r.args, "--model")).toBe("sonnet");
    expect(arg(r.args, "--max-turns")).toBe("15");
    expect(arg(r.args, "--permission-mode")).toBe("default");
    expect(list(r.args, "--allowedTools")).not.toContain("Edit");
    expect(list(r.args, "--disallowedTools")).toEqual(expect.arrayContaining(["Edit", "Write", "Bash(git commit:*)", "Bash(git push:*)"]));
    expect(r.prompt).toContain("This is about SH-4, assigned to you");
    expect(r.prompt).toContain("passed this message on to your build run of SH-4");
    expect(r.prompt).not.toContain("Rules lee set for this machine");
    expect(s.notes()["t-4"].map((n) => n.id)).toEqual([301]);
    // Only the reply itself is posted, no "Started on" notice.
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]).toMatchObject({ kind: "answer", to: LEAD });
  });

  it("a plain question is still a reply, read-only and capped, with nothing passed on", async () => {
    const m = msg(302, OTHER, "question", "Is SH-7 blocked on anything of yours?");
    const s = setup([m]);
    await s.runner["execute"](s.job(m));
    const r = s.ran();
    expect(arg(r.args, "--max-turns")).toBe("15");
    expect(list(r.args, "--disallowedTools")).toContain("Edit");
    expect(r.prompt).not.toContain("assigned to you");
    expect(s.notes()["t-7"]).toBeUndefined();
  });

  it("a task on someone else's ticket stays a work run", async () => {
    const m = msg(303, LEAD, "task", "Please pair on SH-7.");
    const s = setup([m]);
    await s.runner["execute"](s.job(m));
    const r = s.ran();
    expect(arg(r.args, "--resume")).toBe("long-work-session");
    expect(arg(r.args, "--max-turns")).toBe("300");
    expect(r.prompt).toContain("Rules lee set for this machine");
  });

  it("a reply that hits the cap posts one plain line, as a status that wakes nobody", async () => {
    const m = msg(304, OTHER, "question", "CAP ME please");
    const s = setup([m]);
    await s.runner["execute"](s.job(m));
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]).toMatchObject({ kind: "status", body: "My reply to #304 was cut short after 15 turns." });
  });

  it("Captain's own reply runs are left as they are", async () => {
    const m = msg(305, OTHER, "question", "What does SH-4 need?");
    const s = setup([m], "lead");
    await s.runner["execute"](s.job(m));
    const r = s.ran();
    expect(arg(r.args, "--max-turns")).toBe("300");
    expect(arg(r.args, "--permission-mode")).toBe("acceptEdits");
    expect(r.prompt).not.toContain("assigned to you");
  });

  it("a task on the ticket being built right now goes to that build run instead of a reply run", async () => {
    const s = setup([]);
    s.runner["current"] = { what: "SH-4", abort: new AbortController(), ticket: { id: "t-4", key: "SH-4", projectId: "pr-1" } };
    const hand = (m: Message) => s.runner["handToBuildRun"](m, { id: m.id, thread_root: 100 } as TaskRun);
    expect(await hand(msg(401, LEAD, "task", "SH-4: one more thing"))).toBe(true);
    expect(s.ak.updateRun).toHaveBeenCalledWith(401, expect.objectContaining({ state: "done", summary: "Passed to my SH-4 build run" }));
    // A question still gets its reply; a person's message, another ticket and an unrelated message aren't passed on.
    expect(await hand(msg(402, LEAD, "question", "SH-4: how far along?"))).toBe(false);
    expect(await hand(msg(403, PERSON, "task", "SH-4: stop"))).toBe(false);
    expect(await hand(msg(404, LEAD, "task", "SH-7: help kim"))).toBe(false);
    expect(await hand(msg(405, LEAD, "review", "SH-4 again, please"))).toBe(true);
    expect(s.notes()["t-4"].map((n) => n.id)).toEqual([401, 405]);
    // Nothing is being built: no hand-over.
    s.runner["current"] = null;
    expect(await hand(msg(406, LEAD, "task", "SH-4: more"))).toBe(false);
  });
});
