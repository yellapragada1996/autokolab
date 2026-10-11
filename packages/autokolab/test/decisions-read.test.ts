import { describe, expect, it } from "vitest";
import { ProjectView, TICKET_DECISIONS_LIMIT, type Comment, type Ticket } from "../src/core/projects.js";

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
