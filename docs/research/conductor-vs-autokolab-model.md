# Follow-up study: Conductor's model and AutoKolab's, and what to build next

Ticket AK-121 · written 15 Oct 2026 · by yvssaratchandra-claude · follows AK-118 ([conductor-case-study.md](conductor-case-study.md))

AK-118 compared features one by one. This study compares the two **ways of working**: who drives, how work starts, how agents run, how people see it, how it's reviewed and what it costs. It goes deeper into Conductor's advanced features, designs parallel tickets for one AutoKolab agent, gives frank feedback, and ends with one ranked build order for both studies.

Public sources only; nothing was installed or decompiled. Sources are numbered [S1]… as in AK-118, with new ones from [S28]. Anything a source didn't confirm is marked **unconfirmed**. AutoKolab facts come from the code on `main` (commit e9ef3a4) and from this repo's GitHub history.

## The short answer

- **Conductor gives one person many hands.** The person is the lead. They start four or more agents on one Mac, watch each chat, and review each change themselves [S7][S27].
- **AutoKolab gives a team a foreman.** Captain is the lead. It writes tickets, agents on many machines build them, Captain reviews and merges, and people step in for decisions.
- **The big gap is parallel work per agent.** Each AutoKolab agent builds one ticket at a time. One Conductor user runs several at once. We can close most of that gap with a careful "two tickets at once" setting, but only after four small fixes (section 3).
- **Our model is stronger where Conductor's users hurt most:** no memory between workspaces, the person as the only reviewer, no spend caps, Mac only [S19][S27].
- **Our model is weaker on speed of correction, on overhead per run, and on how easy it is to understand at first sight.** Section 4 is frank about this.
- **Build first:** a setup script per worktree, conflicts sent back to the builder instead of to a person, a port per worktree, a guard against two tickets touching the same files, then two tickets at once (section 5).

---

## 1. The two models side by side

### At a glance

| | Conductor | AutoKolab |
|---|---|---|
| **Who drives the work** | The person. They decide every task, write every prompt, and choose when to review and merge [S7]. | Captain, the lead agent. People say what they want; Captain writes tickets with "done means", assigns them and reviews (DEC-10, DEC-22). |
| **How work is split** | The person splits it: "the workspace is the unit of delegation. The branch and pull request are the unit of integration" [S7]. Plan mode can suggest a split [S12]. | Captain splits it into tickets. Big work arrives as a plan the person OKs first (AK-81, CON-23). Tickets can be blocked by other tickets. |
| **How work starts** | The person presses ⌘N and types a prompt (the Dispatcher), or picks a branch, PR, GitHub or Linear issue [S13][S15]. | Captain moves a ticket to Ready. The agent's runner claims the next Ready ticket by priority (`claimNext` in `core/projects.ts`) and starts on its own. |
| **How many run at once** | As many workspaces as the person opens. Users report about four [S26][S27]. No limit is documented [S7]. | **One ticket per agent.** The runner has one `busy` flag and one `current` run (`runner/runner.ts`, `work()`). Parallel work equals the number of connected agents. |
| **Isolation** | A git worktree per workspace on the person's Mac. "Development isolation, not a security boundary" [S6]. Paid cloud: a small Linux sandbox per agent [S11]. | A git worktree per ticket under the helper's data folder, on the owner's machine (`runner/repos.ts`). Owner-set limits: protected branches, forbidden paths, minutes per task, hours per day (DEC-12). |
| **Machines** | One Mac, or Conductor's cloud [S11][S19]. | Many machines, macOS and Linux, owned by different people (DEC-1, DEC-14). |
| **How people see progress** | A sidebar of workspaces with a status (backlog, in progress, in review, done), unread marks, sounds and each agent's live chat [S4]. | Overview: one sentence, feature columns, Team and "Worth watching" (`workspace/glance.ts`). The board, ticket steps and the Room. Agents' raw transcripts stay on their machine (DEC-3). |
| **How work is reviewed** | The person reads the diff, comments on lines, and can ask an agent to review [S16]. The Checks tab gathers CI, comments and todos [S18]. | Captain reviews the exact commit and records why (AK-59, AK-80). Small safe changes and re-reviews get a lighter, cheaper review (AK-117). Nobody approves their own work. |
| **How work is merged** | The person merges, or turns on automerge so a PR merges when CI passes (0.45, 0.55) [S35]. | Captain's runner merges safe changes once tests pass. Risky ones (database, CI, dependencies, auth) wait for a person's OK (DEC-19). |
| **Cost in tokens** | Only the agents' own chats, plus an optional AI review. Every extra workspace adds its full cost: "four agents = four times API consumption" [S27]. | The builds, plus overhead: every run is briefed with the guide, decisions and board, and Captain runs for questions, reviews and replies. Recent work cut this (AK-90, AK-91, AK-115, AK-116, AK-117). Measured per run in `run_usage` (migration 020). |
| **Cost in people's time** | High. The person dispatches every task and is "still the quality gate" for every change [S27]. | Low per change. People read summaries and answer "Needs you". But they must learn more ideas first: tickets, goals, Captain, the Room, decisions, merge settings. |
| **Price** | Free locally; $50–$60 a person a month for cloud and team features [S3]. | Free and open source. You pay only for the agents you already have. |

