import { describe, expect, it } from "vitest";
import type { RunUsage } from "../lib/data";
import { BIRCH, ME, workspace } from "./fixtures";
import { costText, costToday, reportedLimit, spendText } from "./agentCosts";

const ws = workspace([]);
const a = ws.agentOf(BIRCH)!;
a.vendor = "opencode";
ws.people.profiles.get(ME)!.timezone = "America/Toronto";
const now = new Date("2026-10-14T02:00:00Z"); // still Oct 13 on Ana's computer
const run = (created_at: string, cost_usd: number | null, agent_id = BIRCH): RunUsage => ({
  id: 1,
  agent_id,
  ticket_id: null,
  kind: "build",
  model: "deepseek/deepseek-v4-flash",
  input_tokens: null,
  cache_read_tokens: null,
  cache_write_tokens: null,
  output_tokens: null,
  turns: 1,
  seconds: 10,
  cost_usd,
  created_at,
});

describe("API spend today", () => {
  it("uses the owner's day, excludes other agents and keeps zero reports", () => {
    const cost = costToday(
      ws,
      a,
      [
        run("2026-10-13T05:00:00Z", 1.2),
        run("2026-10-14T01:00:00Z", 0),
        run("2026-10-13T01:00:00Z", 9),
        run("2026-10-14T01:00:00Z", 8, "someone-else"),
      ],
      now,
    );
    expect(cost).toEqual({ usd: 1.2, missing: false, runs: 2 });
    expect(costText(cost)).toBe("$1.20 today");
    expect(costText(costToday(ws, a, [run("2026-10-14T01:00:00Z", 0)], now))).toBe("$0.00 today");
  });
  it("distinguishes never reported from reports without a cost", () => {
    expect(costToday(ws, a, [], now)).toBeNull();
    for (const missing of [null, NaN, -1]) {
      const cost = costToday(ws, a, [run("2026-10-14T01:00:00Z", missing), run("2026-10-14T01:00:00Z", 2)], now);
      expect(cost).toEqual({ usd: null, missing: true, runs: 2 });
      expect(costText(cost)).toBeNull();
    }
  });
  it("does not turn subscription costs into API spend", () => {
    expect(costToday(ws, { ...a, vendor: "codex" }, [run("2026-10-14T01:00:00Z", 2)], now)).toBeNull();
  });
});

describe("API spend against the reported daily limit (AK-112)", () => {
  const spent = (usd: number) => ({ usd, missing: false, runs: 1 });
  it("shows today's spend against the limit its runner reported", () => {
    expect(spendText(spent(1.2), 5)).toBe("$1.20 of $5 today");
    expect(spendText(spent(1.2), 2.5)).toBe("$1.20 of $2.50 today");
    expect(spendText(null, 5)).toBe("$0.00 of $5 today");
    expect(spendText(spent(1.2), 0)).toBe("$1.20 today · no daily limit");
  });
  it("shows the limit alone when some run today reported no cost", () => {
    expect(spendText({ usd: null, missing: true, runs: 2 }, 5)).toBe("$5 daily limit");
    expect(spendText({ usd: null, missing: true, runs: 2 }, 0)).toBe("No daily limit");
  });
  it("keeps the honest fallback when an older helper or server reports no limit", () => {
    expect(spendText(spent(1.2), null)).toBe("$1.20 today · daily limit set on its computer");
    expect(spendText(null, null)).toBeNull();
    expect(reportedLimit({ vendor: "opencode" })).toBeNull();
    expect(reportedLimit({ vendor: "opencode", daily_usd: null })).toBeNull();
  });
  it("reads the limit only for API-model agents, as a number", () => {
    expect(reportedLimit({ vendor: "opencode", daily_usd: 5 })).toBe(5);
    expect(reportedLimit({ vendor: "opencode", daily_usd: "2.50" })).toBe(2.5);
    expect(reportedLimit({ vendor: "opencode", daily_usd: "nonsense" })).toBeNull();
    expect(reportedLimit({ vendor: "claude", daily_usd: 5 })).toBeNull();
  });
});
