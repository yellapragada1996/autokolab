#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import type { AutoKolab } from "./core/client.js";
import { readConfigFile, updateConfigFile } from "./core/config.js";
import { formatItem, formatMember, formatMessage, formatWork } from "./core/format.js";
import { connectFromConfig } from "./core/node.js";
import { resolveRoom } from "./core/repo.js";
import { BULLETIN_STATES, MESSAGE_KINDS, type Message } from "./core/types.js";
import { runMcpServer } from "./mcp/server.js";
import { runConnect } from "./setup/pair.js";
import { runAll } from "./runner/runner.js";
import { connectAgents } from "./setup/connect.js";
import { runInit } from "./setup/init.js";
import { runInvite } from "./setup/invite.js";
import { runJoin } from "./setup/join.js";
import { runApp } from "./setup/server.js";
import { installService, serviceStatus, uninstallService } from "./setup/service.js";
import { runStatus } from "./setup/status.js";
import { readState, servicePid, startUpdater, updateNow, type UpdateState } from "./setup/update.js";
import { aheadLine, appliedLine, checkDatabase, databaseOnStart, isAdminMachine, setAutoMigrate, versionLabel } from "./setup/dbupdate.js";
import { notify } from "./setup/notify.js";
import { renameLocally } from "./setup/naming.js";
import { runnerFileFor } from "./runner/config.js";
import { adminClient, loadTeam, revokeMember } from "./setup/team.js";
import { bold, dim, setAssumeYes } from "./setup/ui.js";

const program = new Command();
program
  .name("autokolab")
  .description("A shared chat room and bulletin board for AI coding agents on different machines.")
  .version("0.2.0")
  .addHelpText(
    "after",
    `
Getting started: just run  autokolab  and follow the page that opens in your browser.
(The commands below do the same things from the terminal.)`,
  );

const profileOpt = () => new Option("-p, --profile <name>", "act as this identity (default: you)").hideHelp();
const roomOpt = () => new Option("-r, --room <room>", "room name or repo (default: this folder's repo)");

async function withClient<T>(profile: string | undefined, fn: (ak: AutoKolab) => Promise<T>): Promise<T> {
  const ak = await connectFromConfig(profile);
  try {
    return await fn(ak);
  } finally {
    await ak.close();
  }
}

function fail(e: unknown): never {
  console.error(`\nautokolab: ${(e as Error).message}`);
  process.exit(1);
}

const action =
  <A extends unknown[]>(fn: (...args: A) => Promise<unknown> | unknown) =>
  async (...args: A) => {
    try {
      await fn(...args);
    } catch (e) {
      fail(e);
    }
  };

// ------------------------------------------------------------------ onboarding

program
  .command("init")
  .description("Set up your team (first time) or add the repo you're in as a room")
  .option("--url <url>", "Supabase project URL")
  .option("--public-key <key>", "Supabase publishable (anon) key")
  .option("--secret-key <key>", "Supabase secret (service_role) key")
  .option("--db-url <url>", "database connection string, to set up the tables")
  .option("--name <name>", "your name in the room")
  .option("--no-instructions", "don't add AutoKolab instructions to CLAUDE.md / AGENTS.md")
  .option("--env-file <path>", "read AUTOKOLAB_URL, AUTOKOLAB_ANON_KEY, AUTOKOLAB_SERVICE_ROLE_KEY, AUTOKOLAB_DB_URL from a file")
  .option("-y, --yes", "accept defaults without asking")
  .action(
    action(async (o) => {
      setAssumeYes(!!o.yes);
      if (o.envFile) process.loadEnvFile(o.envFile);
      await runInit({
        url: o.url,
        publicKey: o.publicKey,
        secretKey: o.secretKey,
        dbUrl: o.dbUrl,
        name: o.name,
        instructions: o.instructions === false ? false : o.yes ? true : undefined,
      });
    }),
  );

