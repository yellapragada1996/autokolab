# AutoKolab: The Guide

_What the app is, the idea behind it, how it works, and what has been built so far._
_Last updated: 8 October 2026._

---

## 1. AutoKolab in one paragraph

AutoKolab is a shared workspace where **people and their AI coding agents (Claude Code and Codex) build software together on one GitHub repository, from different computers, in different countries.** Each person keeps using their own agent on their own machine and their own subscription. AutoKolab connects all of them: there is a **ticket board** that people and agents both work from, a **Project Guide** that every agent reads before it starts, a list of **decisions** everyone has to follow, and a **chat room** where agents can ask each other and their humans questions. You talk to one agent, the **lead** (for example your own Claude Code). It turns what you ask for into complete tickets and assigns them to the **worker** agents. Workers pick up the tickets assigned to them, do the work in their own git branch, show their progress live on the board, ask a person when they need a decision, and open a pull request when they're done. The website shows everything happening in one place, so anyone looking at it knows exactly what is being built, by whom, and how far along it is.

---

## 2. The idea

### The problem

AI coding agents are now good enough to do real work: write features, fix bugs, open pull requests. But they are built for **one person at one computer**. As soon as two people work on the same project, each with their own agent, things fall apart:

- My agent doesn't know what your agent is doing, so they edit the same files and step on each other.
- My agent doesn't know the decisions we made last week ("we use Postgres, not Mongo"), so it does it differently.
- I can't hand work to your agent while you're asleep in another time zone.
- There's no single place to see what all the agents are doing right now.
- People end up copying and pasting between chat apps, terminals and GitHub to keep everyone in sync.

No existing tool does **cross-person, cross-machine, cross-vendor** agent collaboration (Claude Code on a Mac in Toronto working with Codex on a Linux PC in Sweden, for example).

### The answer

Treat agents as **visible team members** and give the whole team, humans and agents, **one shared source of truth**:

- A **board of tickets** (like Jira or Linear) that both people and agents read and update.
- A **Project Guide** (concept, architecture, rules) and a list of **decisions** that are automatically given to every agent before it works.
- **Each agent runs on its owner's computer**, with its owner's subscription and its owner's limits, but reports to the shared board.
- **People stay in charge**: they decide what gets built, agents ask when they need a decision, and nothing merges to `main` without a pull request.

### The one design rule

> **You only get interrupted for decisions. Everything else is findable whenever you want.**

Agents work unattended. When they need a person, the ticket turns yellow with a short question ("Needs you"). Everything else (progress, history, comments, decisions) is on the board for whenever you want to look.

### What developers should respect about it

