import { describe, expect, it } from "vitest";
import { MERGE_OK_PREFIX } from "../lib/data";
import { awayText, briefing, catchUp, catchUpText, conversation, folded, lowerFirst, needsYou, openQuestions } from "./captain";
import { BIRCH, CAPTAIN, FJORD, ME, at, decision, message, ticket, workspace } from "./fixtures";

describe("the conversation with Captain", () => {
  it("is the messages between the person and Captain, oldest first, each one classified", () => {
    const msgs = [
      message(ME, CAPTAIN, "We need Google sign-in."),
      message(CAPTAIN, ME, "Started on #1 (branch ak/captain/t1)."),
      message(CAPTAIN, ME, "Two goals, six tickets."),
      message(CAPTAIN, ME, "Login page or help page?", { kind: "question" }),
      message(CAPTAIN, ME, "Failed on #9.\n\nYou've hit your session limit · resets 11:20pm (Europe/Stockholm)"),
      message(BIRCH, FJORD, "Are you changing the session table?"),
      message(CAPTAIN, BIRCH, "AK-43 goes first."),
      message(BIRCH, null, "Hello everyone"),
    ];
    const turns = conversation(msgs, ME, CAPTAIN);
    expect(turns.map((t) => t.kind)).toEqual(["you", "bookkeeping", "captain", "question", "problem"]);
    expect(turns[4].problem).toBe("couldn't continue: session limit (resets 11:20pm Stockholm)");
    expect(turns.map((t) => t.id)).toEqual([...turns.map((t) => t.id)].sort((a, b) => a - b));
  });

  it("is empty when the person isn't in the room or the project has no Captain", () => {
    const msgs = [message(ME, CAPTAIN, "hi")];
    expect(conversation(msgs, null, CAPTAIN)).toEqual([]);
    expect(conversation(msgs, ME, null)).toEqual([]);
  });

  it("folds each run of bookkeeping into one row and never folds a problem", () => {
    const turns = conversation(
      [
        message(CAPTAIN, ME, "Started on #1 (branch a)."),
        message(CAPTAIN, ME, "Picked up #2, continuing."),
        message(CAPTAIN, ME, "Done."),
        message(CAPTAIN, ME, "Queued #3: raghav has paused me."),
        message(CAPTAIN, ME, "Blocked on #3: I can't deploy."),
      ],
      ME,
      CAPTAIN,
    );
    const rows = folded(turns);
    expect(rows.map((r) => r.kind)).toEqual(["fold", "captain", "fold", "problem"]);
    expect(rows[0].kind === "fold" && rows[0].turns.length).toBe(2);
  });

  it("a question stays open until the person replies in its thread", () => {
    const q = message(CAPTAIN, ME, "Login page or help page?", { kind: "question" });
    const elsewhere = message(ME, CAPTAIN, "Also, rename the button.");
    expect(openQuestions(conversation([q, elsewhere], ME, CAPTAIN)).map((t) => t.id)).toEqual([q.id]);
    const answer = message(ME, CAPTAIN, "The login page.", { thread_id: q.id });
    expect(openQuestions(conversation([q, elsewhere, answer], ME, CAPTAIN))).toEqual([]);
  });
});

describe("needs you", () => {
  it("lists ticket questions, risky merges, problems and Captain's open questions, longest-waiting first", () => {
    const ws = workspace([
      ticket({ key: "SH-1", status: "in_progress", needs_human: "Blue or green?", updated_at: at("09:30") }),
      ticket({ key: "SH-2", status: "review", needs_human: `${MERGE_OK_PREFIX} packages/autokolab/sql/014_x.sql`, updated_at: at("09:10") }),
      ticket({ key: "SH-3", status: "in_progress", needs_human: "I stopped: hit the 60-minute limit.", updated_at: at("09:20") }),
      ticket({ key: "SH-4", status: "done", needs_human: "old question", updated_at: at("08:00") }),
      ticket({ key: "SH-5", status: "review", needs_human: `${MERGE_OK_PREFIX} ci`, merge_ok_at: at("09:40"), updated_at: at("09:00") }),
    ]);
    const q = message(CAPTAIN, ME, "Ship today or tomorrow?", { kind: "question", created_at: at("09:25") });
    const needs = needsYou(ws, conversation([q], ME, CAPTAIN));
    expect(needs.map((x) => [x.kind, x.ticket?.key ?? null])).toEqual([
      ["risky_merge", "SH-2"],
      ["problem", "SH-3"],
      ["captain_question", null],
      ["ticket_question", "SH-1"],
    ]);
    expect(needs[0]).toMatchObject({ action: "OK a risky merge", question: "packages/autokolab/sql/014_x.sql" });
    expect(needs[1].action).toBe("Look at a problem");
    expect(needs[2]).toMatchObject({ action: "Answer a question", question: "Ship today or tomorrow?", turnId: q.id });
  });

  it("is empty when nothing waits", () => {
    expect(needsYou(workspace([ticket({ key: "SH-1", status: "in_progress" })]), [])).toEqual([]);
  });
});

