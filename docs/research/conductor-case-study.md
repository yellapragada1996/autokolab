# Case study: Conductor, and what AutoKolab should take from it

Ticket AK-118 · written 15 Oct 2026 · by yvssaratchandra-claude

Everything here comes from public sources: Conductor's website, docs, changelog and blog, plus reviews and forum threads. Nothing was installed or decompiled. Each claim has a source number like [S1]; the list is at the end. Anything a source didn't confirm is marked **unconfirmed**.

## The short answer

- **Conductor is a Mac app for one developer running several coding agents side by side.** It is very good at that, and it moves fast (a release every few days).
- **AutoKolab is a team of agents that run themselves,** on many machines, with a lead (Captain), a board, reviews and approvals. People mostly watch and decide.
- **Rebuild all of Conductor inside AutoKolab? No.** Most of Conductor is a code editor and a terminal for a person sitting at one Mac. AutoKolab's promise is the opposite: people don't drive each agent. Copying it would cost a lot, break our decisions (no desktop app, code never on our server), and add screens nobody on our team needs.
- **Take about six things from it,** most of them small: a setup script for each new worktree, a port and name for each worktree, keeping the computer awake while agents work, sending GitHub review comments back to the agent, starting work from a GitHub issue, and a "needs you" notification. The ranked list is in section 5.

---

## 1. What Conductor is

| | |
|---|---|
| **What** | A Mac app to "run parallel Claude Code, Codex, and Cursor agents in isolated workspaces", see what each is doing, then review and merge their changes [S1]. OpenCode is supported too [S2][S9]. |
| **Who makes it** | Melty Labs, San Francisco, a Y Combinator (Summer 2024) company. Founders Charlie Holtz and Jackson de Campos [S20]. Raised a $22M Series A from Spark and Matrix in March 2026 [S8]. |
| **Who it's for** | Developers on a Mac who already pay for Claude or ChatGPT and want several agents working at once [S1][S19]. Since July 2026 also teams, through its paid cloud [S5][S11]. |
| **Platforms** | macOS only. Windows and Linux have a waitlist and no date [S19]. An iPhone app arrived on 2 Oct 2026 (version 0.90.0) [S4][S23]. |
| **Pricing** | Free: unlimited local agents, bring your own subscription or API key. Pro: $50 a month, adds Conductor Cloud, multiplayer for up to 5 people, the API and the mobile app. Teams: $60 per person a month, adds an admin portal and central billing. Enterprise: custom price, adds SSO (SAML, SCIM), a data agreement and support terms [S3]. Conductor never resells model usage: you pay Anthropic, OpenAI or Cursor directly [S9]. Usage-based pricing for cloud computers is planned [S3]. |

### How it works

1. **A workspace per task.** Each task (a feature, a bug, an issue, an experiment) gets a *workspace*: its own git branch and its own copy of the files on disk, made with git worktrees. Agents in different workspaces can't overwrite each other [S6][S7]. Conductor's own docs say this is "development isolation, not a security boundary": agents still run with your full user permissions [S6].
2. **Start it from anywhere.** You make a workspace from a branch, a pull request, a GitHub issue or a Linear issue (⌘⇧N), or type a prompt into the *Dispatcher* (⌘N), which can create several in a row [S7][S13][S15].
3. **Set up the copy.** A *setup script* runs in each new workspace (install packages, generate files, link shared files). Each workspace gets its own port number (`CONDUCTOR_PORT`) and name, so several copies of an app can run at once. *Run scripts* start the app from a Run button; *archive scripts* clean up when you're done. These live in a `conductor.json` file in the repo [S10][S21].
4. **Chat with the agent.** Each workspace has one or more chats. Each chat uses one agent (Claude Code, Codex, Cursor or OpenCode) and one model. You pick the model, the effort level and fast mode, can ask for a plan first, and can approve each tool use if you want [S2][S9][S12].
5. **Undo a turn.** *Checkpoints* snapshot every turn. You can revert to an earlier turn, which deletes the later messages and their code changes [S14].
6. **Review.** A diff viewer shows the changes; you comment on lines and the comments go to the agent. An AI "Review" action checks the diff using review guidance you set per repo [S16][S17].
7. **Ship.** "Create PR" drafts the pull request. The *Checks* tab gathers git status, CI, deployments, GitHub comments and todos, and can send failing checks and unresolved comments back to the agent. Conductor may block a merge while todos or checks are open. You merge, then archive the workspace (it can be restored later) [S16][S17][S18].

