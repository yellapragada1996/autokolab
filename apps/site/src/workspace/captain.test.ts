import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEAD_BUILT_QUESTION, MERGE_OK_PREFIX, REVIEW_LIMIT_QUESTION } from "../lib/data";
import { answeredLine, awayText, briefing, captainWorkActivity, catchUp, catchUpItems, catchUpSummary, catchUpText, ANSWERED_BELOW, clock, closingAnswers, closingReply, conversation, settledLine, settledWithoutYou, dayLabel, folded, foldText, goalName, lowerFirst, mergeChip, mergeQuestion, NO_ANSWER_NEEDED, needsYou, needText, newerPlan, openQuestions, ownerOf, parsePlan, planAsks, planLine, planOrder, planRequest, plans, planTitle, problemText, replyPreview, riskyPart, shortened, timeline, today, waitsFor, withoutPlan } from "./captain";
import { BIRCH, CAPTAIN, FJORD, ME, at, decision, message, ticket, workspace } from "./fixtures";

describe("the conversation with Captain", () => {
  it("shows a plain working message and step instead of a raw tool label", () => {
    expect(captainWorkActivity("Updating tickets")).toBe("Captain is working on your message… updating a ticket.");
    expect(captainWorkActivity("Updating the ticket")).toBe("Captain is working on your message… updating a ticket.");
    expect(captainWorkActivity("tool_xyz")).toBe("Captain is working on your message…");
  });
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

  it("counts an answer given in the thread from the Room, whoever it was addressed to", () => {
    const q = message(CAPTAIN, ME, "Login page or help page?", { kind: "question" });
    const toEveryone = message(ME, null, "The login page.", { thread_id: q.id });
    const turns = conversation([q, toEveryone], ME, CAPTAIN);
    expect(turns.map((t) => t.kind)).toEqual(["question", "you"]);
    expect(openQuestions(turns)).toEqual([]);
    // Someone else's reply in the thread, or mine in an unrelated thread, isn't part of it.
    const other = message(BIRCH, null, "I'd pick help.", { thread_id: q.id });
    const unrelated = message(ME, BIRCH, "Thanks", { thread_id: 99999 });
    expect(conversation([q, other, unrelated], ME, CAPTAIN).map((t) => t.id)).toEqual([q.id]);
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

describe("needs you shows each request once (AK-100)", () => {
  const ask = (body: string, time: string, over = {}) => message(CAPTAIN, ME, body, { kind: "question", created_at: at(time), ...over });

  it("shows a ticket's Needs you and Captain's question about it as one item, where Captain asked", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Redis or Postgres?", updated_at: at("09:00") })]);
    const q = ask("SH-1 needs a choice: Redis or Postgres for sessions? Redis is faster, Postgres is one less thing to run.", "09:05");
    const needs = needsYou(ws, conversation([q], ME, CAPTAIN));
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ key: `ticket:t-SH-1`, kind: "ticket_question", turnId: q.id, since: at("09:05"), said: q.body });
    // Captain's message is the fuller one, so it's the text.
    expect(needText(needs[0], () => "")).toBe(q.body);
  });

  it("keeps the ticket's words when they say more than Captain's question", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Redis or Postgres for the sessions table? Redis is faster." })]);
    const [need] = needsYou(ws, conversation([ask("SH-1?", "09:05")], ME, CAPTAIN));
    expect(need.said).toBeUndefined();
    expect(needText(need, () => "Birch")).toMatch(/^Someone has a question on SH-1: Redis or Postgres/);
  });

  it("collapses several open questions about one ticket to the newest", () => {
    const ws = workspace([ticket({ key: "SH-2", status: "review" })]);
    const qs = [ask("SH-2 is stuck on its tests. Retry?", "09:00"), ask("SH-2 failed again. Retry?", "09:10"), ask("SH-2 still fails. Should I hand it to Fjord?", "09:20")];
    const needs = needsYou(ws, conversation(qs, ME, CAPTAIN));
    expect(needs.map((n) => [n.kind, n.turnId])).toEqual([["captain_question", qs[2].id]]);
  });

  it("shows both when it isn't clear they're the same: a question naming several tickets, or none", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Blue or green?" }), ticket({ key: "SH-2", status: "in_progress" })]);
    const both = ask("SH-1 and SH-2 both touch the header. Which goes first?", "09:05");
    const none = ask("Ship today or tomorrow?", "09:06");
    const needs = needsYou(ws, conversation([both, none], ME, CAPTAIN));
    expect(needs.map((n) => [n.kind, n.turnId])).toEqual([["ticket_question", null], ["captain_question", both.id], ["captain_question", none.id]]);
  });

  it("ignores keys that aren't tickets on the board", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Blue or green?" })]);
    const needs = needsYou(ws, conversation([ask("Does DEC-17 cover SH-1?", "09:05")], ME, CAPTAIN));
    expect(needs).toHaveLength(1);
    expect(needs[0].ticket?.key).toBe("SH-1");
  });

  it("closes Captain's question with whatever answers the item, so it doesn't come back on its own", () => {
    const merge = ticket({ key: "SH-2", status: "review", needs_human: `${MERGE_OK_PREFIX} db/004_sessions.sql`, updated_at: at("09:00") });
    const asked = ask("SH-2 changes the sessions table. OK to merge it?", "09:05");
    const [need] = needsYou(workspace([merge]), conversation([asked], ME, CAPTAIN));
    expect(need).toMatchObject({ kind: "risky_merge", turnId: asked.id });
    expect(closingReply(need, "yes")).toBe("Yes, merge SH-2.");
    expect(closingReply(need, "approved")).toBe("I approved SH-2.");
    expect(closingReply(need, "no", " Wait for Monday. ")).toBe("No on SH-2: Wait for Monday.");
    expect(closingReply(need, "answered", "Postgres.")).toBe("Postgres.");
    expect(closingReply(need, "dismissed")).toBe(NO_ANSWER_NEEDED);
    // Any of those, posted by the person in the thread, closes the question: once the ticket's need
    // is gone too, nothing is left.
    const reply = message(ME, CAPTAIN, closingReply(need, "yes")!, { thread_id: asked.id, created_at: at("09:10") });
    expect(needsYou(workspace([{ ...merge, needs_human: null }]), conversation([asked, reply], ME, CAPTAIN))).toEqual([]);
    // Without the reply, the question would come back as its own item.
    expect(needsYou(workspace([{ ...merge, needs_human: null }]), conversation([asked], ME, CAPTAIN)).map((n) => n.kind)).toEqual(["captain_question"]);
    // A need that isn't also Captain's question has no thread to close.
    const [alone] = needsYou(workspace([merge]), []);
    expect(closingReply(alone, "yes")).toBeNull();
  });

  it("is the one list the page, Overview and the badge count: the briefing agrees", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Blue or green?" })]);
    const needs = needsYou(ws, conversation([ask("SH-1: blue or green?", "09:05"), ask("SH-1, still: blue or green?", "09:10")], ME, CAPTAIN));
    expect(briefing(ws, needs).needs.count).toBe(1);
  });
});

