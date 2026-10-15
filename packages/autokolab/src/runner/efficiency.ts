/** Numeric counters only. Keys are fixed here and in schema 29; no request or prompt content is kept. */
export const EFFICIENCY_KEYS = [
  "rest_tickets_board", "rest_tickets_ticket", "rest_tickets_other", "rest_ticket_comments_comments",
  "rest_messages_messages", "rest_project_guides_guide", "rest_decisions_decisions", "rest_other_other",
  "rest_projects_membership", "rest_project_members_membership", "rest_profiles_identity", "rest_agents_identity",
  "rest_ticket_steps_steps", "rest_ticket_links_board", "rest_members_identity", "rest_room_members_membership",
  "rest_rooms_membership", "rest_task_runs_runs", "rest_bulletin_board", "rest_read_cursors_messages", "rest_rpc_other",
  "realtime_events", "prompt_guide", "prompt_decisions", "prompt_ticket", "prompt_comments", "prompt_other",
  "wake_message_chat", "wake_message_question", "wake_message_task", "wake_message_review", "wake_message_other",
  "wake_comment", "wake_ready", "wake_review", "wake_triage",
  "fail_env_git", "fail_env_network", "fail_provider", "fail_ci", "fail_conflict", "fail_other",
] as const;
export type EfficiencyKey = typeof EFFICIENCY_KEYS[number];
export type EfficiencyDelta = Partial<Record<EfficiencyKey, number>>;

export class EfficiencyCounters {
  private days = new Map<string, EfficiencyDelta>();
  add(key: EfficiencyKey, value = 1): void {
    if (!Number.isFinite(value) || value < 0) return;
    const day = localDay();
    const values = this.days.get(day) ?? {};
    values[key] = (values[key] ?? 0) + Math.round(value);
    this.days.set(day, values);
  }
  take(): { day: string; values: EfficiencyDelta }[] {
    const result = [...this.days].map(([day, values]) => ({ day, values }));
    this.days.clear();
    return result;
  }
  restore(day: string, delta: EfficiencyDelta): void {
    const values = this.days.get(day) ?? {};
    for (const [key, value] of Object.entries(delta)) values[key as EfficiencyKey] = (values[key as EfficiencyKey] ?? 0) + value;
    this.days.set(day, values);
  }
}

export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** URL and column selection only; neither the URL nor the response is saved. */
export function restKey(raw: string): EfficiencyKey | null {
  const u = new URL(raw);
  const name = u.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1];
  if (!name) return null;
  if (name === "rpc") return "rest_rpc_other";
  if (name === "tickets") return u.searchParams.has("key") || u.searchParams.has("id") ? "rest_tickets_ticket"
    : u.searchParams.has("project_id") ? "rest_tickets_board" : "rest_tickets_other";
  if (name === "ticket_comments") return "rest_ticket_comments_comments";
  if (name === "messages") return "rest_messages_messages";
  if (name === "project_guides") return "rest_project_guides_guide";
  if (name === "decisions") return "rest_decisions_decisions";
  const other: Record<string, EfficiencyKey> = {
    projects: "rest_projects_membership", project_members: "rest_project_members_membership",
    profiles: "rest_profiles_identity", agents: "rest_agents_identity", ticket_steps: "rest_ticket_steps_steps",
    ticket_links: "rest_ticket_links_board", members: "rest_members_identity",
    room_members: "rest_room_members_membership", rooms: "rest_rooms_membership",
    task_runs: "rest_task_runs_runs", bulletin: "rest_bulletin_board", read_cursors: "rest_read_cursors_messages",
  };
  if (other[name]) return other[name];
  return "rest_other_other";
}

/** Count UTF-8 bytes in each heading of a rendered prompt, without retaining the text. */
export function promptSections(prompt: string): EfficiencyDelta {
  const out: EfficiencyDelta = {};
  let key: EfficiencyKey = "prompt_other";
  for (const line of prompt.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (/^=== (Your ticket|The ticket) ===/.test(line)) key = "prompt_ticket";
    else if (/^=== Decisions in force ===/.test(line)) key = "prompt_decisions";
    else if (/^=== (Rules |Project brief |The pull request|The diff|What you said)/.test(line) || /^How to review:/.test(line) || /^What to do \(/.test(line)) key = "prompt_other";
    else if (/^## (Concept|Architecture|Rules)\s*$/.test(line.trimEnd())) key = "prompt_guide";
    else if (/^## Decisions in force\s*$/.test(line.trimEnd()) || /^Decisions and contracts this ticket mentions:/.test(line)) key = "prompt_decisions";
    else if (/^## (Board|Your open tickets|Agents|Your job)\s*$/.test(line.trimEnd())) key = "prompt_other";
    else if (/^Comments \(\d+, oldest first\):/.test(line) || /^New comments (on|since)/.test(line)) key = "prompt_comments";
    out[key] = (out[key] ?? 0) + Buffer.byteLength(line);
  }
  return out;
}

export function failureClass(error: unknown): EfficiencyKey {
  const s = String((error as Error)?.message ?? error).toLowerCase();
  if (/conflict|merge conflict/.test(s)) return "fail_conflict";
  if (/\bci\b|check(s)? failed|test(s)? failed/.test(s)) return "fail_ci";
  if (/git|worktree|branch|clone|checkout/.test(s)) return "fail_env_git";
  if (/network|fetch|econn|timeout|unreachable|dns|socket/.test(s)) return "fail_env_network";
  if (/provider|model|rate.limit|quota|api error/.test(s)) return "fail_provider";
  return "fail_other";
}
