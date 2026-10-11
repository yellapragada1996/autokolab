import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addComment, allowMerge, lastCaughtUp, markCaughtUp, updateTicket, type Agent, type Project, type Ticket } from "../lib/data";
import { postToRoom, roomFor, roomMessages, watchRoom, type Room as RoomData, type RoomMember, type RoomMessage } from "../lib/room";
import { catchUp, conversation, needsYou, OK_START, plans as plansOf, type CatchUp, type Need, type Plan, type Turn } from "./captain";
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
}

const REFUSED = "the preview is set to refuse answers (?refuse).";

export interface CaptainRoom {
  /** undefined while loading; null when your sign-in isn't in the project's room. */
  room: RoomData | null | undefined;
  messages: RoomMessage[];
  turns: Turn[];
  /** Everything still waiting on the person, after the answers given on this visit. */
  needs: Need[];
  /** Captain's plans, with the tickets moved on this visit already counted as Ready. */
  plans: Plan[];
  /** Risky merges OK'd on this visit: their cards stay, in green. */
  okd: Need[];
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
  /** Work out the catch-up once per visit, the first time the Captain page shows. */
  startCatchUp: () => void;
  send: (text: string, thread?: number | null, errorKey?: string) => Promise<boolean>;
  okMerge: (need: Need) => Promise<void>;
  answerTicket: (need: Need, text: string) => Promise<void>;
  answerCaptain: (need: Need, text: string) => Promise<void>;
  clearNeed: (need: Need) => Promise<void>;
  /** OK, start: the plan's Backlog tickets go to Ready, then "OK, start" goes to Captain in the plan's thread. */
  startPlan: (plan: Plan) => Promise<void>;
  /** Change something: the person's words go to Captain in the plan's thread. No ticket changes. */
  changePlan: (plan: Plan, text: string) => Promise<boolean>;
}

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
  const [settled, setSettled] = useState<Map<string, { since: string; need: Need; ok: boolean }>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [cu, setCu] = useState<{ c: CatchUp; at: string } | null>(null);
  const [cuReady, setCuReady] = useState(false);
  const [demoReading, setDemoReading] = useState(false);
  // Tickets "OK, start" moved on this visit, shown as Ready before the board reloads.
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const started = useRef(false);

  const load = useCallback(async () => {
    try {
      // The preview goes through the same path, with the room and its messages each arriving late.
      const r = demo ? await wait((demo.delayMs ?? 0) / 2).then(() => demo.room) : await roomFor(project.room_id, profileId);
      const msgs = !r ? [] : demo ? await wait((demo.delayMs ?? 0) / 2).then(() => demo.messages) : await roomMessages(r.id);
      // Set together, in one render. A reload keeps the old room and messages until the new ones
      // are in, so watching never flashes the page back to "Loading…".
      setLoaded(msgs);
      setRoom(r);
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
      setRoom((x) => (x === undefined ? null : x));
    }
  }, [project.room_id, profileId, demo]);

  useEffect(() => {
    setRoom(undefined);
    setLoaded([]);
    setPending([]);
    setSettled(new Map());
    setErrors(new Map());
    setMoved(new Set());
    setCu(null);
    setCuReady(false);
    started.current = false;
    void load();
  }, [load]);
  useEffect(() => (room && !demo ? watchRoom(room.id, () => void load()) : undefined), [room?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => [...loaded, ...pending], [loaded, pending]);
  const captainId = project.lead_agent_id;
  const turns = useMemo(() => conversation(messages, room?.me?.id, captainId), [messages, room, captainId]);
  const planWs = useMemo(() => (ws && moved.size ? { ...ws, tickets: ws.tickets.map((t) => (moved.has(t.id) && t.status === "backlog" ? { ...t, status: "ready" as const } : t)) } : ws), [ws, moved]);
  const plans = useMemo(() => (planWs ? plansOf(planWs, turns) : []), [planWs, turns]);
  const raw = useMemo(() => (planWs ? needsYou(planWs, turns) : []), [planWs, turns]);
  // An answer hides the card it answered, not a newer question on the same ticket.
  const needs = useMemo(() => raw.filter((n) => settled.get(n.key)?.since !== n.since), [raw, settled]);
  const okd = useMemo(() => [...settled.values()].filter((s) => s.ok && s.need.kind === "risky_merge").map((s) => s.need), [settled]);

  const captain = ws?.agentOf(captainId);
  const member: RoomMember | undefined = room?.members.find((m) => m.id === captainId);
  const online = !!captain && agentOnline(captain);
  const working = demoReading || (!!captain && agentDot(captain) === "working") || member?.runner_state === "working";

  const setError = (key: string, msg: string | null) =>
    setErrors((m) => {
      const next = new Map(m);
      if (msg) next.set(key, msg);
      else next.delete(key);
      return next;
    });

  /** Hide the card now, run the answer, and bring the card back with the reason if it fails. */
  const settle = async (need: Need, run: () => Promise<void>) => {
    setError(need.key, null);
    setSettled((m) => new Map(m).set(need.key, { since: need.since, need, ok: false }));
    try {
      await run();
      setSettled((m) => new Map(m).set(need.key, { since: need.since, need, ok: true }));
      if (!demo) await ws?.reload();
    } catch (e) {
      setSettled((m) => {
        const next = new Map(m);
        next.delete(need.key);
        return next;
      });
      setError(need.key, (e as Error).message || "The server refused it.");
    }
  };

  /** Post to Captain: the message shows at once and is taken back if the post fails. */
  const post = async (text: string, thread: number | null) => {
    const me = room?.me;
    if (!room || !me) throw new Error("You can't post in this project's room.");
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
      setError(errorKey, (e as Error).message || "The server refused it.");
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
        reason ||= (e as Error).message || "the server refused it.";
      }
    }
    if (refused.length) {
      mark(refused.map((t) => t.id), false);
      const left = drafts.length - refused.length;
      const which = refused.map((t) => t.key).join(", ");
      setError(key, left ? `${which} ${refused.length === 1 ? "is" : "are"} still in Backlog: ${reason} The other ${left} moved to Ready. OK, start again tries only ${refused.length === 1 ? "that one" : "those"}.` : `no ticket moved: ${reason}`);
    } else {
      try {
        await post(OK_START, plan.thread);
      } catch (e) {
        setError(key, `the tickets are on the board, but Captain didn't get your OK: ${(e as Error).message || "the server refused it."}`);
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

  return {
    room,
    messages,
    turns,
    plans,
    needs,
    okd,
    errors,
    loadError,
    captain,
    online,
    working,
    catchUp: cu,
    catchUpReady: cuReady,
    startCatchUp,
    send,
    okMerge: (need) => settle(need, real(() => allowMerge(need.ticket!.id))),
    answerTicket: (need, text) =>
      settle(
        need,
        real(async () => {
          await addComment(need.ticket!.id, profileId, text);
          await updateTicket(need.ticket!.id, { needs_human: null });
        }),
      ),
    answerCaptain: (need, text) => {
      const thread = turns.find((t) => t.id === need.turnId)?.thread ?? need.turnId;
      return settle(need, () => post(text, thread));
    },
    clearNeed: (need) => settle(need, real(() => updateTicket(need.ticket!.id, { needs_human: null }))),
    startPlan,
    changePlan: (plan, text) => send(text, plan.thread, planKey(plan)),
  };
}
