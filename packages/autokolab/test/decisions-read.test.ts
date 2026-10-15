import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { LEAD_ASK_ONCE, ProjectView, TICKET_DECISIONS_LIMIT, type Comment, type Ticket } from "../src/core/projects.js";
import { parseRunnerConfig } from "../src/runner/config.js";
import { promptSections } from "../src/runner/efficiency.js";
import { buildReviewPrompt, buildTicketPrompt } from "../src/runner/prompt.js";

const ticket = (change: Partial<Ticket> = {}): Ticket => ({
  id: "ticket-1", project_id: "project-1", number: 1, key: "AK-1", title: "Build it",
  description: "", type: "task", priority: "medium", status: "in_progress", labels: [],
  parent_id: null, assignee_id: null, assignee_type: null, reporter_id: "person",
  done_means: [], branch: null, pr_url: null, needs_human: null, sort_order: 1,
  created_at: "2026-10-11T10:00:00Z", updated_at: "2026-10-11T10:00:00Z", ...change,
});
const decision = (key: string, body: string, change: Record<string, unknown> = {}) => ({
  id: key, key, kind: key.startsWith("CON") ? "contract" : "decision", title: `Title ${key}`,
  body, ticket_id: "ticket-1", created_at: "2026-10-11T10:00:00Z", superseded_by: null, ...change,
});
const comment = (body: string): Comment => ({
  id: 1, ticket_id: "ticket-1", author_id: "person", author_type: "human", body,
  created_at: "2026-10-11T10:00:00Z",
});
function view(ds: ReturnType<typeof decision>[], t = ticket(), cs: Comment[] = []): ProjectView {
  return Object.assign(Object.create(ProjectView.prototype), {
    project: { id: "project-1", name: "Test", ticket_prefix: "AK", default_branch: "main", lead_agent_id: null },
    meId: "person", names: new Map(), agentInfo: new Map(),
    guide: async () => ({ concept: "", architecture: "", rules: "" }),
    decisions: async () => ds,
    ticket: async () => t,
    tickets: async () => [t],
    ticketsLight: async () => [t],
    steps: async () => [],
    comments: async () => cs,
    links: async () => [],
  }) as ProjectView;
}

describe("decision_get text", () => {
  const body = "Exact wording\n\n```ts\nconst a = 1;\n```";
  const ds = [decision("CON-23", body), decision("DEC-4", "Old", { superseded_by: "DEC-5" }), decision("DEC-5", "New")];
  it("returns one complete, unflattened contract with its source", async () => {
    const text = await view(ds).decisionGet(["con-23"]);
    expect(text).toContain(body);
    expect(text).toContain("CON-23 (contract): Title CON-23");
    expect(text).toContain("Recorded: 2026-10-11T10:00:00Z");
    expect(text).toContain("From ticket: AK-1");
  });
  it("returns several in order, a plain unknown message, and a replacement key", async () => {
    const text = await view(ds).decisionGet(["DEC-4", "no-99", "CON-23"]);
    expect(text.startsWith("Replaced by DEC-5.\nDEC-4")).toBe(true);
    expect(text).toContain("No decision or contract NO-99 in Test.");
    expect(text.indexOf("NO-99")).toBeLessThan(text.indexOf("CON-23 (contract)"));
  });
});

describe("Captain's brief", () => {
  it("tells Captain to ask a person once, through one channel, and to close what's settled (AK-100)", async () => {
    const lead = view([]);
    lead.project.lead_agent_id = "person";
    const brief = await lead.brief();
    expect(brief).toContain(LEAD_ASK_ONCE);
  });
});