describe("requests close themselves (AK-100)", () => {
  const ask = (body: string, time: string) => message(CAPTAIN, ME, body, { kind: "question", created_at: at(time) });

  it("a ticket's Needs you never counts once it's Done or Canceled", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "done", needs_human: "Blue or green?" }), ticket({ key: "SH-2", status: "canceled", needs_human: "I stopped: hit the 60-minute limit." })]);
    expect(needsYou(ws, [])).toEqual([]);
  });

  it("closes a question when every ticket it names is Done or Canceled, and says what happened", () => {
    const q = ask("SH-1 and SH-2 are stuck. Should I restart them?", "09:00");
    const open = workspace([ticket({ key: "SH-1", status: "done" }), ticket({ key: "SH-2", status: "in_progress" })]);
    expect(needsYou(open, conversation([q], ME, CAPTAIN))).toHaveLength(1);
    const closed = workspace([ticket({ key: "SH-1", status: "done" }), ticket({ key: "SH-2", status: "done" })]);
    const turns = conversation([q], ME, CAPTAIN);
    expect(needsYou(closed, turns)).toEqual([]);
    expect(settledWithoutYou(closed, turns).get(q.id)).toBe("SH-1 and SH-2 were finished");
    expect(settledLine("SH-1 was canceled")).toBe("Settled without you · SH-1 was canceled");
    const mixed = workspace([ticket({ key: "SH-1", status: "done" }), ticket({ key: "SH-2", status: "canceled" })]);
    expect(settledWithoutYou(mixed, turns).get(q.id)).toBe("SH-1 was finished, SH-2 was canceled");
  });

  it("closes a question about a merge or an approval once that ticket was approved or OK'd after it was asked", () => {
    const q = ask("SH-3 is ready. Can someone approve it?", "09:00");
    const turns = conversation([q], ME, CAPTAIN);
    const before = workspace([ticket({ key: "SH-3", status: "review", approved_at: at("08:30") })]);
    expect(needsYou(before, turns)).toHaveLength(1);
    const approved = workspace([ticket({ key: "SH-3", status: "review", approved_at: at("09:30") })]);
    expect(needsYou(approved, turns)).toEqual([]);
    expect(settledWithoutYou(approved, turns).get(q.id)).toBe("SH-3 was approved");
    const merged = workspace([ticket({ key: "SH-3", status: "done" })]);
    expect(settledWithoutYou(merged, turns).get(q.id)).toBe("SH-3 was merged");
    // An approval says nothing about a question that isn't about merging or approving.
    const other = conversation([ask("SH-3: should the button say Save or Done?", "09:00")], ME, CAPTAIN);
    expect(needsYou(approved, other)).toHaveLength(1);
  });

  it("closes a question Captain answered itself in its thread (question_close), and shows the answer under it once", () => {
    const q = ask("The Codex runner keeps failing on jamesblack's machine. Can you look?", "09:00");
    const done = message(CAPTAIN, ME, "Fixed by jamesblack-codex: it was an old login.", { kind: "answer", thread_id: q.id, created_at: at("10:00") });
    const turns = conversation([q, done], ME, CAPTAIN);
    expect(openQuestions(turns)).toEqual([]);
    expect(needsYou(workspace([]), turns)).toEqual([]);
    expect(settledWithoutYou(workspace([]), turns).get(q.id)).toBe("Fixed by jamesblack-codex: it was an old login");
    expect([...closingAnswers(turns)]).toEqual([done.id]);
    // An ordinary Captain message in the thread doesn't close it.
    const chat = message(CAPTAIN, ME, "Still looking.", { thread_id: q.id, created_at: at("09:30") });
    expect(openQuestions(conversation([q, chat], ME, CAPTAIN)).map((t) => t.id)).toEqual([q.id]);
  });

  describe("hides only the one answer shown under a settled question (review of da5252d)", () => {
    const q = () => ask("The Codex runner keeps failing. Can you look?", "09:00");
    const answer = (thread: number, body: string, time: string) => message(CAPTAIN, ME, body, { kind: "answer", thread_id: thread, created_at: at(time) });
    const you = (thread: number, body: string, time: string) => message(ME, CAPTAIN, body, { thread_id: thread, created_at: at(time) });

    it("keeps Captain's answer after the person replied", () => {
      const question = q();
      const reply = you(question.id, "It's the old login.", "09:05");
      const a = answer(question.id, "Thanks, fixed it.", "09:10");
      const turns = conversation([question, reply, a], ME, CAPTAIN);
      expect(closingAnswers(turns).has(a.id)).toBe(false);
      expect(settledWithoutYou(workspace([]), turns).size).toBe(0);
      // Also in a thread the person started: they ask, Captain asks back, they reply, Captain answers.
      const start = message(ME, CAPTAIN, "Can we ship Friday?", { created_at: at("08:00") });
      const back = message(CAPTAIN, ME, "With or without Apple Pay?", { kind: "question", thread_id: start.id, created_at: at("08:05") });
      const yes = you(start.id, "Without.", "08:10");
      const done = answer(start.id, "Then Friday works.", "08:15");
      expect(closingAnswers(conversation([start, back, yes, done], ME, CAPTAIN)).has(done.id)).toBe(false);
    });

    it("keeps Captain's answer when the person replied after it", () => {
      const question = q();
      const a = answer(question.id, "Fixed by lee-codex.", "09:10");
      const reply = you(question.id, "Great.", "09:20");
      const turns = conversation([question, a, reply], ME, CAPTAIN);
      expect(closingAnswers(turns).has(a.id)).toBe(false);
      expect(settledWithoutYou(workspace([]), turns).size).toBe(0);
    });

    it("hides only the first of several answers, the one shown under the question", () => {
      const question = q();
      const first = answer(question.id, "Fixed by lee-codex.", "09:10");
      const second = answer(question.id, "It happened again; fixed for good now.", "09:30");
      const turns = conversation([question, first, second], ME, CAPTAIN);
      expect([...closingAnswers(turns)]).toEqual([first.id]);
      expect(settledWithoutYou(workspace([]), turns).get(question.id)).toBe("Fixed by lee-codex");
    });

    it("leaves an answer of several lines as its own message, and points to it", () => {
      const question = q();
      const a = answer(question.id, "Fixed by lee-codex.\n\nIt was an old login; the update signed it in again.", "09:10");
      const turns = conversation([question, a], ME, CAPTAIN);
      expect(closingAnswers(turns).has(a.id)).toBe(false);
      expect(settledWithoutYou(workspace([]), turns).get(question.id)).toBe(ANSWERED_BELOW);
      expect(openQuestions(turns)).toEqual([]);
    });
  });

  it("a question about no ticket still needs a reply or Not needed any more", () => {
    const q = ask("Ship today or tomorrow?", "09:00");
    const ws = workspace([ticket({ key: "SH-1", status: "done" })]);
    expect(needsYou(ws, conversation([q], ME, CAPTAIN))).toHaveLength(1);
    expect(settledWithoutYou(ws, conversation([q], ME, CAPTAIN)).size).toBe(0);
    const close = message(ME, CAPTAIN, NO_ANSWER_NEEDED, { thread_id: q.id });
    expect(needsYou(ws, conversation([q, close], ME, CAPTAIN))).toEqual([]);
  });

  it("a question the person replied to is theirs, not settled without them", () => {
    const q = ask("SH-1 is stuck. Restart it?", "09:00");
    const reply = message(ME, CAPTAIN, "Yes.", { thread_id: q.id, created_at: at("09:05") });
    expect(settledWithoutYou(workspace([ticket({ key: "SH-1", status: "done" })]), conversation([q, reply], ME, CAPTAIN)).size).toBe(0);
  });
});

