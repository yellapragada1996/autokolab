import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Agent } from "../lib/data";
import { agent } from "./fixtures";
import { ApiActionHint } from "./People";

// An API agent's action hints as HTML, without a browser.

const api: Agent = { ...agent("agent-api", "ana-api"), vendor: "opencode", effective_model: "deepseek/deepseek-chat", machine: "ana-mbp", daily_usd: 5 };
const hint = (action: string, over: Partial<Agent> = {}) =>
  renderToStaticMarkup(createElement(ApiActionHint, { action, agent: { ...api, ...over }, local: false }));

describe("an API agent's action hints", () => {
  it("names the computer it reported, with a space after the comma", () => {
    expect(hint("Change daily limit")).toContain("On ana-mbp, edit <code>");
    expect(hint("Change model")).toContain("On ana-mbp, edit <code>");
    expect(hint("Remove")).toContain("On ana-mbp, run <code>autokolab pause ana-api</code>");
  });

  it("says that computer when an older helper didn't report one", () => {
    expect(hint("Change daily limit", { machine: null })).toContain("On that computer, edit <code>");
    expect(hint("Remove", { machine: null })).toContain("On that computer, run <code>");
  });
});
