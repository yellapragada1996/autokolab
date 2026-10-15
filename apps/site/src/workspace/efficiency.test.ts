import { describe, expect, it } from "vitest";
import { efficiencyLine, lastSevenDays } from "./efficiency";

describe("seven-day AutoKolab traffic line", () => {
  it("sums numeric downloads and wake reasons while showing missing days", () => {
    const now = new Date(2026, 9, 16);
    const days = lastSevenDays(now);
    const line = efficiencyLine([
      { agent_id: "a", day: days[0], counters: { rest_tickets_board: 1_000_000, wake_message_chat: 2, wake_ready: 1 } },
      { agent_id: "a", day: days[6], counters: { rest_messages_messages: 500_000, wake_comment: 1, realtime_events: 9 } },
    ], now);
    expect(line).toContain("1.5 MB");
    expect(line).toContain("woke agents 4 times");
    expect(line).toContain("2 for messages");
    expect(line).toContain("5 days missing data");
  });
});