describe("the briefing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at("10:00")));
  });
  afterEach(() => vi.useRealTimers());
  const running = (ws: ReturnType<typeof workspace>, ...ids: string[]) => {
    for (const id of ids) Object.assign(ws.agentOf(id)!, { status: "building", last_seen_at: at("09:59") });
  };
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
    running(ws, FJORD);
    const b = briefing(ws, needsYou(ws, []));
    expect(b.work).toBe("1 agent is building Google sign-in.");
    expect(b.needs).toEqual({ text: "1 thing needs you.", tone: "amber", count: 1 });
    expect(b.next).toBe("Next from me: “Provider column” is waiting on your OK, then the review of “Login button”.");
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
    running(two, BIRCH, FJORD);
    expect(briefing(two, []).work).toBe("2 agents are working on 2 goals.");
    const loose = workspace([ticket({ key: "SH-30", status: "in_progress", assignee_id: BIRCH }), ticket({ key: "SH-31", status: "in_progress", assignee_id: FJORD })]);
    running(loose, BIRCH, FJORD);
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

  it("describes an agent without steps by its ticket, and quotes titles as written", () => {
    const ws = workspace([ticket({ key: "SH-1", title: "Google sign-in", status: "in_progress", assignee_id: BIRCH, needs_human: "Blue or green?" })]);
    running(ws, BIRCH);
    const b = briefing(ws, needsYou(ws, []));
    expect(b.agents[0]).toMatchObject({ doing: "working on “Google sign-in”", step: null, needsYou: true });
    // A title written as an instruction still reads as a name.
    const cmd = workspace([ticket({ key: "SH-2", title: "Add the sessions column", status: "in_progress", needs_human: "Text or enum?" })]);
    expect(briefing(cmd, needsYou(cmd, [])).next).toBe("Next from me: “Add the sessions column” is waiting on your answer.");
    expect(lowerFirst("Running the tests")).toBe("running the tests");
    expect(lowerFirst("PR review")).toBe("PR review");
  });

  it("shows stopped tickets when nobody is running, including a stale heartbeat", () => {
    const ws = workspace([
      ticket({ key: "SH-1", title: "Checkout", status: "in_progress", assignee_id: BIRCH, needs_human: "I stopped: the run failed." }),
      ticket({ key: "SH-2", title: "Search", status: "in_progress", assignee_id: FJORD }),
    ], { steps: { "SH-1": [["Run tests", "now"]] } });
    Object.assign(ws.agentOf(FJORD)!, { status: "building", last_seen_at: at("09:54") });
    expect(briefing(ws, needsYou(ws, [])).work).toBe("Nobody is working; 2 tickets are stopped.");
    expect(briefing(ws, []).agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Birch", doing: "stopped on “Checkout”", step: null, needsYou: true }),
      expect.objectContaining({ name: "Fjord", doing: "stopped on “Search”", step: null }),
    ]));
    ws.tickets.pop();
    expect(briefing(ws, []).work).toBe("Nobody is working; 1 ticket is stopped.");
  });

  it("counts only the running ticket and keeps a stopped agent's question", () => {
    const ws = workspace([
      goal,
      child("SH-16", { title: "Callback", status: "in_progress", assignee_id: BIRCH }),
      child("SH-17", { title: "Session store", status: "in_progress", assignee_id: FJORD, needs_human: "Which store?" }),
    ]);
    running(ws, BIRCH);
    expect(briefing(ws, needsYou(ws, [])).work).toBe("1 agent is building Google sign-in.");
    expect(briefing(ws, needsYou(ws, [])).agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ doing: "working on “Callback”", needsYou: false }),
      expect.objectContaining({ doing: "stopped on “Session store”", step: null, needsYou: true }),
    ]));
  });

  it("doesn't promise to review Captain's own work", () => {
    const ws = workspace([ticket({ key: "SH-1", title: "Lead's ticket", status: "review", assignee_id: CAPTAIN, pr_url: "https://github.com/a/b/pull/3" })]);
    expect(briefing(ws, []).next).toBeNull();
  });

  it("names a goal by the part of its title before the colon", () => {
    const long = { ...goal, title: "Captain UX: one point of contact, readable at a glance" };
    const ws = workspace([long, child("SH-11", { status: "in_progress", assignee_id: BIRCH })]);
    running(ws, BIRCH);
    expect(briefing(ws, []).work).toBe("1 agent is building Captain UX.");
  });
});

