import reference from "../../../../../docs/research/overview-wireframe-v5/codex/overview.html?raw";
import { describe, expect, it } from "vitest";
import { overviewHeadings, type OverviewAgent, type OverviewAgentState, type OverviewGoal } from "../glance";

// Use the approved story's inputs, with explicit expectations for unsupported data below.
const story = JSON.parse(/<script id="story" type="application\/json">([\s\S]*?)<\/script>/.exec(reference)![1]) as {
  situations: { id: string; setup?: "none" | "captain" | "agents"; allDone?: number; names?: string; goals: { name: string; finished?: string }[]; agents: { name: string; goal?: string; state: OverviewAgentState; waiting?: number }[] }[];
};
const expected: Record<string, string[]> = {
  a1: ["2 agents are working on Checkout and Sign-in."],
  a2: ["2 agents are working on Checkout and Sign-in."],
  a3: ["3 agents are working on Checkout and Sign-in."],
  a4: ["3 agents are working on Checkout and Sign-in."],
  a5: ["3 agents are working on Checkout and Sign-in."],
  a6: ["Birch is working on Sign-in."],
  a7: ["2 agents are working on Checkout and Sign-in.", "Tern has stopped."],
  b8: ["Nothing is connected yet.", "Connect your computer to bring in Captain."],
  b9: ["Captain is here, but nobody builds yet.", "Add an agent to start building."],
  b10: ["Nothing has started yet.", "Tell Captain what you want to make."],
  b11: ["Birch is working on Checkout."],
  b12: ["3 agents are working on Checkout and Sign-in."], // First visit is not a recorded fact.
  c13: ["3 agents are working on Checkout and Sign-in."],
  c14: ["Birch is working on Checkout."],
  c15: ["2 agents are working on Checkout and Search.", "Sign-in is done."],
  c16: ["All 3 goals are done.", "No agents are working right now."],
  c17: ["8 agents are working on 5 goals.", "Moss has stopped."],
  c18: ["3 agents are working on 2 goals."],
  d19: ["2 agents are working on Checkout.", "Moss and Tern have stopped."],
  d20: ["2 agents are working on Checkout.", "Oriole is offline with 2 tickets waiting."],
  d21: ["2 agents are working on Checkout and Sign-in.", "Captain is offline."], // No claim about its host or all reviews.
  d22: ["No agents are working right now."], // Per-agent pause does not establish a project pause.
  d23: ["2 agents are working on Checkout and Sign-in.", "Tern has stopped."],
  d24c: ["3 agents are working on Checkout and Sign-in."],
  e25a: ["3 agents are working on Checkout and Sign-in."],
  e25b: ["3 agents are working on Checkout and Sign-in."],
  e26: ["3 agents are working on Checkout and Sign-in."],
};
const long: Record<string, string> = { Checkout: "Guest checkout with saved cards", "Sign-in": "Sign-in with email links and Google" };

describe("the approved heading table", () => {
  for (const scene of story.situations.filter(s => expected[s.id])) {
    it(`${scene.id}: ${expected[scene.id].join(" / ")}`, () => {
      const team: OverviewAgent[] = scene.agents.map(a => ({ id: a.name, name: a.name, state: a.state, word: "", doing: "", key: null, goalId: a.goal ?? null, steps: [], step: null, waiting: a.waiting ?? 0 }));
      const goals: OverviewGoal[] = scene.goals.map(g => ({ id: g.name, name: scene.names === "long" ? long[g.name] ?? g.name : g.name, tickets: [], finished: g.finished ?? null }));
      expect(overviewHeadings(team, goals, scene.setup ?? null, scene.allDone ?? 0).map(h => h.text)).toEqual(expected[scene.id]);
    });
  }
  it("covers every reference situation other than the two load screens tested in Overview", () => {
    expect(story.situations.map(s => s.id).filter(id => !expected[id])).toEqual(["d24a", "d24b"]);
  });
});
