import { describe, expect, it } from "vitest";
import { usageLimit } from "../src/runner/limit.js";

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
