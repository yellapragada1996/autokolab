# AutoKolab coherence review

15 October 2026 · Research for AK-145 · Proposal, not an approved product decision

## The short version

The app has the right pieces, but it asks a newcomer to learn the team's machinery before they can understand the team's progress. Eight top-level destinations, four views inside Work, two inside Decisions, and several ways to act on the same issue make the product feel like a collection of tools. Captain is already a good, plain chat. Keep it as the front door. Put the answer to **what is happening?** on one separate page, and let people open the record only when they want detail.

This review applies the project goal in AK-145, DEC-22, DEC-24, and the [amendments](../../autokolab-ux-handoff/00-AMENDMENTS.md). The amendments override the older wireframes where they differ. `docs/product-vision.md` is absent in this checkout.

**What I could inspect.** I read the current routes, React screens, sample workspace, styles, Captain prompts, guide, and handoff. I tried `npm run dev -w autokolab-site`; binding to `::1:20000` failed with `EPERM`. I also tried `npm run look` with the 1440 and 390 defaults; Chromium exited at startup with `Operation not permitted` in `sandbox_host_linux.cc`. I therefore could not see or capture the running app at either width, use sign-in, test keyboard or touch interactions, or check live Supabase states. All observations below are **source review**, not measured visual or usability findings. No app screenshots are presented. The existing handoff wireframes show intended design, not today's app.

## 1. What's there today

A new person signs in with GitHub, gives the team a name to call them, creates a project for a GitHub repo, connects an agent on a computer, then lands with Captain. The create flow goes straight to Add an agent. The Agent flow may end by offering “Give it a first ticket”, even though Captain is meant to translate a person's request into work. Sources: [App.tsx](../../apps/site/src/App.tsx), [SignIn.tsx](../../apps/site/src/screens/SignIn.tsx), [Welcome.tsx](../../apps/site/src/screens/Welcome.tsx), [CreateProject.tsx](../../apps/site/src/workspace/CreateProject.tsx), [Connect.tsx](../../apps/site/src/workspace/Connect.tsx).

The sample workspace is useful for reviewing structure, but its made-up data does not establish how the live project behaves. Sources: [demo.tsx](../../apps/site/src/workspace/demo.tsx), [router.ts](../../apps/site/src/lib/router.ts), [Workspace.tsx](../../apps/site/src/workspace/Workspace.tsx).

| Page or flow | Purpose in one line | What is on it today | Who it serves |
| --- | --- | --- | --- |
| Sign in and first welcome | Enter with a GitHub identity. | A GitHub button, three product claims, then a name and local time step. The pitch still names only Claude Code and Codex. | New project members. |
| Create or join a project | Link people to one repo. | Name, GitHub repo and editable “ticket prefix”; invited people see project details before signing in. | Owner, invitees. |
| Add an agent | Connect a locally running agent. | Choice of Claude Code, Codex or API provider; model, name and daily spend for API agents; then a terminal command and connection state. A completion action offers a first ticket. | Agent owner, usually a developer. |
| Captain | Tell the team what to do and answer genuine decisions. | One conversation, composer, quiet update fold, catch-up, plan messages and small actions for questions, risky merges and problems. “How do you know?” opens evidence. The empty state asks what to build. | Everyone steering the project. |
| Overview | Explain the current state at a glance. | Count tiles, a state sentence, needs-you and problem panels, a team table, current and next features, recent events, and unfinished setup. | People checking progress. |
| Work | Find and manage units of work. | Four tabs: By agent, By feature, Later, All tickets. The board has search, person filters, quick filters and editable cards. | Builders and anyone investigating progress. |
| Ticket | Inspect one unit of work. | Title, “Needs you”, summary, description, “Done means”, linked issues, steps, activity, status, assignee, priority, type, labels, branch and PR details. Many fields are editable. | Agents, project editors, detail seekers. |
| Plan detail | See the proposed scope before it starts. | Goals, their tickets, what is excluded, likely later asks, and OK or change actions. | Person approving larger work. |
| Room | See the team's conversation. | Chat and threads, an agent-activity toggle, a separate roster and an `@name` composer that can direct an agent. | Curious people and coordinating agents. |
| People | See and configure the team. | People and agents, status, location, usage and spend, model and effort controls, and Captain selection. | Owner and people checking availability. |
| Decisions / Guide | See the rules agents follow. | Two tabs. Decisions lists current and replaced choices, permits recording and replacing decisions, and marks contracts. Guide exposes concept, architecture and rules for editing. | Captain and builders first; auditors second. |
| Results | See what the team delivered. | A period selector, delivery and intervention measures, usage breakdowns, and CSV/JSON audit export. | Owner and people evaluating the team. |
| Settings | Set project policy. | Merge behavior, browser notifications and invites. | Owner, with some member visibility. |
| Look first / evidence / Show the work | Check one change before trusting or approving it. | An in-chat evidence expansion, a risky-merge review step, and a detail sheet with summary, change and history. | Person making a risky decision or checking proof. |
| Search and shortcuts | Jump directly to a place or record. | A command palette includes destinations, tickets, agent setup, new ticket and account actions. | Frequent keyboard users. |

