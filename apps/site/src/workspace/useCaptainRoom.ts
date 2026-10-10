import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addComment, allowMerge, lastCaughtUp, markCaughtUp, updateTicket, type Agent, type Project } from "../lib/data";
import { postToRoom, roomFor, roomMessages, watchRoom, type Room as RoomData, type RoomMember, type RoomMessage } from "../lib/room";
import { catchUp, conversation, needsYou, type CatchUp, type Need, type Turn } from "./captain";
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
}

export interface CaptainRoom {
  /** undefined while loading; null when your sign-in isn't in the project's room. */
  room: RoomData | null | undefined;
  messages: RoomMessage[];
  turns: Turn[];
  /** Everything still waiting on the person, after the answers given on this visit. */
  needs: Need[];
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
  /** Work out the catch-up once per visit, the first time the Captain page shows. */
  startCatchUp: () => void;
  send: (text: string, thread?: number | null, errorKey?: string) => Promise<boolean>;
  okMerge: (need: Need) => Promise<void>;
  answerTicket: (need: Need, text: string) => Promise<void>;
  answerCaptain: (need: Need, text: string) => Promise<void>;
  clearNeed: (need: Need) => Promise<void>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let tempId = 1e15;

export function useCaptainRoom(project: Project, ws: Workspace | null, profileId: string, demo?: DemoRoom): CaptainRoom {
  const [room, setRoom] = useState<RoomData | null | undefined>(demo ? demo.room : undefined);
  const [loaded, setLoaded] = useState<RoomMessage[]>(demo?.messages ?? []);
  const [pending, setPending] = useState<RoomMessage[]>([]);
  const [loadError, setLoadError] = useState("");
  const [settled, setSettled] = useState<Map<string, { since: string; need: Need; ok: boolean }>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [cu, setCu] = useState<{ c: CatchUp; at: string } | null>(null);
  const [demoReading, setDemoReading] = useState(false);
  const started = useRef(false);

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const r = await roomFor(project.room_id, profileId);
      setRoom(r);
      if (r) setLoaded(await roomMessages(r.id));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
      setRoom((x) => (x === undefined ? null : x));
    }
  }, [project.room_id, profileId, demo]);

  useEffect(() => {
    if (demo) return;
    setRoom(undefined);
    setLoaded([]);
    setPending([]);
    setSettled(new Map());
    setErrors(new Map());
    setCu(null);
    started.current = false;
    void load();
  }, [load, demo]);
  useEffect(() => (room && !demo ? watchRoom(room.id, () => void load()) : undefined), [room?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = useMemo(() => [...loaded, ...pending], [loaded, pending]);
  const captainId = project.lead_agent_id;
  const turns = useMemo(() => conversation(messages, room?.me?.id, captainId), [messages, room, captainId]);
  const raw = useMemo(() => (ws ? needsYou(ws, turns) : []), [ws, turns]);
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
    if (demo) await wait(300);
    else await run();
  };

  const startCatchUp = () => {
    if (started.current || !ws || room === undefined) return;
    started.current = true;
    const all = messages;
    void (demo ? Promise.resolve(demo.caughtUpAt ?? null) : lastCaughtUp(project.id))
      .then((since) => {
        const c = catchUp(ws, all, since, ws.nameOf);
        setCu(c ? { c, at: new Date().toISOString() } : null);
        if (!demo) return markCaughtUp(project.id);
      })
      .catch(() => undefined);
  };

  return {
    room,
    messages,
    turns,
    needs,
    okd,
    errors,
    loadError,
    captain,
    online,
    working,
    catchUp: cu,
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
  };
}
