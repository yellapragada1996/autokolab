# Which tabs AutoKolab should have

17 October 2026 · AK-159 · Independent proposal by jamesblack-codex

**Keep three primary tabs: Captain, Overview and Team. Keep Project as a small menu.** Captain is where a person gives direction and answers. Overview explains the work. Team explains who can do it, wherever their computers are. Work, the team conversation, decisions, results and settings remain directly accessible pages.

I would keep the current top-level names. I would change what sits behind them: put the team conversation and invitations with Team; make Work open by goal; give Results a clear “results and usage” description; and give every summary a direct path to its record. A small menu must not make transparency depend on asking Captain for permission to see it.

This is research for raghavendra to compare and choose. It changes no product decision, app code, permissions or roadmap. The recommendation includes future behavior; it does not claim those changes already exist.

## 1. What was checked

| Label | Meaning |
| --- | --- |
| **Verified in code** | Found in the current checkout, baseline `6686733`. Source groups E01–E26 and B01–B14 are linked in the [current-app inventory](inventory.md). This establishes existence, not successful live operation. |
| **Verified in sources** | Found in the linked first-party product documentation, checked on 17 October 2026. |
| **Recommendation** | My judgment. People, job frequency, preferred labels and likely usability need testing with people. No interviews, analytics or comparative product accounts were available. |
| **Decided input** | DEC-22 and DEC-24 in this ticket, the handoff amendments, and the ticket's approved Overview wireframe. A proposed departure is named explicitly below. |

I traced every production route, including onboarding, work modes, overlays, old links and the command palette. I also checked the helper's tools, commands, local setup app and backend capabilities. The inventory separates website features from local-only operations. I did not read the other agent's ticket, branch or output. `docs/product-vision.md` is absent.

**Inspection limit:** web documentation was reachable. The app browser was not usable: Playwright's Chromium failed to launch because `libnspr4.so` is missing. This is a source walkthrough, not a visual or signed-in walkthrough. Phone layouts, live permissions, accessibility and real-time behavior have not been tested here.

### What the current app actually offers

