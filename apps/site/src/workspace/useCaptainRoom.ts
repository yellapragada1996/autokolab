import { statusHere } from "./glance";
import { reportError } from "../lib/errors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addComment, allowMerge, approveTicket, lastCaughtUp, markCaughtUp, updateTicket, type Agent, type Project, type Ticket } from "../lib/data";
import { postToRoom, roomFor, roomFeed, mergeRoomMember, watchRoom, type Room as RoomData, type RoomMember, type RoomMessage } from "../lib/room";
import { catchUp, closingAnswers, closingReply, conversation, needsYou, NO_ANSWER_NEEDED, OK_START, plans as plansOf, settledWithoutYou, type Answer, type CatchUp, type Need, type Plan, type Turn } from "./captain";
import { agentDot, agentOnline } from "./People";
import type { Workspace } from "./useWorkspace";

// The person's conversation with Captain (AK-49): the project's room, what needs them, and the
// answers they give from the Captain page. Called once in Workspace, so the page and the sidebar
// badge count the same list. Answers are optimistic: the card goes at once and comes back, with the
// reason, if the server refuses.

export interface DemoRoom {
  room: RoomData;
  messages: RoomMessage[];
  /** When the person last caught up, so the preview shows a catch-up. */
  caughtUpAt?: string;
  /** Deliver the room after this long, like the live site does, so the loading path can be checked. */
  delayMs?: number;
  /** Refuse every answer and post, so the preview can show what a refused one looks like. */
  refuse?: boolean;
  /** Open with the composer replying to this question of Captain's (a message id), to see reply mode. */
  replyTo?: number;
}

const REFUSED = "the preview is set to refuse answers (?refuse).";

/** Where the composer's next message goes while it's in reply mode (AK-69). */
export type ReplyTarget = { kind: "captain"; need: Need } | { kind: "no"; need: Need } | { kind: "plan"; plan: Plan };

/** Something the person answered on this visit, shown as a quiet line under its message. */
export interface Answered {
  need: Need;
  answer: Answer;
  at: string;
}

export interface CaptainRoom {
  /** undefined while loading; null when your sign-in isn't in the project's room. */
  room: RoomData | null | undefined;
  messages: RoomMessage[];
  turns: Turn[];
  /** Everything still waiting on the person, after the answers given on this visit. */
  needs: Need[];
  /** Captain's questions settled without the person, by message id: what happened (AK-100). */
  settled: Map<number, string>;
  /** Captain's answers that closed its own questions: shown under the question, not again on their own. */
  closers: Set<number>;
  /** Captain's plans, with the tickets moved on this visit already counted as Ready. */
  plans: Plan[];
  /** Risky merges OK'd on this visit: they stay, with a green line. */
  okd: Need[];
  /** Everything answered on this visit (sent or still sending): its message stays, with a quiet line. */
  answered: Answered[];
  /** A plain message per card (by need key), or "composer", when the server refused. */
  errors: Map<string, string>;
  loadError: string;
  captain: Agent | undefined;
  online: boolean;
  /** Captain's agent is running: "Captain is reading…". */
  working: boolean;
  catchUp: { c: CatchUp; at: string } | null;
  /** The catch-up has been worked out (whether or not there is one): the conversation is complete. */
  catchUpReady: boolean;
  /** Work out the catch-up once per visit, the first time the Captain page or Overview shows; both show the same one. */
  startCatchUp: () => void;
  send: (text: string, thread?: number | null, errorKey?: string) => Promise<boolean>;
  okMerge: (need: Need) => Promise<boolean>;
  /** "Approve this change": the person approves the commit they were shown, with their note if any. */
  approve: (need: Need, sha: string, note: string) => Promise<boolean>;
  answerTicket: (need: Need, text: string) => Promise<boolean>;
  answerCaptain: (need: Need, text: string) => Promise<boolean>;
  /** "No" on a risky merge: "No on <KEY>: <why>" goes to Captain. */
  sayNo: (need: Need, text: string) => Promise<boolean>;
  /** "Not needed any more" on one of Captain's questions: "No answer needed." in its thread closes it. */
  closeQuestion: (need: Need) => Promise<boolean>;
  clearNeed: (need: Need) => Promise<boolean>;
  /** OK, start: the plan's Backlog tickets go to Ready, then "OK, start" goes to Captain in the plan's thread. */
  startPlan: (plan: Plan) => Promise<void>;
  /** Change something: the person's words go to Captain in the plan's thread. No ticket changes. */
  changePlan: (plan: Plan, text: string) => Promise<boolean>;
  /** The composer's reply mode: what its next message answers, or null for a new message. */
  replyTo: ReplyTarget | null;
  setReplyTo: (target: ReplyTarget | null) => void;
  /** Send the composer's text to where reply mode points; reply mode ends unless it was refused. */
  sendReply: (text: string) => Promise<boolean>;
}

