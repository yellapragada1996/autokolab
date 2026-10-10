import { readConfigFile, supabaseOrigin, updateConfigFile, writeConfigFile } from "../core/config.js";
import { detectRepo, gitRoot, roomNameFor } from "../core/repo.js";
import { connectFromConfig } from "../core/node.js";
import { ENGINE_CLIENT, installedEngines, writeInstructions } from "./agents.js";
import { connectAgents, ENGINE_LABEL } from "./connect.js";
import { localTimezone, suggestedPersonName } from "./naming.js";
import {
  addToRoom,
  adminClient,
  applySchema,
  checkPublicKey,
  ensureRoom,
  issueMember,
  loadTeam,
  schemaFiles,
  schemaVersion,
  SCHEMA_VERSION,
  usualRole,
  type Team,
} from "./team.js";
import { ask, bold, confirm, cyan, dim, info, NAME_RULE, ok, pressEnter, step, warn } from "./ui.js";

// `autokolab init`: the first person's one-time setup, and how any repo is added later.
// Run it inside a repo. Each part is skipped when it's already done, so re-running is safe.

export interface InitOptions {
  url?: string;
  publicKey?: string;
  secretKey?: string;
  dbUrl?: string;
  name?: string;
  instructions?: boolean;
}

export async function runInit(opts: InitOptions): Promise<void> {
  console.log(bold("AutoKolab setup") + dim("  (safe to re-run; finished steps are skipped)"));
  const cfg = readConfigFile();

  // ------------------------------------------------------------ 1. Supabase
  step(1, 4, "Your team's Supabase project");
  const env = (k: string) => process.env[k]?.trim() || undefined;
  let url = opts.url ?? env("AUTOKOLAB_URL") ?? cfg.url;
  let publicKey = opts.publicKey ?? env("AUTOKOLAB_ANON_KEY") ?? cfg.anonKey;
  let secretKey = opts.secretKey ?? env("AUTOKOLAB_SERVICE_ROLE_KEY") ?? cfg.serviceRoleKey;
  if (!(url && publicKey && secretKey)) {
    info("Supabase → your project → Project Settings → API keys (and Data API for the URL).");
    url = await ask("Project URL", url, { required: true, validate: (v) => (/^https:\/\/.+/.test(v) ? null : "It starts with https://") });
    publicKey = await ask("Publishable key (or anon key)", publicKey, { required: true });
    secretKey = await ask("Secret key (or service_role key), stays on this machine", undefined, { hidden: true, required: true });
  }
  url = supabaseOrigin(url!);
  ok(`Using ${url}`);
  const sb = adminClient(url, secretKey!);
  let version = await schemaVersion(sb);
  if (version >= SCHEMA_VERSION) {
    ok("Database is ready");
  } else {
    info(version ? "The database needs an update." : "The database needs AutoKolab's tables (one-time).");
    let dbUrl = opts.dbUrl ?? env("AUTOKOLAB_DB_URL");
    if (!dbUrl) {
      info("Supabase → Connect (top bar) → Session pooler → copy the URI, with your database password filled in.");
      dbUrl = await ask("Database connection string (or press Enter to do it by hand)");
    }
    if (dbUrl) {
      version = await applySchema(dbUrl, version);
      ok("Database set up");
    } else {
      const files = schemaFiles().filter((f) => f.version > version);
      info("Open Supabase → SQL Editor, paste and run this file:");
      for (const f of files) console.log(`    ${cyan(f.path)}`);
      await pressEnter("Press Enter when it has run…");
    }
    for (let i = 0; i < 10 && (await schemaVersion(sb)) < SCHEMA_VERSION; i++) await new Promise((r) => setTimeout(r, 1000));
    if ((await schemaVersion(sb)) < SCHEMA_VERSION) throw new Error("The database still isn't set up. Run `autokolab init` again once it is.");
  }
  await checkPublicKey(url, publicKey!);
  writeConfigFile({ ...readConfigFile(), url, anonKey: publicKey, serviceRoleKey: secretKey });
  ok("Keys saved on this machine (readable only by you)");
  if (readConfigFile().auto_migrate === undefined) {
    info("When a new AutoKolab version needs a database update, this machine can apply it by itself when its helper starts");
    info("(all in one transaction, then one line in the room). It needs AUTOKOLAB_DB_URL in the environment or the helper's .env.");
    const on = await confirm("Apply database updates automatically from this machine?", false);
    updateConfigFile((c) => void (c.auto_migrate = on));
    ok(on ? "Database updates are automatic" : "Database updates wait for `autokolab db update` (you'll get a line in the room)");
  }

  // ------------------------------------------------------------ 2. You and your agents
  step(2, 4, "You and your agents");
  const team = await loadTeam(sb);
  const myAgents = await setUpMe(team, sb, opts.name);
  const meId = readConfigFile().me!;

  // ------------------------------------------------------------ 3. This repo
  step(3, 4, "This repo");
  const repo = detectRepo();
  const root = gitRoot();
  if (!repo) {
    warn("This folder isn't a GitHub repo, so no room was created. Run `autokolab init` inside a repo to add it.");
  } else {
    const { room, created } = await ensureRoom(repo, roomNameFor(repo), team, sb);
    ok(`${created ? "Created" : "Found"} room ${bold(room.name)} for github.com/${repo}`);
    await addToRoom(room.id, meId, "human", true, team, sb);
    for (const a of myAgents) await addToRoom(room.id, a.id, "lead", true, team, sb);
    ok(`You${myAgents.length ? ` and ${myAgents.map((a) => a.name).join(", ")}` : ""} lead this room`);

    const others = team.members.filter((m) => !m.revoked && m.owner_id !== meId && !team.memberships.some((x) => x.room_id === room.id && x.member_id === m.id));
    if (others.length) {
      const people = [...new Set(others.map((m) => team.members.find((p) => p.id === m.owner_id)?.name ?? "?"))];
      if (await confirm(`Also add ${people.join(", ")} and their agents to this room?`)) {
        for (const m of others) {
          const usual = usualRole(team, m.id) ?? { role: m.kind === "agent" ? "follower" : "human", canInstruct: false };
          await addToRoom(room.id, m.id, usual.role, usual.canInstruct, team, sb);
        }
        ok(`Added ${others.map((m) => m.name).join(", ")} (their agents pick up this repo automatically)`);
      }
    }
  }

  // ------------------------------------------------------------ 4. Agents
  step(4, 4, "Connecting your coding agents");
  const ak = await connectFromConfig(meId);
  connectAgents(ak, readConfigFile());
  await ak.close();
  if (root && repo) {
    const wantInstructions = opts.instructions ?? (await confirm("Add AutoKolab instructions to CLAUDE.md and AGENTS.md in this repo?"));
    if (wantInstructions) {
      const changed = writeInstructions(root);
      if (changed.length) ok(`Updated ${changed.join(" and ")}. Commit and push them so everyone's agents read them.`);
      else ok("Instructions already up to date");
    }
  }

  console.log(`\n${bold("Done.")} Next:`);
  console.log(`  ${cyan("autokolab invite <name>")}   invite a teammate and their agents (one line for them to paste)`);
  console.log(`  ${cyan("autokolab open")}            open the room in your browser`);
  console.log(`  ${dim("In Claude Code, try: \"check AutoKolab and assign the first task\"")}`);
}