### What the record says about our model

From this repo's GitHub history (all merged PRs, read 15 Oct 2026):

| Fact | Number | What it tells us |
|---|---|---|
| PRs merged 9–15 Oct | **88** in six working days (20, 25, 24, 3, 6, 10 a day) | The team ships a lot, with very little human typing. |
| Built by one worker agent | **76 of 88** came from one GitHub account on jamesblack's machine | Almost all of it was built **one ticket after another** by one agent. Parallel work came only from a second machine. |
| Time from PR opened to merged | Median **15 minutes**; 45 of 88 under 15 minutes | Captain's review and auto-merge are fast when nothing is risky. |
| PRs that waited over an hour | **27 of 88** | Mostly waiting for a person (risky changes, the old "Ask me" setting) or overnight. People, not agents, are our slow step. |

The runner side, in code:

- `work()` returns at once if `busy` is set, so a second Ready ticket waits until the first run ends, even when the machine is idle otherwise.
- The agent's live status has one `current_ticket_id`. Overview's Team block shows one state per agent (`teamState` in `glance.ts`).
- The daily limit is time used per agent per day (`max_hours_per_day`, default 3). An API-model agent also has a dollar limit (CON-25).
- `run_usage` stores one row per run: kind (build, review, reply, question), model, tokens, seconds and cost. That's what lets us measure any change in section 5 before and after.

---

## 2. Conductor's advanced features in depth

For each: how it works, and whether the idea fits AutoKolab's model.

### 2.1 Parallel agents per person

- **How it works.** Each task gets its own workspace: a git worktree, branch, terminal, diff and review path [S2][S6]. The person picks between two shapes: several agents **in one workspace** when they "should share the same files and context", or a **new workspace** when work "should have its own branch, files, running environment, and review path" [S7]. No limit on the number is documented [S7]. Users run about four [S26][S27].
- **What users found.** Four agents fixed four bugs in about ten minutes. But "four parallel agents potentially mean four times as many bugs to catch", tokens grow with each agent, and "each workspace starts without memory of previous decisions" [S27].
- **Fits our model?** **Yes, the idea fits**, as "one agent may build up to N tickets at once". Our model fixes the two things that hurt users: Captain reviews, so the person isn't the bottleneck, and the guide and decisions brief every run. Designed in section 3.

### 2.2 Checkpoints, fork and compare

- **Checkpoints.** Before each message, Conductor saves the branch's state in a private git ref. Reverting to a turn deletes that turn and every later message and code change, and "the agent will have no knowledge" of them. It warns against using checkpoints with several chats in one workspace [S14].
- **Fork.** Makes a new workspace "with the changes up to that fork point, and a summary of your chat" [S29], so a person can try a second approach.
- **Compare.** Run Claude Code and Codex on the same task in separate tabs or workspaces and compare their approaches [S36][S27]. There is no side-by-side compare screen that we could confirm (**unconfirmed**).
- **Fits our model?** **Mostly no.** These help a person steering one chat turn by turn. Our agents commit and push often, so git is the undo, and a reviewer sends work back through the ticket. Compare doubles the cost of a ticket. **One idea worth keeping for later:** for a rare, hard ticket, Captain could ask two agents from different vendors for a plan (not code) and pick one. That's cheap compared to two builds. Ranked low in section 5.

### 2.3 Several agents or chats on one branch

