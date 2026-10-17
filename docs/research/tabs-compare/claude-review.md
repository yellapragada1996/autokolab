# Two tabs proposals compared: where Claude and Codex agree, and who is right where they don't

17 October 2026 · AK-162 · by yvssaratchandra-claude · A review, not a decision

- **Mine:** [`docs/research/tabs-claude/proposal.md`](../tabs-claude/proposal.md) (AK-160), called "Claude" below.
- **Theirs:** [`docs/research/tabs-codex/proposal.md`](../tabs-codex/proposal.md) and [`inventory.md`](../tabs-codex/inventory.md) (AK-159, jamesblack-codex), called "Codex" below.
- I wrote this without reading `codex-review.md`.

**How to read this.** ✅ means I checked it in the code, with the file and line. ❌ means the code says otherwise. 💭 means my opinion. Line numbers are from `main` at `c6b2fa2`.

## 1. Short summary

1. **Biggest agreement:** Captain first and Overview as drawn; no Inbox tab; Work opens by goal; your personal things leave the project menu; invitations live with Team; nothing is deleted.
2. **Biggest disagreement:** the third tab. I proposed **History** (the record of what happened), with Team in a menu. Codex proposed keeping **Team**, with Work, Decisions and Results as named pages in a Project menu.
3. **Who is right there 💭:** mostly Codex. Team already exists, and it is where the rare but urgent jobs happen ("my agent stopped", "add my laptop"). My History tab would be a new page that is mostly weekly reading, so it fails my own "used daily" test.
4. **Where I'm still right 💭:** keep the phone's bottom bar as it is built today, put a real Pause button for the agent's owner on the roadmap, and tell people when an Overview row is a dead end.
5. **Honest view:** Codex checked the code more carefully. It found four real bugs on Overview and in Results that I missed. Each of us got a few facts wrong (section 4). My recommendation (section 6) is Codex's navigation with three of my changes.

## 2. Where we agree

| Point | Claude | Codex | Same reasons? |
| --- | --- | --- | --- |
| **Captain is the first tab** and the page a project opens on | §4.3 | "Tab 1: Captain" | Yes. Both follow DEC-24. |
| **Overview stays as the approved wireframe**, for looking, not typing | §4.4 | "Tab 2: Overview" | Yes. Codex adds fixes backed by the code (see 3, row 7). |
| **No Inbox, Activity or Notifications tab** | §4.8 | "Alternatives rejected" | Yes: Captain already holds every "needs you". |
| **Work opens by goal**, and "By feature" is renamed "By goal" | §4.6, §6 | "Work" row, §5 | Yes: goals are what people asked for. |
| **Personal things leave the project menu** (name, notifications, sign out) | §4.7 "You" | "Your account" | Yes: they are about you, not the project. |
| **Invitations go to Team.** The link and "add by GitHub name" become one place | §4.6 | "Team", row 1 | Yes: one job, two pages today. |
| **Subscription cost is shown as time**; never a made-up dollar figure | §4.5 item 6, Q5 | "Transparency and cost" | Yes. Codex goes further: never add API, subscription and local-model use into one "bill", and never show missing cost as zero. |
| **Nothing is deleted.** Every record and route is kept, moved or linked | §6 | §5 | Yes. |
| **The Room's roster goes**, since Team already lists everyone | §6 | §5, "Room roster/presence" | Yes: one fact, one place. |
| **The "Create" button leaves pages that aren't about tickets** | §1.4, §6 | §5, "New ticket modal" | Yes. |
| **Editing tickets and decisions stays**, as an expert path, not the normal one | Q3 ("Detailed" switch) | "Scope caution" | Yes. Different words, same idea. |
| **Search/⌘K grows** to decisions, people and records | §5.4 | "Search" | Yes. Codex adds that it must show what it can't search yet. |
| **An invitee lands on Captain**, and adding an agent is optional | §5.2 | "Joining" table | Yes. |
| **Only blocking questions notify**, and a notification opens that exact question | §5.5 | "Notifications" | Yes. Both follow the amendments. |
| **The command line and the helper's local app stay off the website** (keys, setup, updates) | §1.3 | §5, helper table | Yes: keys never leave the machine. |
| **GUIDE and handoff must be updated with the change** | §7, risks | §7, last paragraph | Partly. I flagged `GUIDE.md`; Codex flagged the handoff. Both are needed. |

## 3. Where we disagree

