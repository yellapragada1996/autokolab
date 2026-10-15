import type { Agent, Ticket } from "../lib/data";

/** A project may show availability, but never another project's status note or current ticket. */
export function statusHere(a: Agent, projectId: string, tickets: ReadonlyMap<string, Ticket>, now = new Date()): Agent & { elsewhere: boolean } {
  const ticket = a.current_ticket_id ? tickets.get(a.current_ticket_id) : undefined;
  const foreign = (!!a.status_project_id && a.status_project_id !== projectId) ||
    (!!a.current_ticket_id && (!ticket || ticket.project_id !== projectId));
  const offline = a.status === "offline" || !a.last_seen_at || now.getTime() - Date.parse(a.last_seen_at) >= 5 * 60_000;
  const limit = (!!a.waiting_until && Date.parse(a.waiting_until) > now.getTime()) || /usage limit/i.test(a.status_note ?? "");
  const global = offline || a.status === "paused" || limit;
  if (!foreign) return { ...a, elsewhere: false };
  // Keep only the reset time from a limit note, never any surrounding project text.
  const reset = /\b(?:about|resets?|until)\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)(?:\s*\(([A-Za-z_+\-/]+)\))?/i.exec(a.status_note ?? "");
  const note = limit ? `Waiting for my usage limit to reset${reset ? `, about ${reset[1]}${reset[2] ? ` (${reset[2]})` : ""}` : ""}` : null;
  return { ...a, status: offline ? "offline" : global ? a.status : "planning", status_note: note,
    current_ticket_id: null, elsewhere: !global };
}
