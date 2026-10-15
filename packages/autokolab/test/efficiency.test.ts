import { describe, expect, it } from "vitest";
import { EfficiencyCounters, failureClass, promptSections, restKey } from "../src/runner/efficiency.js";

describe("numeric efficiency counters", () => {
  it("attributes REST bytes without keeping a URL or response", () => {
    expect(restKey("https://db.example/rest/v1/tickets?select=id%2Csort_order&project_id=eq.x")) .toBe("rest_tickets_board");
    expect(restKey("https://db.example/rest/v1/tickets?select=*&key=eq.AK-1")).toBe("rest_tickets_ticket");
    expect(restKey("https://db.example/rest/v1/ticket_comments?select=*")).toBe("rest_ticket_comments_comments");
    expect(restKey("https://db.example/auth/v1/token")).toBeNull();
  });

  it("counts prompt sections as bytes and keeps only fixed numeric keys", () => {
    const prompt = "Intro\n## Concept\nGuide\n## Decisions in force\nDEC-1\n=== Your ticket ===\nTicket\nComments (1, oldest first):\nHello\n";
    const sections = promptSections(prompt);
    expect(sections.prompt_guide).toBeGreaterThan(0);
    expect(sections.prompt_decisions).toBeGreaterThan(0);
    expect(sections.prompt_ticket).toBeGreaterThan(0);
    expect(sections.prompt_comments).toBeGreaterThan(0);
    expect(Object.values(sections).reduce((a, b) => a + (b ?? 0), 0)).toBe(Buffer.byteLength(prompt));
    const counters = new EfficiencyCounters();
    counters.add("prompt_guide", sections.prompt_guide);
    expect(counters.take()[0].values).toEqual({ prompt_guide: sections.prompt_guide });
  });

  it("classifies failures without storing error text", () => {
    expect(failureClass(new Error("git checkout failed"))).toBe("fail_env_git");
    expect(failureClass(new Error("ECONNRESET"))).toBe("fail_env_network");
    expect(failureClass(new Error("merge conflict"))).toBe("fail_conflict");
  });
});