describe("a goal's short name", () => {
  it("is the title up to the first colon, or the whole title without one", () => {
    expect(goalName("Captain UX: one point of contact, readable at a glance")).toBe("Captain UX");
    expect(goalName("Google sign-in")).toBe("Google sign-in");
    expect(goalName("Search: filters: price")).toBe("Search");
    expect(goalName("  Checkout  ")).toBe("Checkout");
    // Nothing before the colon: keep the whole title rather than an empty name.
    expect(goalName(": odd title")).toBe(": odd title");
  });
});

describe("today", () => {
  // Local times, so midnight is the runner's own.
  const local = (h: number, m = 0, day = 10) => new Date(2026, 9, day, h, m).toISOString();
  const now = new Date(2026, 9, 10, 15, 0);

  it("lists what shipped since midnight, what's in review and what was decided today", () => {
    const ws = workspace(
      [
        ticket({ key: "SH-1", status: "done", completed_at: local(9) }),
        ticket({ key: "SH-2", status: "done", completed_at: local(14) }),
        ticket({ key: "SH-3", status: "done", completed_at: local(23, 50, 9) }),
        ticket({ key: "SH-4", type: "epic", status: "done", completed_at: local(10) }),
        ticket({ key: "SH-5", status: "review", updated_at: local(12) }),
        ticket({ key: "SH-6", status: "review", updated_at: local(8) }),
        ticket({ key: "SH-7", status: "in_progress" }),
        ticket({ key: "SH-8", status: "done", completed_at: null }),
      ],
      { decisions: [decision("DEC-1", "Today", local(11)), decision("DEC-2", "Yesterday", local(20, 0, 9)), decision("DEC-3", "Replaced", local(12), { superseded_by: "d-DEC-4" }), decision("DEC-4", "Newest", local(13))] },
    );
    const t = today(ws, now);
    expect(t.shipped.map((x) => x.key)).toEqual(["SH-2", "SH-1"]);
    expect(t.inReview.map((x) => x.key)).toEqual(["SH-6", "SH-5"]);
    expect(t.decided.map((d) => d.key)).toEqual(["DEC-4", "DEC-1"]);
  });

  it("is empty on a quiet day", () => {
    const t = today(workspace([ticket({ key: "SH-1", status: "ready" })]), now);
    expect(t).toEqual({ shipped: [], inReview: [], decided: [] });
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

  it("sums up the card in one row, leaving out zero counts, and lists every line oldest first", () => {
    const c = catchUp(
      workspace([ticket({ key: "SH-1", status: "done", completed_at: at("10:12") }), ticket({ key: "SH-2", status: "done", completed_at: at("09:00") })], { decisions: [decision("DEC-24", "Sessions", at("09:30"))] }),
      [],
      at("08:40"),
      nameOf,
      now,
    )!;
    expect(catchUpSummary(c)).toBe("2 shipped · 1 decided");
    expect(catchUpSummary({ ...c, decided: [], problems: [{ text: "a", at: at("09:00") }, { text: "b", at: at("09:10") }] })).toBe("2 shipped · 2 problems");
    expect(catchUpItems(c).map((i) => [i.type, i.ref])).toEqual([
      ["shipped", "SH-2"],
      ["decided", "DEC-24"],
      ["shipped", "SH-1"],
    ]);
  });
});

describe("the timeline", () => {
  it("puts a card where Captain asked its question, and ticket cards at the time they started waiting", () => {
    const ws = workspace([ticket({ key: "SH-1", status: "in_progress", needs_human: "Blue or green?", updated_at: at("09:20") }), ticket({ key: "SH-2", status: "in_progress", needs_human: "Late?", updated_at: at("11:00") })]);
    const msgs = [
      message(ME, CAPTAIN, "Hi", { created_at: at("09:00") }),
      message(CAPTAIN, ME, "Started on #1 (branch a).", { created_at: at("09:05") }),
      message(CAPTAIN, ME, "Ship today?", { kind: "question", created_at: at("09:10") }),
      message(CAPTAIN, ME, "On it.", { created_at: at("09:30") }),
    ];
    const turns = conversation(msgs, ME, CAPTAIN);
    const entries = timeline(folded(turns), needsYou(ws, turns), at("12:00"));
    expect(entries.map((e) => (e.kind === "row" ? e.row.kind : e.kind === "card" ? `card:${e.need.kind}` : e.kind))).toEqual([
      "you",
      "fold",
      "card:captain_question",
      "card:ticket_question",
      "captain",
      "card:ticket_question",
      "catchup",
    ]);
    // What the person says after arriving goes below the catch-up.
    const later = conversation([...msgs, message(ME, CAPTAIN, "Thanks", { created_at: at("12:05") })], ME, CAPTAIN);
    expect(timeline(folded(later), [], at("12:00")).map((e) => (e.kind === "row" ? e.row.kind : e.kind)).slice(-2)).toEqual(["catchup", "you"]);
    // An answered question is a normal message again.
    expect(timeline(folded(turns), []).map((e) => e.kind === "row" && e.row.kind)).toEqual(["you", "fold", "question", "captain"]);
  });

  it("labels days the way people say them", () => {
    const now = new Date(2026, 9, 10, 18, 0);
    expect(dayLabel(new Date(2026, 9, 10, 8, 40).toISOString(), now)).toBe("This morning");
    expect(dayLabel(new Date(2026, 9, 10, 14, 0).toISOString(), now)).toBe("This afternoon");
    expect(dayLabel(new Date(2026, 9, 9, 23, 0).toISOString(), now)).toBe("Yesterday");
    const older = dayLabel(new Date(2026, 9, 7, 9, 0).toISOString(), now);
    expect(older).toBe(new Date(2026, 9, 7).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }));
  });

  it("writes times and fold counts plainly", () => {
    expect(clock(new Date(2026, 9, 10, 8, 40).toISOString())).toMatch(/^0?8:40( am)?$/);
    expect(foldText(1)).toBe("1 quiet update");
    expect(foldText(3)).toBe("3 quiet updates");
  });
});