- **How it works.** ⌘T opens another chat in the same workspace [S28]. A plan from one chat can be handed to another agent in the same workspace to build ("hand off plans") [S30]. The docs' example: one agent reviews while another fixes tests [S7].
- **Fits our model?** **Partly, and we already do the useful part.** Captain reviews a worker's branch, and a reviewer's comment resumes the builder (AK-4). Two agents writing to one worktree at once would make "who did this" hard to see and would break "nobody approves their own work" bookkeeping (a ticket's builders, migration 021). Keep one builder per ticket.

### 2.4 Steering mid-run

- **How it works.** When you type while an agent is busy, you choose whether the message waits in a queue or steers the agent now ("Choose your preferred follow-up behavior in Settings → General") [S31]. Message queues existed from the first release [S4]. Exactly how steering is delivered is **unconfirmed**.
- **Our model today.** A comment on a ticket waits until the current run ends, then resumes the agent with the comment (`newComments` in `nextTicket()`). A run can last up to 60 minutes (`max_minutes`). Pause stops a run at once.
- **Fits our model?** **Yes, in a small form.** A person or Captain who spots a wrong turn shouldn't wait up to an hour while the agent keeps building the wrong thing. Claude Code can take more user messages during a run when started with streamed input (`--input-format stream-json`; **unconfirmed** for our exact use, check against the installed version first). Codex and OpenCode support is **unconfirmed**. Where the engine can't, keep today's behaviour. Ranked in section 5.

### 2.5 The Dispatcher and the iPhone app

- **Dispatcher.** ⌘N opens a box: type a task, a workspace starts. A "create more" toggle lets you "keep dispatching requests" one after another [S13].
- **iPhone app** (0.90, 2 Oct 2026). "Chat with agents and merge PRs from your phone. Works with cloud workspaces." Notifications show the chat's title [S34]. It works only with cloud (paid) workspaces [S34][S3].
- **Fits our model?** **Yes, both, already planned.** The Dispatcher is AK-85 (message Captain from anywhere with ⌘L); copy the "create more" idea. The phone app is AK-88. Ours can do better than Conductor's: it works with agents on our own machines (no cloud needed, because the website reads the database), and it notifies only when a decision waits, not whenever an agent finishes.

### 2.6 Routines

- **How it works.** "Run your agents on a schedule or via GitHub action." They run only in Conductor's cloud, so only on paid plans [S24].
- **Fits our model?** **Later, and a person must decide.** A routine starts work nobody asked for that day, which touches "no autonomous decisions about what to build". It would run on an owner's machine through the runner, and it spends agent time every time it fires, so it needs its own daily cap. Good uses: a weekly dependency check, a nightly flaky-test hunt.

### 2.7 Cloud and multiplayer

- **How it works.** Each cloud agent runs in its own Linux sandbox "with your repos and dependencies pre-installed", and keeps working after you disconnect. The organisation's "cloud computer" stores "repositories, environment variables, secrets, and installed software" [S11]. In multiplayer, "workspaces, chats, and presence are shared across the organization": teammates browse everyone's work, add to a teammate's chat, follow workspaces and "Reassign to" someone else [S11][S22]. An API and an MCP server let tools and agents create workspaces and send prompts [S22][S33].
- **Fits our model?** **Multiplayer: we already are it**, in our own way: a shared board, Room and Captain across machines and people. **Cloud: no.** It stores code and secrets on a server, against DEC-2 and DEC-3. The real need behind it, "keep working when my laptop sleeps", is met more cheaply by keeping the machine awake while a run is going (AK-118 rank 4) and by having agents on several machines.

### 2.8 The diff and review flow

- **How it works.** A diff viewer per workspace, one commit at a time if you like. Comments on lines go to the agent "so the agent gets more precise context". GitHub review comments come in, and resolving them updates the Checks tab [S16]. A "Review" action asks an agent to review [S7]. The Checks tab gathers git status, PR details, CI, deployments, comments and todos, and "may block or discourage merge actions" while todos or checks are open [S18]. Automerge merges a PR when CI passes [S35].
- **Fits our model?** **The review itself: we're ahead.** Captain reviews every change against the ticket's "done means", approves the exact commit, and a person only sees risky ones. **Two gaps worth closing:** GitHub line comments don't reach the builder (AK-118 rank 2), and the ticket doesn't link to each file's diff (AK-118 rank 7).

### 2.9 Run scripts, ports and setup

- **How it works.** Settings live in the repo, now in `.conductor/settings.toml` (AK-118 called it `conductor.json`, its older name [S21]). A **setup** script runs when a workspace is made (install packages, generate files, make links). **Run** scripts start the app from a button; several can be named. An **archive** script cleans up. Each workspace gets a name and **ten ports**, `CONDUCTOR_PORT` to `CONDUCTOR_PORT+9`. A run mode says whether run scripts may run in several workspaces at once ("concurrent") or stop each other ("nonconcurrent", for fixed ports or one shared database) [S10].
- **Fits our model?** **Yes, and it's the groundwork for parallel tickets.** A setup script saves every run from installing packages itself. A port range per worktree stops two runs fighting over a port. Our `npm run look` already picks a free port for itself (`freePort()` in `scripts/look.mjs`), so the port item is smaller than AK-118 thought. A Run button is still out: the website must never start things on a machine (DEC-6).

### 2.10 Other advanced features found

| Feature | How it works | Fits our model? |
|---|---|---|
| **Background-task timers** (0.77) | "Chats now show when an agent is waiting on background work, with a dedicated timer" [S22]. | **The idea, yes.** Overview should say "running the tests, 4 minutes" rather than just "working". Small, and honest. |
| **Ultracode** (0.61) | "Combines x-high effort and dynamic workflow orchestration to help Claude take on the hardest tasks." Conductor says it isn't sure it works [S32]. | **No.** Captain already sets model and effort per agent (DEC-18). |
| **Conductor MCP** (0.82) | Agents can "create and manage cloud workspaces, read sessions" [S33]. | **Already ours.** Agents use AutoKolab's MCP tools to read tickets and talk. |
| **Multiple repos in one workspace** (0.25.6) | `/add-dir` lets an agent edit several repos [S29]. | **Not now.** One project is one repo. |
| **Automerge and merge queue** (0.45, 0.55) | A PR merges itself once CI passes; queued PRs show as queued [S35]. | **Already ours**, with review on top (DEC-19). |
| **Speed** (Allegro, 0.49) | The app was rebuilt "to make it twice as fast" [S37]. | **The lesson, yes.** Speed is a feature people notice. Our pages should stay quick. |

---

## 3. Parallel tasks in AutoKolab: one agent, several tickets

### The idea

A new per-agent setting, `max_parallel`, set by the owner in the agent's toml file next to the other limits. It means "this agent may build up to N tickets at the same time". Each ticket keeps its own worktree, branch, session and PR, exactly as today. The runner just runs up to N of them at once.

### The option that exists today

You can already get parallel work **without any code**: connect a second agent on the same machine (for example a second Claude agent on the same subscription). It works, but:

- it shows as a second teammate, so the Team block, People and "who built it" double up for one subscription;
- the two agents don't know they share one plan's usage limit, so each plans its day as if it had the whole plan;
- Captain has to split work between them by hand.

That's fine as a stopgap. `max_parallel` is cleaner: one agent, one owner, one daily limit, several tickets.

### What has to change

| Part | Today | With `max_parallel` |
|---|---|---|
| **The runner's loop** | One `busy` flag and one `current` run in `runner.ts`. | A set of running slots. `work()` fills free slots with Ready tickets, up to N. Room replies, Captain's questions and reviews stay one at a time at first. Pause stops every slot. The updater (`holdIfIdle`) waits until all slots are empty. |
| **Worktrees** | One per ticket already (`ensureTicketWorktree`). | No change to the worktrees. But two slots share one clone, so `git fetch` and `git worktree add` must take turns: add a lock per clone so they never run at the same moment. |
| **Saved state** | One state file per agent (sessions, comments seen, notes). | Same file, but writes must go through one queue so two slots can't overwrite each other's changes. |
| **Ports** | `npm run look` picks a free port. Nothing else does. | Each slot gets its own range, like Conductor's ten ports [S10]: `AUTOKOLAB_PORT` and `AUTOKOLAB_TICKET` set for the run. Needs the port item in section 5. |
| **Setup script** | None. Each run installs packages itself. | A setup script from the repo runs once per new worktree, before the agent starts. With two slots this matters twice as much. Needs the setup item in section 5. |
| **Daily limits** | `max_hours_per_day` counts each run's time. | Keep counting **agent time**, summed over slots: two tickets for an hour is two hours. That's honest about what the subscription used. The day's limit is reached sooner by the clock, and the Team block's "time used today" stays true. Minutes per task stay per ticket. |
| **Usage-limit waits** | One `limitWait` record; the agent waits until the plan resets. | One subscription has one limit, so when any slot hits it, **all** slots stop and wait, and each resumes its own ticket after. |
| **Status and Overview** | The agent reports one `current_ticket_id`; the Team block shows one state per agent. | The agent must report every running ticket. That needs a small database change (for example a list of running tickets on the agent, or one row per live run): a migration, so ask first. Overview's Team row then reads "building 2 · Checkout page, Invite expiry". Each ticket card on Work already shows its own state. |
| **Captain** | Assigns tickets; the runner picks the next Ready one by priority. | Captain must not let two tickets that touch the same files run at the same time. Tickets already have a "Where" section; make it a list of paths or areas, and have both Captain (when it makes tickets Ready) and the runner (when it fills a slot) skip a ticket whose areas overlap a running one. The overlap check helps today too, across different agents. |
| **Captain's reviews** | One review at a time on Captain's runner. | More builders means more reviews. Today's median of 15 minutes from PR to merge could grow. Captain may later need two review slots of its own (reviews only read code, so they don't clash). |
| **Conflicts** | A PR that conflicts with `main` after approval sets **Needs you** on the ticket (`mergeDecision` in `runner/merge.ts`). | Parallel work makes conflicts more likely. A conflict must go back to the builder as a ticket comment, like failing tests do, and reach a person only if the builder can't fix it. Otherwise parallel work breaks "only interrupted for decisions". |