program
  .command("invite")
  .description("Invite a teammate; prints one line for them (they choose their own names)")
  .option("--lead", "their agents can assign work too (default: they carry out your side's instructions)")
  .option("--rooms <list>", "rooms to add them to (default: all)")
  .option("--days <n>", "invite valid for this many days", (v) => parseInt(v, 10), 7)
  .option("-y, --yes", "accept defaults without asking")
  .action(
    action(async (o) => {
      setAssumeYes(!!o.yes);
      await runInvite({ lead: o.lead ?? (o.yes ? false : undefined), rooms: o.rooms, days: o.days });
    }),
  );

program
  .command("join")
  .description("Join a team with the invite you were sent")
  .argument("<invite>", "the akinv_… code")
  .option("--name <name>", "your name (otherwise you're asked)")
  .option("--agents <list>", "which coding agents you use: claude, codex (default: the ones installed)")
  .option("--no-service", "don't run agents in the background")
  .option("-y, --yes", "accept defaults without asking")
  .action(
    action(async (invite: string, o) => {
      setAssumeYes(!!o.yes);
      await runJoin(invite, { name: o.name, agents: o.agents, service: o.service });
    }),
  );

program
  .command("rename")
  .description("Rename yourself or one of your agents, e.g. autokolab rename my-claude builder")
  .argument("<who>", 'current name (or "me")')
  .argument("<new-name>")
  .action(
    action(async (who: string, newName: string) => {
      const cfg = readConfigFile();
      await withClient(cfg.me, async (ak) => {
        const target = who === "me" ? ak.me : ak.mine().find((m) => m.name === who);
        if (!target) throw new Error(`"${who}" isn't you or one of your agents. Yours: ${ak.mine().map((m) => m.name).join(", ")}`);
        const m = await ak.updateMember(target.id, { name: newName });
        renameLocally(m.id, m.name);
        console.log(`${target.name} is now ${bold(m.name)}.`);
        if (runnerFileFor(m.id) && serviceStatus() === "running") installService();
      });
    }),
  );

program
  .command("setup")
  .description("Reconnect this machine's coding agents (e.g. after installing Codex)")
  .action(
    action(async () => {
      const cfg = readConfigFile();
      await withClient(cfg.me, async (ak) => {
        const runners = connectAgents(ak, cfg);
        if (runners.length && serviceStatus() !== "not-installed") installService();
      });
    }),
  );

program
  .command("open", { isDefault: true })
  .description("Open AutoKolab in your browser: setup, rooms, invites (what `autokolab` alone does)")
  .option("--no-browser", "just print the address")
  .option("--invite <code>", "open the join page with this invite filled in")
  .action(action(async (o) => runApp({ noBrowser: o.browser === false, invite: o.invite })));

program
  .command("status")
  .description("Check everything about AutoKolab on this machine")
  .action(
    action(async () => {
      process.exitCode = (await runStatus()) ? 0 : 1;
    }),
  );

// ------------------------------------------------------------------ the room

program
  .command("post")
  .description('Post a message, e.g. autokolab post --to builder --kind task "Add CSV export"')
  .argument("[text...]", "message text (reads stdin if omitted)")
  .addOption(roomOpt())
  .addOption(profileOpt())
  .option("-t, --to <member>", "send to one member (default: everyone)")
  .addOption(new Option("-k, --kind <kind>", "message kind").choices([...MESSAGE_KINDS]).default("chat"))
  .option("--thread <id>", "reply in a thread", (v) => parseInt(v, 10))
  .action(
    action(async (text: string[], o) => {
      const body = text.length ? text.join(" ") : readFileSync(0, "utf8");
      await withClient(o.profile, async (ak) => {
        const room = resolveRoom(ak, o.room);
        const m = await room.post({ body, kind: o.kind, to: o.to, thread: o.thread });
        console.log(`Posted #${m.id} in ${room.room.name}.`);
      });
    }),
  );

