import { describe, expect, it } from "vitest";
import { missingCreateSummaryNudge, needsHumanLengthNudge, roomPostLengthNudge } from "../src/mcp/server.js";

describe("chat length nudges", () => {
  it("nudges a lead after a long message to a person", () => {
    expect(roomPostLengthNudge("x".repeat(501), "lead", "human")).toContain("501 characters");
    expect(roomPostLengthNudge("x".repeat(500), "lead", "human")).toBe("");
  });

  it("does not nudge messages to agents or messages from workers", () => {
    expect(roomPostLengthNudge("x".repeat(501), "lead", "agent")).toBe("");
    expect(roomPostLengthNudge("x".repeat(501), "follower", "human")).toBe("");
    expect(roomPostLengthNudge("x".repeat(501), "lead", undefined)).toBe("");
  });

  it("nudges a long Needs you question only", () => {
    expect(needsHumanLengthNudge("x".repeat(301))).toContain("301 characters");
    expect(needsHumanLengthNudge("x".repeat(300))).toBe("");
    expect(needsHumanLengthNudge(null)).toBe("");
  });

  it("nudges only the lead when a new ticket or goal lacks a summary", () => {
    expect(missingCreateSummaryNudge("AK-75", undefined, true)).toBe("Created AK-75. Add a plain line with ticket_update summary=… so people can read what this is.");
    expect(missingCreateSummaryNudge("AK-76", "  ", true)).toContain("Created AK-76.");
    expect(missingCreateSummaryNudge("AK-75", "adding Apple Pay to the checkout", true)).toBe("");
    expect(missingCreateSummaryNudge("AK-75", undefined, false)).toBe("");
  });
});