describe("decision text in agent brief and ticket", () => {
  it("marks shortened decisions and all contracts, but not short decisions; stops before code", async () => {
    const brief = await view([
      decision("DEC-1", "Short text"),
      decision("DEC-2", "x".repeat(401)),
      decision("CON-3", "Intro\n```ts\nsecretExample()\n```"),
    ]).brief();
    expect(brief).toContain("DEC-1: Title DEC-1 · Short text");
    expect(brief).not.toContain("decision_get DEC-1");
    expect(brief).toContain("decision_get DEC-2 for the full text");
    expect(brief).toContain("CON-3 (contract): Title CON-3 · Intro… (decision_get CON-3 for the full text)");
    expect(brief).not.toContain("secretExample()");
  });
  it("includes mentions from description and comments once, with complete Markdown", async () => {
    const text = await view([
      decision("CON-23", "```json\n{\"ok\": true}\n```"),
      decision("DEC-4", "Old", { superseded_by: "DEC-5" }),
      decision("DEC-5", "New"),
    ], ticket({ description: "Follow con-23 and CON-23" }), [comment("Also follow dec-4")]).ticketText("AK-1");
    const section = text.split("Decisions and contracts this ticket mentions:\n")[1];
    expect(section.match(/CON-23 \(contract\):/g)).toHaveLength(1);
    expect(section).toContain("```json\n{\"ok\": true}\n```");
    expect(section).toContain("Replaced by DEC-5.\nDEC-4");
    expect(section.indexOf("CON-23 (contract)")).toBeLessThan(section.indexOf("DEC-4 (decision)"));
  });
  it("points to remaining decisions after the full text reaches the cap", async () => {
    const text = await view([
      decision("CON-1", "a".repeat(TICKET_DECISIONS_LIMIT - 300)),
      decision("CON-2", "b".repeat(500)),
    ], ticket({ description: "CON-1 and CON-2" })).ticketText("AK-1");
    const section = text.split("Decisions and contracts this ticket mentions:\n")[1];
    expect(section).toContain("a".repeat(100));
    expect(section).toContain("CON-2: decision_get CON-2 for the full text");
    expect(section).not.toContain("b".repeat(100));
    expect(section.length).toBeLessThanOrEqual(TICKET_DECISIONS_LIMIT);
  });
});