program
  .command("read")
  .description("Show unread messages (or --recent N, or --thread ID)")
  .addOption(roomOpt())
  .addOption(profileOpt())
  .option("--recent <n>", "the last N messages", (v) => parseInt(v, 10))
  .option("--thread <id>", "one thread", (v) => parseInt(v, 10))
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        const room = resolveRoom(ak, o.room);
        let msgs: Message[];
        if (o.thread) msgs = await room.thread(o.thread);
        else if (o.recent) msgs = await room.recent(o.recent);
        else msgs = (await room.read({ limit: 200 })).messages;
        console.log(msgs.length ? msgs.map((m) => formatMessage(ak, m)).join("\n\n") : `No new messages in ${room.room.name}.`);
      });
    }),
  );

program
  .command("board")
  .description("Show the bulletin board")
  .addOption(roomOpt())
  .addOption(profileOpt())
  .addOption(new Option("-s, --state <state>").choices([...BULLETIN_STATES, "active", "all"]).default("active"))
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        const room = resolveRoom(ak, o.room);
        const items = await room.boardList({ state: o.state === "all" ? undefined : o.state });
        console.log(items.length ? items.map((b) => formatItem(ak, b)).join("\n\n") : `Nothing on ${room.room.name}'s board.`);
      });
    }),
  );

program
  .command("work")
  .description("What the agents have worked on: instruction, state, branch, result")
  .addOption(roomOpt())
  .addOption(profileOpt())
  .option("-a, --agent <name>", "only this agent")
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        const room = resolveRoom(ak, o.room);
        const entries = await room.workLog({ agent: o.agent, limit: 30 });
        console.log(entries.length ? entries.map((e) => formatWork(ak, e)).join("\n\n") : `No agent work in ${room.room.name} yet.`);
      });
    }),
  );

program
  .command("members")
  .description("Who's in the room")
  .addOption(roomOpt())
  .addOption(profileOpt())
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        const room = resolveRoom(ak, o.room);
        console.log(bold(room.room.name) + (room.room.repo ? dim(` · github.com/${room.room.repo}`) : ""));
        for (const m of room.members()) console.log(`  ${formatMember(ak, m)}`);
      });
    }),
  );

program
  .command("whoami")
  .description("Who you are on this computer, and your rooms")
  .addOption(profileOpt())
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        console.log(`${bold(ak.me.name)}${ak.me.kind === "agent" ? ` (${ak.ownerName(ak.me)}'s agent)` : ""}`);
        for (const r of ak.rooms()) {
          const m = ak.membership(r.id);
          console.log(`  ${r.name}${r.repo ? dim(` · github.com/${r.repo}`) : ""} · ${m?.role}${m?.can_instruct ? ", can instruct" : ""}`);
        }
        const mine = ak.mine().filter((m) => m.id !== ak.me.id);
        if (mine.length) console.log(`  Agents: ${mine.map((m) => m.name).join(", ")}`);
      });
    }),
  );

program
  .command("rooms")
  .description("Your rooms (one per repo)")
  .addOption(profileOpt())
  .action(
    action(async (o) => {
      await withClient(o.profile, async (ak) => {
        for (const r of ak.rooms()) console.log(`${r.name}${r.repo ? dim(` · github.com/${r.repo}`) : ""} · ${ak.membersOf(r.id).length} members`);
        if (!ak.rooms().length) console.log("You aren't in any room yet.");
      });
    }),
  );

program
  .command("watch")
  .description("Follow all your rooms live; --notify for desktop notifications")
  .addOption(profileOpt())
  .option("-n, --notify", "desktop notifications for messages to you or your agents")
  .action(
    action(async (o) => {
      const ak = await connectFromConfig(o.profile);
      const mine = () => new Set(ak.mine().map((m) => m.id));
      let last = await ak.firstMessageIdSince(new Date(Date.now() - 3600_000).toISOString());
      const flush = async () => {
        for (const m of await ak.messagesAfter(last)) {
          last = m.id;
          await ak.memberFresh(m.sender_id);
          console.log(formatMessage(ak, m, { showRoom: ak.rooms().length > 1 }) + "\n");
          const forMe = m.to_id && mine().has(m.to_id);
          const important = ["status", "question", "review", "handoff", "decision"].includes(m.kind);
          if (o.notify && m.sender_id !== ak.me.id && (forMe || important)) notify(`${ak.nameOf(m.sender_id)} · ${m.kind}`, m.body.slice(0, 200));
        }
      };
      await flush();
      ak.onAnyMessage(() => void flush().catch(() => undefined));
      setInterval(() => void flush().catch(() => undefined), 30_000);
      setInterval(() => void ak.heartbeat().catch(() => undefined), 60_000);
      console.log(dim(`Watching ${ak.rooms().map((r) => r.name).join(", ")} as ${ak.me.name}. Ctrl-C to stop.`));
    }),
  );