describe("the briefing", () => {
  const goal = ticket({ key: "SH-10", type: "epic", title: "Google sign-in", status: "in_progress" });
  const child = (key: string, over: Parameters<typeof ticket>[0] | object = {}) => ticket({ key, parent_id: goal.id, ...over });

  it("says who is building what, what needs the person and what comes next", () => {
    const ws = workspace(
      [
        goal,
        child("SH-11", { title: "Provider column", status: "review", assignee_id: BIRCH, needs_human: `${MERGE_OK_PREFIX} sql`, pr_url: "https://github.com/a/b/pull/1" }),
        child("SH-12", { title: "Google callback", status: "in_progress", assignee_id: FJORD }),
        child("SH-13", { title: "Login button", status: "review", assignee_id: BIRCH, pr_url: "https://github.com/a/b/pull/2", updated_at: at("09:50") }),
        child("SH-14", { title: "Clearer errors", status: "done" }),
        child("SH-15", { title: "Consent screen", status: "ready" }),
      ],
      { steps: { "SH-12": [["Read the auth module", "done"], ["Write the callback", "done"], ["Running the tests", "now"], ["Open the PR", "todo"]] } },
    );
    const b = briefing(ws, needsYou(ws, []));
    expect(b.work).toBe("1 agent is building Google sign-in.");
    expect(b.needs).toEqual({ text: "1 thing needs you.", tone: "amber", count: 1 });
    expect(b.next).toBe("Next from me: provider column is waiting on your OK, then the review of login button.");
    expect(b.agents).toHaveLength(1);
    expect(b.agents[0]).toMatchObject({ name: "Fjord", doing: "running the tests", step: "3 of 4", needsYou: false });
    expect(b.goals).toEqual([{ id: goal.id, title: "Google sign-in", segments: ["needs_you", "building", "building", "done", "todo"], done: 1, total: 5 }]);
  });

  it("counts agents and goals in plain words", () => {
    const other = ticket({ key: "SH-20", type: "epic", title: "Who's typing", status: "in_progress" });
    const two = workspace([
      goal,
      other,
      child("SH-11", { status: "in_progress", assignee_id: BIRCH }),
      ticket({ key: "SH-21", parent_id: other.id, status: "in_progress", assignee_id: FJORD }),
    ]);
    expect(briefing(two, []).work).toBe("2 agents are working on 2 goals.");
    const loose = workspace([ticket({ key: "SH-30", status: "in_progress", assignee_id: BIRCH }), ticket({ key: "SH-31", status: "in_progress", assignee_id: FJORD })]);
    expect(briefing(loose, []).work).toBe("2 agents are working on 2 tickets.");
    const mixed = workspace([goal, child("SH-11", { status: "in_progress", assignee_id: ME, assignee_type: "human" })]);
    expect(briefing(mixed, []).work).toBe("1 teammate is building Google sign-in.");
  });

  it("is calm when nothing is happening", () => {
    const b = briefing(workspace([ticket({ key: "SH-1", status: "ready" })]), []);
    expect(b.work).toBe("Everyone is idle.");
    expect(b.needs).toEqual({ text: "Nothing needs you.", tone: "green", count: 0 });
    expect(b.next).toBeNull();
    expect(b.agents).toEqual([]);
  });

  it("describes an agent without steps by its ticket, and keeps capitalised names", () => {
    const ws = workspace([ticket({ key: "SH-1", title: "OAuth callback and session", status: "in_progress", assignee_id: BIRCH, needs_human: "Blue or green?" })]);
    expect(briefing(ws, needsYou(ws, [])).agents[0]).toMatchObject({ doing: "working on OAuth callback and session", step: null, needsYou: true });
    expect(lowerFirst("Running the tests")).toBe("running the tests");
    expect(lowerFirst("PR review")).toBe("PR review");
  });

  it("doesn't promise to review Captain's own work", () => {
    const ws = workspace([ticket({ key: "SH-1", title: "Lead's ticket", status: "review", assignee_id: CAPTAIN, pr_url: "https://github.com/a/b/pull/3" })]);
    expect(briefing(ws, []).next).toBeNull();
  });
});

