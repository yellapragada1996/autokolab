import { readConfigFile, updateConfigFile, writeConfigFile } from "../core/config.js";
import { codeHash, decryptPayload, parseInvite } from "../core/invite.js";
import { connectFromConfig, nodeSupabase } from "../core/node.js";
import { findAccess } from "../runner/repos.js";
import { CLIENT_ENGINE, installedEngines, which, type Engine } from "./agents.js";
import { connectAgents, ENGINE_LABEL } from "./connect.js";
import { chooseName, localTimezone, suggestedPersonName } from "./naming.js";
import { parseEngines } from "./invite.js";
import { installService } from "./service.js";
import { ask, bold, confirm, cyan, dim, info, ok, step, warn } from "./ui.js";

// `autokolab join <invite>`: everything a new teammate needs, in one command. They name
// themselves and their agents here.

export interface JoinOptions {
  name?: string;
  agents?: string;
  service?: boolean;
}

export async function runJoin(inviteText: string, opts: JoinOptions): Promise<void> {
  console.log(bold("Joining AutoKolab"));

  // ------------------------------------------------------------ 1. Redeem
  step(1, 5, "Your invite");
  const link = parseInvite(inviteText);
  const anon = nodeSupabase(link.url, link.anonKey);
  const { data: blob, error } = await anon.rpc("redeem_invite", { code_hash: codeHash(link.code) });
  if (error) throw new Error(error.message.replace(/^.*AUTOKOLAB_INVITE:\s*/, ""));
  const payload = decryptPayload(blob as string, link.code);
  const personSeat = payload.members.find((m) => m.kind === "human")!;

  const cfg = readConfigFile();
  if (cfg.url && cfg.url !== link.url && Object.keys(cfg.profiles ?? {}).length) {
    warn("This machine was set up for a different AutoKolab team; switching to this one.");
    cfg.profiles = {};
  }
  cfg.url = link.url;
  cfg.anonKey = link.anonKey;
  cfg.me = personSeat.id;
  cfg.profiles = { ...cfg.profiles };
  for (const m of payload.members) cfg.profiles[m.id] = { token: payload.tokens[m.id], name: m.id.slice(0, 8), kind: m.kind, client: m.client };
  writeConfigFile(cfg);
  const ak = await connectFromConfig(personSeat.id);
  for (const m of payload.members) updateConfigFile((c) => void (c.profiles![m.id].name = ak.nameOf(m.id)));
  ok(`Invited by ${payload.invitedBy} to ${ak.rooms().map((r) => `${bold(r.name)}${r.repo ? dim(` (github.com/${r.repo})`) : ""}`).join(", ")}`);

  // ------------------------------------------------------------ 2. You
  step(2, 5, "You");
  const me = await chooseName(ak, personSeat.id, "Your name (how the team sees you)", suggestedPersonName(), opts.name);
  const tz = localTimezone();
  if (tz) await ak.updateMember(personSeat.id, { timezone: tz }).catch(() => undefined);
  ok(`You're ${bold(me)}${tz ? dim(` · ${tz}`) : ""}`);

  // ------------------------------------------------------------ 3. Your agents
  step(3, 5, "Your coding agents");
  const seats = payload.members.filter((m) => m.kind === "agent");
  const installed = installedEngines();
  let use: Engine[];
  if (opts.agents) use = parseEngines(opts.agents);
  else if (installed.length) {
    info(`Found ${installed.map((e) => ENGINE_LABEL[e]).join(" and ")} on this machine.`);
    use = installed;
  } else {
    warn("Neither Claude Code nor Codex is installed yet.");
    use = parseEngines(await ask("Which will you use? (claude, codex)", "claude"));
  }
  const kept: string[] = [];
  for (const s of seats) {
    const engine = CLIENT_ENGINE[s.client ?? ""];
    if (!engine) continue;
    if (!use.includes(engine)) {
      await ak.updateMember(s.id, { retire: true });
      updateConfigFile((c) => void delete c.profiles![s.id]);
      continue;
    }
    const name = await chooseName(ak, s.id, `Name your ${ENGINE_LABEL[engine]} agent`, `${me}-${engine}`, opts.name ? `${me}-${engine}` : undefined);
    if (tz) await ak.updateMember(s.id, { timezone: tz }).catch(() => undefined);
    kept.push(name);
  }
  await ak.refresh();
  const followers = connectAgents(ak, readConfigFile());

  // ------------------------------------------------------------ 4. Repos
  step(4, 5, "The shared repos");
  for (const r of ak.rooms()) {
    if (!r.repo) continue;
    if (findAccess(r.repo)) ok(`Can read github.com/${r.repo}`);
    else warn(`Can't read github.com/${r.repo} yet. Accept the GitHub invite to it (or run \`gh auth login\`); your agents will retry.`);
  }
  if (!which("git")) warn("git isn't installed; your agents need it.");
  info("Everyone works on the same repos. Your agents push their work to branches there, so the whole team (people and agents) can read it.");

  // ------------------------------------------------------------ 5. Runner
  step(5, 5, "Working while you're away");
  if (!followers.length) {
    ok("Your agents lead, so there's nothing to run in the background.");
  } else if (opts.service === false) {
    info("Skipped. Start it any time with `autokolab run` (or `autokolab service install`).");
  } else if (await confirm(`Run ${followers.map((f) => f.name).join(" and ")} in the background, so they carry out instructions even when you're away?`)) {
    const s = installService();
    if (s.ok) ok(s.message);
    else warn(s.message);
  } else {
    info("Start it any time with `autokolab run`.");
  }

  for (const r of ak.rooms()) {
    await ak
      .room(r)
      .post({ kind: "chat", body: `${me} joined${kept.length ? ` with ${kept.join(" and ")}` : ""}.` })
      .catch(() => undefined);
  }
  await ak.close();

  console.log(`\n${bold("You're in.")}`);
  console.log(`  ${cyan("autokolab open")}       open the room in your browser`);
  console.log(`  ${cyan("autokolab status")}     check everything on this machine`);
  if (followers.length) console.log(`  ${cyan("autokolab pause")}      stop your agents any time (autokolab resume to continue)`);
  console.log(`  ${cyan("autokolab rename")}     change your name or your agents' names`);
  console.log(dim("\n  You can delete the invite message now; it can't be used again."));
}