/**
 * Make sure you and one agent per coding tool on this machine exist, named by you.
 * Returns your agents. Already-set-up identities are kept as they are.
 */
async function setUpMe(team: Team, sb: ReturnType<typeof adminClient>, fixedName?: string): Promise<{ id: string; name: string }[]> {
  const cfg = readConfigFile();
  const tz = localTimezone() ?? null;
  const taken = (n: string) => (team.members.some((m) => m.name === n) ? `"${n}" is already taken. Pick another.` : null);
  const validate = (n: string) => NAME_RULE(n) ?? taken(n);

  let me = cfg.me ? team.members.find((m) => m.id === cfg.me && !m.revoked) : undefined;
  if (me && cfg.profiles?.[me.id]) {
    ok(`You're ${bold(me.name)}`);
  } else {
    const name = fixedName ?? (await ask("Your name (how the team sees you)", suggestedPersonName(), { required: true, validate }));
    const { member, token } = await issueMember({ name, kind: "human", client: "web", timezone: tz }, team, sb);
    me = member;
    updateConfigFile((c) => {
      c.me = member.id;
      c.profiles = { ...c.profiles, [member.id]: { token, name, kind: "human", client: "web" } };
    });
    ok(`You're ${bold(name)}${tz ? dim(` · ${tz}`) : ""}`);
  }

  const engines = installedEngines();
  if (!engines.length) warn("Neither Claude Code nor Codex is installed here yet; set them up later with `autokolab init` again.");
  const agents: { id: string; name: string }[] = [];
  for (const e of engines) {
    const existing = Object.entries(readConfigFile().profiles ?? {}).find(([, p]) => p.kind === "agent" && p.client === ENGINE_CLIENT[e]);
    if (existing && team.members.some((m) => m.id === existing[0] && !m.revoked)) {
      agents.push({ id: existing[0], name: team.members.find((m) => m.id === existing[0])!.name });
      continue;
    }
    const suggestion = `${me.name}-${e}`;
    const name = fixedName ? suggestion : await ask(`Name your ${ENGINE_LABEL[e]} agent`, taken(suggestion) ? `${suggestion}-2` : suggestion, { required: true, validate });
    const { member, token } = await issueMember({ name, kind: "agent", client: ENGINE_CLIENT[e], ownerId: me.id, timezone: tz }, team, sb);
    updateConfigFile((c) => {
      c.profiles = { ...c.profiles, [member.id]: { token, name, kind: "agent", client: ENGINE_CLIENT[e] } };
    });
    agents.push({ id: member.id, name });
  }
  if (agents.length) ok(`Your agents: ${agents.map((a) => bold(a.name)).join(", ")}`);
  return agents;
}