for (const [name, paused] of [["pause", true], ["resume", false]] as const) {
  program
    .command(name)
    .description(paused ? "Pause one of your agents (stops its current task; new ones wait)" : "Resume a paused agent")
    .argument("[agent]", "agent name (default: all your agents)")
    .addOption(profileOpt())
    .action(
      action(async (agent: string | undefined, o) => {
        await withClient(o.profile, async (ak) => {
          const targets = agent ? [agent] : ak.mine().filter((m) => m.kind === "agent").map((m) => m.name);
          if (!targets.length) throw new Error("You have no agents.");
          for (const t of targets) {
            const m = await ak.setPaused(t, paused);
            console.log(`${m.name} ${m.paused ? "paused" : "resumed"}.`);
          }
        });
      }),
    );
}

// ------------------------------------------------------------------ running agents

program
  .command("run")
  .description("Carry out instructions for this machine's agents (the background service runs this)")
  .argument("[agents...]", "only these agents")
  .action(
    action(async (agents: string[]) => {
      const runners = await runAll(agents);
      startUpdater(runners);
      void databaseOnStart((msg) => runners.forEach((r) => r.note(msg)));
      let stopping = false;
      const shutdown = async () => {
        if (stopping) process.exit(1);
        stopping = true;
        console.log("Stopping…");
        await Promise.all(runners.map((r) => r.stop()));
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    }),
  );

const service = program.command("service").description("The background runner service");
service
  .command("install")
  .description("Run this machine's agents in the background, starting automatically")
  .action(
    action(() => {
      const s = installService();
      console.log(s.message + (s.logs ? `\nLogs: ${s.logs}` : ""));
      if (!s.ok) process.exitCode = 1;
    }),
  );
service.command("uninstall").description("Stop and remove the background service").action(action(() => console.log(uninstallService())));
service.command("status").action(action(() => console.log(serviceStatus())));
program
  .command("restart")
  .description("Restart the background runner (after editing limits)")
  .action(
    action(() => {
      if (serviceStatus() === "not-installed") throw new Error("No background service. Start it with `autokolab service install`.");
      console.log(installService().message);
    }),
  );

program
  .command("update")
  .description("Update AutoKolab on this machine now (it also updates itself when idle)")
  .option("--off", "stop automatic updates on this machine")
  .option("--on", "turn automatic updates back on")
  .action(
    action(async (o: { on?: boolean; off?: boolean }) => {
      if (o.on || o.off) {
        updateConfigFile((c) => void (c.auto_update = !!o.on));
        console.log(o.on ? "Automatic updates are on." : "Automatic updates are off. `autokolab update` still updates by hand.");
        return;
      }
      const pid = serviceStatus() === "running" ? servicePid() : null;
      if (pid) {
        // The service knows whether an agent is mid-run, so it does the update and restarts itself.
        const before = readState().result_at;
        process.kill(pid, "SIGUSR2");
        console.log("Asked the background runner to update now…");
        const answer = await waitForResult(before, 15 * 60_000);
        console.log(answer?.result ?? "No answer yet. `autokolab status` shows how it went.");
        if (answer?.failed) process.exitCode = 1;
        return;
      }
      console.log("Checking for updates…");
      const r = await updateNow({ log: (m) => console.log(m) });
      if (r.kind === "skipped") console.log(`Not updating: ${r.reason}.`);
      else if (r.kind === "up-to-date") console.log(`Already up to date (${r.version}).`);
      else if (r.kind === "failed") {
        console.log(`Update failed: ${r.reason}`);
        process.exitCode = 1;
      } else if (r.kind === "updated") {
        console.log(`Updated from ${r.from} to ${r.version}.`);
        if (serviceStatus() !== "not-installed") console.log(installService().message);
      }
    }),
  );

/** Wait for the service to write a new result to the update state. */
async function waitForResult(before: string | undefined, ms: number): Promise<UpdateState | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = readState();
    if (s.result_at && s.result_at !== before) return s;
  }
  return null;
}

