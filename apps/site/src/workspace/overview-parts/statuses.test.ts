/// <reference types="node" />
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("./overview.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../../tokens.css", import.meta.url), "utf8");
import { OverviewContent } from "../Overview";
import { overviewGlance } from "../glance";
import { at, BIRCH, ticket, workspace } from "../fixtures";

const hex = (source: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(source)![1];
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

describe("Overview problem cues", () => {
  it("keeps red solid and meets text and non-text contrast on its surfaces", () => {
    const red = hex(css, "problem-red"), text = hex(css, "problem-text");
    for (const background of [hex(tokens, "surface"), hex(tokens, "bg"), hex(tokens, "surface-hover"), hex(css, "card-hover"), hex(css, "surface-active")]) {
      expect(contrast(red, background)).toBeGreaterThanOrEqual(3);
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    }
    // A regression to the old middle cut would defeat the ticket's primary visual requirement.
    expect(css).not.toMatch(/(?:mask|clip-path)\s*:/);
    expect(css.match(/\.gs\.x\s*\{([^}]+)\}/)?.[1]).toBe(" background: var(--problem-red); box-shadow: none; ");
  });

  it("pairs the red bar, ring, heading and expanded ticket swatch with specific words", () => {
    const task = ticket({ key: "SH-1", title: "Saved cards", status: "in_progress", assignee_id: BIRCH, needs_human: "I stopped: the run failed." });
    const ws = workspace([task]);
    Object.assign(ws.agentOf(BIRCH)!, { status: "blocked", current_ticket_id: task.id, last_seen_at: at("11:59") });
    const now = new Date(at("12:00"));
    const html = renderToStaticMarkup(createElement(OverviewContent, { snapshot: { view: overviewGlance(ws, [], [], now), at: now } }));
    expect(html).toContain('class="sent problem"');
    expect(html).toContain("Birch&#x27;s run failed.");
    expect(html).toContain('class="av s-stop"');
    expect(html).toContain('class="a-state">Failed');
    expect(html).toContain('class="lg x"');
    expect(html).toContain("1 run failed");
    expect(html).toContain('class="t-meta x">Run failed · Birch');
    expect(html).not.toContain("Stopped");
  });
});
