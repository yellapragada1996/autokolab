import { describe, expect, it } from "vitest";
import type { RunUsage } from "../lib/data";
import { BIRCH, ME, workspace } from "./fixtures";
import { costText, costToday } from "./agentCosts";

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