### Risks

| Risk | How likely | What to do |
|---|---|---|
| **Merge conflicts** | Higher with each slot. Two tickets on nearby code will clash when the first merges. | The overlap guard; send conflicts back to the builder automatically; keep N small. |
| **Plan usage limits** | Certain. A subscription's limit is shared by all of its sessions (**unconfirmed** in detail; this is how Claude and ChatGPT plans are described publicly), so two slots reach it about twice as fast by the clock. | Count summed agent time. Drop to one slot automatically after a usage-limit wait today, or once 80% of the daily hours are used. |
| **Cost** | Tokens per ticket should stay about the same: the same work, done sooner. The extra cost is rework after conflicts and re-reading `main` after it moved. Not measured yet. | Measure with `run_usage`: build tokens per merged ticket, and conflict send-backs, before and after. Turn it off again if build tokens per ticket rise by more than about 10%. |
| **The machine** | Two builds at once mean two test runs and two dev servers at once. A small laptop gets slow. | The owner chooses N. Default stays 1. |
| **Harder to follow** | A person sees more things happening at once. | One Team row per agent that lists its tickets; one card per ticket. Never a separate screen for slots. |
| **Captain becomes the bottleneck** | Likely once builders double. | Watch the "waiting for review" item in Worth watching; add review slots later if it fires often. |

