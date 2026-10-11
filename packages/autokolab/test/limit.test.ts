import { describe, expect, it } from "vitest";
import { ProjectView } from "../src/core/projects.js";
import { usageLimit, usageReport } from "../src/runner/limit.js";
import { Runner } from "../src/runner/runner.js";

const failed = (finalText: string) => ({ finalText, isError: true, aborted: false, timedOut: false });
const now = new Date("2026-10-11T02:00:00.000Z"); // 4:00 am in Stockholm

describe("subscription usage limit", () => {
  it("reads Claude's reset clock in its named time zone", () => {
    expect(usageLimit(failed("You've hit your session limit · resets 5:40am (Europe/Stockholm)"), now)?.until.toISOString())
      .toBe("2026-10-11T03:40:00.000Z");
  });

  it("reads an on-the-hour reset without minutes", () => {
    expect(usageLimit(failed("You've hit your session limit · resets 5am (Europe/Stockholm)"), now)?.until.toISOString())
      .toBe("2026-10-11T03:00:00.000Z");
  });

  it("recognises usage and weekly wording and falls back when the clock is unreadable", () => {
    for (const kind of ["usage", "weekly"]) {
      expect(usageLimit(failed(`You've hit your ${kind} limit · resets soon`), now)?.until.toISOString())
        .toBe("2026-10-11T02:30:00.000Z");
    }
    expect(usageLimit(failed("You've hit your session limit · resets 5:40am (Unknown/Zone)"), now)?.until.toISOString())
      .toBe("2026-10-11T02:30:00.000Z");
  });

  it("caps a distant reset at six hours", () => {
    expect(usageLimit(failed("You've hit your session limit · resets 11:40pm (Europe/Stockholm)"), now)?.until.toISOString())
      .toBe("2026-10-11T08:00:00.000Z");
  });

  it("ignores ordinary errors, quoted limits in successful replies, aborts and timeouts", () => {
    expect(usageLimit(failed("Network connection failed"), now)).toBeNull();
    const quote = failed("You've hit your session limit · resets 5:40am (Europe/Stockholm)");
    expect(usageLimit({ ...quote, isError: false }, now)).toBeNull();
    expect(usageLimit({ ...quote, aborted: true }, now)).toBeNull();
    expect(usageLimit({ ...quote, timedOut: true }, now)).toBeNull();
  });
});

describe("the usage a runner reports", () => {
  const noon = new Date(2026, 9, 11, 12, 0);

  it("reports seconds used, the owner's limit and the local day", () => {
    expect(usageReport(4200.4, 3, null, noon)).toEqual({ used_s: 4200, limit_s: 10800, day: "2026-10-11", waiting_until: null });
    expect(usageReport(10, 0.5, null, new Date(2026, 0, 5, 9, 0)).day).toBe("2026-01-05");
    expect(usageReport(-5, 99, null, noon)).toMatchObject({ used_s: 0, limit_s: 86400 });
  });

  it("says when a limit wait ends, and stops once it has passed", () => {
    const until = new Date(noon.getTime() + 95 * 60_000).toISOString();
    expect(usageReport(600, 3, until, noon).waiting_until).toBe(until);
    expect(usageReport(600, 3, new Date(noon.getTime() - 60_000).toISOString(), noon).waiting_until).toBeNull();
  });

  it("waits until just after local midnight once the day's limit is used", () => {
    expect(usageReport(3 * 3600, 3, null, noon).waiting_until).toBe(new Date(2026, 9, 12, 0, 5).toISOString());
  });

  it("stops asking a database that can't record it yet (before schema 19)", async () => {
    const calls: string[] = [];
    const view = (error: { message: string; code?: string } | null) =>
      Object.assign(Object.create(ProjectView.prototype), {
        usageMissing: false,
        sb: { rpc: async (fn: string) => (calls.push(fn), { data: error ? null : {}, error }) },
      }) as ProjectView;
    const report = usageReport(600, 3, null, noon);
    const old = view({ code: "PGRST202", message: "Could not find the function public.report_usage(p_day, p_limit_s, p_used_s, p_waiting_until) in the schema cache" });
    expect(await old.reportUsage(report)).toBe(false);
    expect(await old.reportUsage(report)).toBe(false);
    expect(calls).toEqual(["report_usage"]);
    expect(await view({ code: "42703", message: 'column "used_today_s" of relation "agents" does not exist' }).reportUsage(report)).toBe(false);
    expect(await view(null).reportUsage(report)).toBe(true);
    await expect(view({ message: "AUTOKOLAB_NOT_AGENT: only agents report their usage" }).reportUsage(report)).rejects.toThrow(/only agents/);
  });

  it("sends a report only when it changed, and never fails the runner", async () => {
    const sent: { waiting_until: string | null }[] = [];
    let ok = true;
    const runner = Object.assign(Object.create(Runner.prototype), {
      isAgentRow: true,
      usageSent: "",
      limitWait: null as { until: string } | null,
      cfg: { limits: { max_hours_per_day: 3 } },
      usedToday: () => 600,
      log: () => undefined,
      projects: [{ reportUsage: async (u: { waiting_until: string | null }) => (sent.push(u), ok) }],
    });
    await runner.reportUsage();
    await runner.reportUsage();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ used_s: 600, limit_s: 10800, waiting_until: null });
    runner.limitWait = { until: new Date(Date.now() + 3600_000).toISOString() };
    await runner.reportUsage();
    expect(sent[1].waiting_until).toBe(runner.limitWait.until);
    // An older database: it is asked each time by the runner (the client is what stops asking), and nothing throws.
    ok = false;
    runner.limitWait = null;
    await runner.reportUsage();
    await runner.reportUsage();
    expect(sent).toHaveLength(4);
    runner.projects = [{ reportUsage: async () => Promise.reject(new Error("offline")) }];
    await expect(runner.reportUsage()).resolves.toBeUndefined();
  });
});