describe("decision cards", () => {
  it("asks Captain's review question, or falls back to a plain one", () => {
    const t = ticket({ key: "SH-2", title: "Sessions column", status: "review", needs_human: `${MERGE_OK_PREFIX} db/004_sessions.sql` });
    const [need] = needsYou(workspace([t]), []);
    expect(mergeQuestion(need)).toBe("OK to merge “Sessions column”?");
    expect(riskyPart(need)).toBe("db/004_sessions.sql");
    const question = "Everyone signed up before today becomes an email sign-in. Right?";
    const reviewed = { ...t, needs_human: `${MERGE_OK_PREFIX} ${question} (db/004_sessions.sql, ci.yml)`, review: { question, less_sure: "" } };
    const [asked] = needsYou(workspace([reviewed]), []);
    expect(mergeQuestion(asked)).toBe(question);
    expect(riskyPart(asked)).toBe("db/004_sessions.sql, ci.yml");
  });

  it("shows who reviewed and who built only when the ticket says both", () => {
    const ws = workspace([]);
    expect(mergeChip(ws, ticket({ key: "SH-1", approved_by: CAPTAIN, assignee_id: BIRCH }))).toBe("Reviewed by Captain, built by Birch");
    expect(mergeChip(ws, ticket({ key: "SH-2", assignee_id: BIRCH }))).toBeNull();
    expect(mergeChip(ws, ticket({ key: "SH-3", approved_by: CAPTAIN }))).toBeNull();
  });

  it("names an agent's owner for the hover", () => {
    const ws = workspace([]);
    expect(ownerOf(ws, BIRCH)).toBe("Raghav's agent");
    expect(ownerOf(ws, "nobody")).toBeNull();
  });
});

