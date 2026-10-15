import type { Agent, Ticket } from "../lib/data";

/** A project may show availability, but never another project's status note or running tickets. */
export function statusHere(a: Agent, projectId: string, tickets: ReadonlyMap<string, Ticket>, now = new Date()): Agent & { elsewhere: boolean; busyElsewhere?: boolean } {
  const runs = a.running_tickets?.filter((r) => r.project_id === projectId && tickets.get(r.ticket_id)?.project_id === projectId && tickets.get(r.ticket_id)?.assignee_id === a.id);
  const busyElsewhere = !!a.running_tickets?.some((r) => r.project_id !== projectId || !tickets.has(r.ticket_id));
  const ticket = a.current_ticket_id ? tickets.get(a.current_ticket_id) : undefined;
  const foreignStatus = (!!a.status_project_id && a.status_project_id !== projectId) ||
    (!!a.current_ticket_id && (!ticket || ticket.project_id !== projectId)) ||
    (busyElsewhere && !a.status_project_id && !ticket);
  const foreign = !runs?.length && (foreignStatus || busyElsewhere);
  const offline = a.status === "offline" || !a.last_seen_at || now.getTime() - Date.parse(a.last_seen_at) >= 5 * 60_000;
  const limit = (!!a.waiting_until && Date.parse(a.waiting_until) > now.getTime()) || /usage limit/i.test(a.status_note ?? "");
  const global = offline || a.status === "paused" || limit;
  const status = offline ? "offline" : a.status === "paused" ? "paused" : limit ? "idle" : foreign ? "planning" : runs?.length ? "building" : a.status;
  // Keep only the reset time from a foreign limit note, never any surrounding project text.
  const reset = /\b(?:about|resets?|until)\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)(?:\s*\(([A-Za-z0-9_+\-/:]+)\))?/i.exec(a.status_note ?? "");
  let zone = reset?.[2];
  if (zone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); }
    catch { zone = undefined; }
  }
  const limitNote = `Waiting for my usage limit to reset${reset ? `, about ${reset[1]}${zone ? ` (${zone})` : ""}` : ""}`;
  const hideNote = foreignStatus || foreign;
  return { ...a, status,
    ...(runs ? { running_tickets: runs } : {}),
    status_note: hideNote ? limit ? limitNote : null : a.status_note,
    status_project_id: runs?.length ? projectId : foreignStatus ? null : a.status_project_id,
    current_ticket_id: foreign ? null : runs?.length ? runs.find((r) => r.ticket_id === a.current_ticket_id)?.ticket_id ?? runs[0].ticket_id : a.current_ticket_id,
    elsewhere: foreign && !global, busyElsewhere };
}