### Conductor Cloud (paid, since July 2026)

- Each agent runs in its own cloud sandbox (a small virtual machine) with the repo and packages pre-installed. It keeps working when you close your laptop [S5][S11].
- The team's repos, environment variables **and secrets** are stored on Conductor's servers so new sandboxes can use them [S11].
- *Multiplayer:* teammates see who's active, follow workspaces, share links and prompt the same agent together [S5][S22].
- *Routines:* agents run on a schedule or when a GitHub action fires. Cloud only, Pro and Teams [S24].
- *API and MCP:* create workspaces and send prompts from other tools or bots (beta) [S25].
- *iPhone app:* chat with agents and merge pull requests from the phone, for cloud workspaces [S23]. Details beyond the release title come from a third-party release tracker; **unconfirmed** on Conductor's own site.

### What users say

- **Good:** "an honest GUI extension of Claude Code", "does one thing cleanly" [S19]. People run about four agents at once and switch between them while each one works [S26]. Worktree creation is near instant, the free tier is truly unlimited, and the docs are candid [S19].
- **Bad:**
  - Mac only, which rules out mixed teams [S19][S26].
  - Agents aren't sandboxed on your machine [S6][S19].
  - Early on it asked for read-write access to all of your GitHub repos; finer permissions came later [S19][S26].
  - Untracked files like `.env` aren't copied into new worktrees, and packages must be reinstalled in each one [S26].
  - "Audit logging is not documented anywhere. Spend caps do not exist" [S19].
- **The real limit is the person.** A team that ran four agents on four bugs said "You're still the quality gate": four agents can mean four times as many bugs to catch, and the cost grows with the number of agents [S27].

---

## 2. Full feature list

One plain sentence each on what it does for the user. Version numbers are from the changelog [S4].

### Running agents

| # | Feature | What it does for you |
|---|---|---|
| F1 | Parallel workspaces (worktrees) | Run many agents at once without them touching each other's files. |
| F2 | Several agents (Claude Code, Codex, Cursor, OpenCode) | Use whichever agent you already pay for, side by side. |
| F3 | Bring your own subscription | No extra model bill from Conductor; you use your Claude or ChatGPT plan (sign in with ChatGPT since 0.89). |
| F4 | Custom providers (Bedrock, Vertex, others) | Run Claude through your company's cloud account (0.13.6). |
| F5 | Model picker, effort, fast mode | Choose a model and how hard it thinks, per chat, from the keyboard (0.85). |
| F6 | Loadouts | Save a favourite set of models and share it with others in one click (0.86). |
| F7 | Plan mode, approve plans with feedback | The agent writes a plan first; you OK it or correct it before any file changes. |
| F8 | Tool approval | You approve each command the agent wants to run, if you want that control (0.41). |
| F9 | Several chats in one workspace | Two agents work on the same branch, e.g. one builds and one reviews. |
| F10 | Steering and message queue | Choose what happens when you type while the agent is busy: queue it or steer it (0.50, 0.54). |
| F11 | Checkpoints | Undo the agent's last turn, or go back several, code included. |
| F12 | Background-task timers | See that a long command is still running, and for how long (0.77). |
| F13 | Skills and synced agent settings | The same instructions and settings for every agent and workspace (0.57). |
| F14 | MCP servers | Give agents extra tools, and see each server's status. |
| F15 | Keep the Mac awake | The computer doesn't sleep while agents are working (0.50, experimental). |
| F16 | Codex goals and personalities | Codex keeps working towards a goal across turns; you can set its style. |