describe("Captain's messages (AK-69)", () => {
  const ws = workspace([]);
  const nameOf = (id: string | null) => ws.nameOf(id);

  it("says each kind of need in one or two short sentences", () => {
    const merge = ticket({ key: "SH-2", title: "Sessions column", status: "review", needs_human: `${MERGE_OK_PREFIX} db/004_sessions.sql` });
    const asked = ticket({ key: "SH-3", status: "in_progress", assignee_id: BIRCH, needs_human: "Redis or Postgres for sessions?" });
    const stopped = ticket({ key: "SH-4", status: "in_progress", assignee_id: BIRCH, needs_human: "I stopped: hit the 60-minute limit. Where it got to: the button shows." });
    const blocked = ticket({ key: "SH-5", status: "in_progress", needs_human: "I'm blocked on the missing table." });
    const couldnt = ticket({ key: "SH-6", status: "review", needs_human: "Couldn't merge: the tests failed." });
    const q = message(CAPTAIN, ME, "Ship today or tomorrow?", { kind: "question" });
    const needs = needsYou(workspace([merge, asked, stopped, blocked, couldnt]), conversation([q], ME, CAPTAIN));
    const text = (key: string) => needText(needs.find((n) => n.ticket?.key === key)!, nameOf);
    expect(text("SH-2")).toBe("SH-2 is ready and needs your OK. OK to merge “Sessions column”?");
    expect(text("SH-3")).toBe("Birch has a question on SH-3: Redis or Postgres for sessions?");
    expect(text("SH-4")).toBe("Birch stopped: hit the 60-minute limit on SH-4.");
    expect(text("SH-5")).toBe("The agent is blocked on the missing table on SH-5.");
    expect(text("SH-6")).toBe("Couldn't merge: the tests failed on SH-6.");
    expect(needText(needs.find((n) => n.kind === "captain_question")!, nameOf)).toBe("Ship today or tomorrow?");
    expect(problemText("couldn't continue: session limit (resets 11:20pm Stockholm)")).toBe("I couldn't continue: session limit (resets 11:20pm Stockholm).");
  });

  it("asks a person to approve a change waiting for an approval (AK-95)", () => {
    const pr = "https://github.com/ana/shop/pull/45";
    const built = ticket({ key: "SH-7", status: "review", assignee_id: CAPTAIN, pr_url: pr, needs_human: LEAD_BUILT_QUESTION });
    const limit = ticket({ key: "SH-8", status: "review", assignee_id: BIRCH, pr_url: pr, needs_human: REVIEW_LIMIT_QUESTION });
    const facts = (sha: string) => ({ sha, checks: { passed: 4, total: 4, state: "success" as const }, files: { total: 1, risky: [] }, additions: 1, deletions: 0 });
    const approved = ticket({ key: "SH-9", status: "review", assignee_id: CAPTAIN, pr_url: pr, needs_human: LEAD_BUILT_QUESTION, approved_sha: "a".repeat(40), pr_facts: facts("a".repeat(40)) });
    // An approval of an older commit doesn't count once the change has moved on (AK-106).
    const moved = ticket({ key: "SH-10", status: "review", assignee_id: CAPTAIN, pr_url: pr, needs_human: LEAD_BUILT_QUESTION, approved_sha: "a".repeat(40), pr_facts: facts("b".repeat(40)) });
    const needs = needsYou(workspace([built, limit, approved, moved]), []);
    expect(needs.map((n) => [n.ticket?.key, n.kind, n.action])).toEqual([
      ["SH-7", "approval", "Approve a change"],
      ["SH-8", "approval", "Approve a change"],
      ["SH-9", "ticket_question", "Answer a question"],
      ["SH-10", "approval", "Approve a change"],
    ]);
    expect(needText(needs[0], nameOf)).toBe("SH-7 is ready. I built it, so someone else has to approve it.");
    expect(needText(needs[1], nameOf)).toBe(`SH-8 is waiting for an approval. ${REVIEW_LIMIT_QUESTION}`);
  });

  it("replaces the actions with one quiet line once answered", () => {
    const t = new Date(2026, 9, 10, 9, 20).toISOString();
    expect(answeredLine("yes", t)).toMatch(/^You said yes · 0?9:20( am)?$/);
    expect(answeredLine("no", t)).toMatch(/^You said no · /);
    expect(answeredLine("answered", t)).toMatch(/^You answered · /);
    expect(answeredLine("approved", t)).toMatch(/^You approved it · /);
    expect(answeredLine("closed", t)).toMatch(/^No answer needed · /);
    expect(answeredLine("dismissed", t)).toBe("Dismissed");
  });

  it("closes one of Captain's questions with “No answer needed.” in its thread", () => {
    const q = message(CAPTAIN, ME, "Still want dark mode?", { kind: "question" });
    const close = message(ME, CAPTAIN, NO_ANSWER_NEEDED, { thread_id: q.id });
    expect(openQuestions(conversation([q, close], ME, CAPTAIN))).toEqual([]);
    expect(needsYou(workspace([]), conversation([q, close], ME, CAPTAIN))).toEqual([]);
  });

  it("leaves short messages whole", () => {
    expect(shortened("Short and sweet.")).toBeNull();
    expect(shortened("One\nTwo\n\nThree\nFour")).toBeNull();
  });

  it("cuts a long message between words, with an ellipsis", () => {
    const long = "word ".repeat(80).trim();
    const head = shortened(long)!;
    expect(head.length).toBeLessThanOrEqual(281);
    expect(head.endsWith("word…")).toBe(true);
    const words = "Postgres keeps everything in one database which is simpler to run and back up ".repeat(5).trim();
    const cut = shortened(words)!;
    expect(cut.endsWith("…")).toBe(true);
    // Every word before the ellipsis is whole.
    expect(words.startsWith(cut.slice(0, -1))).toBe(true);
    expect(words[cut.length - 1]).toBe(" ");
  });

  it("stops after four lines", () => {
    expect(shortened("1\n2\n3\n4\n5\n6")).toBe("1\n2\n3\n4");
  });

  it("never cuts inside a code block", () => {
    const code = "```\nline one\nline two\nline three\n```";
    expect(shortened(`Here's what changed.\n${code}\nAnd more after it.`)).toBe("Here's what changed.");
    expect(shortened(`A.\n\`\`\`\nx\n\`\`\`\n${"tail ".repeat(80)}`)).toBe("A.\n```\nx\n```");
    // A long block that is the very first thing is shown whole rather than cut.
    const first = `\`\`\`\n${"x".repeat(400)}\n\`\`\`\nAfter.`;
    expect(shortened(first)).toBe(`\`\`\`\n${"x".repeat(400)}\n\`\`\``);
  });

  it("previews the message being replied to in its first few words", () => {
    expect(replyPreview("@ana that's a product choice: Postgres keeps us on one database (DEC-1). OK?")).toBe("that's a product choice: Postgres keeps…");
    expect(replyPreview("Two goals.\n\n```autokolab-plan\ngoals: SH-1\n```")).toBe("Two goals.");
    expect(replyPreview("See **[SH-2](https://x/SH-2)** now")).toBe("See SH-2 now");
  });
});