**When Captain needs a decision.** A question, plan or risky merge appears in the Captain conversation with a small “needs you” marker and actions below it. Overview also lists needs-you items and opens the matching Captain message. A ticket can show the same `needs_human` field, with a “Resolved” control. The sample data includes a technical “Redis or Postgres for sessions?” question; that should be settled by Captain from project rules or reframed as a product consequence. Sources: [CaptainHome.tsx](../../apps/site/src/workspace/CaptainHome.tsx), [Overview.tsx](../../apps/site/src/workspace/Overview.tsx), [TicketPage.tsx](../../apps/site/src/workspace/TicketPage.tsx), [demo.tsx](../../apps/site/src/workspace/demo.tsx).

## 2. Critique against the goal

The ranking is about how much a problem prevents someone from **telling Captain a direction, understanding the answer, and seeing what agents are doing**. The wording below is specific to the current source. Visual points need a browser check before implementation.

| Rank | Problem and evidence | Why it hurts | Smallest corrective move |
| --- | --- | --- | --- |
| 1 | **The same state has several homes.** Overview shows a team table and current work; People repeats agent status and work; Work groups tickets by agent and feature; Room repeats a roster. Needs-you is in Captain, Overview and the ticket. See [Overview.tsx](../../apps/site/src/workspace/Overview.tsx), [People.tsx](../../apps/site/src/workspace/People.tsx), [Board.tsx](../../apps/site/src/workspace/Board.tsx), [Room.tsx](../../apps/site/src/workspace/Room.tsx). | People must compare screens to decide which one is authoritative. It breaks the handoff's “one fact in one place” rule. | Give each fact one home: decision in Captain, current state on Progress, identity and controls on Team, raw conversation in detail. |
| 2 | **A new person is invited into the work system too early.** The navigation exposes eight destinations and Work adds four modes; Create Project asks for a ticket prefix; Connect offers a first ticket. See [Workspace.tsx](../../apps/site/src/workspace/Workspace.tsx), [CreateProject.tsx](../../apps/site/src/workspace/CreateProject.tsx), [Connect.tsx](../../apps/site/src/workspace/Connect.tsx). | The first task should be “tell Captain what you want built”, yet the flow teaches tickets and boards before that. | Make the first successful connection lead to Captain with one example request. Keep the ticket prefix automatic and tuck Work behind progress detail. |
| 3 | **People can be asked to do Captain's job.** A ticket can display and dismiss `needs_human`; Decisions offers “Record a decision”; Room tells people to `@name` an agent to send work; the demo asks a person to choose Redis or Postgres. See [TicketPage.tsx](../../apps/site/src/workspace/TicketPage.tsx), [Decisions.tsx](../../apps/site/src/workspace/Decisions.tsx), [Room.tsx](../../apps/site/src/workspace/Room.tsx), [demo.tsx](../../apps/site/src/workspace/demo.tsx). | People are pulled into implementation and coordination. A “Resolved” click can close a question without giving an answer. | Captain handles technical choices and agent dispatch. People answer only product, risk and policy choices through Captain. Keep expert edit controls in a deliberate detail mode. |
| 4 | **The current Overview contains more than a glance.** It starts with count tiles, including zero states such as “Nobody free”, then headline, panels, team, feature cards and recent activity. The needs-you panel uses an amber filled surface. See [Overview.tsx](../../apps/site/src/workspace/Overview.tsx), especially `PulseStrip` and `NeedsPanel`. | A person has to scan several summaries before finding the answer. Zero tiles and repeated amber compete with DEC-24's small, ordinary decision mark. | Start with one state sentence and a short “You are needed” line only when true. Put agents and goals in two compact lists; fold activity and counts. |
| 5 | **The product vocabulary shifts by page.** Sign-in says “room, board and project memory”; Overview says “features”; Work says “By feature” but ticket detail says “Child issues” and “Done means”; Decisions shows “Contract (API, schema)”; setup says “ticket prefix”. See [SignIn.tsx](../../apps/site/src/screens/SignIn.tsx), [Workspace.tsx](../../apps/site/src/workspace/Workspace.tsx), [TicketPage.tsx](../../apps/site/src/workspace/TicketPage.tsx), [Decisions.tsx](../../apps/site/src/workspace/Decisions.tsx). | The reader has to infer how a goal relates to a feature, ticket or issue. “Contract” and “schema” are useful for builders but not a top-level concept for everyone. | Use goal, task and team consistently in primary copy. Explain a task only when opened. Keep IDs, contracts, model names and file paths in details. |
| 6 | **The visual grammar is not fully unified in source.** The newer Captain and Overview use `--amber`, `--blue` and restrained dots; older SignIn, Room and ticket screens use `--primary`, `--warn`, filled badges, heavier headings and different panel shapes. See [CaptainHome.tsx](../../apps/site/src/workspace/CaptainHome.tsx), [Overview.tsx](../../apps/site/src/workspace/Overview.tsx), [SignIn.tsx](../../apps/site/src/screens/SignIn.tsx), [Room.tsx](../../apps/site/src/workspace/Room.tsx), [TicketPage.tsx](../../apps/site/src/workspace/TicketPage.tsx), [tokens.css](../../autokolab-ux-handoff/tokens.css). | The code has two visual dialects. Actual spacing, wrapping, contrast and phone behavior remain unverified because Chromium would not start. | Consolidate on the handoff tokens and shared components after the structure is simplified; inspect 1440 and 390 layouts. |
| 7 | **Results mixes the answer with audit machinery.** It offers exports at the top and several usage measures after the delivery story. See [ResultsPage.tsx](../../apps/site/src/workspace/ResultsPage.tsx). | Someone looking for “what did we get?” meets CSV/JSON and token accounting before choosing to investigate. | Put one outcome sentence and a small number of real measures in Progress; move audit export and usage detail under “Show the record”. |
| 8 | **A stalled project can send a person through setup screens.** With no Captain, chat asks them to pick one on People; with no room membership, it says reload or ask the owner for an invite. See [CaptainHome.tsx](../../apps/site/src/workspace/CaptainHome.tsx). | The first page fails the promise that Captain is the point of contact exactly when setup is incomplete. | Give an owner one clear recovery action; give a member a plain explanation and a route to the owner. Test these states at both widths. |