### Setting up and running the code

| # | Feature | What it does for you |
|---|---|---|
| F17 | Setup script | Every new workspace is ready to run: packages installed, files linked. |
| F18 | Run scripts (several, with a Run button) | Start the app or tests in a workspace with one click (0.70). |
| F19 | Archive script | Clean up anything a workspace made outside its folder when you finish. |
| F20 | Per-workspace port and name | Several copies of your app run at once without fighting over a port. |
| F21 | `conductor.json` | The scripts and settings are saved in the repo, shared with the team. |
| F22 | Terminal, big terminal mode | A terminal inside each workspace. |
| F23 | File explorer, editor, search | Open, search and edit files without leaving the app. |
| F24 | Browser and HTML preview | See your running web page inside the app (0.62, 0.55). |
| F25 | Environment variables, direnv | Workspaces get the settings they need to run. |
| F26 | Context folder and notes tab | Notes and files for the agent that are never committed. |

### Reviewing and shipping

| # | Feature | What it does for you |
|---|---|---|
| F27 | Diff viewer | See exactly what changed, file by file, and per commit. |
| F28 | Line comments to the agent | Point at a line and tell the agent what to fix. |
| F29 | AI code review, custom review model, review preferences | An agent reviews the change before you do, following your repo's guidance. |
| F30 | Revert a file | Throw away one file's changes. |
| F31 | Create PR with a drafted description | The pull request writes itself from the diff. |
| F32 | Checks tab | One place for CI, deployments, GitHub comments and todos before merging. |
| F33 | Forward failing checks to the agent | When CI fails, the agent is told and fixes it (0.12). |
| F34 | Sync GitHub PR comments | Reviewers' comments on GitHub show up and can go straight to the agent (0.25.4). |
| F35 | Todos that block merging | Nothing gets merged while a todo is open (0.28.4). |
| F36 | Merge and archive | Merge from the app, then put the workspace away; restore it from History. |
| F37 | Stacked PRs (Graphite, GitHub stacks) | Split a big change into a chain of small PRs that land in order (0.32, 0.80). |
| F38 | Fork a workspace | Copy a workspace to try a second approach (0.25.6). |
| F39 | Vercel deployment status | See the preview deployment for the branch (0.29.2). |

### Finding your way and seeing what's happening

| # | Feature | What it does for you |
|---|---|---|
| F40 | Workspace status (backlog, in progress, in review, done) | Workspaces are grouped by where they are (0.35). |
| F41 | Unread marks and completion sounds | You know which agent has finished or needs you (0.25.11, 0.52). |
| F42 | Sections, pinned, grouped by repo | Organise many workspaces in the sidebar (0.85). |
| F43 | Dispatcher | Type a task and a workspace starts; type the next one straight away (0.63). |
| F44 | Start from a GitHub or Linear issue, PR or branch | The issue's title and text become the agent's task. |
| F45 | Chat summaries | A short summary of a long chat (0.34.2). |
| F46 | Command palette and keyboard shortcuts | Do everything from the keyboard. |
| F47 | Workspace and chat links | Share a link to one workspace or chat (0.71). |
| F48 | Conductor Wrapped | A year-in-review of your activity (0.25.1). |

### Paid cloud and team features

| # | Feature | What it does for you |
|---|---|---|
| F49 | Cloud workspaces | Agents keep working when your laptop is closed. |
| F50 | Multiplayer | Teammates see and steer the same agents together. |
| F51 | Routines | Agents run on a schedule or when GitHub says so. |
| F52 | API and Conductor MCP | Start agent work from your own tools and bots. |
| F53 | iPhone app | Chat with agents and merge from your phone. |
| F54 | Admin, SSO, billing, data agreement | What a company's IT team asks for. |