describe("purpose-built briefings", () => {
  it("builds with rules, one full ticket, blockers and mentioned decisions, without other full tickets", async () => {
    const target = ticket({ description: "Follow CON-23", done_means: ["Done"] });
    const other = ticket({ id: "ticket-2", key: "AK-2", title: "Other work", description: "PRIVATE OTHER DESCRIPTION", status: "ready" });
    const p = view([decision("CON-23", "Contract body"), decision("DEC-4", "Unrelated decision")], target);
    p.guide = vi.fn(async () => ({ concept: "WHOLE CONCEPT", architecture: "WHOLE ARCHITECTURE", rules: "Project rule" }));
    p.ticketsLight = vi.fn(async () => [target, other]);
    p.tickets = vi.fn(async () => { throw new Error("full board read"); });
    p.links = vi.fn(async () => [{ ticket_id: target.id, blocked_by: other.id }]);
    const built = await p.buildBrief("AK-1");
    expect(built.brief).toContain("Project rule");
    expect(built.brief).toContain("AK-2 [Ready] Other work");
    expect(built.brief).not.toContain("WHOLE CONCEPT");
    expect(built.brief).not.toContain("WHOLE ARCHITECTURE");
    expect(built.ticket).toContain("Blocked by: AK-2 (Ready) Other work");
    expect(built.ticket).toContain("Contract body");
    expect(built.ticket).not.toContain("Unrelated decision");
    expect(built.ticket).not.toContain("PRIVATE OTHER DESCRIPTION");
    expect(p.tickets).not.toHaveBeenCalled();
  });

  it("replies with a mentioned ticket's title and status only", async () => {
    const p = view([], ticket({ description: "Long private detail" }));
    const text = await p.ticketMention("AK-1");
    expect(text).toBe("AK-1 [In progress] Build it");
    expect(text).not.toContain("Long private detail");
  });

  it("reviews only the named decision and keeps guide and decision reads cached", async () => {
    const p = view([decision("CON-23", "Contract body"), decision("DEC-4", "Unrelated")]);
    const read = vi.fn(async () => [decision("CON-23", "Contract body"), decision("DEC-4", "Unrelated")]);
    p.decisions = read;
    expect(await p.reviewDecisions(ticket({ description: "Follow CON-23" }))).toEqual(["CON-23: Title CON-23\nContract body"]);
    await p.reviewDecisions(ticket({ done_means: ["Check CON-23"] }));
    expect(read).toHaveBeenCalledTimes(1);
    p.invalidateBriefCache("decisions");
    await p.reviewDecisions(ticket({ description: "CON-23" }));
    expect(read).toHaveBeenCalledTimes(2);
    const prompt = buildReviewPrompt({ myName: "captain", ownerName: "owner", projectName: "Test", key: "AK-1", title: "Build it",
      description: "Follow CON-23", doneMeans: ["Done"], prUrl: "https://github.com/example/repo/pull/1", sha: "abc123", checks: ["checks: passed"],
      files: ["src/index.ts"], risky: [], diff: "+change", decisions: await p.reviewDecisions(ticket({ description: "CON-23" })), repoPath: "/tmp/review", base: "main" });
    expect(prompt).toContain("Contract body");
    expect(prompt).toContain("- [ ] Done");
    expect(prompt).toContain("+change");
    expect(prompt).not.toContain("Unrelated");
  });

  it("reuses the guide until it changes or the hourly cache expires", async () => {
    const p = view([]);
    const read = vi.fn(async () => ({ concept: "Concept", architecture: "Architecture", rules: "Rule" }));
    p.guide = read;
    await p.buildBrief("AK-1");
    await p.buildBrief("AK-1");
    expect(read).toHaveBeenCalledTimes(1);
    p.invalidateBriefCache("guide");
    await p.buildBrief("AK-1");
    expect(read).toHaveBeenCalledTimes(2);
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(60 * 60_000 + 1);
      await p.buildBrief("AK-1");
      expect(read).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the AK-152 build briefing under 24 KB with the real ticket text", async () => {
    const actual = ticket({
      key: "AK-152", title: "Each run gets a briefing built for its purpose, not the whole guide, all decisions and every ticket twice",
      description: "Rank 3 in docs/research/efficiency-audit.md. A first build reads every full ticket in brief() and again in ticketText(), and sends the whole project guide plus all active decisions. A reply that mentions one ticket can trigger reads of the whole board. Model tokens cost far more than database bytes. Cache the guide and decisions in the runner, refreshed when they change or every hour. Build briefings by run kind: build gets this ticket in full, blockers' titles and statuses, mentioned decisions, rules and other open ticket titles; reply gets thread context and mentioned ticket titles and statuses; review gets done means, diff and mentioned decisions. Never read all full tickets. Measure before switching with AK-151 counters. Keep project_brief and decision_get. Target a build briefing under about 24 KB unless the ticket itself is bigger.",
      done_means: ["Guide and decisions are cached; no run reads all full tickets", "Build, reply and review briefings contain only their purpose's parts; tools still allow reading more", "PR shows before/after briefing sizes on real tickets; tests and CI green"],
    });
    const guide = readFileSync(new URL("../../../GUIDE.md", import.meta.url), "utf8");
    const p = view([], actual);
    p.guide = vi.fn(async () => ({ concept: guide, architecture: "", rules: "Work the assigned ticket, run tests and open a PR against main." }));
    const after = await p.buildBrief("AK-152");
    const afterBytes = Buffer.byteLength(`${after.brief}\n${after.ticket}`);
    // The old run sent at least the full guide and this ticket. Board and decisions only add to it.
    const beforeMinimum = Buffer.byteLength(guide) + Buffer.byteLength(after.ticket);
    expect(afterBytes).toBeLessThan(24 * 1024);
    expect(beforeMinimum).toBeGreaterThan(afterBytes);
    const cfg = parseRunnerConfig('agent_id = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc"\nengine = "codex"', "test");
    const context = { myName: "jamesblack-codex", ownerName: "jamesblack", projectName: "AutoKolab", key: "AK-152", cfg,
      worktree: { clone: "/tmp/clone", path: "/tmp/AK-152", branch: "ak-152-each-run-gets-a-briefing-built", base: "main", created: false }, followUp: false, newComments: null };
    const oldPrompt = buildTicketPrompt({ ...context, brief: `# AutoKolab\n## Concept\n${guide}`, ticket: after.ticket });
    const newPrompt = buildTicketPrompt({ ...context, brief: after.brief, ticket: after.ticket });
    const oldSections = promptSections(oldPrompt);
    const newSections = promptSections(newPrompt);
    expect(Object.values(oldSections).reduce((n, v) => n + v, 0)).toBe(Buffer.byteLength(oldPrompt));
    expect(Object.values(newSections).reduce((n, v) => n + v, 0)).toBe(Buffer.byteLength(newPrompt));
    // Keep both prompt-section measurements visible in the test report for the PR.
    console.info(`AK-152 briefing bytes: old lower bound ${beforeMinimum}, new ${afterBytes}; prompt sections old ${JSON.stringify(oldSections)}, new ${JSON.stringify(newSections)}`);
  });
});