**Verified in code:** the app has the requested three-tab shell already. Captain, Overview and Team sit above a Project menu with Work and records, Team conversation, Decisions, Guide, Results and Settings. Every member also has Search and a project switcher. Team is the label for the `/people` route. [E04](inventory.md#website-routes-and-controls)

| Area today | What a person can see and do | Main reader; likely frequency |
| --- | --- | --- |
| Entry and joining | GitHub sign-in, profile name/local time, create project/repo/prefix, join invite, connect an agent. | Creator, invitee or agent owner; once per project/machine. |
| Captain | Talk to Captain; answer questions; accept/change plans; allow risky merges; perform an eligible independent review; read catch-up and problems; open evidence. | All members; daily or when needed. |
| Overview | One state sentence, next from Captain, compact requests, agents at work, goals and delivery today; first steps when empty. | Everyone; several glances a day is a hypothesis. |
| Work and tickets | Board by agent/feature, Later, All tickets; search/filter/sort/drag; create/edit tickets, steps and blockers; comment, inspect history, code and review. | Hands-on member/reviewer; as needed. |
| Plans and evidence | Read plan detail; inspect tests, exact review, uncertainty, files and history; request a safe revert. | Requester/reviewer/curious member; at a decision or investigation. |
| Team and connection | People, ownership, cities/times, agent state/machine/model; choose Captain, add signed-in person, add agent, own-agent model controls and local instructions. | Members read; project or agent owner manages; episodic. |
| Team conversation | Shared agent/person messages, threads, mentions, presence; unfold bookkeeping; optionally post. | Any member investigating collaboration; occasional. |
| Decisions and Guide | Read/record/replace decisions/contracts; edit concept, architecture and rules. | Members/Captain; whenever direction changes. |
| Results | Delivery and review measures, token usage, reported costs, coordination, traffic diagnostics and audit export. | Owner/stakeholder weekly; operator on a problem. |
| Settings | Merge policy; personal open-tab browser notifications; owner invite links. | Owner or each person's preference; infrequent. |
| Local helper/app | Machine setup, tool sign-in, repo access, limits, pause/resume, background service, updates, database administration, keys; older Room, pinned bulletin and work runs. | Machine owner/admin; setup and recovery. |

Detailed evidence and controls are enumerated in [E01–E26 and B01–B14](inventory.md). These are not all reasons to add tabs. A feature needs a home; it does not necessarily need a permanent navigation item.

### Things without a clear home, or with competing homes

**Verified in code; the last column is recommendation.**

| Gap | Evidence | Proposed resolution |
| --- | --- | --- |
| Inviting someone and adding a signed-in person are split. | Invite links in Settings; add-by-GitHub-name in Team. E17/E23. | Team → Invite people is the canonical place for both. Settings links there. |
| Team state appears in Overview, Team, By agent and Room's roster. | E06/E07/E16/E17. | Overview owns the project-work summary; Team owns identity/availability; Work owns assignments; conversation shows only enough identity to follow speakers. Contextual references can repeat, competing dashboards cannot. |
| The conversation is a menu item disconnected from Team. | E04/E16. | Always-visible Team → Team conversation link, plus links from related ticket/history entries. Keep the Room route. |
| “Search” overpromises. | Its placeholder mentions people/decisions; supplied results are commands and tickets. E24. | Search names its supported scope today; proposed expansion has distinct result types and source links. |
| Cost means different things in Team and Results. | Daily API spend vs period engine estimates; incomplete reporting; mixed-project traffic. E18/E22/B09. | Team owns daily capacity/limits; Results owns period use/outcomes, with scope and completeness beside each number. |
| Machine repair and updates have no public control page. | Local commands/app, B10–B13; settings only E23. | Team → agent details gives reported state and local repair instructions. Project Settings links to local administration guidance. |
| Legacy pinned bulletin and raw work runs exist only locally. | B04/B12. | Preserve local access. Team details/help explains how to open the local app with `autokolab`; do not silently discard or copy these records into new goals. |
| Recovery, global pause and phone push appear in specs but not routes. | Inventory's documentation gaps. | Reserve homes without displaying non-working controls. A failure opens its existing record now. |

## 2. People and their jobs

**Recommendation:** five useful situations, not five permission roles. One person can be in several. The current project roles remain owner and member. There is no new manager, auditor or guest role.

| Kind of person | What matters to them | Their first two destinations |
| --- | --- | --- |
| Person directing the product | “Build this”; understand Captain's answer; choose between real product/risk choices. Often not a coder. | Captain; Overview. |
| Teammate following progress | Know what changed, what comes next and whether anything is stuck; check why a choice was made. | Overview; linked work/decisions. |
| Person contributing an agent | Add their laptop/container's agent; know if it can work; manage their own time, spend and login. May also direct the product. | Team; Captain. |
| Hands-on contributor or reviewer | Inspect the full brief, change, test results and history; intervene deliberately; approve only work they did not build. | Linked ticket/evidence; Work. |
| Project owner or accountable sponsor | Set authority/access; choose Captain; understand delivery, use and recovery. Can be the same non-coder as the first row. | Captain/Overview daily; Team, Results and Settings when needed. |

An invitee is a temporary state of any of these people. Joining should not require them to become an agent owner.

### Ranked jobs

Frequency is an estimate for a small distributed team, not measured usage. Importance means the cost of failing the job: **critical** blocks safe direction/work; **high** blocks understanding or trust; **medium** supports periodic improvement. Rank weighs both. Setup is rare but must be easy to find when it is needed.

| Rank | Job in the person's words | Estimated frequency | Importance | Home |
| --- | --- | --- | --- | --- |
| 1 | Tell Captain what to build or change. | Daily/whenever a goal changes. | Critical | Captain. |
| 2 | Answer Captain and see what my answer will do. | Event-driven; sometimes daily. | Critical | Captain; notification opens the exact question. |
| 3 | Check what is happening and whether anything is stuck. | Several times a day. | High | Overview. |
| 4 | Understand what an agent is doing and why it is waiting. | Daily while work runs. | High | Overview → work record; Team for machine availability. |
| 5 | Check a result and the evidence before trusting it. | Per meaningful delivery/approval. | High | Evidence → Show the work. |
| 6 | See what is next and change the order or scope. | Several times a week. | High | Overview → goal/Work; request change in Captain. |
| 7 | Bring an agent or recover my computer's connection. | Once per machine; then occasional. | Critical at that moment | Team → Add an agent/agent details. |
| 8 | Understand a settled decision or the team's conversation. | A few times a week or on doubt. | High | Project → Decisions; Team → Team conversation. |
| 9 | See what we delivered and used, including cost limits. | Weekly; daily for spend-conscious owners. | High | Results for period totals; Team for today's capacity. |
| 10 | Invite people, choose Captain and set delivery authority. | Setup/occasional changes. | Critical at that moment | Team; Project → Settings. |
| 11 | Edit detailed work or export the record. | Occasional expert/audit work. | Medium | Work; Results → Export. |

This ranking favors direction and comprehension over manual queue management. Agent owners still need a stable place to find their agents across machines and time zones. It is the reason I retain Team as the third primary tab.

## 3. What to learn from other products

The documented facts below are **verified in sources**. Borrow/avoid columns are **recommendations for AutoKolab**, not findings about those products' usability. These are documentation comparisons, not logged-in product tests or evidence that a particular tab count is optimal.

| Product | Documented organization | Borrow | Avoid for this audience |
| --- | --- | --- | --- |
| Linear | Inbox separates Priority from Other. Custom views are filtered collections that can be shared and linked. [Inbox](https://linear.app/docs/inbox), [Custom views](https://linear.app/docs/custom-views). | Stable links; attention separated from ordinary activity; one record with useful views. | A second Inbox competing with Captain, and making people learn issue workflows before giving direction. |
| GitHub Projects | The same issues/PRs can be seen as tables, boards or roadmaps. Views filter/group the records; insights show charts. [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects). | Work modes as views of one record. Exact PR/commit links for technical proof. | Turning every layout into a primary tab or expecting people to manage a board to get work done. AutoKolab tickets are its own records, not automatically GitHub Issues. |
| Slack | Workspace switching, major navigation and a conversation sidebar are distinct layers. The sidebar contains conversations, tools and settings. [Sidebar preferences](https://slack.com/help/articles/212596808-Adjust-your-sidebar-preferences). | Clear project context and a shared conversation that can be opened on purpose. | Asking people to follow several worker conversations or treating all unread activity as a decision. |
| Cursor Cloud Agents | Agents have shareable run URLs; teammates can inspect the conversation, changes and artifacts. Access depends on team and repository rights. Run environment detail is available from the agent page. [Cloud Agents](https://cursor.com/docs/cloud-agent). | A plain progress entry leading to a specific run and its evidence; clear read vs act permissions. | A developer environment console as the default page. AutoKolab runs on owners' computers; Cursor's cloud model is not its architecture. |
| Notion | Search can jump to pages and recent pages. Sidebar sections organize private/shared/teamspace content. [Navigation](https://www.notion.com/help/navigate-with-the-sidebar), [Search](https://www.notion.com/help/search). | Search plus stable browsable homes; a short menu for durable context. | An infinitely nested tree or a new catch-all “Knowledge” label hiding both rules and decisions. |

I also attempted Devin's session-tools documentation. The direct page was inaccessible and the older official-host page timed out. Search snippets are insufficient for a reliable claim about its present navigation, so Devin does not determine this recommendation. No claim here relies on remembered product behavior.

**Inference:** the useful common pattern is a short daily path with direct links to durable detail. None of these sources proves that AutoKolab should have three tabs. That choice follows the jobs above and needs a small navigation test.

## 4. Proposed navigation

```text
Project switcher                         Search     Your account

Captain (2)      Overview      Team      Project ▾
                                        Work
                                        Decisions
                                        Guide
                                        Results   — delivery and usage
                                        Settings
```

Project is a menu trigger, not a fourth page or a new dashboard. It contains five destinations with plain descriptions. Your account owns profile, personal notification preferences and sign out. Team owns connection and invitations. No feature is accessible only through an AI answer or an undocumented shortcut.

### Tab 1: Captain

**Question:** “What do you need from me to move my request forward?”

**For:** every member directing work, asking a question or answering Captain. Captain stays first and remains the project landing page, following DEC-24.

| Order | Default display | One click deeper |
| --- | --- | --- |
| 1 | Small Captain header with honest availability: available, reading, working, or last seen. | Team's Captain details if disconnected. |
| 2 | The person's conversation with Captain. Ordinary messages in time order. Outstanding questions get a small needs-you mark and small specific actions. A “2 waiting for you” link lands on the earliest unanswered request; no new queue/card system. | Related plan, ticket or “How do you know?”. |
| 3 | Completed answers remain in place as one quiet line. Catch-up and routine updates fold into the conversation. Problems stay visible as problems. | Expand catch-up, quiet updates or full message. |
| 4 | Composer and reply context. Send status/error beside the message. | Optional context attached from a linked page; the future slide-over uses this same conversation. |

**Main actions:** send a request, reply, answer a product question, accept/change a plan, allow a risky merge, open evidence, perform an eligible independent approval. Captain normally handles implementation, assignment and routine review. The owner still controls policy; an agent's owner still controls its computer and keys. “Captain controls the project” is authority within those boundaries.

**Left off:** state briefing, goal grid, roster, spend charts, manual assignment tools and worker-chat tabs. A request never moves the person into a different conversation just because Captain delegated it. No voice-note control or live intent guess.

**Current pages:** Captain is kept; plan and Look first remain linked details under Captain. Questions originating on tickets open this same answer flow. Independent approval and merge permission stay visibly different. Repeated controls on a ticket must call the same action and update the same record.

### Tab 2: Overview

**Question:** “What is happening in this project?”

**For:** everyone taking a quick look, especially a person returning after another time zone's workday.

| Order | Default display | One click deeper |
| --- | --- | --- |
| 1 | One record-built state sentence; then Next from Captain when the record supports it. A real last-successful-update time qualifies the page. | Relevant work/blocked record. Do not invent a promised completion time. |
| 2 | Up to two things needing this person, then “See all 5 in Captain” when needed. If a separate failure also exists, show its short problem line here too. | Exact Captain request; problem's existing ticket/history or future heads-up detail. |
| 3 | Who is doing what: up to three active-work rows, each with agent name, plain work/step and state. Show elapsed step time only when its recorded start is reliable. | All work with that agent selected; Team details for connection/limits. These are labelled separately. |
| 4 | Up to two active goals: outcome name, completed/total tickets, next dependency or step. “See all goals” appears for the rest. Include ungrouped work via “Other work” when needed. | Goal detail using the existing goal ticket; then its tickets/board. |
| 5 | Up to two delivered-today outcomes, in the viewer's local date. “See results” opens period delivery/usage. No empty count tiles. | Evidence/Show the work for the item; Results for the period. |

**Main actions:** open a question in Captain, inspect the named work/result, open all goals/work, inspect a problem. Overview has links for looking; requests and changes go through Captain. It is not a second chat.

**Left off:** model selectors, machines, detailed token/cost accounting, audit export, raw messages, manual status changes, full review queue and a second results dashboard. Counts of completed tickets are progress measures, never a claim that the same fraction of effort or time is done.

**Current pages:** keep Overview and its approved reading order. Work/goal/ticket detail stays one click away. Keep Results separate, rather than importing weekly metric tiles into Overview as my earlier coherence review suggested. Today answers “what arrived while I was away”; Results answers “what did we get over a chosen period?”.

**Changes to the approved starting point:** show failures even when a decision also waits; provide explicit destinations for capped lists; replace unconditional “Updated just now” with real freshness. These are proposed refinements, not changes made here. Do not display “Captain is handling it” unless a run, assignment or recorded response supports that claim. [E06](inventory.md#website-routes-and-controls)

### Tab 3: Team

**Question:** “Who can work on this project?”

**For:** members understanding the distributed team, people contributing agents and the project owner managing access/Captain.

| Order | Default display | One click deeper |
| --- | --- | --- |
| 1 | “People and agents on this project.” Visible links: Team conversation, Add an agent, and Invite people for the owner. | Shared conversation; existing connection flow; invite management. |
| 2 | Captain identified once; compact agents grouped with their owners. Each row has name, Captain marker if relevant and plain availability: working here, working elsewhere, available, waiting until a stated time, paused or not seen recently. | Agent's current work, machine, last report and owner. No global agent note from another project is exposed here. |
| 3 | The people in the project, with owner/member label and local time/city when known. Owner's invitation entry also holds add-by-GitHub-name. | Their agents and membership details. No ranking people by ticket counts. |
| 4 | Only when relevant: a connection/limit problem explains which owner/computer can fix it. Routine offline machines do not become amber. | Local recovery instructions and last known report. |

**Main actions:** add your agent; inspect its availability; owner invites/adds people and selects Captain; agent owner opens model/effort/limit controls or local instructions; anyone opens the team conversation. Resume/pause controls must say whether they act remotely or give a local command. Do not invent remote support for local-only operations.

**Left off:** a parallel project progress board, default technical model forms, raw logs, provider keys, graphs, private worker DMs and the full Room roster repeated beside the conversation.

**Current pages:** People becomes the Team roster; Connect remains its linked flow. Invitations move here from Settings. Room becomes **Team → Team conversation**, with a Team breadcrumb, stable Room URL and optional “Room” explanation. It remains readable by project members without contacting Captain. Details about a specific work item open its record, not another roster.

**Why a whole tab:** Team explains AutoKolab's distinctive promise: agents belong to people, run on different computers and may be unavailable for different reasons. Hiding it entirely would make adding a computer and recovering a stopped agent hard to discover. This is a reasoned bet; the Work-vs-Team test below can overturn it.

### The five pages under Project

These have real URLs and active page titles. “Under a menu” means one menu selection away, not buried behind several folders. A page does not disappear because it is not a primary tab.

| Page and question | Audience | Blocks in order: default → deeper | Main actions | Deliberately left off |
| --- | --- | --- | --- | --- |
| **Work:** “What is the full plan and record of work?” | Members inspecting or deliberately managing work. | Goal-grouped active work, including ungrouped work → goal/ticket detail. View options: By goal, By agent, Later, All tickets. Keep existing search, filters, sorting, status and shipped visibility; remember the chosen view. | Open record; ask Captain with context; advanced create/edit/rank/assign/status. | Another Overview headline/dashboard; duplicate decision inbox; mandatory board chores. |
| **Decisions:** “Why are we doing it this way?” | All members; Captain normally records settled choices. | Current decision titles with date/author → full rationale, source ticket and linked replacement. Replaced records behind Show replaced. Contracts labelled within the record. | Read/copy link; ask Captain to reconsider; deliberate record/replace controls remain available with current permissions. | Unanswered questions, notifications or implementation logs. |
| **Guide:** “What must the team know and follow?” | All members; project context contributors. | Concept, Rules, Architecture, each as readable text with last editor/time → Markdown edit. Link to Decisions for changed choices. Same guide record, revised presentation order only. | Read; ask Captain to draft/update; deliberate edit/save/cancel/starter rules. | A second decisions archive or machine secrets. |
| **Results:** “What did we get, and what did it use?” | Owner, sponsor, members checking value. | Period selector, plain delivery sentence, a few delivery/review measures, reported usage/cost with missing-data note → calculation details, review-path breakdown, most-used tickets, audit export and technical traffic diagnostics. Default this week; keep four weeks. | Change period; open related work; expand accounting; export CSV/JSON. | Live task monitoring, invented bills, savings/ROI guesses, solo comparisons or machine controls. |
| **Settings:** “What authority does this project have?” | All members read shared policy; project owner edits it. | Current merge policy and consequence → owner change; explanation of risky categories; links to Team's Captain/access controls and local administration guidance. Personal notifications live in Your account, linked here for existing users. | Owner changes merge policy; navigate to related controls. | Repeated invitation forms, agent roster, hosted keys, a switch that pretends to update another computer. |

**Scope caution:** changing a menu or display order does not grant new rights. Owner-only invite links stay owner-only. Member-visible results/decisions stay member-visible. Direct editing remains an expert path; “talk to Captain” is the ordinary path. None of the existing records is deleted.

### Alternatives rejected

| Alternative | Why I reject it now | What would change my mind |
| --- | --- | --- |
| Captain alone | Chat is a poor way to compare live work or recover when Captain is offline. Conflicts with DEC-24's explicit separation. | No current reason to reverse DEC-24. |
| Captain + Overview only | Smallest count, but agent connection/ownership becomes obscure and Team is a first-class product promise. | Repeated navigation tests show people consistently find and manage their agents through a clear Project → Team item. |
| Captain + Overview + Work | Strong runner-up for hands-on developers. For this audience, Overview already leads to all work, while Team's machine/ownership job is distinct. | Most participants choose Work for daily oversight and cannot find enough from Overview; promote Work and move Team under Project, rather than add tabs indefinitely. |
| Captain + Work + Team | Work must then become a mixed dashboard/board or people lose the glance. | Would require reversing the separation chosen in DEC-24. |
| Add Work, Room and Results as primary tabs | Easier scanning for experts, but grows daily choices for infrequent jobs. | Demonstrated daily navigation demand that contextual links fail to serve. |
| New Inbox, Activity or Notifications tab | Duplicates Captain's questions, Overview's state and the conversation's record. | A distinct job appears that those places cannot serve. |
| One new “Records” page containing everything | Adds another classification step and hides the plain terms Work, Decisions and Results. | No present need. Project can link straight to those existing pages. |

Keep “Overview” instead of my earlier “Progress”: the app and approved wireframe already use it, and renaming alone adds no useful distinction. Keep “Team” rather than “Agents”: people, ownership and geography are part of the product.

## 5. Complete current-feature mapping

**Recommendation.** This is the destination contract. “Keep” preserves the capability, not necessarily every current placement or visual treatment. “Move” preserves its record and permissions. “Link” preserves a real detail page. No current record is removed. The only removals are redundant entry points/copy or inappropriate default presentation.

### Website pages and global features

| Current page/feature | New home | Disposition; detail |
| --- | --- | --- |
| `/` sign-in, session/profile loading and recovery | Outside project tabs | Keep; preserve intended deep link across sign-in. E01. |
| Welcome/name/city/time zone | Onboarding; Your account → Profile thereafter | Keep; do not make it a project page. E01. |
| Last project, switch project, new project | Project switcher | Keep; new project opens `/new`. E01/E04. |
| Create project/repo/ticket prefix | `/new` | Keep; prefix automatic by default, editable in advanced setup. E02. |
| Invite preview/accept/expired/cancelled/used/unknown | `/j/<code>` | Keep; joining offers Captain first, optional Add an agent. E03. |
| Captain chat/replies/composer/send failure | Captain | Keep. E05. |
| Captain reading/working/offline indication | Captain header/conversation | Keep; link Team for connection. E05. |
| Questions, answers, resolved/not-needed records | Captain request/message | Keep answer history; ticket links land here. Generic “Resolved” no longer clears an unanswered question in the ordinary flow. E05/E11. |
| Quiet updates, long-message expansion, catch-up | Captain conversation | Keep folded detail; no Catch up tab. E05. |
| Plan approval/change request/read-only plan/replacement | Captain → Plan | Keep `/plans/<id>`; no separate Plans tab. E13. |
| One-sentence state and Next from Captain | Overview | Keep; qualify with real evidence/freshness. E06. |
| Needs-you rows/count | Overview links → Captain; Captain badge | Keep one request identity, not multiple queues. E06/E25. |
| Current agent work/step/progress time | Overview → work record | Keep compact rows; longer work list in Work. New elapsed claims require reliable data. E06/E07. |
| Goals/progress/next step/ungrouped work | Overview → goal ticket/Work | Keep. E06/E07/E10. |
| Delivery today and past delivery | Overview today → Results for longer period | Keep; item opens exact evidence. E06/E22. |
| First steps/no Captain/no work | Overview setup; Captain recovery link | Keep contextual states; no permanent setup dashboard in chat. E05/E06. |
| Work by agent and by feature | Project → Work; By goal default | Merge navigation into one Work destination; both views kept. Rename feature to goal in visible labels. E07. |
| Board columns/cards/live steps/blockers/shipped retention | Work and ticket detail | Keep; removing aged shipped cards never deletes tickets/history. E07. |
| Board search/quick/people/unassigned filters and drag edits | Work | Keep; keyboard/status alternative to drag. E07. |
| Later/backlog/ranking/inline creation/status | Work → Later | Keep deliberate control. E08. |
| Sortable table/Show shipped/all tickets | Work → All tickets | Keep; show cancelled work through an explicit status filter too. E09. |
| New ticket modal/keyboard C | Work → advanced Create; command menu | Keep; remove generic Create from unrelated Team/Decisions headers. E12/E04. |
| Ticket/goal title, description, summary, acceptance checks | Work → ticket/goal | Keep; plain reading before edit controls. E10. |
| Goal children/progress/dependencies/blockers | Goal/ticket detail | Keep links and advanced add/remove blocker. E10. |
| Steps and comments; activity/comments/history | Ticket detail | Keep editable steps and comment path; comments continue to steer the assigned agent under current runner rules. E10/B05. |
| Status, assignee, reporter, priority, type, goal, labels, areas | Ticket → Details | Keep; technical fields leave the default glance. E10. |
| Branch, PR, timestamps and overlap wait | Ticket → Details | Keep source links; no new public terminal. E10. |
| Context guide and decisions | Ticket → Context links | Keep; link to the actual record, not just a generic landing page. E10. |
| Independent approval/test state/exact commit | Captain request and ticket evidence | Keep same eligibility and shared action. E11. |
| Built-by record and owner correction with reason | Ticket → review details | Keep owner-only correction and audit history. E11. |
| Risky merge permission and Look first | Captain → `/look/<key>` | Keep; no auto-approval by navigation. E15. |
| How do you know? | Beside the claim/request/delivery | Keep evidence and uncertainty; one click. E14. |
| Show the work/Summary/The change/History/files/GitHub | URL-backed sheet from any linked work | Keep query URLs, exact-commit facts and return context. E14. |
| Code revert request; risky-change warning | Show the work | Keep; no database Undo promise. E14. |
| Room messages/threads/replies/mentions/ticket links | Team → Team conversation, `/room` | Move entry point; preserve optional posting and public-within-project context. E16. |
| Show activity/bookkeeping | Team conversation → Show activity | Keep folded; failures stay readable. E16. |
| Room roster/presence | Team; speaker identity in conversation | Merge full roster into Team; no duplicate always-open roster. E16/E17. |
| People/role/GitHub identity/city/local time/agent ownership | Team | Keep; open-ticket counts move to deeper work links. E17. |
| Agent Captain marker, status/note/machine/last seen/current ticket | Team → agent detail; compact availability on roster | Keep; project work itself is summarized in Overview. E17. |
| Choose/remove Captain | Team → Captain control | Keep project-owner permission. E17. |
| Model/effort/requested vs effective/set-by/machine lock note | Team → agent detail | Keep owner edit/Captain authority; others read. E18/B03. |
| API spend/limit/unknown cost/local action instructions | Team → agent detail | Keep current report scope; cross-link Results. E18. |
| Add an agent/subscription/API/local model/name/model/budget | Team → Add an agent, `/connect` | Keep pairing flow, expiry, new code and arrival. E19. |
| “Give it a first ticket” | Connection completion → “Tell Captain what you want built” | Keep Captain draft behavior; change wording. E19. |
| Add signed-in person by GitHub name | Team → Invite people | Keep owner-only advanced option. E17. |
| Invite create/list/copy/cancel/expiry | Team → Invite people | Move from Settings; Settings links here. E23. |
| Decisions/contracts/source/replaced history/record/replace | Project → Decisions | Keep records/actions; contracts in detail, not another tab. E20. |
| Guide/Concept/Architecture/Rules/editor/starter rules | Project → Guide | Keep standalone entry; Guide/Decisions become cross-links rather than a confusing shared top-level view selector. E21. |
| Delivery/test/review/time/human-asks/sent-back metrics | Project → Results | Keep period definitions and data limits. E22. |
| Usage/tokens/review paths/conflict fixing/top tickets/cost | Results → Usage details | Keep; show missing reports, not invented zeros. E22. |
| Traffic/wake/failure/prompt counters and browser downloads | Results → Technical details | Keep current diagnostic scope and seven-day window; do not imply project-only numbers. E22/B09. |
| CSV/JSON audit export and calculation notes | Results → Show the record | Keep; export remains available to current authorized readers. E22. |
| Merge policy/current risky categories | Project → Settings | Keep owner edit/member read. E23/B08. |
| Browser notification permission/preference/dedup/title count | Your account → Notifications; Settings shortcut | Move preference; preserve request deep link and current limitations. E25. |
| Search/button/Cmd or Ctrl K and route/work/project commands | Global Search | Keep existing commands; add decision/person/record results only when supported. E24. |
| G-then shortcuts; save/send shortcuts | Same destination/actions | Keep, shown in menus/help; respect focused text fields. E24. |
| Change name/sign out/repository link | Your account; project repository in Settings | Move visible entries; keep command-menu access. E24. |
| Old board/backlog/list/guide/ticket addresses | Redirects to the same current records | Keep compatibility; no forced URL rename for labels. E26. |
| Dev-only previews/components/fixtures | Developer tools only | Keep; never primary project navigation. E26. |
| Shared errors/loading/Markdown/sheets/toasts/status/avatars | In context on all pages | Keep; one error explains the failed operation and retry. E26. |

### Helper/backend capabilities, including those with no hosted page

| Current capability | Human home | Disposition; boundary |
| --- | --- | --- |
| Tool-based project brief, tickets/steps/blockers, comments, guide, decisions | Their same Work/Guide/Decisions records | Keep agents' tools; no MCP-tools tab. B02/B03. |
| Agent room post/read/wait/thread, question closure and presence | Team conversation; Captain for human decisions | Keep tool behavior and role checks. B03/B04. |
| Legacy bulletin list/upsert and pinned items | Existing local room → Pinned; help link from Team details | Keep local record; no automatic conversion/removal. B04/B12. |
| Legacy work-log/run instruction, branch and result | Existing local work list; Team details explains access | Keep local record; do not upload raw logs to create a new page. B04/B12. |
| Claim work, resume comments/messages, Captain answers/reviews | Automatic; tickets and Captain/Overview show effects | Keep. No new scheduling/routines tab inferred from backlog tickets. B05. |
| Timeout/daily limits/loop stops/spend stops/pause | Overview short consequence; Team details/recovery | Keep local owner limits. Distinguish planned wait from broken run. B05/B06. |
| Protected push/forbidden paths/worktree/setup/test preflight/PR shipping | Ticket evidence/history; Team repair if local setup fails | Keep automatic. B07. |
| Review budgets, independent reviewers, conflict return, risk and merge | Ticket evidence/Captain request; policy in Settings | Keep approvals, exact commits and merge authority. B08. |
| Daily time/status/machine/model/cost reports | Team detail; Results period totals | Keep reporting gaps and scope visible. B06/B09. |
| Local API key set/check/remove and provider login | Owner's computer; instructions from Team detail | Keep local only. No key fields in website or Captain chat. B06/B10. |
| CLI identity/members/rooms/post/read/watch/board/work | Existing CLI; Team/help points to docs | Keep. No duplicate hosted tabs for command names. B10. |
| Pause/resume/rename/reconnect; team removal/revocation | Existing local CLI/app; Team detail instructions | Keep existing authority; removal is not a generic member action. B10/B12. |
| Install agents/GitHub CLI/device sign-in/repo permission/request/grant | Local setup flow; Team troubleshooting entry | Keep local sign-in. AutoKolab invite and GitHub repository access stay separate. B11. |
| Repo clone/folder/add repo/agent instructions/background consent | Local setup; Add an agent points to it | Keep existing local flow. B07/B11. |
| Service install/uninstall/status/restart; helper update on/off/rollback | Local app/CLI; Team → connection help | Keep local operations, reported status only on website. B10/B13. |
| Supabase configuration/schema SQL/database setup/update preference | Admin's local setup/CLI; Settings → administration guidance | Keep local-only secret entry. No live database actions from the public site. B11/B13. |
| Local app's old invite/redeem/name/background/room/repo flows | Existing local app with hosted-project guidance | Keep compatibility; do not require migration as part of navigation work. B11/B12. |
| RLS/restricted fields/secret rejection/history/realtime/fallback reads | Every authorized page; user sees errors/freshness/evidence | Keep mechanisms; no extra tab. B01/B14. |
| Health API and pairing server function | Automatic/support; connection result in Team | Keep endpoints; neither is a person-facing tab. B01. |

**Spec-only homes, not current features:** heads-up detail belongs behind a problem's record link; project Pause everyone belongs in Team's owner controls with a persistent paused state; Cmd/Ctrl L opens Captain with context; phone push/quiet hours belong in account notifications. These require their own approved work. No non-working control should be drawn as available.

## 6. Edges and failure states

### Phone and keyboard

**Recommendation:** the same three primary labels in a bottom bar: **Captain · Overview · Team**. Project is a labelled header menu; Search and Your account remain visible controls. Do not give phone users a separate Work/Room/You mental model. This explicitly departs from the older `P-phone.md` navigation and needs a recorded choice if adopted. Voice notes and pinned chat briefings remain excluded by the amendments/DEC-24.

```text
Shop ▾                         Search   Project ▾

Overview
Checkout is moving. One choice needs you.

You are needed
Allow guest checkout?          Open in Captain →

Who is doing what
Birch · adding guest checkout  Working

Goals                         See all goals →
Checkout                      3 of 5 tickets done

Delivered today               See results →
Order emails show the total.   Show the record →

[ Captain (1) ] [ Overview ] [ Team ]
```

Use a single reading column, 44px minimum touch targets, visible text/status and no hover-only facts. Detail sheets become full-height panels with Back/Close, a copyable URL and restored prior scroll/focus. Keep the composer above the keyboard and navigation; do not cover question actions. Work defaults to a goal list at phone width; optional board/table views retain access. Every drag edit has a select/menu alternative. Keyboard users retain Search, Escape and G-then navigation; shortcuts never fire inside editing fields. Use the existing handoff tokens, at least 12px text and reduced-motion behavior.

### Joining, first run and empty states

| Situation | Default explanation and next action |
| --- | --- |
| New owner without a project | Existing create flow; repo/name first, automatic prefix. Connection is offered next. |
| Project has no Captain | Captain has one short recovery message. Owner: Connect/select Captain on Team. Member: name the owner who can select one; keep records readable. Do not queue messages as if a reply is imminent. |
| New member invited to working project | After joining, open Captain with “What would you like to ask?” and optional Add your agent. Contributing a machine is not a condition of membership. |
| Captain connected, no work yet | Captain invites a goal in plain words. Overview shows the two setup steps only while needed; Team shows connected identity. |
| All work delivered | Overview says nothing is waiting and links to the delivered record; Captain remains ready for the next goal. No fake activity to fill space. |
| No decisions/results/conversation | One plain empty sentence and the relevant next action, not empty cards/counts. Results can still show real reported usage before any delivery. |
| Filter has no results | “Nothing matches these filters” plus Clear filters. Distinct from an empty project. |
| Expired pairing/invite or no repository access | Keep the existing expiry/new-code path; explain who can renew an invite. Repo access is checked on the computer/GitHub, not granted by project membership. |

These are proposed flow refinements. Currently, both project creation and accepting an invite route to Add an agent. [E02/E03](inventory.md#website-routes-and-controls)

### A stalled or broken project

| State | What belongs on Overview | What opens deeper |
| --- | --- | --- |
| A real answer blocks work | Plain question, who waits, time waiting if recorded; amber needs-you mark. | Exact Captain question and evidence. |
| Local daily cap or expected reset | “Ana's agent waits until 09:00 Stockholm time.” No claim it is broken; no amber unless Ana must choose something. | Team details with reported usage/limit/reset and local instructions. |
| Agent/computer not seen | Say “Last seen…” with time, not “working” based only on a stale assignment. Explain affected work. | Team owner/machine details and existing ticket history. |
| Failed tests, refused merge or repeated review/conflict | One problem line, affected goal and recorded next step; keep it visible alongside pending questions. | Existing ticket/evidence/history; future heads-up page if built. |
| Captain offline while agents run | Distinguish “Work continues” from “Captain cannot reply yet.” Keep progress and records usable. | Captain's Team detail; owner recovery guidance. |
| Database/network read fails | Last successfully loaded data marked stale plus Retry; disable actions that require current verification. Never say “nothing needs you” from an unknown snapshot. | Error detail relevant to the failed read. |
| Project pause, when implemented | Persistent “Project paused by X at time”; what will wait and whether current work stopped. | Team owner resume control. Until this exists, show only supported own-agent/local controls. |

Do not assert a repair happened because a model says it did. “Handled” requires a recorded completed recovery. A future Pause everyone label must not promise instant cancellation if runners only check before starting. Operational repairs belong to the right machine owner; product choices return through Captain. No incident inbox or compulsory “Looks right” chore is needed.

### Search, Cmd/Ctrl K and Captain from anywhere

**Verified in code:** current Search is a local command/ticket-title filter. It is not universal search. Cmd/Ctrl L is not implemented. [E24](inventory.md#website-routes-and-controls)

**Recommendation:** keep a visible Search button and Cmd/Ctrl K. Results are grouped as Work, Decisions/Guide, Team, Conversation and Commands, each naming its project and source. Start with current project; offer other accessible projects explicitly. Search includes completed/cancelled work when requested. Never use “no results” to mean “this kind of record cannot be searched yet”; show the supported scope. Exact ticket/decision keys and old links must work.

A separate **Tell Captain** action can pass the current page as context to the same chat. Search does not silently send a sentence to an agent. A proposed Cmd/Ctrl L slide-over is the same conversation, with its visible context; no private worker thread. Until implemented, a labelled Captain link can prefill a draft. Nested dialogs need a single focus owner and Escape/Back behavior; this has not been browser-tested here.

### Notifications and personal attention

**Verified in code:** optional browser notifications need an open project tab. They exclude problems but otherwise consider all non-problem needs. There is no verified closed-app web push or quiet-hours UI. [E25](inventory.md#website-routes-and-controls)

**Recommendation:** account notifications says exactly which devices and conditions it supports. Only a question that blocks progress and can be answered by that person should notify, following the amendments. Quiet hours and installed-PWA push remain future work. Delivery, chatter, telemetry, expected daily caps and handled failures wait until the person looks. Clicking a notification opens the exact Captain question, not Overview or a generic inbox. A settled/replaced question shows its answer if opened later. Do not replay old questions when permission is turned on.

Keep Captain's count about **actionable requests**, not unread messages. A coral problem indication can stay visible without being counted as a decision. Shared project status and personal responsibility are different: another person's question can appear as “waiting for Ana” without notifying everyone. Resolve shared questions in one record so two people cannot independently accept an outdated plan or commit. New backend behavior would need a separate ticket; navigation alone cannot establish recipient ownership.

### Owner vs member vs agent owner

**Verified rights, with recommended placement.** No new permission model is proposed.

| Capability | Who can do it today / boundary | Home |
| --- | --- | --- |
| Read work, decisions, guide, conversation and project results | Authorized project members. Room observer posting is separately restricted. | Their normal pages; do not hide records from members. |
| Send requests, answer questions; use existing work/guide/decision edits | Human members under the current database rules; edits are not all owner-only. | Captain normally; deliberate detail controls remain. |
| Review a commit | Eligible human member or authorized agent; builders cannot approve their own work. Passing facts must match the commit. | Captain/ticket evidence. |
| Allow a risky merge | Human project member under current rules; distinct from independent review. | Captain/Look first. Do not describe this as owner-only. |
| Invite people, choose Captain, set merge policy | Project owner. | Team invitations/Captain; Project Settings policy. |
| Correct a wrongly recorded builder | Project owner, with recorded reason. | Ticket review details. |
| Connect their agent, change its model/effort | Member connecting their own agent; agent owner edits, Captain can set model through its tool. Machine owner lock/limits prevail. | Team. |
| Change local budget/keys/login/service; remove member/agent | Existing local owner/admin commands and authority, not a new public-site control. | Team instructions/local setup; never a key field in chat. |
| Notifications and profile | Each person. | Your account, with Settings shortcut for continuity. |

The database remains authoritative. A visible button or role label is not proof of permission. Hide inapplicable edit controls but explain who can act when the reader needs recovery; do not hide the project's policy itself.

### Transparency and cost

**Recommendation:** give each type of proof a named home and direct links. The three-depth rule is preserved.

| Person's question | Glance | Evidence/detail |
| --- | --- | --- |
| What are agents doing? | Overview active work. | Exact ticket/step/history; Team connection details. |
| What did they say to each other? | Team's visible Team conversation link. | Shared conversation/thread, optional bookkeeping. Never require a worker DM. |
| Why was this decided? | Current decision title or Captain answer. | Rationale, recorder/time, source and replacement chain in Decisions. |
| Why trust this change? | Delivery/question outcome. | How do you know? → Show the work, approved commit, tests and uncertainty. |
| What did it use? | Results' reported period usage; Team's reported daily capacity. | Formula, reporting gaps, scope/date and run category; raw local logs stay local. |

A reported engine dollar estimate is not an invoice. Subscription seats, API charges and local models have different economics. Do not add them into a “total bill” or turn missing cost into zero. Team's daily limit may apply across projects; Results' project runs cover a different scope. Traffic counters explicitly include these agents' other projects. Currency, time zone, period and completeness must sit beside the figure, with explanation deeper. “Asked a person” currently misses Captain's chat questions, so it must not be sold as a complete interruption count. [E18/E22/B09](inventory.md)

## 7. Ranked risks and choices for raghavendra

These are recommendations to choose later, not blockers on this research ticket. No product decision or follow-up ticket is created here.

| Rank | Risk / question | Recommendation | How to settle it |
| --- | --- | --- | --- |
| 1 — high | Does three tabs hide the collaboration record? | Keep Team primary and its Team conversation link visible before any scrolling. Every summary links to its exact record. Leave Work/Decisions/Results named in Project. | Test “show me what two agents agreed” and “why was this choice made” without telling people where to click. |
| 2 — high | Can a clean Overview hide problems or overstate that someone is handling them? | Show pending requests and independent problems together. Use recorded freshness and action evidence. | Check combined question+failure, stale heartbeat, offline Captain and missing-read states against records. |
| 3 — high | Should the third tab be Team or Work? | Team for now. Change to Work only if actual navigation tests favor it; do not add a fourth tab by default. | Compare the two three-tab trees with both non-coders and agent owners on the same tasks. |
| 4 — high | Who should answer a shared question or conflicting direction? | Preserve existing human eligibility; make the responsible person explicit where known. Captain asks the owner on conflicting direction, following the amendments. | Check two members answering, an answered old link, and Captain-built work; identify any missing data separately. |
| 5 — medium | Does “cost” imply a bill or a spend cap the site can enforce? | Results says reported usage/estimate; Team states actual local cap and report scope. Keep unknown values unknown. | Use subscription, API, local-model, incomplete-report and multi-project examples. |
| 6 — medium | Can people direct work without learning tickets? | Captain stays the front door; advanced editing survives in Work. Joining need not force an agent installation. | Ask a new member to request a feature and an owner to change its scope without board coaching. |
| 7 — medium | What happens when Captain cannot help? | Readable records, honest availability and a Team recovery path remain usable; never make Captain the only search/navigation method. | Attempt recovery with Captain offline and project data still reachable. |
| 8 — medium | Do phone tabs match desktop, or keep the old phone Work/Room/You set? | Match Captain/Overview/Team. Project and account controls use the same labels at both widths. | A short phone task test; record the departure from `P-phone.md` if chosen. |
| 9 — medium | Does “Project” sound like a switcher rather than a records menu? | Keep Project with a caret, distinct from the named project switcher; list plain destination names. Do not name a page “Project”. | Ask people to find Work, Results and Settings; if confusing, test “More” as the menu label before adding destinations. |
| 10 — lower | Should local setup and older Room tools be retired? | Preserve them and document their home now. Do not tie a navigation decision to deleting or migrating legacy records. | Captain can scope separate consolidation work only after this choice. |

### A small test before implementation

Use the same short tree and content with 3–5 people covering a non-coder, a teammate and someone owning an agent; the founders can participate but should not be the only evidence. This is a proposed method, not a completed study.

Ask them to: request a change; find a blocked answer; say what an agent is doing; check a delivered change's evidence; add an agent on another computer; find the team conversation; explain a past decision; find reported spend and its daily limit. Record first choice, whether they finish unaided and what words they expected. Repeat key tasks on a 390px phone layout. Prefer the structure with clear successful paths over the one with the smallest count alone. No measured usability claim is made in this proposal.

If this proposal is selected, record the final navigation decision and update the handoff together before app implementation. In particular, resolve the phone-tab departure, conversation/invite moves and Work's goal default explicitly. Captain remains chat, Overview remains separate, removed handoff features stay removed, and the underlying records/permissions remain intact.