Not confirmed in detail: what the "ultracode" and "git --improve" items in 0.61, "Conductor Allegro" in 0.49 and the "hooks" in 0.9 actually do. Only their titles were found [S4]; they are left out of the ratings.

---

## 3. Comparison: does AutoKolab have it?

"Yes" means it exists today on `main`. Ticket and decision numbers say where.

| # | Feature | AutoKolab | Where |
|---|---|---|---|
| F1 | Parallel worktrees | **Yes** | One worktree and branch per ticket (DEC-11, `runner/repos.ts`). |
| F2 | Several agents | **Yes** | Claude Code, Codex, OpenCode (DEC-2, DEC-20, DEC-26). No Cursor. |
| F3 | Own subscription | **Yes** | DEC-2. |
| F4 | Custom providers | **Partly** | Through OpenCode (DEC-26, CON-25). |
| F5 | Model and effort | **Yes** | Per agent, settable by owner and Captain (DEC-18). |
| F6 | Loadouts | No | — |
| F7 | Plan first | **Yes** | Big work arrives as a plan to OK (AK-81, CON-23); each ticket has steps. |
| F8 | Tool approval | No, on purpose | Agents run unattended inside owner-set limits (DEC-12). |
| F9 | Several agents on one branch | **Partly** | Captain reviews a worker's branch; nobody approves their own work (DEC-19). |
| F10 | Steering mid-run | **Partly** | A comment resumes the agent after its run (DEC-11). Pause stops a run (DEC-12). |
| F11 | Checkpoints and undo | No | Git commits on the branch are the history. |
| F12 | Long-task timers | **Partly** | Live status on Overview (AK-79); no per-command timer. |
| F13 | Shared instructions | **Yes** | The guide, rules and decisions brief every agent. |
| F14 | MCP tools | **Yes** | AutoKolab's own tools (`mcp/server.ts`); agents keep their own MCP setup. |
| F15 | Keep computer awake | No | — |
| F16 | Codex goals | No | — |
| F17 | Setup script | No | Agents install packages themselves in each run. |
| F18 | Run scripts | No | `npm run look` takes screenshots for website tickets. |
| F19 | Archive script | **Partly** | Old worktrees are pruned after 14 days (`pruneWorktrees`). |
| F20 | Port and name per worktree | No | — |
| F21 | Settings file in the repo | **Partly** | Guide and decisions live in the database; limits in each owner's toml. |
| F22–F24 | Terminal, editor, preview | No, on purpose | No desktop app (DEC-1). |
| F25 | Environment variables | No | Agents may not read `.env` files (project rules). |
| F26 | Notes for the agent | **Yes** | Ticket description, comments, guide, decisions. |
| F27 | Diff viewer | **Partly** | "Show the work" shows files changed, lines added and removed, risky files (AK-80, `tickets.pr_facts`); the diff itself is on GitHub. |
| F28 | Line comments to agent | **Partly** | Ticket comments resume the agent; GitHub line comments are not picked up. |
| F29 | AI review | **Yes** | Captain reviews and approves the exact commit (DEC-19, AK-59, AK-84). |
| F30 | Revert a file | No | — |
| F31 | PR with drafted description | **Yes** | The runner opens the PR if the agent couldn't (`runner/ship.ts`). |
| F32 | Checks in one place | **Yes** | Evidence: tests passed, files, risky paths, review (AK-80). |
| F33 | Failing checks to agent | **Yes** | Failing tests move the ticket back to the worker with a comment (`runner.ts`). |
| F34 | GitHub PR comments | No | — |
| F35 | Todos block merge | **Partly** | Every "done means" must be true before Review; risky merges wait for a person (DEC-19). |
| F36 | Merge and archive | **Yes** | Captain's runner merges safe changes (AK-84, DEC-19). |
| F37 | Stacked PRs | No | PRs always target `main`. |
| F38 | Fork to try two ways | No | — |
| F39 | Deployment status | No | — |
| F40 | Status grouping | **Yes** | The board: Backlog, Ready, In progress, Review, Done. |
| F41 | Unread and sounds | **Partly** | Amber "needs you" on the website; no notifications yet (AK-88). |
| F42 | Sections and pins | **Yes** | Goals group tickets (epics). |
| F43 | Dispatcher | **Partly** | You tell Captain in chat and it writes tickets (AK-78). ⌘K/⌘L from anywhere is AK-85 (not started). |
| F44 | Start from an issue | No | Captain writes tickets; GitHub issues aren't imported. |
| F45 | Summaries | **Yes** | Ticket summary; status sentences built from the record (DEC-22). |
| F46 | Keyboard | **Yes** | ⌘K palette; AK-85 adds more. |
| F47 | Links | **Yes** | Every ticket has a page. |
| F48 | Wrapped | **Yes** | Results page with real numbers (AK-82). |
| F49 | Cloud agents | No, on purpose | No hosted agents; code stays on owners' machines (DEC-2, DEC-3). |
| F50 | Multiplayer | **Yes** | The whole product: shared board, Room, Captain, many machines. |
| F51 | Routines | No | — |
| F52 | API and MCP | **Partly** | Agents use AutoKolab's MCP tools; there is no public API for bots. |
| F53 | Phone app | No (planned) | AK-88. |
| F54 | Admin, SSO | No, on purpose | Enterprise comes after a pilot (Concept). |