/** Where a reply's refusal is kept in `errors`: the key of what it answers. */
export const replyKey = (r: ReplyTarget) => (r.kind === "plan" ? planKey(r.plan) : r.need.key);

/** Where a plan card's refusal is kept in `errors`; the same key as its need. */
export const planKey = (plan: Plan) => `plan:${plan.turnId}`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let tempId = 1e15;

export function useCaptainRoom(project: Project, ws: Workspace | null, profileId: string, demo?: DemoRoom): CaptainRoom {
  // `room` is the "ready" signal: it is only set together with its messages, so nothing that waits
  // for the room (the catch-up, landing at the newest message) ever sees an empty conversation.
  const [room, setRoom] = useState<RoomData | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<RoomMessage[]>([]);
  const [pending, setPending] = useState<RoomMessage[]>([]);
  const [loadError, setLoadError] = useState("");
  const [settled, setSettled] = useState<Map<string, { since: string; need: Need; ok: boolean; answer: Answer; at: string }>>(new Map());
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [cu, setCu] = useState<{ c: CatchUp; at: string } | null>(null);
  const [cuReady, setCuReady] = useState(false);
  const [demoReading, setDemoReading] = useState(false);
  // Tickets "OK, start" moved on this visit, shown as Ready before the board reloads.
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const started = useRef(false);

  const feed = useMemo(() => project.room_id ? roomFeed(project.room_id) : null, [project.room_id, profileId]);
  const roomRef = useRef(room);
  roomRef.current = room;
  const refreshMembers = useCallback(async () => {
    try { setRoom(await roomFor(project.room_id, profileId)); }
    catch (e) { setLoadError(reportError(e, "load the room members")); }
  }, [project.room_id, profileId]);

  const load = useCallback(async () => {
    try {
      // The preview goes through the same path, with the room and its messages each arriving late.
      const r = demo ? await wait((demo.delayMs ?? 0) / 2).then(() => demo.room) : (roomRef.current ?? await roomFor(project.room_id, profileId));
      const msgs = !r ? [] : demo ? await wait((demo.delayMs ?? 0) / 2).then(() => demo.messages) : await feed!.load();
      // Set together, in one render. A reload keeps the old room and messages until the new ones
      // are in, so watching never flashes the page back to "Loading…".
      setLoaded(msgs);
      setRoom(r);
      setLoadError("");
    } catch (e) {
      setLoadError(reportError(e, "load the room"));
      setRoom((x) => (x === undefined ? null : x));
    }
  }, [project.room_id, profileId, demo, feed]);

  useEffect(() => {
    roomRef.current = undefined;
    setRoom(undefined);
    setLoaded([]);
    setPending([]);
    setSettled(new Map());
    setReplyTo(null);
    setErrors(new Map());
    setMoved(new Set());
    setCu(null);
    setCuReady(false);
    started.current = false;
    void load();
  }, [load]);
  useEffect(() => (room && !demo ? watchRoom(room.id, () => void load(), {
    memberIds: () => new Set(roomRef.current?.members.map((m) => m.id)),
    onMember: (row) => setRoom((r) => mergeRoomMember(r, row)),
    onMembership: () => void refreshMembers(),
  }) : undefined), [room?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => [...loaded, ...pending], [loaded, pending]);
  const captainId = project.lead_agent_id;
  const turns = useMemo(() => conversation(messages, room?.me?.id, captainId), [messages, room, captainId]);
  const planWs = useMemo(() => (ws && moved.size ? { ...ws, tickets: ws.tickets.map((t) => (moved.has(t.id) && t.status === "backlog" ? { ...t, status: "ready" as const } : t)) } : ws), [ws, moved]);
  const plans = useMemo(() => (planWs ? plansOf(planWs, turns) : []), [planWs, turns]);
  const raw = useMemo(() => (planWs ? needsYou(planWs, turns) : []), [planWs, turns]);
  const settledQs = useMemo(() => (planWs ? settledWithoutYou(planWs, turns) : new Map<number, string>()), [planWs, turns]);
  const closers = useMemo(() => closingAnswers(turns), [turns]);
  // An answer hides the card it answered, not a newer question on the same ticket.
  const needs = useMemo(() => raw.filter((n) => settled.get(n.key)?.since !== n.since), [raw, settled]);
  const okd = useMemo(() => [...settled.values()].filter((s) => s.ok && s.answer === "yes").map((s) => s.need), [settled]);
  // A newer question on the same ticket is its own need; the old answer stays with the old message.
  const answered = useMemo(() => [...settled.values()].filter((s) => !needs.some((n) => n.key === s.need.key)).map(({ need, answer, at }) => ({ need, answer, at })), [settled, needs]);

  const demoReply = useRef(false);
  useEffect(() => {
    const need = demo?.replyTo && !demoReply.current ? needs.find((n) => n.key === `ask:${demo.replyTo}`) : undefined;
    if (!need) return;
    demoReply.current = true;
    setReplyTo({ kind: "captain", need });
  }, [demo, needs]);

  const captain = ws?.agentOf(captainId);
  const member: RoomMember | undefined = room?.members.find((m) => m.id === captainId);
  const online = !!captain && agentOnline(captain);
  const scopedCaptain = captain && ws ? statusHere(captain, ws.project.id, ws.byId) : null;
  const working = demoReading || (scopedCaptain ? !scopedCaptain.elsewhere && agentDot(scopedCaptain) === "working" : member?.runner_state === "working");

  const setError = (key: string, msg: string | null) =>
    setErrors((m) => {
      const next = new Map(m);
      if (msg) next.set(key, msg);
      else next.delete(key);
      return next;
    });

  /** Show the answer now, run it, and bring the actions back with the reason if it fails. */
  const settle = async (need: Need, answer: Answer, run: () => Promise<void>) => {
    const at = new Date().toISOString();
    setError(need.key, null);
    setSettled((m) => new Map(m).set(need.key, { since: need.since, need, ok: false, answer, at }));
    try {
      await run();
      setSettled((m) => new Map(m).set(need.key, { since: need.since, need, ok: true, answer, at }));
      if (!demo) await ws?.reload();
      return true;
    } catch (e) {
      setSettled((m) => {
        const next = new Map(m);
        next.delete(need.key);
        return next;
      });
      setError(need.key, reportError(e, "send your reply"));
      return false;
    }
  };

  /** Post to Captain: the message shows at once and is taken back if the post fails. */
  const post = async (text: string, thread: number | null) => {
    const me = room?.me;
    if (!room || !me) throw new Error("AUTOKOLAB_FORBIDDEN: You can't post in this project's room.");
    const temp: RoomMessage = { id: tempId++, room_id: room.id, thread_id: thread, sender_id: me.id, to_id: captainId, kind: "chat", body: text, refs: {}, created_at: new Date().toISOString() };
    setPending((p) => [...p, temp]);
    try {
      if (demo) {
        await wait(300);
        if (demo.refuse) throw new Error(REFUSED);
        setDemoReading(true);
        setTimeout(() => setDemoReading(false), 4000);
        setLoaded((l) => [...l, temp]);
      } else {
        await postToRoom(room.id, text, captainId, thread);
        await load();
      }
    } finally {
      setPending((p) => p.filter((m) => m !== temp));
    }
  };

  const send = async (text: string, thread: number | null = null, errorKey = "composer") => {
    setError(errorKey, null);
    try {
      await post(text, thread);
      return true;
    } catch (e) {
      setError(errorKey, reportError(e, "send your message"));
      return false;
    }
  };

  const real = (run: () => Promise<unknown>) => async () => {
    if (!demo) return void (await run());
    await wait(300);
    if (demo.refuse) throw new Error(REFUSED);
  };

  const startPlan = async (plan: Plan) => {
    const key = planKey(plan);
    setError(key, null);
    // Only the ones still in Backlog: a second click retries what was refused, nothing else.
    const drafts = plan.tickets.filter((t) => t.status === "backlog");
    const mark = (ids: string[], on: boolean) =>
      setMoved((m) => {
        const next = new Set(m);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    mark(drafts.map((t) => t.id), true);
    const refused: Ticket[] = [];
    let reason = "";
    for (const t of drafts) {
      try {
        await real(() => updateTicket(t.id, { status: "ready" }))();
      } catch (e) {
        refused.push(t);
        const message = reportError(e, "start the plan");
        reason ||= message;
      }
    }
    if (refused.length) {
      mark(refused.map((t) => t.id), false);
      const left = drafts.length - refused.length;
      const which = refused.map((t) => t.key).join(", ");
      setError(key, left ? `${which} ${refused.length === 1 ? "is" : "are"} still in Backlog: ${reason} The other ${left} moved to Ready. OK, start again tries only ${refused.length === 1 ? "that one" : "those"}.` : `No ticket moved. ${reason}`);
    } else {
      try {
        await post(OK_START, plan.thread);
      } catch (e) {
        setError(key, `The tickets are on the board. ${reportError(e, "tell Captain to start")}`);
      }
    }
    if (!demo) {
      await ws?.reload();
      mark(drafts.map((t) => t.id), false);
    }
  };

  const startCatchUp = () => {
    if (started.current || !ws || room === undefined) return;
    started.current = true;
    const all = messages;
    void (demo ? Promise.resolve(demo.caughtUpAt ?? null) : lastCaughtUp(project.id))
      .then((since) => {
        const c = catchUp(ws, all, since, ws.nameOf);
        setCu(c ? { c, at: new Date().toISOString() } : null);
        setCuReady(true);
        if (!demo) return markCaughtUp(project.id);
      })
      .catch(() => setCuReady(true));
  };

  const threadOf = (need: Need) => turns.find((t) => t.id === need.turnId)?.thread ?? need.turnId;
  // A ticket's need that is also Captain's question (needsYou): what settles one closes the other,
  // so the question doesn't come back on its own once the ticket's "Needs you" is cleared.
  const alsoInThread = async (need: Need, answer: Answer, text?: string) => {
    const reply = closingReply(need, answer, text);
    // The answer itself went through; if this post doesn't, the question just shows again on its own.
    if (reply) await post(reply, threadOf(need)).catch(() => undefined);
  };
  const answerCaptain = (need: Need, text: string) => settle(need, "answered", () => post(text, threadOf(need)));
  // "No" goes to Captain either way; on an item that is also Captain's question it goes in that thread, which closes it.
  const sayNo = (need: Need, text: string) =>
    settle(need, "no", () => {
      const inThread = closingReply(need, "no", text);
      return inThread ? post(inThread, threadOf(need)) : post(`No on ${need.ticket?.key ?? "it"}: ${text}`, null);
    });
  const changePlan = (plan: Plan, text: string) => send(text, plan.thread, planKey(plan));

  const sendReply = async (text: string) => {
    const r = replyTo;
    if (!r) return send(text);
    // Leave reply mode at once, as the composer clears; go back into it if the answer is refused.
    setReplyTo(null);
    const ok = r.kind === "plan" ? await changePlan(r.plan, text) : r.kind === "no" ? await sayNo(r.need, text) : await answerCaptain(r.need, text);
    if (!ok) setReplyTo((now) => now ?? r);
    return ok;
  };

  return {
    room,
    messages,
    turns,
    plans,
    needs,
    settled: settledQs,
    closers,
    okd,
    answered,
    errors,
    loadError,
    captain,
    online,
    working,
    catchUp: cu,
    catchUpReady: cuReady,
    startCatchUp,
    send,
    okMerge: (need) =>
      settle(need, "yes", async () => {
        await real(() => allowMerge(need.ticket!.id))();
        await alsoInThread(need, "yes");
      }),
    approve: (need, sha, note) =>
      settle(need, "approved", async () => {
        await real(() => approveTicket(need.ticket!.id, sha, note))();
        await alsoInThread(need, "approved");
      }),
    answerTicket: (need, text) =>
      settle(
        need,
        "answered",
        async () => {
          await real(async () => {
            await addComment(need.ticket!.id, profileId, text);
            await updateTicket(need.ticket!.id, { needs_human: null });
          })();
          await alsoInThread(need, "answered", text);
        },
      ),
    answerCaptain,
    sayNo,
    closeQuestion: (need) => settle(need, "closed", () => post(NO_ANSWER_NEEDED, threadOf(need))),
    clearNeed: (need) =>
      settle(need, "dismissed", async () => {
        await real(() => updateTicket(need.ticket!.id, { needs_human: null }))();
        await alsoInThread(need, "dismissed");
      }),
    startPlan,
    changePlan,
    replyTo,
    setReplyTo,
    sendReply,
  };
}