### Recommended default

- **`max_parallel = 1` for every agent.** Nothing changes unless an owner asks for it.
- **An owner may set 2.** Allow up to 3; refuse more, with a plain message saying why.
- **Captain keeps 1** for building. Its reviews may get their own second slot later.
- **Automatic step-down to 1** after any usage-limit wait that day, or at 80% of the daily hours.
- **Only after these are in place:** the setup script, a port per worktree, the overlap guard, and conflicts going back to the builder. Without them, two slots mean more failed runs and more interruptions, not more work done.

---

## 4. Frank feedback on AutoKolab's model

### Where we're weaker

1. **One ticket at a time is slow.** A Conductor user runs four tasks at once on one Mac. Our best day, 25 PRs, came from one worker building one after another. When there are five small Ready tickets, four wait for no good reason.
2. **Corrections are slow.** A comment waits until the current run ends, up to 60 minutes. Conductor lets you steer within the turn. An agent building the wrong thing keeps building it, and we pay for every minute.
3. **Each run carries overhead Conductor doesn't have.** Every run is briefed with the guide, rules, decisions and board: several thousand words before the ticket itself (an estimate from this ticket's own briefing). Captain also runs for questions, reviews and replies. Prompt caching and AK-90, AK-91, AK-116 and AK-117 have cut this a lot, but it's built into the model. Conductor's cost is the chat and nothing else.
4. **A conflict interrupts a person.** Today a conflicting PR asks a person to fix it. That breaks our own rule, "only interrupted for decisions".
5. **People's waits are our slowest step.** 27 of 88 PRs waited more than an hour, mostly for a person or overnight. Conductor's users merge when they're ready; our risky merges wait in a queue nobody is told about yet (no notifications until AK-87 and AK-88).
6. **"What is it doing right now?" is harder to see.** Conductor shows each agent's live chat. We show a status sentence and steps, and keep transcripts on the agent's machine on purpose (DEC-3). That's right for privacy, but "working" for 40 minutes tells a person very little. A line like "running the tests, 4 minutes" would help a lot.
7. **It's a lot to learn.** Captain, goals, tickets, done means, the Room, decisions with numbers, contracts, merge settings, limits in a toml file. Conductor's whole idea fits in one sentence: one workspace per task, a chat in each. A new person opening AutoKolab needs the Overview sentence to carry far more weight than it does today.
8. **Captain is one machine.** One Captain, on one person's computer, reviews and merges everything. When that laptop sleeps, finished work stops. Conductor has no such single point, because the person is the lead.
9. **Each worktree starts cold.** Every new worktree installs packages again, inside the agent's run, using its tokens. Conductor solved this with setup scripts long ago [S10].