---

## 4. What AutoKolab has that Conductor doesn't

| AutoKolab | Why it matters | Conductor |
|---|---|---|
| **Agents on many machines, owned by different people** | raghavendra's Mac and jamesblack's Linux box work on one project. | One Mac, or its paid cloud. |
| **macOS and Linux** (DEC-14) | Mixed teams can use it. | Mac only [S19]. |
| **Captain, a lead agent** (DEC-10, DEC-22) | People talk to one agent; it plans, splits, assigns, answers and reviews. | The person is the lead and drives each agent. |
| **A board of tickets with "done means"** | Work is written down before it starts; anyone can see what's next. | Workspaces with a status, but no ticket text or acceptance list. |
| **Agents talk to each other** (DEC-17) | Workers ask Captain or a teammate instead of stopping to ask a person. | Agents don't talk to each other [S7]. |
| **Reviews and approvals with rules** (DEC-19) | Nobody approves their own work; exact-commit approval; risky changes wait for a person; safe ones merge on their own. | A person reviews and merges; an AI review is optional. |
| **Overview, Evidence, Results for people** (AK-79, AK-80, AK-82) | A person sees what's happening in one sentence, with proof one click away. | Built for the developer at the keyboard. |
| **Decisions the team remembers** | Every agent is briefed with the same decisions. | Settings and skills, but no decision record. |
| **Owner-set limits enforced by the helper** (DEC-12) | Time per task, hours per day, protected branches, forbidden paths, pause. | No spend caps; "all perms are given to agents by default" [S19][S20]. |
| **A history written by the database** (DEC-4) | A trail a manager can audit. | No audit log documented [S19]. |
| **Open source, code never on our server** (DEC-3) | Nothing to trust but GitHub and your own machine. | Closed source; its cloud stores your repo and secrets [S11]. |
| **Free, with no paid tier** | Small teams pay only for the agents they already have. | Team features cost $50–$60 a person a month on top [S3]. |

---

## 5. Recommendations, ranked

**How to read this.** *Adopt* = take it as it is. *Adapt* = take the idea, shaped to how AutoKolab works. *Skip* = don't build it. Effort: **S** = a day or two for one agent, **M** = about a week or a few tickets, **L** = a goal of its own.