| # | Topic | Codex's position and reasoning | Claude's position and reasoning | Who is right, and why 💭 | What would settle it |
| --- | --- | --- | --- | --- | --- |
| 1 | **Third tab** | **Team.** "Team explains AutoKolab's distinctive promise: agents belong to people, run on different computers." Hiding it makes "adding a computer and recovering a stopped agent hard to discover" (Codex, "Why a whole tab"). | **History.** Results, Decisions, Work and Room each fail "used daily" alone, but together answer "what happened, and can I trust it?" Team's live part is already on Overview (Claude §4.1). | **Codex.** My argument has a hole: the daily part of "what happened" is already on Overview ("Delivered today"). What History adds is weekly. By my own rule, it doesn't earn a tab. Team is also not daily, but its jobs are urgent when they come (Codex ranks them "critical at that moment"), and it exists and works today. Changing it now reverses AK-156 for a guess. **Codex changed my mind here.** | Codex's test (§7): the same tasks on both trees, with a non-coder and an agent owner. In particular "find why X was decided" and "your agent stopped, fix it". |
| 2 | **Results, Decisions and Room: one place or separate** | **Separate, named pages.** One "Records" page "adds another classification step and hides the plain terms Work, Decisions and Results". | **One History tab**, with doors to Work, Decisions and the conversation. Separate tabs would bring back the eight-item sidebar. | **Codex.** They are separate in a menu, not separate tabs, so my sidebar worry doesn't apply. Merging them is a large rebuild with no evidence that it helps. I keep one small idea: Results could list "decided this period" and link to Decisions, so "why" is one click from "what". | A tree test: "why was X decided?" Do people pick Decisions or Results first? |
| 3 | **Menu name** | **Project ▾.** It flags its own risk: "Project" may read like the project switcher; test "More" if confusing (Codex risk 9). | **More.** | **Codex, once Sign out moves out.** Today "Project" is wrong because it holds Sign out (✅ `Workspace.tsx:279-280`). After that, every item really is about the project, and "Project" says so. "More" says nothing about what's inside. | Codex's own check: ask people to find Work, Results and Settings. |
| 4 | **Menu contents** | Work · Decisions · Guide · Results · Settings. | All the work · Team conversation · Rules (Guide + decisions in force) · Settings, with Team in it too. | **Codex**, mostly. Keeping today's names avoids another renaming in a week of renamings. Merging Guide and Decisions into "Rules" is a fair idea (they already share one page today, ✅ `Decisions.tsx`, `?tab=guide` in `router.ts:50`), but it can wait. | None needed now. |
| 5 | **Where the team conversation (Room) lives** | **Under Team**, as a link visible before scrolling: "Team → Team conversation". | **In the More menu**, plus links from tickets and goals. | **Codex, slightly.** It is already named "Team conversation", and the people in it are the Team. A link at the top of a tab is as easy to find as a menu item. The risk is that people never open Team. Links from tickets matter more than either. | The task "show me what two agents agreed" (Codex risk 1). |
| 6 | **Where Pause everyone goes** (not built yet) | Team, in the owner's controls, with a persistent "paused" state. | Settings ("How hands-off is this project?"). | **Neither, quite.** The handoff draws it on the status page: the old briefing (`S01-captain-home.md:41`) and the phone status screen (`source/PhoneOverview.dc.html:57`). Since DEC-24, that status page is Overview. An emergency stop should be where you notice the emergency. I'd put the paused state and the button on Overview (owner only), with the same control in ⌘K. This changes Overview's "nothing is typed here" rule, so it needs raghavendra. | AK-87 (Heads-up and Pause everyone) should decide it when it is specified. |
| 7 | **Overview fixes** | Show a failure even when a question is waiting; replace the fixed "Updated just now" with a real time; never say "Captain is handling it" without a record that it is. | Rename "Delivered today" to "Today" so it can include decisions; say who can fix a stopped agent. | **Codex.** All three of its fixes match real bugs I confirmed (section 4, items C1–C3). Mine are nice-to-haves. "Who can fix it" appears in both (Codex's Team row 4 and its "stalled" table). | Already settled by the code. |
| 8 | **Phone layout** | The same three tabs in a bottom bar. "Project ▾" moves to the **header**, next to Search. | Four slots in the bottom bar: Captain · Overview · History · More. Project switch, search and You go in the header. | **Claude, on the shape.** Today's phone bar already has three tabs plus Project in the bottom bar (✅ `styles.css:207-222`). Moving the menu to the top puts it out of thumb reach and changes something that works. Codex's phone sketch also drops "Your account" from the header, though its text says it stays. Both of us depart from the handoff's phone tabs (Captain · Work · Room · You, `screens/P-phone.md:3`), and so does the built app. | A short phone test (Codex risk 8). Either way, record the departure from `P-phone.md`. |
| 9 | **Pause and Remove buttons for an agent** | Don't "invent remote support for local-only operations". Show local instructions; removal stays with the command line. | Real buttons: Pause for the agent's owner, Remove for the project owner, writing to the database. | **Split.** For **Remove**, I'm right: the database already lets the owner remove a member or agent (✅ `004_workspace.sql:414-415`, `:461`), so it isn't local-only. For **Pause**, Codex's caution is right: `set_paused` works through the old v1 `members` table (✅ `001_init.sql:321-335`), and the website never calls it. A website button needs backend work, not just a button. | A small ticket that checks whether a signed-in person can call `set_paused` today. |
| 10 | **"Give it a first ticket"** at the end of Add an agent | Keep what it does (it drafts a message to Captain); change the words to "Tell Captain what you want built". | Remove it: "teaches tickets before Captain". | **Codex.** I misread it. It already sends you to Captain with a draft (✅ `Connect.tsx:198-201`). Only the label talks about tickets. | Settled by the code. |
| 11 | **Search: send a sentence to Captain** | Search "does not silently send a sentence to an agent"; a separate **Tell Captain** action passes the page as context. | A sentence that matches nothing shows **Send to Captain** (handoff S07). | **Close to agreement.** S07 has an explicit "Tell Captain" mode and a Send button (`screens/S07-command-bar.md:13-16`), so nothing is silent either way. Follow S07. | None needed. |
| 12 | **Old local records** (v1 bulletin board, raw work log) | Keep them in the local app; Team's help explains how to open it. | Agent machinery; not for the website. | **Codex, slightly.** Neither of us wants them on the website (✅ no page reads them: no match for `task_runs` or `bulletin` in `apps/site/src`). Pointing people at an old local app is low value, but harmless. | Not worth a test. |

## 4. Disputed facts, checked in the code

### 4.1 Claims from both proposals

| # | Claim | From | Result | Evidence |
| --- | --- | --- | --- | --- |
| A1 | The sidebar has Captain · Overview · Team, then a Project menu: Work and records, Team conversation, Decisions, Guide, Results, Settings, Sign out | Both | ✅ | `apps/site/src/workspace/Workspace.tsx:42-46`, `:277-280` |
| A2 | Below 1100 px, a bottom bar: three tabs, plus Project on the last quarter | Claude | ✅ | `apps/site/src/styles.css:207`, `:215`, `:219` |
| A3 | "Change your name" is only in ⌘K; there is no account menu | Claude | ✅ | `Workspace.tsx:149`; sidebar `:268-281` |
| A4 | "Create" shows on Team, Decisions and Guide only | Claude ✅ · Codex names Team and Decisions, misses Guide | ✅ | `Workspace.tsx:188-191` (hidden on every other view) |
| A5 | Shortcuts: `C` new ticket; `G` then O, P, W, R, D, S. No shortcut for Captain or Settings | Claude | ✅ | `Workspace.tsx:43-52`, `:121-124` |
| A6 | Search's placeholder promises people and decisions, but it only filters commands and tickets | Codex ✅ · Claude says only the second half | ✅ | `apps/site/src/ui/CommandPalette.tsx:67` ("Jump to a ticket, person or decision…"), `:31` |
| A7 | No ⌘L, no "Tell Captain", no Pause everyone, no quiet hours, no `/history` or `/decisions/DEC-n` route | Both | ✅ | No match in `apps/site/src`; `lib/router.ts:26-55`. "Pause everyone" exists only as a preview switch (`ui/Preview.tsx:78`). |
| A8 | Browser notifications go off for every need except problems | Both | ✅ | `apps/site/src/workspace/decisionNotifications.ts:6` |
| A9 | The notification switch is saved **per browser** | Claude ✅ · Codex says "opt-in stored by profile" ❌ (misleading) | ✅ per browser | `useDecisionNotifications.ts:16`, `:79`: `localStorage`, keyed by profile id. Nothing goes to the database. Turning it on at your desk does not turn it on on your phone. |
| A10 | Any person in the project can OK a risky merge, not just the owner | Both | ✅ | `packages/autokolab/sql/012_merge_policy.sql:62-75` |
| A11 | Anyone in the project can record or replace a decision and edit the Guide | Both | ✅ | `Decisions.tsx:23-27`, `:70-73`; `GuidePage.tsx:112-115` (no owner check) |
| A12 | Results and its export are open to every member | Both | ✅ | `Workspace.tsx:214-215`; `ResultsPage.tsx:129-136` |
| A13 | The ticket page has a plain "Resolved" button that clears a question | Both | ✅ | `TicketPage.tsx:136-138` |
| A14 | The site posts only plain chat to the Room; agents post other kinds | Claude | ✅ | `apps/site/src/lib/room.ts:122` → `006_room_on_web.sql:44-45` |
| A15 | Observers can read the Room but not post | Codex | ✅ | `Room.tsx:368`; `CaptainHome.tsx:79` |
| A16 | The app records no page visits | Claude | ✅ | No analytics table; nearest is `project_reads.caught_up_at` (`015_last_visit.sql:6-11`) |
| A17 | Schema version is 29 | Codex | ✅ | `packages/autokolab/src/setup/team.ts:15` |
| A18 | `GUIDE.md` still describes the old app (lead, board, website only on localhost) | Claude | ✅, partly | `GUIDE.md:10`, `:93`, `:426`, `:449-454`. But §9 already describes Captain and Overview (`:315-320`). |

### 4.2 Claims about Overview and Captain

| # | Claim | From | Result | Evidence |
| --- | --- | --- | --- | --- |
| C1 | Overview's header says "Updated just now" as fixed text | Codex | ✅ | `Workspace.tsx:171`. A real `updatedText()` exists in `glance.ts:727` but isn't used there. |
| C2 | When a question waits, Overview hides the "What happened" problem row | Codex | ✅ | `glance.ts:862` (questions win the state), `Overview.tsx:60` (problem row shows only in the problem state) |
| C3 | In the problem state, Overview always says "Captain is handling it; you do not need to act", whether or not it is | Codex | ✅ | `glance.ts:873`, and "I'll check the next result and report back" at `:879`. Nothing checks that Captain took any action. |
| C4 | Overview already says "Work has stopped on …" | Claude | ❌ on Overview | That sentence is built in `glance.ts:428`, inside the older `overview()` summary. The Overview page builds its own sentence (`glance.ts:868-876`), which uses C3's wording instead. |
| C5 | Each Overview row links to Captain, the record, Team or Work | Claude | ❌ partly | Questions, problems, goals and "Delivered today" link (`Overview.tsx:56`, `:63`, `:80`, `:85`). **"Who is doing what" rows link nowhere** (`Overview.tsx:67-72`), and "See the team →" appears only with more than three agents (`:73`). |
| C6 | Overview shows how long an agent has been on its task | Neither claims it exists | ✅ not shown | Worked out in `glance.ts:219-220`, never shown (`:882-888`). That is AK-129. |
| C7 | With no Captain, the Captain page says "Pick one on People" | Claude | ✅ | `CaptainHome.tsx:110-114`, `:629`. The tab is called Team, so this wording is out of date. |
| C8 | Overview's "Open in Captain" lands on the exact message (`#need-<key>`) | Claude | ✅ | `CaptainHome.tsx:448`, `:90-92`; `Overview.tsx:34` |
| C9 | People can approve someone else's change right in the Captain chat | Codex | ✅ | `CaptainHome.tsx:411-412`; builders are blocked, `approve.ts:21` |

### 4.3 Claims about Team, joining and the backend

| # | Claim | From | Result | Evidence |
| --- | --- | --- | --- | --- |
| T1 | API agents' Pause / Remove / Change model / Change limit are "terminal commands, not buttons" | Claude | ❌ partly | They **are** buttons, shown only to the agent's owner. Clicking one shows the command to run (`People.tsx:530-544`). Codex's wording ("actions show local instructions") is right. |
| T2 | The owner of a Claude Code or Codex agent sees no pause or remove at all | Claude | ✅ | `People.tsx:274-384` (model and effort only) |
| T3 | Only the agent's owner can change model and effort on the site; Captain can too, through its tool; the machine can lock it | Codex | ✅ | `People.tsx:313-324`; `010_agent_model.sql:16-36`; `runner/config.ts:30-31` (`model_locked`, off by default) |
| T4 | Team says "The invite link is in Settings", and shows open-ticket counts per person | Both | ✅ | `People.tsx:82-89`, `:76` |
| T5 | New joiners and new project owners both land on Add an agent; existing members land on Captain | Codex ✅ · Claude implies Team ❌ | ✅ | `Join.tsx:24`, `:33`; `App.tsx:135-137` |
| T6 | "Give it a first ticket" teaches tickets before Captain | Claude | ❌ | It drafts a message to Captain and opens Captain (`Connect.tsx:198-201`). Only the label says "ticket". |
| T7 | The database lets the owner remove a member or agent, but no page does | Claude ✅ · Codex treats removal as local-only ❌ | ✅ | `004_workspace.sql:414-415`, `:461`; no delete in `apps/site/src`. The command-line `autokolab remove` uses a different, older path (`cli.ts:537-546`). |
| T8 | The database lets the owner rename the project or change its repo, but no page does | Claude | ✅ | `004_workspace.sql:408-409`, `:460` |
| T9 | Pause is a database function a website button could call | Claude | ❌ not yet | `set_paused` is granted to signed-in users but works through the v1 `members` table (`001_init.sql:321-335`). The site never calls it. It needs checking and probably backend work. |
| T10 | An agent's own limits (hours a day, minutes a run, daily dollars) can be shown read-only on Team | Claude | ❌ partly | Hours a day are reported (`019_agent_usage.sql:12-34`). **Minutes per run are never reported**, and daily dollars exist only for API agents (`runner/config.ts:47-49`, `:109-110`). |
| T11 | `run_usage` records tokens, cost and seconds per run | Claude | ✅ | `020_run_usage.sql:17-32` |
| T12 | Results' "asked a person" count leaves out Captain's chat questions | Codex | ✅ | `ResultsPage.tsx:24`; `results.ts:145` |
| T13 | Results' traffic covers seven days and includes the agents' other projects | Codex | ✅ | `ResultsPage.tsx:78-81`, `:159` |
| T14 | There is no project-wide pause in the database | Both (implied) | ✅ | `004_workspace.sql:10-21` has no pause column. `autokolab pause` with no name pauses only your own agents (`cli.ts:330`). |
| T15 | The handoff's phone tabs are Captain · Work · Room · You, and the amendments don't change them | Both | ✅ | `autokolab-ux-handoff/screens/P-phone.md:3`; `02-information-architecture.md:73-84` |

### 4.4 Factual errors found

**In my proposal (Claude):**
1. Overview does not say "Work has stopped on …" (C4).
2. Not every Overview row links somewhere: agent rows are dead ends (C5).
3. API agents' actions are buttons that show commands, not plain text (T1).
4. "Give it a first ticket" already goes to Captain (T6).
5. A Pause button is not just a button; the database function is tied to the old member table (T9).
6. Minutes per run can't be shown on Team; nobody reports them (T10).
7. Invitees and new owners land on Add an agent today, not on Team (T5).
8. I missed that Search's placeholder over-promises (A6).

**In Codex's proposal:**
1. The notification switch is saved per browser, not "by profile" in a way that follows you between devices (A9).
2. Removing a member or agent isn't local-only: the database already allows the owner to do it (T7).
3. "Create" is also on Guide, not only Team and Decisions (A4, minor).
4. Its phone sketch has no "Your account" in the header, though its text says it stays visible (minor, an inconsistency rather than a code fact).

## 5. What each of us missed

### 5.1 Only Codex covered

| Gap | Why it matters |
| --- | --- |
| Overview hides a failure when a question is also waiting (C2) | Someone answers the question and never learns the build broke. |
| "Captain is handling it" is said with no proof (C3) | It breaks the rule that status sentences come from the record (DEC-24). |
| "Updated just now" is fixed text (C1) | If the page stops refreshing, it still looks fresh. |
| A failed or stale data read must not say "nothing needs you" | The calm page is the most dangerous one to get wrong. |
| Two people answering the same question, or an old link to an answered one | Two people could approve an outdated plan. |
| Results' "asked" count misses chat questions; traffic includes other projects (T12, T13) | The numbers look complete when they aren't. |
| A small test with 3–5 people before building, with named tasks | The only real evidence either proposal offers a path to. |
| Search must say what it can't search yet (A6) | Today the placeholder promises people and decisions. |

### 5.2 Only I covered

| Gap | Why it matters |
| --- | --- |
| `GUIDE.md` still describes a board, a "lead" and a local-only website (A18) | New people read the guide first. |
| The navigation has changed three times in a week | Each change costs people; do the next one once, with redirects. |
| The owner of a Claude Code or Codex agent has no pause or remove at all (T2) | Only API agents' owners see any controls. |
| The database already allows removing members, and renaming the project or changing its repo (T7, T8) | These need only a page, not backend work. |
| There's no list of past plans, and a goal doesn't link back to its plan | Hard to find "what did Captain propose for this?" later. |
| "AutoKolab traffic" in bytes is a developer measure on a person's page | It answers a question only AutoKolab's builders ask. |
| A member who isn't the owner sees owner-only controls read-only, with who can change them | Codex says the same in one line; I gave the table. |

### 5.3 Neither of us covered

| Gap | Why it matters |
| --- | --- |
| **People in more than one project.** The needs-you count is per project, and a notification needs that project's tab open. | A question in project B is invisible while you work in project A. The project switcher could show a dot per project. |
| **The built app already departs from the amendments.** They still list Captain · Overview · Work · Room · People \| Decisions · Results · Settings (`00-AMENDMENTS.md:98`). I found no recorded decision for today's three-tab shell. | Whatever is chosen, a decision should record it, and the amendments should be updated, or the next builder will "fix" the app back to line 98. |
| **Pause everyone's home in the handoff is the status page** (section 3, row 6) | Both of us put it in a menu, away from where the problem shows. |
| **"Pick one on People"** on the Captain page uses the old name (C7) | A small copy fix, but it sends people to a tab that doesn't exist by that name. |
| **An agent owner's offline machine** is the one problem that blocks on a specific person, yet only questions notify. | Should "Your Mac is offline and Birch's work has stopped" reach Ana? The amendments say only blocking questions notify. |
| **Observers** (people who can read the room but not post, A15) | Neither proposal says what Captain looks like for someone who can't post. |

## 6. Recommended final navigation 💭

**Codex's three tabs and menu, with three of my changes:** the phone keeps its bottom-bar menu, Overview's agent rows open their work, and agent owners get real controls.

### Tabs

| Tab | What it shows, in one line |
| --- | --- |
| **Captain** | Your chat with Captain, and every "needs you" as a short message with small actions. (As built; fix "Pick one on People" → "Choose one on Team".) |
| **Overview** | The state sentence, what needs you, any problem (shown even when a question waits), who is doing what (each row opens its ticket), goals, and today's deliveries, with a real "updated" time. |
| **Team** | People and agents, with Captain marked; at the top: **Team conversation**, **Add an agent**, **Invite people** (owner). An agent's details show model, effort, hours today and limit, spend, and what its owner can do. |

### Menus

| Menu | Contents |
| --- | --- |
| **Project ▾** (desktop: bottom of sidebar; phone: fourth slot of the bottom bar, as today) | Work (opens By goal) · Decisions · Guide · Results ("what got done and what it used") · Settings (how merging works) |
| **You** (your avatar; phone: top right) | Your name and place · Notifications on this browser · New project · AutoKolab on GitHub · Sign out |
| **Top bar** | Project switcher · Search (⌘K) · You |

### What moves where

| Thing | From | To |
| --- | --- | --- |
| Team conversation (Room) | Project menu | Team, as a link at the top; also linked from tickets and goals; `/room` keeps working |
| Invite link | Settings | Team → Invite people, together with "add by GitHub name" |
| Notifications switch | Settings | You → Notifications, saying it works only in this browser while a tab is open |
| Sign out, Change your name | Project menu, ⌘K | You |
| Room's roster | Room | Removed (Team has it) |
| "Create" (new ticket) | Team, Decisions and Guide headers | Work and ⌘K |
| Work's default view | By agent | By goal |
| "Give it a first ticket" | End of Add an agent | Same action, new label: "Tell Captain what to build first" |
| Remove a person or agent | Command line only | Team, owner only (the database already allows it) |
| Pause my agent | Command line; API agents only | Team, the agent's owner, every engine. Needs a backend check first (T9). |
| Results | As is | Plus a short "Decided this period" list linking to Decisions; traffic moves under "Technical details" |

### The decisions only raghavendra can make

1. **Keep Team as the third tab, with the record (Work, Decisions, Results) in the Project menu?** Or promote a record tab instead of Team? I now recommend keeping Team, and running Codex's small test before changing it again.
2. **Record the navigation as a decision.** Today's app, these proposals and the handoff all disagree: the amendments list eight items (`00-AMENDMENTS.md:98`), and the phone spec lists Captain · Work · Room · You (`P-phone.md:3`). One decision should set desktop and phone together, and say whether Pause everyone (when built) may sit on Overview.

## 7. What I could not check

- I did not open the running site. Every fact above comes from the source code.
- I didn't run the database's access-rule tests, so whether a signed-in person can call `set_paused` (T9) is read from the SQL, not tested.
- How often people use each page is still a guess in both proposals. The app records no page visits (A16).