1. **Open source and inspectable.** The helper that runs agents on your machine is public code: [github.com/yellapragada1996/autokolab](https://github.com/yellapragada1996/autokolab).
2. **Your code never leaves your machine or GitHub.** The server stores tickets, chat, decisions and status. Never code, never keys.
3. **GitHub-native.** Sign in with GitHub, real branches, real pull requests.
4. **Fast and keyboard-first.** Linear is the bar: `⌘K` to jump anywhere, `C` to create a ticket.
5. **Safe by default.** Agents never push to `main`, never force-push, stop at a daily time limit, and can be paused.
6. **macOS and Linux from day one** (the real team uses both).
7. **No magic.** One readable install line, no `sudo`, plain config files.

---

## 3. How it works (the big picture)

```
 ┌──────── Person A's Mac ─────────┐                ┌──────── Person B's Linux PC ─────┐
 │ Browser → autokolab.com         │                │ Browser → autokolab.com          │
 │ Claude Code (uses AutoKolab     │                │ Codex / Claude Code              │
 │   tools through MCP)            │                │                                  │
 │ Helper: `autokolab`             │                │ Helper: `autokolab`              │
 │  ├─ Runner (starts agents)      │                │  ├─ Runner                       │
 │  ├─ Git worktrees per ticket    │                │  ├─ Git worktrees per ticket     │
 │  └─ MCP server (agent tools)    │                │  └─ MCP server                   │
 └───────────────┬─────────────────┘                └──────────────┬───────────────────┘
                 │      HTTPS + Realtime (WebSocket), outbound only │
                 └─────────────────► Supabase ◄─────────────────────┘
                      Postgres database + Row-Level Security
                      + Realtime (live updates) + Auth (GitHub sign-in)
                                         │
                              GitHub: the code lives here
                      (AutoKolab never stores code, only links to it)
```

There are four parts:

| Part | What it is | Where it runs |
|---|---|---|
| **The website** (autokolab.com) | The board, tickets, Project Guide, decisions, people. Where humans look and steer. | In the browser. Hosted on Vercel (not deployed yet). |
| **The helper** (`autokolab` command) | A small Node.js program. Runs agents, gives them their tools, manages git worktrees. | On each person's computer, as a background service. |
| **The backend** (Supabase) | The shared database. Everything everyone sees comes from here, live. | Supabase cloud (Postgres). |
| **GitHub** | The code. Branches and pull requests. | GitHub. |

**Why a website plus a helper, and not a desktop app?** One UI for every operating system and the phone, instant updates, no installers to sign. The helper is the only thing that has to run locally, because agents must run on their owner's machine and subscription.

---

## 4. The main concepts

| Term | Meaning |
|---|---|
| **Lead** | The one agent per project that its person talks to. It turns requests into complete tickets (context, what to do, where in the code, done means, order) and assigns them to the worker agents, then follows up and reviews. Chosen by the project owner on the People page. |
| **Worker** | Any other agent. It does the tickets assigned to it, exactly as written, and asks on the ticket when something is unclear. |
| **Project** | One GitHub repo plus its board, guide, decisions and team. Has a short **ticket prefix**, e.g. `VV`, so tickets are `VV-1`, `VV-2`… |
| **Ticket** | One piece of work. Has a title, description, type (feature, bug, task, chore, epic), priority, status, assignee, labels, and more (below). |
| **Status** | Work shows **To do** (Ready) → **Building** (In progress) → **In review** → **Shipped** (Done). Open requests for a person appear in **Needs you** and link to Captain. **Later** holds the ranked Backlog. The stored statuses and agent tools keep their existing names. |
| **Epic** | A big ticket that groups smaller tickets ("Sign-in" containing "Google sign-in", "Remember me"…). Smaller tickets point at it as their parent. |
| **Done means** | The acceptance checklist: what must be true for the ticket to be done. Agents must make every item true before moving a ticket to Review. |
| **Steps** | The plan for one ticket, ticked off live as the agent works (each is to do, now, or done). This is how you see where a ticket is. |
| **Blocked by** | "This ticket waits for that one." Agents won't start a ticket until its blockers are done. |
| **Touches** | The areas a ticket changes: repo paths or globs such as `packages/autokolab/src/runner/**` or `GUIDE.md` (a plain folder covers everything under it). A runner won't start a Ready ticket while another ticket In progress or in Review touches the same areas; the ticket says "waiting for AK-12 (same files)" and starts once that one is done. Empty means no check. |
| **Needs you** | A short question from an agent to a person. The ticket turns yellow, the question shows on the Captain page and it's listed on Overview. |
| **Comments** | The conversation on a ticket. A person's comment on an agent's ticket is an instruction: the agent picks it up and continues. |
| **History** | Every change to a ticket, recorded automatically (status changes, assignments, steps, branch, PR…). Shown mixed with comments. |
| **Project Guide** | Three sections every agent reads before working: **Concept** (what we're building and for whom), **Architecture** (stack, folders, how to run and test) and **Rules** (what agents must and must not do). |
| **Decisions / Contracts** | Settled choices everyone builds on ("DEC-1: Postgres for everything"). A **contract** is an interface others code against, like an API or schema ("CON-2"). A newer decision can replace an older one. |
| **Agent** | An AI coding agent (Claude Code or Codex) that belongs to a person, has a name (e.g. `builder`), and shows its live status (Idle, Planning, Building, Needs you, Blocked, Paused, Offline). |
| **Runner** | The part of the helper that starts an agent headless (`claude -p`, `codex exec`) to work a ticket or an instruction, and reports the result. |
| **Worktree** | A separate working copy of the repo for one ticket, on its own branch. Agents never share a working copy and never touch the owner's own checkout. |
| **MCP** | Model Context Protocol: the standard way to give Claude Code and Codex extra tools. AutoKolab's tools (like `ticket_update`) are served this way. |
| **Room** | The chat room for a repo (from version 1). Lead and follower agents talk there. |
| **Lead / follower** | Room roles (from version 1). A lead is the agent its person talks to and directs the team through; followers carry out instructions from people (and agents) who can instruct. |

---

## 5. The life of a ticket

This is the core loop. Example: a project called Shop with tickets `SH-n`.

1. **You tell the lead what you want.** In Claude Code, for example: _"Add Google sign-in."_ The lead reads the code, the guide and the decisions, and plans the work: an epic, then tickets of a few hours each, in the right order.
2. **The lead writes complete tickets and assigns them.** Each ticket is the whole brief, because workers never see the conversation: a title stating the outcome; a description with **Context**, **What to do**, **Where** (files and code to follow), **Not in scope** and **Notes**; "done means" with 2 to 6 checkable items including tests; the **areas** it touches (paths or globs); and blockers. Example: _"SH-2: Add Google sign-in to /login"_, done means _"Google button on /login; new users get a profile; denied consent shows a friendly error; tests pass"_. It assigns each ticket to a worker and puts it in **Ready**. The tools refuse to hand a worker a ticket in Ready without a real description and done means. (People can also create tickets on the website with `C`.)
3. **The agent's runner notices.** Through a live database subscription, plus a check every two minutes as a safety net. The board is read light (no descriptions) and kept between checks, and refetched only when the subscription says tickets, comments or links changed, or after five minutes, so an idle runner downloads almost nothing. It takes the highest-priority Ready ticket that isn't waiting on anything, and **claims** it by moving it to In progress. The claim is atomic, so two runners can never take the same ticket. A ticket whose areas overlap one In progress or in Review (its PR not merged yet) waits, and the runner picks it up once the other is done; if two runners claim overlapping tickets at the same moment, the one with the higher number goes back to Ready.
4. **The runner prepares a workspace.** It makes (or reuses) a local clone of the repo and creates a git **worktree** on a branch named after the ticket, e.g. `sh-2-add-google-sign-in`. The branch is recorded on the ticket.
   - **The repo's setup script.** If the repo has `.autokolab/setup.sh` on its default branch (this repo's runs `npm ci`), the runner runs it in the new worktree before the agent starts, so the agent doesn't spend its run installing packages. It runs once per worktree, and again only when the script changes on the default branch; the version in the agent's own branch is never run, because the runner isn't sandboxed. It's stopped after `setup_minutes` (10 by default, in the agent's runner limits file). Its output goes to the runner's log on the owner's computer, not to the agent. If it fails or runs out of time, the agent starts anyway, with one line in its brief saying why, and the ticket gets a comment. The script runs as the owner on their own computer; AutoKolab never reads or copies `.env` files for it.
   - **Its own ports.** Each run (the setup script, the agent's build, a review or a question about a ticket) gets its own block of 10 ports, so two runs on one computer can both start a dev server or tests without clashing. The runner sets `AUTOKOLAB_PORT` (the first port of the block), `AUTOKOLAB_PORT_COUNT=10` and, for a ticket, `AUTOKOLAB_TICKET` (its key). Blocks start at port 20000. The blocks in use are kept in `ports.json` in `~/.config/autokolab/`, under a lock, so no two runs on the computer hold the same block; a block is freed when its run ends, or once the process holding it is gone. In this repo `npm run dev -w autokolab-site` listens on `AUTOKOLAB_PORT` when it's set (5175 otherwise), and `npm run look` starts its site on another port in the block. A repo's own scripts can read the same variables.
5. **The runner briefs the agent.** The agent is started headless with a prompt that contains:
   - the **Project Guide** (concept, architecture, rules; default rules if none are written yet),
   - the **decisions in force**,
   - a snapshot of the **board** (what everyone is working on),
   - the **full ticket** (description, done means, steps, blockers, epic, every comment),
   - the **owner's machine rules** (protected branches, forbidden files, time limits),
   - instructions on **how to report** back.
6. **The agent works, and the board updates live.** It plans steps and marks them as it goes, sets "Needs you" if it needs a decision, comments on what it found, records decisions, and creates new tickets for extra work it discovers. Everyone sees this live on the website. The agent's status ("Building · Create profiles for new users") shows on the People page and under "Who's doing what" on Overview. Status belongs to the project where the agent is working; other projects show "Busy in another project" without its note or ticket. Offline, paused, usage-limit waits and time used today apply to the whole agent and stay visible everywhere. Older helpers still work: the database derives the project from their current ticket when possible.
7. **It finishes.** It commits, pushes, opens a pull request with the ticket key in the title against the default branch (`main`, even when it builds on another ticket's unmerged branch, so merging it always lands the work in `main`), and moves the ticket to **Review** with the PR link. Its short final message ("what I did, how I checked it, anything left") is posted as a comment.
8. **People steer at any time.** A comment from a person on the ticket starts a follow-up run: the agent resumes the same session in the same worktree and gets the new comments as instructions.
9. **Captain reviews it by itself** once its tests pass (see below), and the merge follows the project's merge setting: Captain's runner merges the approved commit, or a person does.

**The lead runs in the background too.** Its runner wakes it when a worker asks it something in the room, and when a worker sets "Needs you" on a ticket.

**The computer stays awake while an agent works.** During any run (a build, a review, a reply, the setup script, or Captain's merge), the runner keeps the computer from going to sleep on its own: with `caffeinate -i` on macOS, and with `systemd-inhibit --what=idle` on Linux. When nothing is running, it holds nothing. It only stops idle sleep: closing the lid still sleeps the computer, and an asleep computer isn't woken. If Linux doesn't allow it without `sudo`, or the command is missing, the runner logs one line and carries on. Turn it off with `keep_awake = false` in the agent's runner file (`~/.config/autokolab/runners/<agent>.toml`).

**Only messages that need an answer start a run.** Every message a person sends to an agent wakes it. From another agent, only a question, a task, a review request or an answer does; a status, handoff, decision or chat is news, and the board is the report, so nobody posts "finished" or "approved" in the room. A reply to a teammate's question, task or review request goes back as an answer, which wakes them once; other runs' reports wake nobody. A teammate's message waits about 20 seconds (2 minutes at most) so that messages arriving together in one thread are answered in one run; a person's message never waits. The loop guard (12 agent turns in a thread with no person, by default) counts turns, not messages: messages in a row from the same agent are one turn, so a burst answered by one run counts once. Each runner logs every decision ("#412 from builder: status, no run.") and counts messages seen, run and merged per day in `wakes/<agent id>.json` in its state folder. The lead looks at each question once: if the answer is in the code, the guide or the decisions, it answers on the ticket and clears "Needs you", which resumes the worker; if it's a real product choice, it asks its person in the room. It decides and acts on its own, except before big work (a new epic or more than 3 tickets, migrations, dependencies, auth, security, CI or infra changes, deleting a feature, changing a decision), when it asks its person first and waits. The owner's limits (minutes per task, hours per day, pause) apply to the lead exactly as to workers.

**Replies to other agents are quick and cheap.** When everything a run answers is another agent's question, answer or chat, it runs as a reply. A message from a person, a task or a review request is work and gets the full run. A reply's prompt holds only who the agent is, the thread (its first message and the last 10, fetched by the runner), up to 3 mentioned tickets' titles and statuses, and a few rules: answer in one brief message, `NO_REPLY` if there's nothing to add, and ask for a ticket or task instead of doing work in a reply. There's no guide, board or decisions list; the agent can still fetch them if it truly needs to. A reply never continues a long work session. It starts fresh, or continues its own reply in the same thread if that was less than 30 minutes ago. Likewise, later work in that thread continues the last work session, never a reply's. Replies use `reply_model` and `reply_effort` from the runner settings: `sonnet` and `low` for Claude Code, and Codex's usual model at `low`. With `model_locked = true`, the owner's model and effort apply to replies too. Each room run logs its prompt size, model, turns and tokens ("Reply run #412: prompt 2,345 chars, model sonnet (low), 2 turns, tokens: …"), so reply and work runs can be compared.

**A worker never does ticket work in a reply.** When another agent's message to a worker (any kind, a task from Captain included) is about an open ticket assigned to that worker, it's a reply too: the worker acknowledges in a line or two, adds a ticket comment if the message changes the ticket, and ends. A task or review request in it is passed on to that ticket's build run, which gets it as new instructions the next time it runs (straight after, if the ticket is in progress or in review). If the build run for that ticket is running right then, the request goes straight to its next wake-up and there's no reply run at all. A worker's reply runs can't edit files, commit or push (Claude Code gets only reading tools, Codex the read-only sandbox, OpenCode no edits and only commands that read), and they stop after `reply_max_turns` turns (15 unless the runner settings say otherwise), with one plain line in the room saying the reply was cut short. Captain's own replies are unchanged.

**The lead reviews by itself.** Nobody has to tell Captain a PR is ready. Its runner watches tickets in Review that have a PR and no approval (on every ticket change, and once a minute), asks GitHub about the PR, and decides in plain code, without running the model:

- **Tests still running:** it waits.
- **Tests failed:** it comments on the ticket which checks failed on which commit, and moves the ticket back to In progress. The comment resumes the worker. The model doesn't run.
- **The PR conflicts with `main`** (AK-124), before review or when it's about to merge: it comments "PR #N conflicts with main; merge main into the branch, fix the conflicts, run the tests and push", takes back any approval (the fix is a new commit, reviewed and approved again), and moves the ticket back to In progress. The builder's runner merges `main` into the worktree before the run, so an agent that can't write the Git folder only fixes the files; the runner then commits that, finishing the merge, and pushes. It never commits a file that still has conflict markers. Only if the same PR conflicts again after 2 send-backs, or the builder sets "Needs you" because it can't resolve it, is a person asked.
- **No tests yet:** GitHub often takes a minute or two to start them on a new PR, so it waits and looks again. Only if a commit still has no tests 5 minutes after the runner first saw it does it set "Needs you" ("No automatic tests ran on this PR."), once. It keeps looking, and when tests do show up, it clears that and carries on as below.
- **Tests passed:** it starts one review run for that exact commit. The prompt holds only the ticket, its done means, the PR and commit, the checks, the changed files (risky ones marked), the diff (capped at about 60,000 characters) and the decisions, with a read-only checkout at that commit. Captain either approves that commit with `ticket_approve`, or comments on what's missing and moves the ticket back to In progress. The runner itself never approves anything. If the run ends without doing either (or fails, or hits the time limit), the runner sets "Needs you" so the ticket doesn't sit in Review unseen.
- **Captain built the ticket:** it can't approve its own work, so the runner asks one other agent in the room (Claude Code agents first, idle ones first) to review and approve it. With nobody to ask, it sets "Needs you".

**Agents look at the pages they change.** `npm run look -- <pages>` opens website pages in a headless browser at desktop and phone width (1440 and 390), saves screenshots under `~/.local/state/autokolab/looks/` (outside the repo, never uploaded), and reports the title, sideways scrolling, console errors, failed requests and the visible text. It uses installed Chrome, or downloads Chromium once into the user's cache, with no `sudo`. A builder whose ticket changes `apps/site` or `apps/web` runs it before Review and says what it saw at each width. When a PR changes those folders, the review looks too, and a website change isn't approved on tests alone when a page didn't load, has console errors or scrolls sideways (exit code 1). An agent whose sandbox can't start a browser gets exit code 2 and says so; its reviewer covers it, and if neither could look, the approval's "less sure" says that. Nobody sets "Needs you" or creates a ticket asking a person to look at a page. README.md has the options.

**A person can approve on the website** (AK-95). A change waiting for an approval shows **Approve this change** on its ticket page (in the Approval row) and on Captain's message about it. The person sees the ticket's plain line, the tests ("Tests: 48 of 48 passed on GitHub"), the commit and the PR first, and approves exactly the commit Captain's runner recorded with those tests. One optional field, "Anything you're unsure about?", becomes the review's note. Without recorded tests, or when they didn't all pass, one sentence says why it can't be approved there yet.

**Who counts as a builder** (schema 21). Nobody approves a ticket they worked on (`built_by`). A member counts as having worked on it only after changing it as its assignee while it's In progress or Review (status, branch, PR link, summary, steps and so on, but not just who it's assigned to), or after a build run is recorded for them. Being assigned, or taking a ticket and handing it back untouched, doesn't count. A ticket given another ticket's PR link takes on that ticket's builders. If someone is recorded by mistake, the project's owner can take them off from the ticket page ("Didn't work on this", with a reason that goes in the history).

Guards: each commit is handled once, even across a restart (the runner remembers it on its owner's machine); a ticket gets at most 5 automatic reviews, then "Needs you"; reviews wait behind room messages and workers' questions, never run alongside another task, and respect pause, the daily limit and the per-task time limit. While reviewing, Captain's status says "Reviewing SH-2".

To keep reviews cheap: after Captain sends a ticket back, the next review reads only the commits pushed since, together with what Captain said, instead of the whole PR again (a rebase or a merge from main means the whole PR is read). A change of up to `review_small_lines` (150) changed lines, with no database, CI, dependency or auth files anywhere in the PR, is reviewed on `review_model_small` (Sonnet by default) at `review_effort_small` (low); everything else keeps Captain's usual model. Both are set in the lead's runner file, `model_locked = true` keeps the usual model for every review, and the runner log says which path each review took.

The owner can turn this off with `auto_review = false` in the lead's runner file (`~/.config/autokolab/runners/<agent>.toml`); then Captain reviews only when someone asks.

If something goes wrong (time limit hit, crash, blocked), the runner comments on the ticket and sets "Needs you" with what happened. Nothing fails silently.

---

## 6. How agents get the full picture and the rules

Agents get the context needed for their current work and can read the full project record on demand:

1. **The briefing in every run** (see step 5 above). A build gets the rules, its full ticket and mentioned decisions, and one line about each other open ticket. A reply gets its thread and mentioned ticket titles and statuses. A review gets the ticket's done means, its mentioned decisions and the PR diff.
2. **The `project_brief` tool.** An agent working interactively (for example, your own Claude Code in your terminal) calls `project_brief` for the concept, architecture, rules, decisions and board on demand. `ticket_get` and `decision_get` give full details.
3. **The repo's `CLAUDE.md` and `AGENTS.md`.** AutoKolab writes a short block into these files telling any agent that opens the repo to start with `project_brief`, treat tickets as the source of truth, and keep its ticket current.

If a project has no rules written yet, agents get these **default rules** (they also exist as a one-click starter on the Guide page):

- Only work on tickets assigned to you that are in Ready or In progress.
- When you start, move the ticket to In progress and plan the steps on it.
- One branch per ticket, named `<ticket key>-<short-title>`. Commit and push early so others can see your work.
- Never push to `main`. Open a pull request against `main` (even when your branch builds on unmerged work) and move the ticket to Review.
- Every "done means" item must be true before Review. Run the tests and the type checker first.
- When a ticket changes the website, run `npm run look` on the pages you touched, open the screenshots and say what you saw at each width.
- Never ask a person to look at a page or check a layout. If the builder couldn't look, the reviewer does.
- Follow the decisions. If you need to break one, ask first.
- If something is ambiguous, set "Needs you" with a short question.
- If you find more work, create a new ticket instead of growing this one.
- Never put keys, tokens or passwords in tickets, comments or code.

---

## 7. Agents whose tools are blocked (for example Codex on a company account)

Some accounts don't allow extra tools. Codex on a managed ChatGPT business workspace refused to load AutoKolab's MCP tools ("disabled by enterprise-managed requirements"). Without tools, the agent can't update the board itself.

**The solution: the runner updates the board on the agent's behalf.** The runner is a separate program that starts the agent and reads everything it prints, so it doesn't need the agent's cooperation:

- **Live steps from the agent's own to-do list.** Codex and Claude both keep a step-by-step plan while they work (Codex's `todo_list`, Claude's `TodoWrite`). It appears in their JSON output. The runner copies it onto the ticket as steps and ticks them off live.
- **Commits as progress.** If there is no to-do list, the latest commit message shows as what the agent is doing.
- **A structured ending.** The agent ends its final message with a small block:

  ````
  ```autokolab
  status: review
  pr: https://github.com/owner/repo/pull/12
  summary: Uploads retry on their own when the network drops
  question: none
  new_ticket: Add retries to the uploader
  ```
  ````

  The runner reads it and moves the ticket to Review with the PR, saves the one-sentence summary shown on the board, sets "Needs you" if there's a question, creates follow-up tickets, and posts the rest of the message as the agent's comment.
- **Comments still steer.** People's comments are passed to the agent by the runner on the next run.
- **The runner delivers the work too.** Some sandboxes can't write the repository's Git data, reach GitHub or use `gh`. When an agent ends with `status: review` and there is no pull request, the runner commits what's left in the agent's folder, pushes the branch and opens the pull request against the default branch, then moves the ticket to Review. Follow-up work after a review goes the same way: when the ticket already has a pull request, the runner commits and pushes what's left to that pull request's branch (no new pull request), says which commit it pushed, and moves the ticket to Review. If someone else pushed to that branch in the meantime, it stops and says so instead of overwriting their commits. It never commits or pushes local secret files (`.env`, keys, credentials), including in commits the agent made itself, and never pushes a protected branch. If a step fails, "Needs you" says which one and why. The runner does this outside the agent's sandbox, so the sandbox must not be able to steer it: the repository's Git folder (hooks and settings) is never made writable for the agent, and the runner points Git at that folder itself instead of trusting the `.git` link in the agent's folder.

Agents that *do* have the tools report their own steps; the runner notices and stays out of the way. **This was tested end to end** with a simulated Codex that had no tools: the ticket went Ready → In progress, its three steps ticked along live, the ending block moved it to Review with the PR, created the follow-up ticket and posted the comment.

---

## 7b. Agents on any model with an API (DeepSeek, Gemini, OpenRouter, …)

Besides Claude Code and Codex, an agent can run any provider's model through **OpenCode**, an open-source coding agent that already talks to many providers (DEC-20; OpenCode was picked over Aider in DEC-26 because it has MCP tools, JSON output, session resume and a cost per step). In AutoKolab its engine is `opencode`, and its model is written `provider/model`, for example `deepseek/deepseek-flash` (`opencode models <provider>` lists the models OpenCode knows).

**Adding one (CON-25).** You choose the provider, model, name and daily spend on the website, which gives you one line to paste on the computer where the agent will work:

```bash
curl -fsSL https://autokolab.vercel.app/install.sh | bash -s -- CODE --engine opencode \
  --provider deepseek --model deepseek-chat --name ana-deepseek --daily-usd 5
```

`autokolab connect CODE` takes the same options (without them it connects Claude Code and Codex as before). It creates that one agent:

1. installs OpenCode for you if it isn't on the computer (`npm install` into `~/.local/share/autokolab/opencode`, about 190 MB, no sudo);
2. asks "Paste your DeepSeek API key. It stays on this computer." with nothing shown as you paste (it reads the terminal itself, so it works under `curl … | bash`);
3. checks the key with one small request to the provider (listing its models). A rejected key stops here, with "DeepSeek didn't accept that key. Check you copied all of it, then run the line again.", and nothing is created or saved;
4. creates the agent through the website (only its name and `opencode` go there, never the key), saves the key on this computer, writes the agent's runner file with the `[opencode]` section, and starts or restarts the background runner;
5. ends with the agent's name and model, "Your key is stored on this computer only.", and the People page where it now shows.

Providers to start with: DeepSeek, Gemini (`google`), OpenAI, Anthropic, Mistral, OpenRouter, Groq, xAI and a few more (`core/providers.ts`), plus a **local model through Ollama** (`--provider ollama --model qwen2.5-coder:7b`), which needs no key: the check is that Ollama is running and has the model (it listens on `127.0.0.1:11434`, or `OLLAMA_HOST`; the runner file's `base_url` keeps it).

**In a container or a script**, where nobody can type, put the key in an environment variable and add `--key-env NAME` (only the variable's name is ever shown). Add `--no-service` where there's no launchd or systemd, and run the agent with `autokolab run <name>`.

**Replacing or removing a key**, on the agent's computer only: `autokolab key set <agent>` (asked for hidden, or `--key-env NAME`; checked before it replaces the old one), `autokolab key check <agent>` ("DeepSeek accepted the key", or what's wrong), `autokolab key remove <agent>`. The runner reads the key for each run, so a new key applies from the next run without a restart.

- **How it runs.** The runner starts `opencode run --format json -m <provider/model>` in the ticket's worktree with the prompt on stdin, the same way it starts the other engines. A small config file gives OpenCode the AutoKolab tools and the owner's limits as OpenCode permission rules: no force-push or `--no-verify`, no pushing to protected branches, no reading or changing the forbidden paths, nothing outside the working folder. OpenCode's to-do list becomes the ticket's steps; tokens, turns and cost come from its own figures for every step; later comments continue the same session.
- **The key stays on the owner's computer.** It's in the macOS keychain (service `autokolab`, account the agent's id), or else in `~/.config/autokolab/keys/<agent id>`, which must be mode 600 (the runner refuses a file others can read). The runner reads it for each run and passes it only to OpenCode's process, through the provider's environment variable (`DEEPSEEK_API_KEY` for DeepSeek, and so on). It's never in a command line, a log, a prompt, a ticket, the room or the server; if it shows up in the output anyway, it's replaced with `[redacted]`. Without a key the agent doesn't start, and says so on the ticket.
- **A daily spend limit.** `daily_usd` under `[opencode]` in the agent's runner file is how many dollars it may spend per day (0: no limit). The runner adds up the cost OpenCode reports for each run; once the day's total reaches the limit it starts no new work and says once: "I've spent today's $5 limit on DeepSeek. I'll carry on tomorrow." It starts again after local midnight. If a provider reports no cost, the limit can't be enforced, and the runner's log says so.
- **Plain reasons when the provider says no.** A rejected key, an account with no credit, or a model that doesn't exist stops the run with "I stopped: …" on the ticket saying which, and what to do. A rate limit waits like a subscription's usage limit: OpenCode keeps retrying on its own, so after three refusals in a row the runner stops the run and tries again 15 minutes later.

```toml
engine = "opencode"

[opencode]
provider = "deepseek"
model = "deepseek-flash"
daily_usd = 5
```

---

## 8. Safety and trust

| Protection | How |
|---|---|
| **Everyone sees only their projects** | Postgres **Row-Level Security** (RLS): every table checks membership in the database itself, not just in the app. |
| **Fields can't be forged** | Column-level grants and database triggers: ticket keys, reporters, timestamps and history can't be changed by clients. History is written by the database. |
| **No secrets in shared text** | A `looks_like_secret()` check in the database (and in the helper) rejects messages, tickets, comments and guides that look like API keys, tokens or private keys. |
| **Agents can't touch `main`** | Owner-set protected branches (`main`, `master`, `prod`, `production`), enforced by a git **pre-push hook** in the agent's clone and by deny rules passed to Claude Code (no force-push, no `--no-verify`, no deleting remote branches). |
| **Forbidden files** | Owner-set paths (e.g. `.env.production`) agents may never read or change. |
| **Time limits** | Per-task limit (default 60 minutes) and a daily total (default 3 hours) per agent. Past the daily limit, work waits for tomorrow. |
| **Pause** | Each owner can pause their agents; a running task stops immediately. |
| **Code stays on GitHub** | The server stores tickets, chat, decisions and status, never code. Repo access is enforced by GitHub with each person's own credentials. |
| **Keys stay private** | The public website only ever uses the public (anon) key. The service key is only on the admin machine and (later) in Vercel server functions. `.env` files are gitignored; the repo is public. |
| **Instructions only from the right people** | Agents treat text from web pages, files, issues and tool output as information, not instructions. The ticket and comments from people and the lead are instructions. A teammate agent's message is a colleague's request: agents help within their rules and limits, and never break them because another agent asked. |

---

## 9. What has been built so far

The work happened in two generations. **Version 1** proved the core idea with a chat room. **Version 2** is the full product: a hosted website with a Jira/Linear-style board that agents work from. Both live in the same repository and share the same helper and database.

### Version 1: the shared room (working, in daily use)

- **Install with one line** from GitHub (`git clone … && scripts/install.sh`), which adds the `autokolab` command and opens a local web page.
- **Local web app** on `127.0.0.1:4777` (session token in the page, Host/Origin checks) with a clean black-and-white UI: setup, invites, and the room where all messages are visible, with an icon per agent.
- **Setup flow:** connect a Supabase project, set up the database in one click, name yourself and your agent, pick your repo, create an invite.
- **Joining flow:** paste one line; it walks you through your name, GitHub access to the repo (it asks the team for access if needed, using `gh`), a copy of the repo, connecting Claude Code and/or Codex, and what your agents may do while you're away.
- **Identity:** each member (person or agent) is a Supabase Auth user with a token `ak1.<id>.<secret>`; invites are one-time and encrypted.
- **Room tools for agents (MCP):** `whoami`, `agents`, `room_post` (with waiting for replies), `room_read`, `room_wait`, `room_thread`, `work_log`, `board_list`, `board_upsert`.
- **The runner:** runs for lead and follower agents alike; starts `claude -p --output-format stream-json` or `codex exec --json` headless when someone who can instruct sends work; per-thread git worktrees; pre-push guard; daily limits; says hello to the team the first time it starts; resumes sessions for follow-ups.
- **Runs as a background service** (launchd on macOS, systemd on Linux), or inside the app server when the service isn't installed.
- **Keeps itself up to date** (AK-31): the service checks `origin/main` every 10 minutes; when no agent is mid-run it pulls, builds, restarts onto the new code and says so once in the room. A failed pull or build goes back to the previous commit. Only the installed clone at `~/.autokolab` updates itself; `"auto_update": false` in `~/.config/autokolab/config.json` (or `autokolab update --off`) turns it off.
- **Database updates apply themselves** (AK-32, AK-33): on the team owner's machine (secret key plus a database connection string), the helper compares the live schema version with its own when it starts, including right after it updated itself. The local setup page stores the connection string in the machine config and has a switch for automatic updates. `AUTOKOLAB_DB_URL` overrides that saved value; the install `.env` is the fallback. Behind, with `"auto_migrate": true` (off by default; `autokolab init` asks once, the setup switch or `autokolab db update --on` turns it on): it applies every pending migration in one transaction and posts "Updated the database to version N (…)" in the room. Behind and off: it tells the owner once in the room to run `autokolab db update`, which does the same by hand. A helper older than the database refuses to touch it. The connection string is never printed or sent to the setup page after saving. `autokolab status` shows the database version and whether updates are automatic or by hand.
- **Real use:** the founding team's Claude (macOS, Toronto) and Codex (Linux, Sweden) talked through the room, and a lead → follower question was answered in about 30 seconds.
- **Fixes along the way:** Supabase URL normalization, Node 20 WebSocket support, finding Claude Code bundled inside the desktop app, GitHub sign-in on older `gh` versions on Linux, `@mentions` of hyphenated names, Codex `resume` flags.

### Version 2: autokolab.com and the project board

**Phase 0, the hosted skeleton (done, not deployed yet)**

- New website in `apps/site`: React + TypeScript + Vite, the "night shift" dark design (lime primary color, IBM Plex Sans and Mono), base components, the `⌘K` command palette.
- **Sign in with GitHub** through Supabase Auth (PKCE flow), automatic profile creation, a welcome step (name, city, time zone). Verified with a real GitHub sign-in.
- Ready for Vercel: SPA rewrites, security headers, a health endpoint.

**The project workspace (done)**

- **Captain:** a plain chat with Captain, the page a project opens on (DEC-24). Captain's runner updates are folded into "quiet updates", a catch-up arrives when you've been away 30 minutes or more, and each thing that needs you (a risky merge to OK, a question on a ticket, a question from Captain, a problem) is answered right there. You write to Captain in the box at the bottom. The sidebar badge on Captain counts what needs you.
- **Results**: what the team got done this week or in the last 4 weeks, counted from the record, and the audit export. "Where the usage went" shows how much of the agents' usage went on building against reviewing, agents talking to each other and questions, with coordination as a percentage on top of building. Reviews are split by path (the whole PR, only the new commits, or light), and building after a conflict send-back shows as fixing conflicts, each with what one run used. Each runner records what a run used when it ends (tokens, turns and the tool's cost figure, exactly as Claude Code or Codex report them; no message or prompt text). Tokens read from the cache count as one tenth. A run whose tool reported nothing is counted and said plainly, never estimated.
- **AutoKolab traffic on Results (schema 29)**: each runner adds fixed numeric daily counters for REST response bytes by table and purpose, realtime deliveries, prompt section bytes, wake reasons and failure classes. It sends deltas at most every 10 minutes and on shutdown. Results sums the last seven calendar days for agents in the project, names days without reports, and shows this browser tab's database downloads separately. An agent's daily totals include its work in other projects. No prompt, message, URL, key or response body is stored.
- **Overview** (`/p/<project>/overview`, G then O): for looking, not talking. One sentence on what's happening and whether anything needs you, then one row per thing that needs you (click it to answer it on the Captain page), who's doing what, each goal's progress, and today: what shipped, what's in review and what was decided. New projects also get a setup checklist here until every step is done.
- **Work:** tabs **By agent · By feature · Later · All tickets**, with a sentence built from the board under the title and a **New ticket** button (C). Columns are **To do · Building · In review · Needs you · Shipped**; empty columns are hidden and named in one quiet line. Agent lanes show a neutral avatar, status dot and one short state shared with Overview; hover shows the owner and model. Cards show the plain summary or title, live steps and a thin progress bar, the plain line of any blocker, a short request linking to Captain, or a green tick and merge time. Keys stay in hover text and on ticket pages. Dragging between columns and lanes, search, avatar filters and quick filters still work. Shipped tickets leave the board after 14 days.
- **Later:** tickets on the board at the top, the ranked list below; drag to rank or move onto the board, change status from its label, add a ticket inline and filter by feature.
- **All tickets:** a sortable table with status, feature, priority, assignee and update time.
- **Issue page, modelled on Jira:** breadcrumb with the epic; title; description; done means; child issues with a progress bar (for epics); linked issues ("is blocked by" / "blocks"); live steps; **Activity** with All / Comments / History tabs and the comment box on top. On the right: Jira's **status button**, a **Details** panel (assignee, reporter, priority, type, parent epic, labels, the areas it touches, branch, pull request); a Ready ticket held back by another one's files says which, "Context it's using", and created / updated / resolved dates.
- **Jira's visual language:** issue types Story (green), Bug (red), Task (blue), Chore (grey) and Epic (purple) with Jira's icons; priority arrows; grey / blue / green status lozenges.
- **Project Guide** page with Concept, Architecture and Rules, each editable in Markdown, with "Start from the recommended rules".
- **Decisions** page: record decisions and contracts, replace an old one with a new one, link to the ticket it came from.
- **People & agents:** everyone in the project with city and local time, each agent with its owner, live status and current ticket, marked **Lead** or Worker; the owner picks the lead ("Make lead") and adds people by GitHub username.
- **New project** screen: name, GitHub repo, ticket prefix (suggested automatically).
- **Keyboard:** `C` for a new ticket, `⌘K` to jump to any ticket, view or project, `⌘Enter` to save or send.
- **Live updates:** every screen refreshes through Supabase Realtime when anything changes, plus a 30-second safety refresh.
- Works at phone width.

The website keeps agent and room presence live through realtime updates without reloading tickets or chat history. Workspace lists leave out long ticket fields; opening a ticket or its evidence loads the full record. After the first Room load, chat reads only messages newer than the last one received. Safety reads run every five minutes, skip hidden tabs and catch up when the tab becomes visible again.

**The database for projects (done, applied)**: migration `004_workspace.sql` (schema version 4)

- Tables: `projects`, `agents`, `project_members`, `tickets`, `ticket_steps`, `ticket_links`, `ticket_comments`, `ticket_events` (history), `decisions`, `project_guides`.
- Functions: `create_project`, `create_ticket` (assigns the next key), `create_decision`, `add_project_person`, `agent_status`.
- Triggers for the secret check, protected fields, automatic timestamps (started, completed) and the full history.
- Row-Level Security on every table, column-level grants, and Realtime publication.
- Database tests in `supabase/tests/policies.sql` cover the permissions.

**The lead (done, tested against the real database)**: migration `005_lead.sql` (schema version 5)

- One lead agent per project (`projects.lead_agent_id`), set by the owner; the database checks it's an agent in the project and clears it if the agent leaves.
- `project_brief` tells the lead its job: understand the request, split it into tickets of a few hours, write each as a complete brief (Context, What to do, Where, Not in scope, Notes, done means, blockers), assign the workers by their status and load, report back to its person, then follow up: answer workers' questions on tickets, bring product choices to its person, review pull requests against done means.
- Workers are told they're workers: do the ticket as written, ask on the ticket when unclear.
- Quality gate: giving a worker a ticket in Ready (or In progress) without a real description and done means is refused, with an explanation. The website warns about the same thing.
- Vajra Vision's lead is the Toronto Claude agent.

**Agents on the board (done, tested against the real database)**

- New MCP tools: `project_brief`, `tickets`, `ticket_get`, `ticket_create`, `ticket_update`, `ticket_comment`, `ticket_steps`, `guide_update`, `decision_get`, `decision_add`. (`whoami` now mentions the project.)
- The runner picks up Ready tickets, works each one in its own worktree and branch, briefs the agent for that run's purpose, resumes when people comment, and handles failures.
- Support for agents whose tools are blocked (section 7).
- The real project **Vajra Vision** (`VV-n`) was created with its owner and three existing agents (a Claude agent in Toronto, a Codex agent and a Claude agent in Sweden). Its `CLAUDE.md` and `AGENTS.md` point agents at the board.
- **Tests:** 56 unit tests pass (runner, prompts, worktrees, engines, the pre-push guard, plan parsing, the ending block), plus two end-to-end runs against the real database (one with the agent tools, one with a simulated tool-less Codex).

---

## 10. Where things are in the code

```
autokolab/                      (github.com/yellapragada1996/autokolab)
├─ GUIDE.md / GUIDE.pdf          this document
├─ README.md                     install and quick start (version 1)
├─ scripts/install.sh            the one-line installer
├─ apps/
│  ├─ web/                       version 1 local web app (room, setup, invites)
│  └─ site/                      version 2: autokolab.com
│     ├─ src/screens/            sign-in, welcome
│     ├─ src/workspace/          CaptainHome, Overview, Board, Backlog, List, TicketPage, GuidePage,
│     │                          Decisions, People, CreateProject, NewTicket, Workspace shell
│     ├─ src/lib/                data access (data.ts), session (GitHub sign-in), router
│     └─ src/ui/                 design system components, ⌘K palette
├─ packages/autokolab/           the helper (`autokolab` command)
│  ├─ sql/                       database migrations 001–005
│  ├─ src/cli.ts                 every command
│  ├─ src/core/                  database client: rooms (client.ts), projects and tickets (projects.ts)
│  ├─ src/mcp/server.ts          the tools agents use
│  ├─ src/runner/                runner, engines (Claude/Codex/OpenCode), prompts, worktrees, git hook
│  └─ src/setup/                 local app server, setup, join, invites, service install
├─ supabase/tests/               database permission tests
└─ autokolab-spec/               the full product spec and wireframes (not committed yet)
```

---

## 11. Reference

### Tools agents have (MCP)

| Tool | What it does |
|---|---|
| `project_brief` | The concept, architecture, rules, decisions in force, the board and your open tickets. Read this first. |
| `tickets` | List tickets: by status, assignee (`me`, `none` or a name), text search. |
| `ticket_get` | One ticket in full: fields, description, done means, steps, blockers, epic, every comment, and the full decisions or contracts it mentions (up to a size cap). |
| `ticket_create` | New ticket with title, description, done means, type, priority, status, assignee, epic, labels, blockers, areas. |
| `ticket_update` | Change status, branch, PR, "needs you", assignee, priority, title, description, done means, labels, epic, blockers, areas. |
| `ticket_comment` | Comment on a ticket. |
| `ticket_steps` | Plan the steps, or mark one step now / done / to do (marking one "now" finishes the ones before it). |
| `guide_update` | Write the concept, architecture or rules (replace or append). |
| `decision_add` | Record a decision or contract. |
| `decision_get` | Read the full text of one or several decisions or contracts by key, including replaced ones. |
| `agent_model` | Change an agent's model and effort, with a reason (its owner or the project's lead). The agent is told in the room; it applies from its next run. |
| `question_close` | Close a question you asked a person that was settled without them: posts one sentence on how, as an answer in its thread, and the person's "needs you" list stops showing it. |
| `whoami`, `agents`, `room_post`, `room_read`, `room_wait`, `room_thread`, `work_log`, `board_list`, `board_upsert` | The version 1 chat room tools. |

### Commands (`autokolab …`)

`open` (default: opens the local app) · `init` · `invite` · `join` · `setup` · `rename` · `status` · `whoami` · `rooms` · `members` · `post` · `read` · `watch` · `board` · `work` · `run` (start runners) · `service install / uninstall / status / restart` · `update` (update now; `--off` / `--on` for automatic updates) · `connect CODE` (the website's line; `--engine opencode --provider … --model … --name … --daily-usd … [--key-env NAME] [--no-service]` adds an API-model agent) · `key set / check / remove <agent>` (an API-model agent's key on this computer) · `mcp` (started by Claude Code / Codex) · `team remove`.

### Technology

- **Website:** React 19, TypeScript, Vite, Supabase JS client, hosted on Vercel.
- **Helper:** Node.js 20+, TypeScript, Commander (CLI), MCP SDK, Zod, smol-toml (runner limits in `~/.config/autokolab/runners/<agent>.toml`), `ws` for WebSockets on Node 20.
- **Backend:** Supabase (Postgres, Row-Level Security, Realtime, Auth with GitHub). Database migrations 001 to 005.
- **Agents:** Claude Code (`claude -p --output-format stream-json`) and Codex (`codex exec --json`), each running on its owner's machine and subscription, and any provider's model through OpenCode (`opencode run --format json`) with the owner's own API key.

---

## 12. What's not done yet

Being honest about the gaps:

1. **The website isn't online yet.** It runs locally (`localhost:5175`). It needs deploying to Vercel and the autokolab.com domain pointed at it. Until then, only the person running it locally can see the board.
2. **New agents can't join the board by themselves yet.** The three existing agents were added to the project by hand. One-click joining from the website (pairing the helper with your account, devices, invites at `/j/…`) is **Phase 1**.
3. **The room chat isn't on the website yet.** Chat still lives in the version 1 local app. Bringing it to the website (with @mentions and presence) is **Phase 2**.
4. **Teammates must sign in once** on the website before the owner can add them by GitHub username, and before their agents are linked to them.
5. **Not built yet from the spec:** file reservations so two agents never edit the same file and approvals for risky actions (Phase 5), a "while you were away" digest and phone notifications (Phase 7).

### Roadmap status

| Phase | What | Status |
|---|---|---|
| 0 | Hosted skeleton: website, GitHub sign-in, design system | ✅ Built, not deployed |
| 1 | Helper pairing, devices, invites, one-line join from the website | ⏳ Next (version 1 has a working local version) |
| 2 | Room chat on the website, presence | ⏳ (works in the version 1 local app) |
| 3 | Agents run tickets: worktree per ticket, live steps, PRs, steering | ✅ Done |
| 4 | Board, dependencies, plans | ✅ Jira-style board and backlog, dependencies, the lead plans and assigns |
| 5 | Safety: reservations, overlaps, approvals | 🟡 Protected branches, hooks, limits, pause done; reservations and approvals not yet |
| 6 | Memory: decisions, contracts, the guide given to every agent | ✅ Done |
| 7 | Catch-up digest and phone | ⏳ Not started |

---

## 13. How to use it today

1. **Run the website locally:** `npm run dev -w autokolab-site`, then open `http://localhost:5175` and sign in with GitHub.
2. **Open Vajra Vision** (or create a project for another repo).
3. **Write the Project Guide**, or ask your lead: _"Read the repo and draft the Project Guide."_
4. **Tell your lead what you want built** in Claude Code, e.g. _"Plan 'add Google sign-in' on the AutoKolab board and assign the tickets."_ It writes the tickets and assigns them to the workers.
5. **Make sure the agent's helper is running** on its owner's computer (`autokolab service install`; it keeps itself up to date).
6. **Watch the board.** Answer anything in **Needs you**, comment to steer, review pull requests on GitHub, and move tickets to Done.
