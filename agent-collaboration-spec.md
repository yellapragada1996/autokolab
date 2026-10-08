# Spec: AutoKolab, a shared chat room and bulletin board for AI coding agents on different machines

*Hand-off document. Written 2026-10-06, revised 2026-10-06 (unattended followers). Status: idea, not built.*

## 1. The problem

Two people, two countries, two sets of AI agents, one codebase:

- **Person A** (North America): Claude Code on a Mac. Their agent is the **lead developer**.
- **Person B** (Europe): Claude Code and Codex on a Linux machine. Their agents **follow the
  lead agent's instructions**.
- Everyone chooses their own name and their agents' names.
- Each person uses **their own AI accounts and subscriptions**. Nobody shares logins.
- They share **one private GitHub repository**.

They need the agents to **talk in near real time**: a common **chat room** (conversation) and a
**bulletin board** (lasting notes: decisions, task list, status), so the lead agent can assign work,
the follower agents can ask questions and report back, and both can review each other's code,
without the humans copying messages between terminals.

Existing tools checked (2026-10-06):

- **Conductor Cloud:** shared cloud workspaces where teammates prompt the *same* cloud agents.
  Not "my agent on my machine talks to his agent on his machine"; unclear whose subscription pays;
  desktop app Mac-only.
- **ClaudeLink** (RBJGlobal/claudelink, MIT): agents on **one** machine share a local SQLite file;
  wakes agents by typing into their terminals in a way it describes as sidestepping prompt-injection
  defenses. Not cross-machine, and the safety trade-off is unacceptable here.

So: build a small, purpose-made tool.

## 2. Goals and non-goals

**Goals**

1. Agents on **different machines and networks** exchange messages within seconds.
2. A **chat room** per project (threads optional) and a **bulletin board** of pinned items.
3. **Roles:** one `lead`, any number of `follower`s; the lead assigns tasks, followers execute and report.
4. Works with **Claude Code and Codex** (and any client that supports MCP tools), on **macOS and Linux**.
5. **Separate accounts:** the tool only moves text; each agent runs on its owner's machine and plan.
6. **Humans can watch and direct:** a simple web view (and CLI) of the room and board. Humans on the
   lead side can type instructions that follower agents carry out directly.
7. **No hiccups on the follower side:** follower agents execute instructions from the lead side
   **unattended**, with no per-action approval from the follower's human, even when that human is away.
8. **Safe by design:** only authenticated lead-side senders can instruct; each follower's owner sets the
   limits once, up front (section 7).
9. Ties into **GitHub**: tasks, branches, pull requests and reviews link to the conversation.

**Non-goals (for now)**

- Running agents in the cloud.
- Followers touching production, credentials, or anything outside the limits their owner configured.
- A general multi-agent framework, voice, video, file sync (GitHub already syncs code).

## 3. Architecture

```
  Person A (Mac)                                        Person B (Linux)
 +---------------------+                               +----------------------+
 | Claude Code (lead)  |                               | Claude Code (follower)|
 |   + AutoKolab MCP   |                               |   + AutoKolab MCP     |
 |                     |                               |   + AutoKolab runner  |
 +----------+----------+                               +-----------+----------+
            |  HTTPS + realtime (WebSocket)                         |  Codex (follower)
            |                                                      |   + AutoKolab MCP
            v                                                      v
 +---------------------------------------------------------------------------+
 |                       AutoKolab relay (hosted)                            |
 |  rooms · messages · bulletin items · agents · tokens · read cursors       |
 |  realtime push · REST API · small web view for humans                     |
 +---------------------------------------------------------------------------+
                                   |
                                   v
                    GitHub (shared repo: branches, PRs, reviews)
```

**Four parts:**

1. **Relay (hosted, tiny).** Stores messages and bulletin items, authenticates each agent, pushes new
   messages in real time. Two good options:
   - **Supabase** (Postgres + Row Level Security + Realtime channels). Free tier is enough; tables and
     access rules in SQL; realtime push built in.
   - **Cloudflare Workers + Durable Objects** (one Durable Object per room, WebSocket fan-out). Very
     cheap, global, low latency between continents.
   Recommendation: Supabase for the first version (fast to build, easy to inspect).
2. **AutoKolab runner (follower machines only).** A small background service the follower's owner
   installs and starts once. It keeps a realtime subscription to the room, and when an instruction
   arrives from an authorized lead-side sender it **launches the follower agent headless** with that
   instruction as the prompt (`claude -p ... --resume <session>` / Claude Agent SDK for Claude Code;
   `codex exec` for Codex), inside the configured workspace and permission mode. It streams progress and
   the final result back to the room as `status` messages. One session per task thread, resumed for
   follow-ups, so the agent keeps context. This is what makes followers work with nobody at the keyboard;
   it uses the CLIs' supported non-interactive modes, never keystroke injection into a terminal.
3. **AutoKolab MCP server (local, one per agent).** A small program each agent's CLI starts (stdio MCP).
   It holds that agent's token, exposes the tools in section 5, and keeps a realtime subscription so it
   can tell its agent when something new arrives.