Each recommendation is judged against two goals:
- **See it:** does it help many agents work together, and help a person see what's happening?
- **Cost:** using AutoKolab shouldn't cost more than using the agents directly. Does it save or spend agent time?

### Adopt or adapt, in order

| Rank | Feature | Verdict | Effort | Why | See it | Cost |
|---|---|---|---|---|---|---|
| 1 | F17 + F21 Setup script for each new worktree, kept in the repo | **Adopt** | S | Today every agent installs packages itself in every new worktree, which uses its time and tokens. A script kept in the repo, like Conductor's `conductor.json` (e.g. `npm ci`), run by the helper before the agent starts, makes the worktree ready to work. Users name this as a main pain [S26]. | Fewer runs that fail on setup. | **Saves:** no agent turns spent on installs. |
| 2 | F34 + F28 GitHub review comments go back to the agent | **Adapt** | M | When a person comments on a PR line on GitHub, nothing happens today. Captain's runner already reads the PR; it could copy new review comments to the ticket, which resumes the worker. One place for feedback: the ticket. | Feedback from GitHub shows on the ticket. | Neutral: one resume per comment, same as a ticket comment. |
| 3 | F20 Port and name for each worktree | **Adopt** | S | The helper sets something like `AUTOKOLAB_PORT` and `AUTOKOLAB_TICKET` for each run, so two agents can run the website or `npm run look` at once without clashing. | Parallel agents stop tripping over each other. | Saves retries. |
| 4 | F15 Keep the computer awake while an agent runs | **Adopt** | S | A sleeping laptop stops the team. The helper can ask the system not to sleep only while a run is going (`caffeinate -i` on macOS; `systemd-inhibit` on Linux, which must be checked to work without `sudo`). | Fewer stalled tickets. | Neutral. |
| 5 | F41 + F53 Tell people only when a decision is waiting, on the phone too | **Adapt** | M | Conductor tells you when *any* agent finishes, and its iPhone app lets you chat and merge. Our rule is to interrupt only for decisions, so notify only on "needs you". This belongs in AK-88 (phone app, already planned: "only notifies you when a decision is waiting") and AK-87 (heads-up); a browser notification could come first. | The core promise: interrupted only for decisions. | Free: no agent time. |
| 6 | F44 Start work from a GitHub issue | **Adapt** | M | Let a person point Captain at an issue ("do #42"), and Captain writes the ticket from it. Captain still writes the ticket (DEC-10). Skip Linear. | Outside requests come in the same way as everything else. | One Captain run per issue, as today. |
| 7 | F27 See the diff from the ticket | **Adapt** | S | Don't build a diff viewer. On "Show the work", list the changed files and link each one to its diff on GitHub. | One click from the ticket to the exact change. | Free. |
| 8 | F19 Clean up when a ticket is merged | **Adapt** | S | Remove the worktree when its ticket is Done, instead of waiting 14 days, and run an optional cleanup script. Saves disk; keeps the worktree list honest. | — | Free. |
| 9 | F39 Preview link on the ticket | **Adapt** | S | If GitHub reports a preview deployment for the PR (Vercel does this), show the link in Evidence, so a person can try the change before it merges. Our PRs already get one: this PR's checks include a finished Vercel preview deployment. | Proof a person can click. | Free. |
| 10 | F43 Dispatcher: quick way to hand over a task | **Adapt** | — | Already planned as AK-85 (⌘K / ⌘L to Captain from anywhere). Conductor's "create more" toggle is a good detail to copy there. | Faster to ask. | Neutral. |
| 11 | F51 Routines: work on a schedule or on a GitHub event | **Adapt, later** | M | Useful for chores (weekly dependency check, nightly flaky-test hunt). It must run on an owner's machine, and starting work without a person asking touches "no autonomous decisions about what to build". A person should decide this. | — | **Spends** agent time on its own; needs a daily cap. |

### Skip

