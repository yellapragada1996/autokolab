import { describe, expect, it } from "vitest";
// The look command (AK-96) lives in scripts/ so every workspace can use it; its logic is tested here, without a browser.
// @ts-expect-error a plain .mjs script, no types
import { CouldNotLook, DEFAULT_WIDTHS, clip, heightFor, parseArgs, problems, reportLines, runFolder, shotName, targetUrl, verdict, why } from "../../../scripts/look.mjs";

describe("npm run look: the command line", () => {
  it("looks at 1440 and 390 by default", () => {
    expect(DEFAULT_WIDTHS).toEqual([1440, 390]);
    expect(parseArgs(["/p/shop/overview", "/p/shop/results"])).toEqual({ targets: ["/p/shop/overview", "/p/shop/results"], widths: [1440, 390], actions: [], wait: null, full: false, server: null, chromium: false, help: false });
  });
  it("keeps clicks and presses in the order given", () => {
    const o = parseArgs(["/p/shop", "--click", "Overview", "--press", "g", "--click", "Sign-in", "--wait", "Team", "--full", "--widths", "1280, 375"]);
    expect(o.actions).toEqual([
      { kind: "click", value: "Overview" },
      { kind: "press", value: "g" },
      { kind: "click", value: "Sign-in" },
    ]);
    expect(o.wait).toBe("Team");
    expect(o.full).toBe(true);
    expect(o.widths).toEqual([1280, 375]);
  });
  it("takes a running site and drops its trailing slash", () => {
    expect(parseArgs(["/p/shop", "--server", "http://localhost:5175/"]).server).toBe("http://localhost:5175");
  });
  it("refuses bad input in plain words", () => {
    expect(() => parseArgs([])).toThrow(CouldNotLook);
    expect(() => parseArgs([])).toThrow("Give at least one page to look at");
    expect(() => parseArgs(["/p/shop", "--widths", "wide"])).toThrow('--widths takes whole numbers from 200 to 4000, separated by commas (got "wide")');
    expect(() => parseArgs(["/p/shop", "--widths", "50"])).toThrow(CouldNotLook);
    expect(() => parseArgs(["/p/shop", "--click"])).toThrow("--click needs a value.");
    expect(() => parseArgs(["/p/shop", "--fast"])).toThrow("Unknown option --fast.");
    expect(parseArgs(["--help"]).help).toBe(true);
  });
});

describe("npm run look: addresses and files", () => {
  const base = "http://127.0.0.1:5999";
  it("opens site paths with sample data, unless the path already chose a preview", () => {
    expect(targetUrl("/p/shop/overview", base)).toBe(`${base}/p/shop/overview?preview=workspace`);
    expect(targetUrl("p/shop", base)).toBe(`${base}/p/shop?preview=workspace`);
    expect(targetUrl("/p/shop/overview?state=paused", base)).toBe(`${base}/p/shop/overview?state=paused&preview=workspace`);
    expect(targetUrl("/?preview=components", base)).toBe(`${base}/?preview=components`);
  });
  it("leaves full URLs alone", () => {
    expect(targetUrl("http://localhost:4777/setup", base)).toBe("http://localhost:4777/setup");
  });
  it("names each screenshot after its page and width", () => {
    expect(shotName("/p/shop/overview", 390, 1)).toBe("02-p-shop-overview-390.png");
    expect(shotName("/p/shop?preview=workspace&state=idle", 1440, 0)).toBe("01-p-shop-state-idle-1440.png");
    expect(shotName("/", 1440, 11)).toBe("12-home-1440.png");
    expect(shotName("http://localhost:4777/setup", 390, 0)).toBe("01-localhost-4777-setup-390.png");
  });
  it("saves under the helper's state folder, never in the repo", () => {
    const now = new Date("2026-10-11T14:03:22.500Z");
    expect(runFolder(now, {}, "/home/ana")).toBe("/home/ana/.local/state/autokolab/looks/2026-10-11T14-03-22");
    expect(runFolder(now, { XDG_STATE_HOME: "/state" }, "/home/ana")).toBe("/state/autokolab/looks/2026-10-11T14-03-22");
  });
  it("uses a phone-shaped window for phone widths", () => {
    expect(heightFor(390)).toBe(844);
    expect(heightFor(1440)).toBe(900);
  });
});

describe("npm run look: the report", () => {
  const fine = { target: "/p/shop/overview", width: 1440, file: "/s/01-p-shop-overview-1440.png", title: "AutoKolab", scrollWidth: 1440, clientWidth: 1440, consoleErrors: [], failedRequests: [], text: "Overview\n\n  The team is   building Sign-in." };
  it("prints the file, title, sideways scrolling, errors and visible text", () => {
    expect(reportLines(fine)).toEqual([
      "/p/shop/overview at 1440 wide",
      "  screenshot: /s/01-p-shop-overview-1440.png",
      "  title: AutoKolab",
      "  scrolls sideways: no",
      "  console errors: none",
      "  failed requests: none",
      "  text: Overview The team is building Sign-in.",
    ]);
  });
  it("says what's wrong", () => {
    const bad = { ...fine, width: 390, scrollWidth: 512, clientWidth: 390, consoleErrors: ["TypeError: x is undefined"], failedRequests: ["http://x/a.css (404)"] };
    const lines = reportLines(bad);
    expect(lines).toContain("  scrolls sideways: yes (the page is 512 wide in a 390 window)");
    expect(lines).toContain("  console error: TypeError: x is undefined");
    expect(lines).toContain("  failed request: http://x/a.css (404)");
    expect(problems(bad)).toEqual(["scrolls sideways (the page is 512 wide in a 390 window)", "1 console error"]);
  });
  it("reports a page that didn't load without a screenshot", () => {
    const lines = reportLines({ target: "/p/shop", width: 390, failed: "the page didn't load (500)", consoleErrors: [], failedRequests: [] });
    expect(lines.slice(0, 2)).toEqual(["/p/shop at 390 wide", "  problem: the page didn't load (500)"]);
    expect(lines.join("\n")).not.toContain("screenshot");
  });
  it("cuts the visible text at 400 characters", () => {
    const line = reportLines({ ...fine, text: "a".repeat(900) }).at(-1)!;
    expect(line).toBe(`  text: ${"a".repeat(400)}…`);
    expect(clip("  a \n b  ")).toBe("a b");
    expect(reportLines({ ...fine, text: " " }).at(-1)).toBe("  text: (nothing visible)");
  });
  it("drops Playwright's call log from an error", () => {
    expect(why(new Error("locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByText('x')"))).toBe("locator.click: Timeout 10000ms exceeded.");
  });
  it("exits 0 when every look is fine, and 1 when a page is broken", () => {
    expect(verdict([fine, { ...fine, width: 390, clientWidth: 390, scrollWidth: 390 }])).toEqual({ code: 0, line: "Looked at 2 screenshots: no problems found. Open them to see the pages." });
    for (const broken of [{ ...fine, failed: "the page didn't load (404)" }, { ...fine, consoleErrors: ["boom"] }, { ...fine, scrollWidth: 1500 }]) {
      const v = verdict([fine, broken]);
      expect(v.code).toBe(1);
      expect(v.line).toMatch(/^Problems in 1 of 2: \/p\/shop\/overview at 1440 \(/);
    }
    // Failed requests are reported but don't fail the look on their own.
    expect(verdict([{ ...fine, failedRequests: ["http://x/font.woff2 (net::ERR_FAILED)"] }]).code).toBe(0);
  });
});