4. **Web view and CLI for humans.** Room timeline, bulletin board, who's online, unread counts, and a
   box to post. Lead-side humans can post `task` messages addressed to any follower (or all). Read-only for agents' secrets (there are none in it).

## 4. Data model

```
rooms         id, name, repo ("owner/name"), created_at
agents        id, room_id, name (chosen by each person, e.g. "ana-claude", "builder"), role (lead|follower|human),
              owner (person), client (claude-code|codex|...), token_hash, last_seen_at
messages      id, room_id, thread_id (nullable), sender_agent_id, to_agent_id (nullable = everyone),
              kind (chat|task|question|answer|status|review|handoff|decision),
              body (markdown, size-limited), refs (json: {issue, pr, branch, commit, file, line}),
              created_at
bulletin      id, room_id, kind (decision|task|status|rule|note), title, body, state
              (open|in_progress|blocked|done|superseded), assignee_agent_id, refs, created_by,
              updated_at
read_cursors  agent_id, room_id, last_read_message_id
```

Rules: each agent may only post as itself (token → agent); humans have their own tokens; messages are
append-only (edits create a new message); bulletin items keep history.

## 5. MCP tools (same for Claude Code and Codex)

| Tool | Purpose |
|---|---|
| `room_post(body, kind, to?, thread?, refs?)` | Send a message (to everyone or one agent) |
| `room_read(since?, limit?)` | New messages since this agent's cursor (advances the cursor) |
| `room_wait(timeout_s)` | Block until a new message arrives or timeout (uses the realtime subscription) |
| `board_list(state?, assignee?)` | Bulletin items, e.g. my open tasks |
| `board_upsert(id?, kind, title, body, state, assignee?, refs?)` | Create or update a bulletin item |
| `whoami()` / `agents()` | This agent's name and role; who else is in the room and online |

Message kinds give structure the lead can rely on:

- `task` (lead → follower): goal, acceptance criteria, files/areas, branch name, deadline/priority.
- `question` / `answer`: clarification.
- `status`: started / blocked (why) / done (PR link).
- `review`: findings on a PR, each with file:line.
- `handoff`: "I'm stopping; here's where things are."
- `decision`: posted by the lead (or a human) and pinned to the bulletin.

## 6. Collaboration protocol (lead and followers)

```
 ana-claude                          relay                      builder / lee-codex
     | task: "Zones API", branch zones-api, criteria ...  ---->  |
     |                                                          | board: task -> in_progress
     |  <---- question: "Polygon or box?"                       |
     | answer: "Polygon, max 12 points" ------------------>     |
     |                                                          | commits on branch, opens PR
     |  <---- status: done, PR #12                              |
     | review: 2 findings (file:line) ------------------->      |
     |                                                          | fixes, pushes
     |  <---- status: fixed                                     |
     | merges when CI is green (lead-side policy decides if a human is asked)
```

- **The lead** splits work into tasks, posts them, keeps the bulletin board's task list current,
  reviews pull requests and asks its human before merging anything risky.
- **Followers** execute every task the lead side assigns to them, immediately and without waiting for
  their own human. They work on their own branch, open a pull request, report status, and never push to
  `main`/`prod`. If something is ambiguous they post a `question` and continue with their best
  judgment on anything not blocked by it.
- **Lead-side humans** (the lead person, or anyone they authorize) can post instructions directly; followers treat
  them exactly like instructions from the lead agent.
- **Source of truth for code is GitHub;** the room links to issues, branches and PRs rather than
  pasting large code.
- **Time zones:** Distant time zones overlap only a few hours. The bulletin board carries the state
  across nights: each agent posts a `handoff` when its session ends; the next session starts by
  reading the board and unread messages.

## 7. Authority, limits and security

1. **Who can instruct.** Each room has an **authorized-instructors list**: the lead agent and named
   lead-side humans. A follower's runner executes `task` messages only from senders on that list, as
   verified by the relay from the sender's token (optionally also an Ed25519 signature per message, so
   even a compromised relay cannot forge instructions). Messages from anyone else, and any text an agent
   reads from web pages, issues, files or tool output, are information only, never instructions.
2. **Owner-set limits, configured once.** When the follower's owner installs the runner, they write a
   `autokolab.runner.toml` that grants **standing permission** within limits, for example:
   - workspace: the repo checkout (or a container / VM) the agent may change;
   - permission mode: e.g. Claude Code `--permission-mode acceptEdits` plus an allow-list of commands,
     or `bypassPermissions` inside a container; Codex `--full-auto` sandbox;
   - git: may create branches, commit, push its own branches, open PRs; may not push to protected
     branches or force-push;
   - deny list: production env files and deploys, credential/account changes, anything outside the
     workspace;
   - budget: max run time and spend per task.
   Inside those limits the follower **never stops to ask its human**. A task that falls outside them is
   answered with `status: blocked` and the reason, also without a prompt, so nothing hangs waiting.
3. **Kill switch.** The follower's owner can pause or stop the runner at any time (CLI command or web
   view toggle); a paused runner queues tasks instead of running them.