describe("plans (CON-23)", () => {
  const block = "```autokolab-plan\ngoals: SH-10, SH-20\nasks: SH-12\nnot: Password reset is not in this plan.\n```";
  const body = `Two goals, three tickets. I'll ask you once.\n\n${block}`;

  it("reads the block at the end of a message and hides it", () => {
    expect(parsePlan(body)).toEqual({ goals: ["SH-10", "SH-20"], asks: ["SH-12"], not: "Password reset is not in this plan.", text: "Two goals, three tickets. I'll ask you once." });
  });

  it("is tolerant of spacing, case and a trailing newline", () => {
    const loose = "Plan below.\n``` Autokolab-Plan \n  GOALS :sh-10 ,sh-20,\n Asks:  \n NOT : Nothing else.  \n```\n";
    expect(parsePlan(loose)).toEqual({ goals: ["SH-10", "SH-20"], asks: [], not: "Nothing else.", text: "Plan below." });
  });

  it("is an ordinary message without a block or a valid goal, and still hides a broken block", () => {
    expect(parsePlan("Just a message.")).toBeNull();
    expect(parsePlan("```js\ngoals: SH-1\n```")).toBeNull();
    const empty = "Here's the plan.\n```autokolab-plan\ngoals: soon\n```";
    expect(parsePlan(empty)).toBeNull();
    expect(withoutPlan(empty)).toBe("Here's the plan.");
    expect(withoutPlan("Here's the plan.\n```autokolab-plan\ngoals: SH-1")).toBe("Here's the plan.");
    expect(withoutPlan("No block here.")).toBe("No block here.");
  });

  const goalA = ticket({ key: "SH-10", type: "epic", title: "Google sign-in", status: "backlog" });
  const goalB = ticket({ key: "SH-20", type: "epic", title: "Profiles", status: "backlog" });
  const kids = (status: "backlog" | "ready") => [
    ticket({ key: "SH-11", parent_id: goalA.id, status }),
    ticket({ key: "SH-12", parent_id: goalA.id, status }),
    ticket({ key: "SH-21", parent_id: goalB.id, status }),
    ticket({ key: "SH-22", parent_id: goalB.id, status: "canceled" }),
  ];
  const planMsg = message(CAPTAIN, ME, body, { kind: "question", created_at: at("09:00") });

  it("resolves goals and tickets from the board and is pending until the person answers", () => {
    const ws = workspace([goalA, goalB, ...kids("backlog")]);
    const [p] = plans(ws, conversation([planMsg], ME, CAPTAIN));
    expect(p.status).toBe("pending");
    expect(p.goals.map((g) => [g.goal.key, g.tickets.map((t) => t.key)])).toEqual([
      ["SH-10", ["SH-11", "SH-12"]],
      ["SH-20", ["SH-21"]],
    ]);
    expect(p.asks.map((t) => t.key)).toEqual(["SH-12"]);
    expect(planTitle(p)).toBe("Plan · 2 goals, 3 tickets");
    expect(planAsks(p)).toBe("You'll be asked once");
    expect(planAsks({ ...p, asks: p.tickets.slice(0, 2) })).toBe("You'll be asked 2 times");
    expect(planTitle({ ...p, goals: p.goals.slice(0, 1), tickets: p.tickets.slice(0, 1) })).toBe("Plan · Google sign-in, 1 ticket");
    expect(planAsks({ ...p, asks: [] })).toBeNull();
    expect(planLine(p)).toBe("2 goals, 3 tickets. You'll be asked once.");
    expect(planLine({ ...p, asks: p.tickets.slice(0, 2) })).toBe("2 goals, 3 tickets. You'll be asked 2 times.");
    expect(planLine({ ...p, goals: p.goals.slice(0, 1), tickets: p.tickets.slice(0, 1), asks: [] })).toBe("1 goal, 1 ticket.");
    // Unknown goals are dropped; a plan with none left is an ordinary message.
    const unknown = message(CAPTAIN, ME, "Plan\n```autokolab-plan\ngoals: SH-99\n```", { created_at: at("09:10") });
    expect(plans(ws, conversation([unknown], ME, CAPTAIN))).toEqual([]);
  });

  it("is started when none of its tickets is in Backlog, saying when the person said OK", () => {
    const ok = message(ME, CAPTAIN, "OK, start", { thread_id: planMsg.id, created_at: at("09:18") });
    const started = workspace([goalA, goalB, ...kids("ready")]);
    expect(plans(started, conversation([planMsg, ok], ME, CAPTAIN))[0]).toMatchObject({ status: "started", okAt: at("09:18"), byYou: true });
    // Moved on the board, or by someone else: started, but not by you.
    expect(plans(started, conversation([planMsg], ME, CAPTAIN))[0]).toMatchObject({ status: "started", okAt: null, byYou: false });
    // "OK, start" said but a ticket is still a draft (one was refused): still pending, so it can be retried.
    expect(plans(workspace([goalA, goalB, ...kids("backlog")]), conversation([planMsg, ok], ME, CAPTAIN))[0].status).toBe("pending");
  });

  it("is changes-asked when the person replied with anything else, and replaced by a newer plan for the same goals", () => {
    const ws = workspace([goalA, goalB, ...kids("backlog")]);
    const change = message(ME, CAPTAIN, "Leave out profiles for now.", { thread_id: planMsg.id, created_at: at("09:20") });
    expect(plans(ws, conversation([planMsg, change], ME, CAPTAIN))[0]).toMatchObject({ status: "changes_asked", changedAt: at("09:20") });
    const newer = message(CAPTAIN, ME, "Updated.\n```autokolab-plan\ngoals: SH-10\n```", { kind: "question", created_at: at("09:30") });
    expect(plans(ws, conversation([planMsg, change, newer], ME, CAPTAIN)).map((p) => p.status)).toEqual(["replaced", "pending"]);
  });

  it("counts a pending plan in needs you once, as a plan and not a question", () => {
    const ws = workspace([goalA, goalB, ...kids("backlog")]);
    const turns = conversation([planMsg], ME, CAPTAIN);
    const needs = needsYou(ws, turns);
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ kind: "plan", action: "OK a plan", turnId: planMsg.id, question: "Plan · 2 goals, 3 tickets" });
    expect(timeline(folded(turns), needs).map((e) => e.kind === "card" && e.need.kind)).toEqual(["plan"]);
    // Started, changes-asked and replaced plans don't count.
    expect(needsYou(workspace([goalA, goalB, ...kids("ready")]), turns)).toEqual([]);
    const change = message(ME, CAPTAIN, "Smaller, please.", { thread_id: planMsg.id, created_at: at("09:20") });
    expect(needsYou(ws, conversation([planMsg, change], ME, CAPTAIN))).toEqual([]);
    // A question whose block is broken is an ordinary question, shown without the block.
    const broken = message(CAPTAIN, ME, "Go ahead?\n```autokolab-plan\nnope\n```", { kind: "question", created_at: at("10:00") });
    expect(needsYou(ws, conversation([broken], ME, CAPTAIN))[0]).toMatchObject({ kind: "captain_question", question: "Go ahead?" });
  });

  it("links a replaced plan to the newer one, and finds the person's request at the root of its thread", () => {
    const ws = workspace([goalA, goalB, ...kids("backlog")]);
    const ask = message(ME, CAPTAIN, "We need Google sign-in.", { created_at: at("08:55") });
    const first = message(CAPTAIN, ME, body, { kind: "question", thread_id: ask.id, created_at: at("09:00") });
    const other = message(CAPTAIN, ME, "Another.\n```autokolab-plan\ngoals: SH-20\n```", { kind: "question", created_at: at("09:10") });
    const turns = conversation([ask, first, other], ME, CAPTAIN);
    const [p, q] = plans(ws, turns);
    expect(newerPlan([p, q], p)?.turnId).toBe(other.id);
    expect(newerPlan([p, q], q)).toBeNull();
    expect(planRequest(p, turns)?.body).toBe("We need Google sign-in.");
    // A plan that starts its own thread has no request to show.
    expect(planRequest(q, turns)).toBeNull();
  });
});