There is real strength here: Captain's messages are already plain, questions live in the conversation, quiet updates fold away, evidence is close to the claim, and code builds much of Overview from records. Preserve those choices. The critique is about their arrangement and remaining escape hatches, not a request to rebuild the product.

### A few words to change first

| Current wording | Say first | Where the technical term can live |
| --- | --- | --- |
| “Give it a first ticket” | “Tell Captain what you want built” | Task detail. |
| “Ticket prefix” | Hide the generated code unless the owner opens Advanced. | Settings or task IDs. |
| “Done means” | “What will be true when this is finished” | Detailed task editor can retain the field name. |
| “Child issues” | “Tasks in this goal” | Internal API and database. |
| “Contract (API, schema)” | “Technical rule” | Record detail for builders. |
| “Room” | “Team conversation” in the link text; explain that agents use it. | Keep `Room` in URLs and existing records. |

## 3. The target shape

Keep **three primary places**. Keep a small **Project** menu for owner controls and records. This is a proposal to replace the eight-item navigation in DEC-22; it requires raghavendra to accept a new navigation decision before implementation. It preserves DEC-24's separate chat and status page.

| Place | One question it answers | What moves here | What is one click deeper |
| --- | --- | --- | --- |
| **Captain** (first) | “What do I want done, and what decision needs me?” | The chat, plan OK, product questions, risky approvals, and Captain's brief explanations. | Evidence and the linked task or plan. No status dashboard in chat. |
| **Progress** (separate from chat) | “What is happening now, what's next, and what was delivered?” | Overview's state sentence, compact agent activity, goals and recent outcomes; a simple result line from Results. | “See all work” opens the existing board and task details; “Show results” opens full measures and audit. |
| **Team** | “Who is here, and can they work?” | People, agent connection and availability. | Model, effort, limits and machine details in an owner/expert section; Room opens as “Team conversation”. |
| **Project** (small menu, not a daily tab) | “What rules and access apply?” | Settings, invite, merge policy, Guide and Decisions. | Full decision history, contracts, audit export. |