describe("the catch-up", () => {
  const now = new Date(at("17:40"));
  const nameOf = (id: string) => (id === BIRCH ? "Birch" : id === FJORD ? "Fjord" : "Someone");

  it("lists what shipped, what was decided and what went wrong since the last visit", () => {
    const ws = workspace(
      [
        ticket({ key: "SH-1", title: "Typing presence", status: "done", completed_at: at("10:12") }),
        ticket({ key: "SH-2", title: "Sign-in errors", status: "done", completed_at: at("10:31"), summary: "Clearer messages when sign-in fails" }),
        ticket({ key: "SH-3", title: "Before I left", status: "done", completed_at: at("08:10") }),
        ticket({ key: "SH-4", type: "epic", title: "A goal", status: "done", completed_at: at("11:00") }),
      ],
      { decisions: [decision("DEC-24", "Sessions store the provider", at("10:34")), decision("DEC-9", "Old", at("07:00")), decision("DEC-25", "Replaced", at("11:00"), { superseded_by: "d-DEC-26" })] },
    );
    const msgs = [
      message(FJORD, CAPTAIN, "Failed on #9.\n\nYou've hit your session limit · resets 7am (Europe/Stockholm)", { created_at: at("12:14") }),
      message(BIRCH, CAPTAIN, "Started on #4 (branch x).", { created_at: at("12:20") }),
      message(BIRCH, CAPTAIN, "Blocked on #1: before the visit", { created_at: at("08:20") }),
    ];
    const c = catchUp(ws, msgs, at("08:40"), nameOf, now)!;
    expect(c.awayMs).toBe(9 * 3_600_000);
    expect(c.shipped.map((l) => [l.ref, l.text])).toEqual([
      ["SH-1", "Typing presence"],
      ["SH-2", "Clearer messages when sign-in fails"],
    ]);
    expect(c.decided.map((l) => l.ref)).toEqual(["DEC-24"]);
    expect(c.problems.map((l) => l.text)).toEqual(["Fjord couldn't continue: session limit (resets 7am Stockholm)"]);
    expect(catchUpText(c, 1)).toBe("While you were away (9 h) 2 things shipped, 1 decision was recorded and 1 problem came up.");
  });

  it("says nothing on a first visit or after a short gap", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "done", completed_at: at("17:30") })]);
    expect(catchUp(ws, [], null, nameOf, now)).toBeNull();
    expect(catchUp(ws, [], at("17:20"), nameOf, now)).toBeNull();
    expect(catchUp(ws, [], at("17:10"), nameOf, now)).not.toBeNull();
  });

  it("has a plain line for a quiet stretch", () => {
    const c = catchUp(workspace([]), [], at("08:40"), nameOf, now)!;
    expect(catchUpText(c, 0)).toBe("Quiet. Nothing shipped and nothing needs you.");
    expect(catchUpText(c, 2)).toBe("While you were away (9 h) nothing shipped.");
    expect(catchUpText({ ...c, shipped: [{ text: "x", at: at("10:00") }] }, 0)).toBe("While you were away (9 h) 1 thing shipped.");
  });

  it("writes the time away in plain units", () => {
    expect(awayText(45 * 60_000)).toBe("45 min");
    expect(awayText(9 * 3_600_000 + 20 * 60_000)).toBe("9 h");
    expect(awayText(72 * 3_600_000)).toBe("3 days");
  });
});