| Feature | Verdict | Effort if built | Why skip |
|---|---|---|---|
| F49 Cloud agents, F50 multiplayer cloud, F54 enterprise admin | **Skip** | L | Breaks DEC-2 and DEC-3 (no hosted agents, code and secrets never on our server). Multiplayer we already have in our own way. Enterprise waits for a pilot. |
| F22–F24 Terminal, editor, file explorer, browser preview | **Skip** | L | This is an IDE. No desktop app (DEC-1), and the website must never talk to the helper (DEC-6). People shouldn't need to drive agents by hand. |
| F18 Run button | **Skip** | M | Needs the website to start things on a machine (against DEC-6). `npm run look` and the setup script (rank 1) cover what agents need. |
| F11 Checkpoints, F30 revert a file, F38 fork a workspace | **Skip** | M | Built for a person steering one chat. Our agents commit often, so git is the undo, and a reviewer asks for changes on the ticket. Running two approaches at once doubles the cost. |
| F8 Tool approval | **Skip** | S | We run unattended inside limits (DEC-12). Asking a person before each command breaks "only interrupted for decisions". |
| F9 Several agents in one worktree | **Skip** | M | One ticket, one agent, one branch keeps it readable. Review by another agent already happens through Captain. |
| F10 Steering mid-run | **Skip** | M | Comments already resume the agent after its run; pause stops it now. Changing a run midway is hard to explain to a person watching. |
| F37 Stacked PRs | **Skip** | M | Captain splits big work into separate tickets; PRs always target `main`. |
| F6 Loadouts, F16 Codex goals and personalities | **Skip** | S | Captain and owners already set model and effort (DEC-18). Little value for people watching. |
| F42 Sections and pins | **Skip** | S | Goals already group the work. |
| F48 Wrapped | **Skip** | S | The Results page (AK-82) already shows real numbers. |
| F52 Public API for bots | **Skip for now** | M | No user has asked. The database and MCP tools cover agents. Revisit for companies. |
| F25 Copying `.env` into worktrees | **Skip** | — | Agents must not read `.env` files (project rules). A setup script an owner writes may link them on their own machine; that's the owner's choice, not ours. |

Features AutoKolab already has (F1–F3, F5, F7, F13, F14, F26, F29, F31–F33, F35, F36, F40, F45–F47) need nothing. F4 (custom providers) is covered by OpenCode (DEC-26) and F12 (task timers) by Overview's live status.

### What this does for the two goals

- **See it:** ranks 2, 5, 7 and 9 put more of what's happening on the ticket, which is where people already look, and only interrupt people for decisions.
- **Cost:** ranks 1, 3 and 4 cut wasted agent time (installing, clashing ports, stalled runs). Rank 11 is the only one that spends more, so it waits for a person's yes. None of the "adopt" items adds a paid tier or a server that holds code.

---

## 6. Should AutoKolab rebuild the whole of Conductor?

**No.**

1. **It's a different product.** Conductor puts one developer in the driver's seat of several agents: a chat, a terminal and an editor per agent. AutoKolab's idea is the opposite: agents run themselves as a team with Captain in charge, and people only step in for decisions. Rebuilding Conductor would bring back the job AutoKolab exists to remove.
2. **About half of it breaks our decisions.** The cloud stores code and secrets (against DEC-3). It needs a desktop app (against DEC-1) or a website that talks to your machine (against DEC-6). Hosted agents are against DEC-2.
3. **It's a moving target.** Conductor has a funded team, has shipped well over 150 releases in 15 months [S4], and is Mac only. Chasing its terminal, editor and previews would use our whole team for a copy that is always behind.
4. **It wouldn't help the people we build for.** The founding team is on macOS and Linux, on two continents, with agents on both machines. Conductor doesn't do that, and AutoKolab already does.
5. **It would cost more, not less.** Features like forking workspaces and many chats per branch multiply agent runs. Our cost goal is to cost no more than using the agents directly.