describe("the plan page's ticket order", () => {
  const blocked = (tickets: ReturnType<typeof ticket>[], links: [string, string][]) => {
    const ws = workspace(tickets);
    return { ...ws, blockersOf: (id: string) => links.filter(([t]) => `t-${t}` === id).map(([, b]) => ws.byKey.get(b)!) };
  };

  it("puts a ticket after the ones it waits for, ties in board order", () => {
    const [a, b, c, d] = ["SH-1", "SH-2", "SH-3", "SH-4"].map((key) => ticket({ key }));
    // SH-1 waits for SH-3; SH-2 waits for SH-1. SH-4 waits for nothing, so it keeps its board place.
    const ws = blocked([a, b, c, d], [["SH-1", "SH-3"], ["SH-2", "SH-1"]]);
    expect(planOrder(ws, [a, b, c, d]).map((t) => t.key)).toEqual(["SH-3", "SH-1", "SH-2", "SH-4"]);
    // No blockers: board order, whatever order they came in.
    expect(planOrder(workspace([a, b, c]), [c, a, b]).map((t) => t.key)).toEqual(["SH-1", "SH-2", "SH-3"]);
  });

  it("ignores blockers outside the list, and still lists every ticket when blockers loop", () => {
    const [a, b, x] = ["SH-1", "SH-2", "SH-9"].map((key) => ticket({ key }));
    expect(planOrder(blocked([a, b, x], [["SH-1", "SH-9"]]), [a, b]).map((t) => t.key)).toEqual(["SH-1", "SH-2"]);
    expect(planOrder(blocked([a, b], [["SH-1", "SH-2"], ["SH-2", "SH-1"]]), [a, b]).map((t) => t.key)).toEqual(["SH-1", "SH-2"]);
  });

  it("says what a ticket still waits for, by title, and nothing when it waits for nothing open", () => {
    const a = ticket({ key: "SH-1", title: "Add the table" });
    const b = ticket({ key: "SH-2", title: "Callback" });
    const c = ticket({ key: "SH-3", title: "Button" });
    const done = ticket({ key: "SH-4", title: "Old work", status: "done" });
    const ws = blocked([a, b, c, done], [["SH-3", "SH-1"], ["SH-3", "SH-2"], ["SH-2", "SH-1"], ["SH-1", "SH-4"]]);
    expect(waitsFor(ws, b)).toBe("after “Add the table”");
    expect(waitsFor(ws, c)).toBe("after “Add the table” and “Callback”");
    expect(waitsFor(ws, a)).toBeNull();
  });
});