The Work board, tickets, plan page, Room and detailed Results remain real routes and link targets. They become **look-closer pages**, not parallel summaries. “Show the record” should take the reader to the exact task, decision or conversation behind a statement. Nothing is erased from the audit trail. If the team conversation becomes hidden by this proposal, add a direct, visible “Team conversation” link on Team and within each relevant record; transparency must stay one click away. Search can reach every detailed page.

**One consistent path:** “I want Apple Pay” → Captain replies with either a short commitment or a plan → Progress says who is working and what happens next → a click opens the task and its proof → Captain reports delivery in chat. A person never has to create or move a task to get that path started.

**Captain's authority has boundaries.** Captain decides technical implementation, assignment, ordering within an approved goal, routine review, and safe delivery under the project merge policy. It tells the person what it did, with a link to proof. It asks before a new goal or other big work under DEC-17, a real product choice, a conflicting request, or a risky merge under DEC-19. The owner still chooses project policy and controls local agents and their keys. “Complete control” should mean Captain manages the work within those limits, not that it bypasses them.

| Situation | Weak wording | Better wording from Captain |
| --- | --- | --- |
| Technical choice already covered by rules | “Redis or Postgres for sessions?” | “I used Postgres for sessions, as the project rules say. The sign-in work is moving again.” |
| Small request | “Ticket SH-28 created in Ready.” | “I’ve asked Birch to add Apple Pay. You can see its progress under Checkout.” |
| Product choice | “Select the session persistence option.” | “Should people stay signed in on shared computers after they close the browser? Birch is waiting for that choice.” |
| Risky merge | “Approve PR #43?” | “This change keeps existing sign-ins working while adding Google sign-in. Tests passed, but I could not try a live Google account. Is it OK to make it live?” |
| Blocked agent without a human choice | “Agent is blocked; resolve ticket.” | “Birch’s machine reached its daily limit. I moved the next task to Fjord; no action is needed from you.” |

On a decision message, the action should repeat the **specific choice**, not merely say “Yes”. A risk review still shows “How do you know?” and “Show the work”, and uncertainty must remain visible. A plan should say the user-visible outcome and the first reason approval is needed before listing counts or task IDs.

## 4. Captain's role and voice

Current prompts already give Captain autonomy: [projects.ts](../../packages/autokolab/src/core/projects.ts) says to read the code and decisions, delegate, answer workers, review, ask once, and write short messages. [prompt.ts](../../packages/autokolab/src/runner/prompt.ts) applies that guidance to work, questions and reviews. DEC-22 makes Captain the single contact; DEC-24 makes its page a simple chat. [GUIDE.md](../../GUIDE.md) still opens with “lead”, “ticket board” and “room”, and later explains detailed agent machinery. That is accurate history but a poor first explanation of today's product.

What to refine after this proposal is approved:

1. **Manage:** Captain should turn a person's request into an outcome first. It may create technical tasks and choose agents silently. It should give a short initial answer before doing lengthy work, then report the next meaningful state. AK-142 is already tackling reply timing, so the plan below should coordinate with that ticket rather than duplicate it.
2. **Decide:** before forwarding a worker's question, Captain checks the guide, decisions and code, then makes the implementation choice itself when allowed. The current question prompt mostly says this; the same rule needs to apply to plan, review and reply paths. Do not let a ticket's technical `needs_human` surface as a product decision without this pass.
3. **Explain:** one sentence about the outcome and, when useful, one about why or uncertainty. Link to the exact task or evidence. Do not narrate tickets created, model changes or agent-to-agent messages unless the person asks or the consequence matters.
4. **Ask:** name the consequence in ordinary language, state what waits, offer one specific choice, and end with the question. Never ask a person to check a page, read logs, pick a library, clear a stale question, or approve a generic PR. Keep the detailed brief on the task.
5. **Close the loop:** after a person's answer, Captain records the decision if it governs future work, resumes what waited, and later reports the outcome. The person should not need to visit Decisions to make it stick.

