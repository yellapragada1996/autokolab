import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { readConfigFile } from "../core/config.js";
import type { InvitePayload } from "../core/invite.js";
import { detectRepo } from "../core/repo.js";
import type { Room } from "../core/types.js";
import { CLI_PATH, ENGINE_CLIENT, type Engine } from "./agents.js";
import { addToRoom, adminClient, createInvite, issueMember, loadTeam } from "./team.js";
import { bold, confirm, cyan, dim, ok } from "./ui.js";

// `autokolab invite`: makes a seat for one teammate (them plus a Claude Code and a Codex agent),
// adds it to the rooms, and prints one line for them. They choose their own name and their agents'
// names when they join, and keep only the agents they use.

export interface InviteOptions {
  lead?: boolean;
  rooms?: string;
  days?: number;
}

const ENGINES: Engine[] = ["claude", "codex"];

export async function runInvite(opts: InviteOptions): Promise<void> {
  const cfg = readConfigFile();
  const sb = adminClient();
  const team = await loadTeam(sb);
  if (!team.rooms.length) throw new Error("There are no rooms yet. Run `autokolab init` inside a repo first.");

  const lead = opts.lead ?? !(await confirm("Should their agents carry out instructions from your side? (No = they can assign work too)"));
  const rooms = pickRooms(team.rooms, opts.rooms);

  // Placeholder names until they choose their own at `autokolab join`.
  const seat = `new-${randomBytes(3).toString("hex")}`;
  const payload: InvitePayload = { tokens: {}, members: [], invitedBy: team.members.find((m) => m.id === cfg.me)?.name ?? "your team" };
  const person = await issueMember({ name: seat, kind: "human", client: "web" }, team, sb);
  const seats = [{ client: "web", issued: person }];
  for (const e of ENGINES) {
    const issued = await issueMember({ name: `${seat}-${e}`, kind: "agent", client: ENGINE_CLIENT[e], ownerId: person.member.id }, team, sb);
    seats.push({ client: ENGINE_CLIENT[e], issued });
  }
  for (const s of seats) {
    const m = s.issued.member;
    payload.tokens[m.id] = s.issued.token;
    payload.members.push({ id: m.id, kind: m.kind, client: s.client });
    for (const room of rooms) {
      if (m.kind === "human") await addToRoom(room.id, m.id, "human", lead, team, sb);
      else await addToRoom(room.id, m.id, lead ? "lead" : "follower", lead, team, sb);
    }
  }

  const { invite, expires } = await createInvite({ url: cfg.url!, anonKey: cfg.anonKey!, payload, days: opts.days ?? 7, label: seat }, sb);
  ok(`Invite ready for ${rooms.map((r) => bold(r.name)).join(", ")}; their agents will ${lead ? "be able to assign work too" : "carry out your side's instructions"}`);
  console.log(`\nSend this privately (a direct message). It works once, until ${expires.toDateString()}.`);
  console.log(dim("They'll pick their own name and their agents' names when they join.\n"));
  console.log(dim("  ┌─────────────────────────────────────────────────────────"));
  const source = detectRepo(dirname(CLI_PATH));
  if (source) {
    console.log(dim("  │ ") + "Install AutoKolab (needs Node.js 20+ and git):");
    console.log(dim("  │ ") + cyan(`git clone https://github.com/${source}.git ~/.autokolab && ~/.autokolab/scripts/install.sh`));
    console.log(dim("  │"));
    console.log(dim("  │ ") + "Then join:");
  } else {
    console.log(dim("  │ ") + "Install AutoKolab (README → Install), then join:");
  }
  console.log(dim("  │ ") + cyan(`autokolab join ${invite}`));
  console.log(dim("  └─────────────────────────────────────────────────────────"));
}

function pickRooms(all: Room[], spec?: string): Room[] {
  if (!spec || spec === "all") return all;
  return spec.split(",").map((n) => {
    const r = all.find((x) => x.name === n.trim() || x.repo === n.trim().toLowerCase());
    if (!r) throw new Error(`No room "${n}". Rooms: ${all.map((x) => x.name).join(", ")}`);
    return r;
  });
}

export function parseEngines(text: string): Engine[] {
  const out = new Set<Engine>();
  for (const part of text.split(/[,;/+&]|\band\b/).map((x) => x.trim()).filter(Boolean)) {
    const p = part.toLowerCase();
    if (p.includes("claude")) out.add("claude");
    else if (p.includes("codex")) out.add("codex");
    else throw new Error(`Unknown agent "${part}". Use claude and/or codex.`);
  }
  if (!out.size) throw new Error("Pick at least one agent: claude, codex.");
  return [...out];
}