What *does* make sense: take the half-dozen small things in section 5 that make each agent's worktree ready faster and put more of the truth on the ticket.

---

## 7. Sources

All read on 15 Oct 2026.

- [S1] Conductor homepage — https://www.conductor.build/
- [S2] Docs, introduction — https://www.conductor.build/docs
- [S3] Pricing — https://www.conductor.build/pricing
- [S4] Changelog (every release and date) — https://www.conductor.build/changelog and https://www.conductor.build/changelog.md
- [S5] 0.78.0 Introducing Conductor Cloud — https://www.conductor.build/changelog/0.78.0-introducing-conductor-cloud
- [S6] Docs, isolated workspaces — https://www.conductor.build/docs/concepts/workspaces-and-branches
- [S7] Docs, workflow and parallel agents — https://www.conductor.build/docs/concepts/workflow and https://www.conductor.build/docs/concepts/parallel-agents
- [S8] Blog: Series A — https://www.conductor.build/blog/series-a (listed on https://www.conductor.build/blog)
- [S9] Docs, harnesses (agents, bundling, billing) — https://www.conductor.build/docs/reference/harnesses
- [S10] Docs, scripts (setup, run, archive, environment variables) — https://www.conductor.build/docs/reference/scripts
- [S11] Docs, Conductor Cloud — https://www.conductor.build/docs/cloud-beta
- [S12] Docs, agent modes — https://www.conductor.build/docs/concepts/agent-modes
- [S13] 0.63.0 Cursor support and Dispatcher — https://www.conductor.build/changelog/0.63.0-cursor-support-dispatcher
- [S14] Docs, checkpoints — https://conductor.build/docs/reference/checkpoints and https://www.conductor.build/changelog/0.19.0-checkpoints
- [S15] Docs, issue to PR — https://www.conductor.build/docs/guides/issue-to-pr
- [S16] Docs, diff viewer — https://www.conductor.build/docs/reference/diff-viewer
- [S17] Docs, review and merge — https://www.conductor.build/docs/guides/review-and-merge
- [S18] Docs, checks — https://www.conductor.build/docs/reference/checks
- [S19] Continuum Code, "Conductor review 2026" and "What is Conductor?" — https://continuumcode.ai/guides/conductor-review/ and https://continuumcode.ai/guides/what-is-conductor/
- [S20] Ry Walker, research note on Conductor — https://rywalker.com/research/conductor
- [S21] 0.11.0 `conductor.json`, 0.70.0 multiple run scripts — listed in [S4]
- [S22] 0.77.0 early-access multiplayer, API, background tasks — https://www.conductor.build/changelog/0.77.0-early-access-multiplayer-api-background-tasks-performance
- [S23] Releasebot, Conductor release notes (iPhone app details) — https://releasebot.io/updates/conductor
- [S24] 0.85.0 Sections, routines and a new model picker — https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker
- [S25] Docs, API and MCP — https://www.conductor.build/docs/api
- [S26] Hacker News, "Show HN: Conductor" — https://news.ycombinator.com/item?id=44594584
- [S27] madewithlove, "Conductor: running multiple AI coding agents in parallel" — https://madewithlove.com/blog/conductor-running-multiple-ai-coding-agents-in-parallel/
- Other changelog entries used for single features: 0.35.0 workspace status — https://www.conductor.build/changelog/0.35.0-workspace-status; 0.50.0 steering and keep-awake — https://www.conductor.build/changelog/0.50.0-steering; 0.37.0 Manual Mode (a built-in file editor) — https://www.conductor.build/changelog/0.37.0-manual-mode; 0.48.5 effort toggle — https://www.conductor.build/changelog/0.48.5-effort; 0.52.0 completion sounds — https://www.conductor.build/changelog/0.52.0-sounds-colors

AutoKolab facts come from the project guide, the decisions (DEC-1 to DEC-26) and the code on `main` at commit 03c3a36.
