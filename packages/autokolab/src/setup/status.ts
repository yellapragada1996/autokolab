import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { waitSubscribed } from "../core/client.js";
import { configPath, profilesOf, readConfigFile } from "../core/config.js";
import { nodeConnect, nodeMajor } from "../core/node.js";
import { loadRunnerConfig, runnerFiles } from "../runner/config.js";
import { findAccess } from "../runner/repos.js";
import { claudeBin, CLIENT_ENGINE, codexConfigPath, which } from "./agents.js";
import { renameLocally } from "./naming.js";
import { serviceStatus } from "./service.js";
import { autoUpdateOn, cloneFacts, readState, statusLine, updatable } from "./update.js";
import { autoMigrateOn, dbStatusLine, isAdminMachine, liveVersion } from "./dbupdate.js";
import { SCHEMA_VERSION } from "./team.js";
import { bold, dim, fail, info, ok, warn } from "./ui.js";

// `autokolab status`: everything about AutoKolab on this machine, with what to do about problems.

/** A gentle note on older Node (a warning, not a problem: Node 20 still works). */
export function nodeVersionNote(version = process.versions.node): string | null {
  return nodeMajor(version) < 22 ? `Node ${version}: Node 22 or newer is recommended; Node 20 support is ending in Supabase.` : null;
}

export async function runStatus(): Promise<boolean> {
  const cfg = readConfigFile();
  console.log(bold("AutoKolab on this machine"));
  if (!cfg.url || !cfg.profiles || !Object.keys(cfg.profiles).length) {
    fail("Not set up. Run `autokolab init` (first person on the team) or `autokolab join <invite>`.");
    return false;
  }
  info(`${cfg.url} · config ${configPath()}${cfg.serviceRoleKey ? " · team admin" : ""}`);
  const nodeNote = nodeVersionNote();
  if (nodeNote) warn(nodeNote);
  let healthy = true;
  const problem = (msg: string) => {
    healthy = false;
    warn(msg);
  };
  const broken = (msg: string) => {
    healthy = false;
    fail(msg);
  };
  const repos = new Set<string>();

  console.log(`\n${bold("Identities")}`);
  for (const p of profilesOf(cfg)) {
    const name = p.name;
    try {
      const ak = await nodeConnect({ url: cfg.url, anonKey: cfg.anonKey!, token: p.token });
      const rooms = ak.rooms().map((r) => `${r.name} (${ak.membership(r.id)?.role})`);
      for (const r of ak.rooms()) if (r.repo) repos.add(r.repo);
      if (ak.me.name !== p.name) renameLocally(p.id, ak.me.name);
      ok(`${ak.me.name}${p.kind === "agent" ? "" : dim(" (you)")}${rooms.length ? ` · ${rooms.join(", ")}` : dim(" · in no rooms yet")}`);
      if (p.kind === "agent") {
        const engine = CLIENT_ENGINE[p.client ?? ""];
        if (engine === "claude") {
          const bin = claudeBin();
          const r = bin ? spawnSync(bin, ["mcp", "get", "autokolab"], { encoding: "utf8" }) : null;
          if (!r) problem("  Claude Code isn't installed");
          else if (r.status !== 0 || !r.stdout.includes(p.id)) problem("  Claude Code isn't connected to AutoKolab: run `autokolab setup`");
        } else if (engine === "codex") {
          const path = codexConfigPath();
          if (!which("codex")) problem("  Codex isn't installed");
          else if (!existsSync(path) || !readFileSync(path, "utf8").includes(`"${p.id}"`)) problem("  Codex isn't connected to AutoKolab: run `autokolab setup`");
        }
        if (ak.me.paused) warn(`  paused (autokolab resume ${ak.me.name})`);
      }
      if (p.id === cfg.me) {
        const ch = ak.onAnyMessage(() => undefined);
        await waitSubscribed(ch, 8000).then(
          () => ok("Live updates work"),
          () => (problem("Live updates didn't connect (messages will still arrive, just slower)")),
        );
      }
      await ak.close();
    } catch (e) {
      healthy = false;
      fail(`${name}: ${(e as Error).message}`);
    }
  }

  const runners = runnerFiles();
  if (runners.length) {
    console.log(`\n${bold("Working while you're away")}`);
    for (const r of runners) {
      try {
        const c = loadRunnerConfig(r);
        ok(`${r} · ${c.engine} · up to ${c.limits.max_minutes} min per instruction · protected: ${c.limits.protected_branches.join(", ")}`);
      } catch (e) {
        healthy = false;
        fail((e as Error).message);
      }
    }
    const s = serviceStatus();
    if (s === "running") ok("Runner service is running");
    else if (s === "stopped") problem("Runner service is installed but stopped: `autokolab service install` restarts it");
    else warn("Runner service isn't installed: agents only work while `autokolab run` is open (`autokolab service install` fixes that)");

    console.log(`\n${bold("Repos")}`);
    for (const repo of repos) {
      if (findAccess(repo)) ok(`github.com/${repo}`);
      else broken(`github.com/${repo}: no access from this machine (accept the GitHub invite or run \`gh auth login\`)`);
    }
  }

  console.log(`\n${bold("Updates")}`);
  const can = updatable(cloneFacts());
  const upd = readState();
  if (!can.ok) info(`Updates: by hand (${can.reason})`);
  else if (upd.failed && upd.result) problem(`${statusLine(autoUpdateOn(cfg), upd)} · ${upd.result}`);
  else ok(statusLine(autoUpdateOn(cfg), upd));
  try {
    const live = await liveVersion(cfg);
    const line = dbStatusLine(live, SCHEMA_VERSION);
    const how = isAdminMachine(cfg) ? (autoMigrateOn(cfg) ? "updates automatically" : "`autokolab db update` applies it") : "the team admin's machine applies it";
    if (live === SCHEMA_VERSION) ok(line);
    else if (live < SCHEMA_VERSION) problem(`${line} (${how})`);
    else problem(line);
  } catch (e) {
    problem(`Database: couldn't read its version (${(e as Error).message})`);
  }

  console.log(healthy ?`\n${bold("All good.")}` : `\n${bold("Some things need attention (above).")}`);
  return healthy;
}
