import { afterEach, describe, expect, it, vi } from "vitest";
import { MERGE_OK_PREFIX } from "../lib/data";
import { href, lookHref, parse } from "../lib/router";
import { answeredText, codeLines, lookChips, lookState, lookTitle, mergeQuestion } from "./captain";
import { BIRCH, CAPTAIN, FJORD, ME, at, ticket, workspace } from "./fixtures";

// "Let me look first" (AK-55, autokolab-ux-handoff/screens/S04-look-first.md).

const risky = (over: Parameters<typeof ticket>[0]) =>
  ticket({
    status: "review",
    assignee_id: BIRCH,
    approved_by: CAPTAIN,
    approved_sha: "a1b2c3d4e5f6",
    needs_human: `${MERGE_OK_PREFIX} Everyone is signed out once. OK? (db/004_sessions.sql)`,
    review: { question: "Everyone is signed out once. OK?", summary: "Sessions move into Postgres.", line: { file: "db/004_sessions.sql", code: "+create table sessions (\n  id text\n+);", plain: "A sessions table." }, less_sure: "None." },
    ...over,
  });

describe("which state the look-first step is in", () => {
  it("asks when the ticket waits for a merge OK, with the recorded question", () => {
    const ws = workspace([risky({ key: "SH-10" })]);
    const s = lookState(ws, "sh-10");
    expect(s.kind).toBe("ask");
    if (s.kind !== "ask") return;
    expect(s.need.kind).toBe("risky_merge");
    expect(s.need.key).toBe("merge:t-SH-10");
    expect(mergeQuestion(s.need)).toBe("Everyone is signed out once. OK?");
  });

  it("says who already OK'd it, and when", () => {
    const ws = workspace([risky({ key: "SH-11", merge_ok_by: ME, merge_ok_at: at("11:04") })]);
    expect(lookState(ws, "SH-11")).toEqual({ kind: "answered", by: ME, at: at("11:04") });
  });

  it("has nothing to answer for an unknown key or a ticket that isn't waiting", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "in_progress" }), ticket({ key: "SH-3", needs_human: "Redis or Postgres?" }), risky({ key: "SH-4", status: "done" })]);
    expect(lookState(ws, "SH-99")).toEqual({ kind: "nothing", why: "unknown" });
    expect(lookState(ws, "SH-2")).toEqual({ kind: "nothing", why: "not_waiting" });
    expect(lookState(ws, "SH-3")).toEqual({ kind: "nothing", why: "not_waiting" });
    expect(lookState(ws, "SH-4")).toEqual({ kind: "nothing", why: "not_waiting" });
  });
});

describe("what the step shows", () => {
  it("titles it with the review's summary, else the ticket's title", () => {
    expect(lookTitle(risky({ key: "SH-1", title: "Store sessions" }))).toBe("Sessions move into Postgres.");
    expect(lookTitle(risky({ key: "SH-1", title: "Store sessions", review: null }))).toBe("Store sessions");
  });

  it("shows each chip only when it's true, naming Captain when the lead approved", () => {
    const ws = workspace([]);
    expect(lookChips(ws, risky({ key: "SH-1" }))).toEqual([
      { text: "Captain approved this exact commit", tone: "verified", sha: "a1b2c3d" },
      { text: "Can't be undone automatically", tone: "neutral" },
    ]);
    expect(lookChips(ws, risky({ key: "SH-1", approved_by: FJORD }))[0].text).toBe("Fjord approved this exact commit");
    expect(lookChips(ws, risky({ key: "SH-1", approved_sha: null })).map((c) => c.text)).toEqual(["Can't be undone automatically"]);
    expect(lookChips(ws, ticket({ key: "SH-2" }))).toEqual([]);
  });

  it("says who OK'd it in plain words, with the day when it wasn't today", () => {
    const ws = workspace([]);
    const now = new Date(at("15:00"));
    expect(answeredText(ws, ME, at("11:04"), "someone-else", now)).toMatch(/^Raghav already OK'd this at .+\.$/);
    expect(answeredText(ws, ME, at("11:04"), ME, now)).toMatch(/^You already OK'd this at /);
    expect(answeredText(ws, null, at("11:04"), ME, now)).toMatch(/^Someone already OK'd /);
    expect(answeredText(ws, ME, "2026-10-01T11:04:00Z", ME, now)).toMatch(/October 1/);
  });

  it("marks added lines so they show in green", () => {
    expect(codeLines("+a\n b\n+++ file")).toEqual([
      { text: "+a", added: true },
      { text: " b", added: false },
      { text: "+++ file", added: false },
    ]);
  });
});

describe("its address", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the Captain page with the step on top, and survives a refresh", () => {
    expect(parse("/p/shop/look/sh-10")).toEqual({ view: "captain", project: "shop", look: "SH-10" });
    expect(parse("/p/shop/look")).toEqual({ view: "captain", project: "shop" });
    expect(parse("/p/shop/look/SH-10", "?show=SH-10&part=change")).toEqual({ view: "captain", project: "shop", look: "SH-10", show: { key: "SH-10", part: "change" } });
    expect(href({ view: "captain", project: "shop", look: "SH-10" })).toBe("/p/shop/look/SH-10");
  });

  it("keeps the preview but drops a sheet, going in and coming back", () => {
    vi.stubGlobal("location", { href: "https://example.test/p/shop?preview=workspace&show=SH-2&part=history" });
    expect(lookHref("shop", "sh-10")).toBe("/p/shop/look/SH-10?preview=workspace");
    expect(lookHref("shop", null)).toBe("/p/shop?preview=workspace");
  });
});