The present `LEAD_VOICE` limit of “about 400 characters” is useful but not enough by itself: a short message can still contain jargon or ask the wrong person. Pair it with the decide/explain/ask test above. The [copy guide](../../autokolab-ux-handoff/08-captain-voice-and-copy.md) supplies good patterns, but its old “decision cards”, “briefing”, “side thread” and conflict copy must be read through the amendments and DEC-24; they are not instructions to revive those UI pieces. Update GUIDE.md's introductory user story and terminology as part of the later implementation, without weakening its agent safety rules.

## 5. Ordered plan

These are proposed ticket-sized changes, not tickets yet. **S** ≈ a focused copy or layout change; **M** ≈ one flow across several screens; **L** ≈ a cross-screen behavior change. Captain should turn the accepted plan into tickets after raghavendra decides on the target navigation. Each UI item needs desktop and phone inspection and a small test of its primary path. The first items remove the most clutter.

| Order | Proposed ticket outcome | Effort | Pages or files likely touched | What it removes or folds |
| --- | --- | --- | --- | --- |
| 1 | Make Progress answer “what is happening?” with one sentence, needed action, compact team and goals. | M | `Overview.tsx`, `glance.ts`, `styles.css` | Count tiles with zero states, repeated team metadata, filled amber panel, second-level summaries. |
| 2 | Give the main navigation only Captain, Progress and Team, with Project in a small menu. | M | `Workspace.tsx`, `router.ts`, `CommandPalette.tsx` | Eight equal-weight sidebar destinations; keeps old URLs and direct links working. Requires a new navigation decision. |
| 3 | Make new-project and connected-agent success end in Captain with a plain first request. | S | `CreateProject.tsx`, `Connect.tsx`, `CaptainHome.tsx`, `SignIn.tsx` | First-ticket invitation, visible ticket-prefix lesson, stale two-agent-only pitch. |
| 4 | Make each agent's current work appear once, in Progress, and keep Team focused on people and availability. | M | `Overview.tsx`, `People.tsx`, `Room.tsx`, `glance.ts` | Duplicate work notes and the Room roster. Keep an easy “Team conversation” link. Coordinate with AK-129's live activity work. |
| 5 | Make the full Work board and task editor a deliberate detail layer with a plain default reading view. | L | `Board.tsx`, `Backlog.tsx`, `ListView.tsx`, `TicketPage.tsx` | Four equal Work tabs and always-visible edit controls in the normal reading path; keep expert controls available. |
| 6 | Route every human decision through Captain and have Captain filter technical questions first. | M | `CaptainHome.tsx`, `TicketPage.tsx`, `Decisions.tsx`, `projects.ts`, `prompt.ts` | `Resolved` as a substitute for an answer, direct implementation-choice requests, routine decisions that require manual recording. Coordinate with AK-142. |
| 7 | Put a short delivered-outcomes section in Progress and keep detailed Results behind “Show results”. | S | `Overview.tsx`, `ResultsPage.tsx` | Audit export and usage accounting from the first-glance path; retain the full report. |
| 8 | Make Project the one home for rules, invites and merge policy, with decisions shown as a readable record. | M | `Settings.tsx`, `Decisions.tsx`, `GuidePage.tsx`, `People.tsx` | Separate daily Decisions and Settings destinations; contract terminology in primary navigation. Owner permissions remain. |
| 9 | Unify typography, spacing, status colors and phone layout across the kept pages. | M | `styles.css`, `tokens.css`, shared `ui/`, touched screens | Legacy `--primary` and `--warn` presentation patterns where they contradict the approved status palette; verify rather than guess at 1440 and 390. |
| 10 | Make empty, offline and no-Captain states explain the next useful action in one place. | S | `CaptainHome.tsx`, `Overview.tsx`, `Connect.tsx` | Reload/ask-owner dead ends and repeated setup prompts. |

**Acceptance for the whole sequence:** a new person can sign in, connect an agent and ask Captain for a change without learning what a ticket is; a returning person can say what is happening and whether they are needed after one glance at Progress; a person can inspect proof and the team conversation without losing their place; Captain handles routine technical choices; the owner can still find every policy and full record. These outcomes should be checked in a real browser with both a populated and an empty project. The browser failure above leaves that evidence open for the later builder and reviewer.
