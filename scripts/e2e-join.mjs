import { readFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
// End-to-end test of joining, against a real AutoKolab backend (the one in .env, with its service key):
// a project and its room, invite links, joining, connecting a computer's agents through the real
// /api/connect handler, reusing an agent, refusing other people's codes, and the lead. Everything
// runs as throwaway accounts and is deleted at the end. Needs Node 22+ and a built helper:
//   npm run build -w autokolab && node --experimental-strip-types scripts/e2e-join.mjs
//   E2E_SITE=https://autokolab.vercel.app node --experimental-strip-types scripts/e2e-join.mjs   (the live site)
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const env = Object.fromEntries(readFileSync(`${ROOT}/.env`, "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "ak-join-cfg-"));   // isolated helper config
process.env.XDG_STATE_HOME = mkdtempSync(join(tmpdir(), "ak-join-state-"));
import { createRequire } from "node:module";
const req = createRequire(ROOT + "/package.json");
const { createClient } = await import(req.resolve("@supabase/supabase-js"));
const { supabaseOrigin } = await import(`${ROOT}/packages/autokolab/dist/core/config.js`);
const URL_ = supabaseOrigin(env.AUTOKOLAB_URL), ANON = env.AUTOKOLAB_ANON_KEY, SERVICE = env.AUTOKOLAB_SERVICE_ROLE_KEY;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const tag = randomBytes(3).toString("hex");
const cleanup = { users: [], projects: [], rooms: [] };
let pass = 0;
const ok = (c, m) => { if (!c) throw new Error("FAILED: " + m); pass++; console.log("  ✓", m); };
const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

async function person(login) {
  const password = randomBytes(18).toString("base64url");
  const email = `jt-${login}-${tag}@autokolab.example.com`;
  const u = must(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { provider: "github" }, user_metadata: { user_name: `${login}-${tag}` } })).user;
  cleanup.users.push(u.id);
  const prof = must(await admin.from("profiles").select("id").eq("id", u.id).maybeSingle());
  if (!prof) must(await admin.from("profiles").insert({ id: u.id, github_login: `${login}-${tag}`, name: login, onboarded: true }));
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  must(await sb.auth.signInWithPassword({ email, password }));
  return { id: u.id, sb };
}

let server;
try {
  const owner = await person("owner");
  const joiner = await person("joiner");
  const outsider = await person("outsider");

  // 1. Owner creates a project on the website: it gets a room, owner is in it.
  const project = must(await owner.sb.rpc("create_project", { p_name: `Join Test ${tag}`, p_repo: "", p_prefix: "JT" }));
  cleanup.projects.push(project.id); cleanup.rooms.push(project.room_id);
  ok(!!project.room_id, "a new project gets its room");
  ok((must(await owner.sb.from("room_members").select("member_id").eq("room_id", project.room_id))).length === 1, "the owner is in the room");

  // 2. Invite link, readable before signing in.
  const inv = must(await owner.sb.rpc("create_invite", { p_project: project.id, p_days: 7 }));
  const code = `${inv.code.slice(0, 4)}-${inv.code.slice(4)}`.toLowerCase();
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const peek = must(await anon.rpc("peek_project_invite", { p_code: code }));
  ok(peek.project === project.name && peek.valid && peek.people === 1, "the join page can show the invite before sign-in");
  ok((await joiner.sb.rpc("create_invite", { p_project: project.id })).error, "only the owner makes invites");

  // 3. The joiner signs in and joins: project + room, and can read the room.
  ok(must(await joiner.sb.rpc("accept_invite", { p_code: code })).id === project.id, "joining with the link");
  const joinerProjects = must(await joiner.sb.from("projects").select("id, room_id"));
  ok(joinerProjects.some((p) => p.id === project.id), "the joiner sees the project");
  ok(must(await joiner.sb.from("rooms").select("id").eq("id", project.room_id)).length === 1, "the joiner sees the room");
  must(await joiner.sb.rpc("web_post", { p_room: project.room_id, p_body: "Hello from the join test" }));
  ok(must(await owner.sb.from("messages").select("id").eq("room_id", project.room_id)).length === 1, "the joiner posts in the room and the owner sees it");

  // 4. The joiner connects a computer: a new Codex agent through the real server function.
  const pairing = must(await joiner.sb.rpc("create_pairing", { p_project: project.id }));
  const { default: handler } = await import(`${ROOT}/apps/site/api/connect.ts`);
  process.env.VITE_SUPABASE_URL = URL_; process.env.VITE_SUPABASE_ANON_KEY = ANON; process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const r = { statusCode: 200, status(n) { this.statusCode = n; return this; }, setHeader: (k, v) => res.setHeader(k, v), json(b) { res.writeHead(this.statusCode, { "content-type": "application/json" }); res.end(JSON.stringify(b)); } };
    await handler({ method: req.method, body: JSON.parse(body || "{}") }, r);
  }).listen(0);
  // E2E_SITE=https://… tests a deployed site's /api/connect instead of the local handler.
  const site = process.env.E2E_SITE ?? `http://127.0.0.1:${server.address().port}`;
  console.log(`  (connect service: ${site})`);
  const { runConnect } = await import(`${ROOT}/packages/autokolab/dist/setup/pair.js`);
  const first = await runConnect(pairing.code, { site, engines: ["codex"], setupTools: false });
  const agent = first.agents[0];
  for (const a of first.agents) cleanup.users.push(a.id);
  ok(first.agents.length === 1 && agent.created && agent.name === `joiner-${tag}-codex`, `a new agent was created: ${agent?.name}`);
  const cfg = JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME, "autokolab", "config.json"), "utf8"));
  ok(cfg.profiles[agent.id]?.token?.startsWith("ak1.") && cfg.url && cfg.anonKey, "its sign-in is saved on the computer");
  const agentsSeen = must(await owner.sb.from("agents").select("id, owner_profile_id, display_name").eq("id", agent.id));
  ok(agentsSeen[0]?.owner_profile_id === joiner.id, "the owner sees the new agent, belonging to the joiner");
  const rm = must(await admin.from("room_members").select("role, can_instruct").eq("room_id", project.room_id).eq("member_id", agent.id));
  ok(rm[0]?.role === "follower" && !rm[0].can_instruct, "the agent is in the room as a worker");

  // 5. Running the line again: the existing agent joins with its own sign-in; nothing new is made.
  const second = await runConnect(pairing.code, { site, engines: ["codex"], setupTools: false });
  ok(second.agents.length === 1 && second.agents[0].id === agent.id && !second.agents[0].created, "running it again reuses the agent");

  // 6. Someone else's code can't take the joiner's agent.
  const other = must(await owner.sb.rpc("create_pairing", { p_project: project.id }));
  await runConnect(other.code, { site, engines: ["codex"], setupTools: false }).then(() => ok(false, "foreign code accepted"), (e) => ok(/someone else/.test(e.message), "another person's code can't take this agent"));
  ok((await outsider.sb.rpc("create_pairing", { p_project: project.id })).error, "outsiders can't make pairing codes");
  const bad = await fetch(`${site}/api/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "ZZZZZZZZ", agents: [{ vendor: "codex" }] }) });
  ok(bad.status === 410, "an unknown code is refused before anything is created");

  // 7. The owner makes it the lead: it leads the room.
  must(await owner.sb.from("projects").update({ lead_agent_id: agent.id }).eq("id", project.id));
  const rl = must(await admin.from("room_members").select("role, can_instruct").eq("room_id", project.room_id).eq("member_id", agent.id));
  ok(rl[0]?.role === "lead" && rl[0].can_instruct, "the lead leads the room");

  // 8. The agent itself sees its project.
  const { connectFromConfig } = await import(`${ROOT}/packages/autokolab/dist/core/node.js`);
  const { ProjectView } = await import(`${ROOT}/packages/autokolab/dist/core/projects.js`);
  const ak = await connectFromConfig(agent.id);
  const pv = await ProjectView.find(ak.sb, ak.me.id, project.slug);
  ok(pv?.iAmLead && (await pv.brief()).includes("You are the lead"), "the agent's project brief says it's the lead");
  await ak.close();
  console.log(`\nALL ${pass} JOIN CHECKS PASSED`);
} finally {
  server?.close();
  // Clean up everything this test made.
  for (const p of cleanup.projects) await admin.from("projects").delete().eq("id", p);
  for (const r of cleanup.rooms) if (r) { await admin.from("messages").delete().eq("room_id", r); await admin.from("room_members").delete().eq("room_id", r); await admin.from("rooms").delete().eq("id", r); }
  for (const u of [...cleanup.users].reverse()) { await admin.from("agents").delete().eq("id", u); await admin.from("members").delete().eq("id", u); await admin.from("members").delete().eq("profile_id", u); await admin.auth.admin.deleteUser(u); }
  const left = must(await admin.from("projects").select("id").like("name", `Join Test ${tag}%`));
  console.log(`cleanup: ${left.length === 0 ? "done" : "LEFTOVERS " + left.length}`);
  process.exit(0);
}