const db = program.command("db").description("AutoKolab's database (the team admin's machine)");
db.command("update")
  .description("Apply pending database updates now, all in one transaction")
  .option("--on", "apply database updates automatically when this helper starts")
  .option("--off", "stop applying them automatically (the default)")
  .action(
    action(async (o: { on?: boolean; off?: boolean }) => {
      if (o.on || o.off) {
        setAutoMigrate(!!o.on);
        console.log(
          o.on
            ? "Database updates are automatic: when this helper starts or updates itself, it applies any pending ones and says so in the room."
            : "Automatic database updates are off. `autokolab db update` still applies them by hand.",
        );
        if (o.on && !isAdminMachine()) console.log("This only takes effect on the team admin's machine (with the secret key and AUTOKOLAB_DB_URL).");
        return;
      }
      const r = await checkDatabase({ byHand: true, log: (m) => console.log(m) });
      if (r.kind === "applied") console.log(appliedLine(r.live, r.version));
      else if (r.kind === "up-to-date") console.log(`The database is up to date (version ${r.version}).`);
      else if (r.kind === "ahead") {
        console.log(aheadLine(r.live, r.helper));
        process.exitCode = 1;
      } else {
        console.log(
          `The database needs ${versionLabel(r.live, r.helper)}, but this isn't the team admin's machine ` +
            "(it needs the Supabase secret key and AUTOKOLAB_DB_URL). Ask your admin to run `autokolab db update`.",
        );
        process.exitCode = 1;
      }
    }),
  );

program
  .command("connect <code>")
  .description("Connect this computer's agents to a project (the website gives you this line)")
  .option("--site <url>", "the AutoKolab website", undefined)
  .action(async (code: string, o: { site?: string }) => {
    await runConnect(code, { site: o.site }).catch((e) => {
      console.error(`\n  ${(e as Error).message}\n`);
      process.exit(1);
    });
  });

program
  .command("mcp")
  .description("MCP server for Claude Code / Codex (they start it; not for typing)")
  .addOption(profileOpt())
  .option("-r, --room <room>", "fixed room instead of detecting from the repo")
  .option("--project <project>", "fixed project instead of detecting from the repo")
  .action(async (o) => {
    await runMcpServer(o.profile, o.room, o.project).catch((e) => {
      console.error(`autokolab mcp: ${(e as Error).message}`);
      process.exit(1);
    });
  });

// ------------------------------------------------------------------ team admin

program
  .command("team")
  .description("Everyone on the team and their rooms (admin machine)")
  .action(
    action(async () => {
      const t = await loadTeam(adminClient());
      for (const r of t.rooms) {
        console.log(bold(r.name) + (r.repo ? dim(` · github.com/${r.repo}`) : ""));
        for (const rm of t.memberships.filter((x) => x.room_id === r.id)) {
          const m = t.members.find((x) => x.id === rm.member_id)!;
          const names = { nameOf: (id: string) => t.members.find((x) => x.id === id)?.name ?? "?" };
          console.log(`  ${m.revoked ? "[removed] " : ""}${formatMember(names, { ...m, role: rm.role, can_instruct: rm.can_instruct })}`);
        }
      }
    }),
  );

program
  .command("remove")
  .description("Remove a person or agent from the team (their token stops working at once)")
  .argument("<name>")
  .action(
    action(async (name: string) => {
      const m = await revokeMember(name);
      console.log(`Removed ${m.name}. To bring someone back, send a new \`autokolab invite\`.`);
    }),
  );

program.parseAsync().catch(fail);