### Where we're stronger

1. **Many machines, many people, any vendor, macOS and Linux.** Conductor is one Mac or a paid cloud [S19].
2. **The person isn't the quality gate.** Captain reviews every change against its "done means" and approves the exact commit. Conductor's users say the review burden grows with each agent [S27]. Ours doesn't, for safe changes.
3. **The team remembers.** The guide, the decisions and the ticket brief every run. Conductor users said "each workspace starts without memory of previous decisions" [S27].
4. **Work is written down before it starts.** A ticket says what "done" means. Anyone can read what an agent was asked to do, and why.
5. **Limits and spend caps exist.** Hours per day, minutes per task, dollars per day for API agents, protected branches, pause. Conductor: "Spend caps do not exist" [S19].
6. **An audit trail.** History is written by the database, and each run's usage is recorded. Conductor documents no audit log [S19].
7. **It costs nothing extra and keeps code off our servers.** Conductor's team features cost $50–$60 a person a month and store the code and secrets in its cloud [S3][S11].
8. **Fast when nothing's risky.** A median of 15 minutes from PR opened to merged, with no person involved.

### What we should learn, even where we don't copy

- **Name the unit of work plainly.** "The workspace is the unit of delegation. The branch and pull request are the unit of integration" [S7]. We should say the same about tickets in one sentence on the website.
- **Settings in the repo travel with the code.** Conductor's scripts live in `.conductor/settings.toml` [S10]. Our setup script should live in the repo too, not in each owner's toml.
- **Show the boring truth.** Background-task timers [S22] are a small thing that makes "working" believable.
- **Be candid in the docs.** "Development isolation, not a security boundary" [S6] builds trust. Our GUIDE.md should be as plain about what the limits do and don't protect.
- **Ship small and often, and keep the app fast** [S4][S37]. People notice speed.
- **Let people choose how follow-ups behave** [S31]: wait for the run, or reach the agent now.

---

## 5. One ranked build order

All items from AK-118's list and this study, in the order I'd build them.

**Effort:** S = a day or two for one agent; M = about a week or a few tickets; L = a goal of its own.
**"See it"** = the effect on "many agents working together, and easy to see what's happening".
**Cost** = the effect on what the team spends in agent time and tokens.
"AK-118 #n" marks items from the first study.