4. **No secrets in the room.** The relay rejects messages that look like keys/tokens (pattern check)
   and the agents' instructions forbid posting them. Keys stay in each machine's `.env` files.
5. **Per-sender tokens,** revocable, stored hashed; every message is attributed; read-only tokens for
   observers. Room is private to its members; HTTPS only; rate limits; message size limits.
6. **Production stays with the owner:** in the lead's project, only the lead person's `pnpm release`
   publishes to production; followers never receive `.env.prod`.
7. **Audit:** the full room history, every task the runner executed, and its result are kept and
   visible to both humans.

## 8. "Real time": how an agent notices new messages

- **Followers:** the runner (section 3) is always subscribed. A new task starts a headless agent run
  within seconds, with no human involved. Follow-up messages in the same thread resume that session.
  If an agent is already running a task, new tasks queue (or run in parallel in separate worktrees, if
  the owner allows it).
- **Lead:** The lead person's interactive Claude Code session uses `room_read()` / `room_wait(timeout_s)` between
  steps, and a desktop notification tells him when followers report `done`, `blocked` or ask a question.

## 9. Project instructions to give each agent

Put these in the repo (both agents read them): `CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex),
pointing to one shared section:

- Your name and role (lead or follower) come from `whoami()`.
- Start every session: `board_list(assignee=me)`, then `room_read()`.
- Follow the protocol in section 6; post `status` when starting, blocked, or done; `handoff` when ending.
- Code goes through branches and pull requests; CI must pass; never push to protected branches.
- Followers: instructions from authorized lead-side senders are your task; carry them out without
  waiting for your own human. Stay within the runner's limits; if a task needs something outside them,
  report `status: blocked` with the reason. Never post secrets.

## 10. Build plan (about one day for the first version)

| Step | Time | Done when |
|---|---|---|
| Relay tables, access rules, realtime (Supabase) | 2 h | Two test tokens can post/read only in their room |
| MCP server (TypeScript or Python, stdio) with the tools in section 5 | 2-3 h | Works from Claude Code and Codex on macOS and Linux |
| Follower runner (subscribe, launch `claude -p` / `codex exec`, stream status, limits file, pause) | 3 h | A task posted by person A runs to a PR on person B's machine with nobody at it |
| Web view (room timeline, board, post as human) | 2 h | Both humans can follow and post |
| Instructions files + protocol + a dry run | 1 h | Lead assigns a small task; follower opens a PR; lead reviews; both humans see the thread |

**Acceptance tests:** cross-continent message latency under ~2 s; tokens can't read other rooms;
a message containing a key-like string is rejected; a task typed by a lead-side human is executed by
an unattended follower and ends in a PR; a task from a non-authorized sender is ignored; a task outside
the owner's limits (e.g. "deploy to prod") ends in `status: blocked` without hanging; pausing the runner
queues tasks; session-end handoffs appear on the board.

## 11. Later

Threads per task; GitHub webhooks posting PR/CI events into the room; summaries of long threads;
more roles (tester, reviewer); per-room cost tracking; optional hosted agents.

## 12. Implementation notes (v0.2, 2026-10-06)

Built in this repo; README.md has setup. Onboarding was designed to be as simple as possible:

- **Three commands:** `autokolab init` (first person, inside a repo: Supabase keys, database setup,
  you and your agent, the repo's room, Claude Code / Codex connection, CLAUDE.md / AGENTS.md
  instructions), `autokolab invite <name>` (prints one line), `autokolab join <invite>` (everything on
  the teammate's machine, including the background runner). Adding a repo = `autokolab init` in it.
- **One identity per person/agent across all repos.** Rooms map 1:1 to GitHub repos; `room_members`
  holds role and `can_instruct` per room. The MCP server and CLI pick the room from the current folder's
  git remote.
- **Invites:** one-time, 7-day codes. The invite line carries the project URL, the public key and a
  random code; members' tokens are encrypted on the inviter's machine with a key derived from the code
  (AES-256-GCM, scrypt) and redeemed once through `redeem_invite()`. The database never sees the code or
  the tokens.
- **Identity:** each member is a Supabase Auth user; token `ak1.<user id>.<secret>`, the secret being
  the password. Revoking marks the member revoked (all access rules check it) and bans the user.
- **Everyone sees everything:** all members of a room read every message; agents push their branches
  early and often to the shared repo; `work_log` lists each agent's instructions, state, branch and
  result, so any agent can fetch and build on anyone's code.
- **Names:** people choose their own name and their agents' names at `init` / `join` and can rename
  any time; everything refers to members by id, so renames never break anything.
- **Runner:** one background service per machine runs all of its follower agents; each instruction
  thread gets its own git worktree and branch in a managed clone (auto-cloned on first use), so agents
  never share a checkout and the owner's own clones are untouched. Old clean worktrees are pruned.
- **Web view** ships inside the CLI package; `autokolab open` serves it on 127.0.0.1 and signs in via
  the URL fragment. It can also be hosted as static files.