| Rank | What it is | Effort | Needs first | See it | Cost |
|---|---|---|---|---|---|
| **1** | Each new worktree runs a setup script kept in the repo (e.g. `npm ci`) before the agent starts. (AK-118 #1) | S | Nothing | Fewer runs fail on setup; the agent's first steps are about the ticket. | **Saves.** No agent turns spent installing packages. |
| **2** | A PR that conflicts with `main` goes back to its builder as a ticket comment, not to a person. | S | Nothing | People are interrupted only for decisions again. | **Small spend:** one resume per conflict, instead of a person's time. |
| **3** | Each run gets its own port range and name (`AUTOKOLAB_PORT`, `AUTOKOLAB_TICKET`). (AK-118 #3) | S | Nothing | Agents on one machine stop tripping over each other's servers. | **Saves** retries. |
| **4** | Tickets list the areas they touch; Captain and the runner never run two overlapping tickets at once. | M | Nothing | Fewer conflicts between agents, today and with parallel tickets. | **Saves** conflict rework. |
| **5** | One agent may build up to 2 or 3 tickets at once (`max_parallel`, default 1), with Overview listing each running ticket. | L | 1, 2, 3, 4; a migration for running tickets (ask first) | **The biggest gain:** more work at once from the same agents, still one row per agent. | About the same per ticket; more per hour. Plan limits are reached sooner by the clock. |
| 6 | Each run's path (build, re-review, light review) and conflict send-backs are recorded, so Results can compare before and after. (Already ticketed as AK-120.) | S | Nothing | Proof of whether a change helped. | Free; needed to judge 5. |
| 7 | Keep the computer awake while a run is going (`caffeinate` on macOS, `systemd-inhibit` on Linux, checked without `sudo`). (AK-118 #4) | S | Nothing | Fewer stalled tickets, and Captain's machine keeps reviewing. | Neutral. |
| 8 | Overview says what a working agent is doing now and for how long ("running the tests, 4 minutes"). | S | Nothing | Answers "what's it doing?" without a transcript. | Free. |
| 9 | Tell people only when a decision waits: a browser notification first, then the phone app. (AK-118 #5; AK-87, AK-88) | M | Nothing | The core promise: interrupted only for decisions, and told when there is one. | Free; shortens the 27 long waits. |
| 10 | GitHub review comments on a PR are copied to the ticket and resume the builder. (AK-118 #2) | M | Nothing | One place for feedback: the ticket. | Neutral: one resume per comment. |
| 11 | A comment on a running ticket reaches the agent during its run, where the engine allows it (Claude Code first). | M | Check the engine flags first | Faster corrections; a person sees the agent change course. | **Saves** minutes spent building the wrong thing. |
| 12 | Captain's runner may review two PRs at once. | M | 5 | Keeps review fast once builders double. | Neutral. |
| 13 | "Show the work" links each changed file to its diff on GitHub. (AK-118 #7) | S | Nothing | One click from ticket to change. | Free. |
| 14 | The PR's preview link shows in Evidence. (AK-118 #9) | S | Nothing | Proof a person can click. | Free. |
| 15 | A ticket's worktree is removed when the ticket is Done, with an optional cleanup script. (AK-118 #8) | S | 1 | — | Free; saves disk. |
| 16 | Point Captain at a GitHub issue and it writes the ticket. (AK-118 #6) | M | Nothing | Outside requests come in like everything else. | One Captain run per issue. |
| 17 | Message Captain from anywhere, with a "create more" toggle. (AK-118 #10; already AK-85) | — | Planned | Faster to ask. | Neutral. |
| 18 | Routines: a chore runs on a schedule or GitHub event, with its own daily cap. (AK-118 #11) | M | A person's yes (it starts work nobody asked for) | — | **Spends** agent time every time it fires. |
| 19 | For a rare hard ticket, Captain asks two agents for a plan and picks one before anyone builds. | M | 5 | A visible second opinion. | **Spends** one extra plan run. |

Not worth building (reasons in AK-118 section 5 and section 2 here): checkpoints, forking a workspace, comparing two full builds, several agents writing to one branch, a terminal or editor, a Run button, cloud agents, stacked PRs, loadouts, Ultracode.

### Why the first five, in this order

1. **The setup script first.** It's small, it saves tokens on every ticket today, and it's the first thing parallel tickets need. Nothing has to change for anyone to benefit.
2. **Conflicts back to the builder second.** It fixes a place where we break our own rule today. Parallel work would make it happen more often, so it must come before 5.
3. **Ports third.** Small, and without it two slots on one machine would fight over servers and test runs. `npm run look` already handles itself, so this mostly covers dev servers and tests.
4. **The overlap guard fourth.** It's the one real design piece: tickets say what they touch, and nothing overlapping runs at once. It pays off even before 5, because today's agents on different machines can clash too.
5. **Parallel tickets fifth.** It's the biggest gain for "many agents working at once", but it's an L, needs a migration, and only works well once 1–4 are in. Start with one owner trying `max_parallel = 2`, and measure with `run_usage` (rank 6) before telling everyone.

Ranks 6 to 9 are small and can run alongside, on other agents. 6 should land before 5 is turned on for anyone, so there's a "before" to compare with.

---

## 6. Sources

All read on 15 Oct 2026. [S1]–[S27] are AK-118's and are listed there in full; the ones used here are repeated below. New sources start at [S28].

- [S2] Docs, introduction — https://www.conductor.build/docs
- [S3] Pricing — https://www.conductor.build/pricing
- [S4] Changelog — https://www.conductor.build/changelog and https://www.conductor.build/changelog.md (newest: 0.90.0, 2 Oct 2026)
- [S6] Docs, isolated workspaces — https://www.conductor.build/docs/concepts/workspaces-and-branches
- [S7] Docs, workflow and parallel agents — https://www.conductor.build/docs/concepts/workflow and https://www.conductor.build/docs/concepts/parallel-agents
- [S10] Docs, scripts — https://www.conductor.build/docs/reference/scripts (settings now in `.conductor/settings.toml`; ten ports per workspace; concurrent and nonconcurrent run modes)
- [S11] Docs, Conductor Cloud — https://www.conductor.build/docs/cloud-beta
- [S12] Docs, agent modes — https://www.conductor.build/docs/concepts/agent-modes
- [S13] 0.63.0 Cursor support and Dispatcher — https://www.conductor.build/changelog/0.63.0-cursor-support-dispatcher
- [S14] Docs, checkpoints — https://conductor.build/docs/reference/checkpoints
- [S15] Docs, issue to PR — https://www.conductor.build/docs/guides/issue-to-pr
- [S16] Docs, diff viewer — https://www.conductor.build/docs/reference/diff-viewer
- [S18] Docs, checks — https://www.conductor.build/docs/reference/checks
- [S19] Continuum Code, "Conductor review 2026" — https://continuumcode.ai/guides/conductor-review/
- [S21] 0.11.0 `conductor.json` — listed in [S4]
- [S22] 0.77.0 early-access multiplayer, API, background tasks — https://www.conductor.build/changelog/0.77.0-early-access-multiplayer-api-background-tasks-performance
- [S24] 0.85.0 Sections, routines and a new model picker — https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker
- [S26] Hacker News, "Show HN: Conductor" — https://news.ycombinator.com/item?id=44594584
- [S27] madewithlove, "Conductor: running multiple AI coding agents in parallel" — https://madewithlove.com/blog/conductor-running-multiple-ai-coding-agents-in-parallel/
- [S28] 0.17.0 Multiple chats — https://www.conductor.build/changelog/0.17.0-multiple-chats
- [S29] 0.25.6 Multiple git repos, fork workspaces — https://www.conductor.build/changelog/0.25.6-multiple-git-repos-fork-workspaces
- [S30] 0.30.0 Hand off plans — https://www.conductor.build/changelog/0.30.0-bug-fixes-claude-code-for-chrome-hand-off-plans
- [S31] 0.50.0 Steering and keep-awake — https://www.conductor.build/changelog/0.50.0-steering (how steering is delivered: **unconfirmed**)
- [S32] 0.61.0 Ultracode and git --improve — https://www.conductor.build/changelog/0.61.0-ultracode-git-improve
- [S33] 0.82.0 Conductor MCP — https://www.conductor.build/changelog/0.82.0-conductor-mcp
- [S34] 0.90.0 Conductor for iOS — https://www.conductor.build/changelog/0.90.0-conductor-for-ios
- [S35] Automerge, 0.45.0 and 0.55.0 — https://www.conductor.build/changelog/0.45.0-file-previews-codex-personalities and https://www.conductor.build/changelog/0.55.0-per-repo-spotlight-html-previews (found through search results; the entries' wording **unconfirmed** beyond the summary)
- [S36] Conductor vs Codex — https://conductor.build/compare/codex
- [S37] 0.49.0 Conductor Allegro — https://www.conductor.build/changelog/0.49.0-conductor-allegro-gpt-5-5

**Unconfirmed items, all in one place:**
- How Conductor's steering reaches a busy agent [S31].
- Whether Conductor has a side-by-side compare screen (beyond running agents in separate tabs) [S36].
- The exact automerge wording in 0.45 and 0.55 [S35].
- Claude Code's streamed input for steering our runs (`--input-format stream-json`), and whether Codex or OpenCode can do the same. Check against the installed versions before building rank 11.
- That a subscription's usage limit is shared by all its sessions in the way section 3 assumes. This is how Claude and ChatGPT plans are publicly described; we haven't measured it.
- The size of the per-run briefing ("several thousand words") is an estimate from this ticket's own briefing, not a measurement.

**AutoKolab facts:** `packages/autokolab/src/runner/runner.ts` (`work()`, `busy`, `current`, `nextTicket()`, limits), `runner/merge.ts` (`mergeDecision`), `runner/repos.ts`, `core/projects.ts` (`claimNext`), `sql/020_run_usage.sql`, `apps/site/src/workspace/glance.ts` (`team()`, `teamState`), `scripts/look.mjs` (`freePort()`), and this repo's merged pull requests (`gh pr list --state merged`, 88 PRs from 9 to 15 Oct 2026).
