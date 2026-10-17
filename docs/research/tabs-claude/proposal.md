# Which tabs should AutoKolab have, and what should each one show?

17 October 2026 · Research for AK-160 · by yvssaratchandra-claude · A proposal, not a decision

## The short answer

**Three tabs, plus one menu.**

| Tab | The one question it answers |
| --- | --- |
| **Captain** | "What do I want done, and what does Captain need from me?" |
| **Overview** | "What is happening right now, and is anything stuck?" |
| **History** | "What got done, why was it decided, and what did it cost?" |
| **More** (a menu, not a tab) | Team, all the work, the team conversation, rules, settings, and you. |

What changes from today (Captain · Overview · Team · Project menu):

1. **History becomes a tab.** Today the answers to "what got done", "why" and "what did it cost" are spread over four pages hidden in the Project menu (Work, Room, Decisions, Results). raghavendra's goal puts transparency at the centre, so the record deserves a front door.
2. **Team moves into More.** "Who is doing what" already lives on Overview. What Team adds (the roster, adding an agent, model and effort) is set-up work people do rarely.
3. **The Project menu splits in two.** Project things (team, work, rules, settings) stay in More. Personal things (your name, your notifications, sign out, switch project) move to a small **You** menu. Today "Sign out" sits under "Project", and "Change your name" is only in ⌘K.

Everything that exists today keeps a home. The mapping table in section 6 lists each one.

**How to read this.** ✅ marks something I checked in the code or a source (with the file or link). 💭 marks my opinion. Unmarked text is the proposal itself.

---

## 1. The app as it is today

### 1.1 How I looked

- I read every route, screen and shared component in `apps/site/src`, the handoff package, the coherence review (AK-145), the Overview wireframe, DEC-22, DEC-24 and `GUIDE.md`. `docs/product-vision.md` does not exist in this checkout.
- I did not run the site or take screenshots. This is a research ticket that changes no pages, and a source review was enough to list what exists. Everything in this section is **from the source**, not from using the app.
- I did not read the other agent's work. Its folder (`docs/research/tabs-codex/`) is not on `main`, and I did not look at its branch or ticket.

### 1.2 Every page and what it does (✅ verified in the code)

The address scheme is in [`router.ts`](../../../apps/site/src/lib/router.ts). The navigation is in [`Workspace.tsx`](../../../apps/site/src/workspace/Workspace.tsx).

**Navigation today.**
- Desktop sidebar: the project switcher, then **Captain** (with the needs-you count), **Overview**, **Team**. At the bottom, a folding **Project** menu: Work and records, Team conversation, Decisions, Guide, Results, Settings, Sign out.
- Below 1100 px wide: a bar along the bottom with Captain, Overview, Team (three quarters of the width) and Project (one quarter), which opens the same menu upwards ([`styles.css`](../../../apps/site/src/styles.css), the `max-width: 1099px` block).
- The header has a **Search** button (⌘K). Some pages also show **Create** (a new ticket): Team, Decisions and Guide. Captain, Overview and Work do not.
- Keyboard: `C` new ticket; `G` then `O` Overview, `P` Team, `W` Work, `R` Room, `D` Decisions, `S` Results.

| Page | Address | What is on it | Who uses it | How often (💭) |
| --- | --- | --- | --- | --- |
| Sign in | `/` signed out | One GitHub button and a short pitch. | Everyone | Once per browser |
| Welcome | after first sign-in | Your name and city/time zone. "Change your name" in ⌘K opens it again. | Everyone | Once |
| Create a project | `/new` | Name, GitHub repo, ticket prefix. Then goes straight to Add an agent. | Owner | Once per project |
| Join | `/j/<code>` | What the invite is for, then sign in and join. | Invitee | Once |
| Add an agent | `/connect`, or a dialog from Team and ⌘K | Pick a tool (Claude Code, Codex, an API model), a name, a daily dollar limit for API agents, then a one-line command with a pairing code that waits live for the machine. Ends with "Give it a first ticket". | Agent owner | Once per agent |
| **Captain** | `/p/<project>` | The chat with Captain: catch-up message, folded quiet updates, messages that need you (question, risky merge, plan) with small actions, "How do you know?" evidence, problems with a coral dot, the composer. Empty: "I'm set up. Tell me what you'd like built." | Owner, member | Several times a day |
| Look first | `/look/<key>` over Captain | The risky-merge check: the line that matters, the question, two answers. | Owner, member | A few times a week |
| Show the work | `?show=<key>` over any page | A side sheet: summary, the change, history of one ticket. | Anyone curious | Daily |
| Plan | `/plans/<id>` | A plan Captain proposed: goals, their tickets, what is left out, OK or Change something. Read-only. Reached from Captain's plan message. | Owner, member | Per big request |
| **Overview** | `/overview` | State sentence, "Next from Captain", Start here (new project), You are needed (2 rows), What happened (a problem), Who is doing what (3 rows), Goals (2 rows), Delivered today (2 rows). Each row links to Captain, the record, Team or Work. | Everyone | Several times a day |
| **Team** | `/people` | People (name, GitHub, place, open tickets, agents). Add a person by GitHub name (owner). Agents (status, tool, owner, machine, last seen, current ticket). Model and effort controls (agent's owner). For API agents: spend, key location, and instructions for Change model / Change daily limit / Pause / Remove, which are terminal commands, not buttons. Make or remove Captain (owner). Add an agent. | Owner, agent owner | Weekly, more during set-up |
| Work | `/work` with four tabs: By agent, By feature (`?group=goal`), Later (`?view=backlog`), All tickets (`?view=all`) | A board with search, filters and editable cards; the ranked backlog; the full list. | Curious owner, builders | Weekly 💭 |
| Ticket | `/work/<key>` | Title, Needs you (with **Resolved** or **OK to merge**), What changed, Description, Done means, Child issues, Linked issues, Steps, Activity and comments; on the side status, assignee, priority, type, labels, branch, PR, approvals. Almost every field is editable. | Agents, curious people | When something is asked about |
| Room ("Team conversation") | `/room` | Every message between people and agents, threads, a "Show agent activity" switch, a roster of people and agents, an `@name` composer. | Curious people, agents | Occasionally 💭 |
| Decisions | `/decisions` | Decisions in force, replaced ones on request, **Record a decision**, **Replace**. Contracts are marked. | Captain, builders, auditors | Rarely by people 💭 |
| Guide | `/decisions?tab=guide` | Concept, Architecture, Rules. Editable by anyone in the project. | Owner, agents | Rarely |
| Results | `/results` | This week / last 4 weeks; Export audit report (CSV, JSON); a headline; merged tickets; where you were asked; by agent; "AutoKolab traffic" (bytes downloaded); usage by kind of work. | Owner, manager | Weekly |
| Settings | `/settings` | Merging (owner changes, others read), "Tell me when a decision is waiting" (a browser notification, only while a tab is open), Invite people (owner). | Owner | Rarely |
| ⌘K | everywhere | Add an agent, New ticket, Go to each page, every ticket by key and title, switch project, new project, change your name, AutoKolab on GitHub, sign out. It does not search decisions, people or messages, and cannot send a message to Captain. | Keyboard users | Daily for some |

**Not built yet (✅ checked by searching the code):** the ⌘L Captain panel, "Tell Captain" from ⌘K, Pause everyone, the heads-up pages, the installable phone app and its push notifications, quiet hours, and a page per decision (`/decisions/DEC-n`).

### 1.3 What the backend can do, and whether the site shows it

✅ From `packages/autokolab/src` (CLI, MCP tools, runner), `packages/autokolab/sql`, `apps/site/api` and `apps/web`.

**What the site already shows** (each has a page today): tickets, steps, comments, links and history; decisions and the guide; the room and Captain's conversation; plans; approvals and the risky-merge OK; agents with status, model and effort; invites and pairing; merge policy; "caught up" for the catch-up message; run usage (tokens, cost, seconds) and daily efficiency on Results; per-agent spend on Team.

**What the backend can do that no page offers:**

| Capability | Where it lives now | Who would use it | Does it need a home in the tabs? (💭) |
| --- | --- | --- | --- |
| Pause or resume an agent (`set_paused`) | `autokolab pause` on the agent's machine. Team shows the command as text, for API agents only. | Agent owner | **Yes.** A button on the agent, for its owner (More → Team). Also the base for Pause everyone. |
| Remove a person or an agent | `autokolab remove` on the admin machine; the database already lets owners remove members, but no page does | Owner | **Yes**, on Team, owner only. |
| The agent's own limits (hours a day, minutes a run, daily dollars) | A settings file on the agent's machine; the site can only read what the runner reports | Agent owner | Show them on the agent (read-only, "set on Ana's Mac"). Changing them stays on the machine. |
| Rename the project or change its repo | Allowed by the database, no page | Owner | Settings, later. Rare. |
| The agents' work log (`task_runs`) and the old v1 bulletin board | MCP tools and CLI | Agents | **No.** Agent machinery. The ticket's history covers what people need. |
| Room messages other than chat (task, question, review, handoff, decision) | Agents post them; the site posts only chat | Agents | Shown in the Team conversation as today; people don't need to send them. |
| Machine set-up, keys, updates, database updates | The helper's local app (`apps/web`, served by `autokolab open` on the owner's computer) and the CLI | Agent owner, owner | **No.** These stay on the computer by design (keys never leave it). The website only shows the result ("on the latest version"). |
| Notifications | No table. Desktop ones from the helper; browser ones from the site while a tab is open | Everyone | See 5.5. |

`apps/web` is the helper's local set-up app, not part of the website. It is out of scope for the website's tabs.

### 1.4 Things with no clear home today (✅ verified, the judgement is 💭)

| Thing | Where it is now | The problem |
| --- | --- | --- |
| Sign out | Bottom of the **Project** menu | It is about you, not the project. |
| Change your name | Only in ⌘K | Nobody finds it without the keyboard. |
| Notifications switch | Project **Settings** | It is per browser and per person, but sits among the owner's project rules. |
| Inviting people | Invite link in **Settings**, "Add by GitHub name" on **Team** | One job, two pages. Team even says "The invite link is in Settings." |
| Cost | API agents' spend on **Team**; usage on **Results** | Nobody can answer "what did this cost us this week?" in one place. |
| Pause or remove an agent | Shown as terminal commands on **Team**, API agents only | The website can't do it; the owner of a Claude Code or Codex agent sees nothing at all. |
| "Create" (new ticket) | Header of Team, Decisions and Guide | A ticket button on the pages least about tickets, and none on Work. |
| "Record a decision", "Resolved" on a ticket's question, `@name` in the Room | Decisions, Ticket, Room | Each lets a person do Captain's job around Captain (also raised in AK-145). |
| "Give it a first ticket" | End of Add an agent | Teaches tickets before Captain. |
| "AutoKolab traffic" (bytes downloaded) | Results | A developer's measure in a person's report. |
| Plan pages | Only from a Captain message | There is no list of past plans. Fine today, but nothing links back to a plan from its goal. |

---

## 2. The people and their jobs

### 2.1 Four kinds of person (💭 drawn from the code's roles and the handoff's cast)

The database knows two roles, **owner** and **member** (✅ `00-AMENDMENTS.md`, "Words"), and every agent has an **owner profile** (✅ `People.tsx`). Those three facts give four kinds of person. One real person can be more than one.

| Who | Example | What they want from AutoKolab | Can code? |
| --- | --- | --- | --- |
| **The director** (project owner) | raghavendra | Give the project direction by talking to Captain; answer only real decisions; trust that it is moving; see what it costs. Sets how hands-off it is. | Maybe not. Design for not. |
| **The teammate** (member) | James | Ask Captain for things; see where their requests are; answer when Captain asks them. | Often, but shouldn't need to. |
| **The machine host** (agent owner) | Anyone who ran the connect line | Their agent is connected, working, on the right model, within the limit they set; pause it when they need their laptop. | Comfortable with a terminal. |
| **The onlooker** (a member who mostly reads, or a manager) | A manager, a client, an investor | What got delivered, how much of people's time it took, what it cost, and why big things were decided. Rarely writes. | No. |

**Agents are not an audience for the tabs.** They work through tools and the database, not the website (✅ `GUIDE.md` §6 and §11). The site shows what they did; it is never their workspace.

### 2.2 Their top jobs, ranked (💭)

Frequency is how often a typical person does it. Importance is what goes wrong if it's slow or hard to find.

| Rank | Job | Who | How often | Importance | Where it should take one step |
| --- | --- | --- | --- | --- | --- |
| 1 | **Answer Captain** when someone is waiting on me | Director, teammate | Several a day | Critical: agents sit idle until then | Captain (badge, notification) |
| 2 | **Tell Captain** what to build, change or stop | Director, teammate | Daily | Critical: it is the product | Captain, or ⌘K from anywhere |
| 3 | **Check nothing is stuck**: is it moving, and am I needed? | Everyone | Several a day | High: this is the trust | Overview |
| 4 | **See what got done** today or this week | Everyone | Daily | High | Overview (today), History (longer) |
| 5 | **Ask "how do you know?" / see the proof** behind one claim | Director, onlooker | Daily to weekly | High: transparency | One click from any claim |
| 6 | **See where my request stands** ("is Apple Pay done?") | Teammate, director | Daily | Medium | Overview goals, or ask Captain |
| 7 | **Understand why something was decided** | Director, onlooker | Weekly | Medium; high when it matters | History |
| 8 | **See what it cost** | Director, machine host, onlooker | Weekly | Medium; high for API agents | History (project); Team (my agent) |
| 9 | **Read what the agents are saying to each other** | Curious anyone | Occasionally | Medium: trust when something looks off | One click from a ticket, goal or agent; More |
| 10 | **Check my agent is connected and working** | Machine host | Daily glance, rare action | Medium | Overview row; Team for detail |
| 11 | **Add my laptop's agent**, change its model or effort, pause it | Machine host | Rare | Medium at set-up, else low | More → Team, ⌘K |
| 12 | **Invite someone**, choose Captain | Director | Rare | Low after set-up | More → Team |
| 13 | **Set how hands-off** the project is, pause everyone | Director | Rare | High when needed, rare | More → Settings |
| 14 | **Read or change the project rules** (Guide, decisions in force) | Director | Rare | Low for people (agents read them) | More → Rules |
| 15 | **Export the audit record** | Onlooker, director | Monthly | Low | History, one click deeper |
| 16 | **Switch project**, change my name, sign out | Everyone | Varies | Low | You menu |

**What the ranking says.** Jobs 1 and 2 are talking. Jobs 3, 4 and 6 are looking at *now*. Jobs 4, 5, 7 and 8 are looking at *what happened*. Everything from 10 down is set-up or management, done rarely. That is three kinds of visit, and so three tabs.

---

## 3. How comparable products organise this

COMPARE_PLACEHOLDER

---

## 4. The proposed tabs

### 4.1 The rule I used to pick them (💭)

A thing earns a **tab** only if all three are true:

1. It answers a question people ask **at least daily**.
2. **No other tab** answers that question.
3. It makes sense to a person who **doesn't code**.

Anything else lives one click deeper: in **More**, behind a link on the page that raises the question, or in ⌘K.

- Captain passes (jobs 1, 2).
- Overview passes (jobs 3, 4, 6).
- History passes (jobs 4 to 8). Today's Results, Decisions, Work and Room each fail rule 1 alone, but together they answer one daily question: "what happened, and can I trust it?"
- Team fails rule 2: the live part ("who is doing what") is on Overview. What remains (the roster and the controls) is set-up, so it fails rule 1 for everyone except a machine host on set-up day.
- Work fails rule 3 as a first stop: four boards of tickets is the team's machinery. It stays, one click deeper, for people who want it.

### 4.2 Sketch

Desktop, 1440 wide:

```
┌──────────────────┬───────────────────────────────────────────────────┐
│ AutoKolab        │  Overview                         [Search ⌘K]     │
│ Shop ⌄           │ ───────────────────────────────────────────────── │
│                  │  The team is building Checkout and Sign-in.       │
│ ▸ Captain    (1) │  Next from Captain: review Fjord's Apple Pay.     │
│   Overview       │                                                   │
│   History        │  You are needed                                   │
│                  │  ● Should shared computers stay signed in?  Open →│
│                  │                                                   │
│                  │  Who is doing what                                │
│                  │  B  Birch · Apple Pay button          Building    │
│                  │  F  Fjord · Google sign-in callback   In review   │
│                  │                                                   │
│                  │  Goals                                            │
│                  │  Checkout        3 of 5 done · next: receipts     │
│                  │  Sign-in         1 of 4 done                      │
│                  │                                                   │
│ More ⌄           │  Today                                            │
│ (A) Ana ⌄        │  ● Shipped: friendlier empty states   Record →    │
└──────────────────┴───────────────────────────────────────────────────┘
```

Phone, 390 wide:

```
┌─────────────────────────────┐
│ Shop ⌄                🔍  (A)│   ← project switch, search, You
│─────────────────────────────│
│                             │
│   (the current tab)         │
│                             │
│─────────────────────────────│
│ Captain  Overview History More│  ← 4 slots, 44 px+ targets
│   (1)                       │
└─────────────────────────────┘
```

### 4.3 Tab 1 · Captain

| | |
| --- | --- |
| **Question** | "What do I want done, and what does Captain need from me?" |
| **For** | Director and teammates, every visit. The page a project opens on (DEC-24). |
| **Change from today** | Little. Keep it as built (DEC-24, AK-69). Fix the dead ends in "Edges" below. |

**What it shows, in order (default):**
1. The conversation, newest at the bottom: Captain's catch-up when you come back, its replies, plans and questions; your messages; quiet updates folded into one line.
2. A message that needs you carries the small amber dot and two or three small actions under it (Yes, merge it · Let me look first · No · Reply).
3. "Captain is reading…" while it works.
4. The composer: "Tell Captain anything — a goal, a question, a change of plan".

**One click deeper:** "How do you know?" (evidence, in place) · "Show the work" (the side sheet) · "Let me look first" (the risky-merge check) · the plan page · any ticket key in a message.

**Main actions:** send a message · answer a question · OK a plan or risky merge · say no or change something.

**Deliberately not here:** status, counts, the team list, goals, cost, setup checklists (all on Overview or History). No filled boxes, no pinned card (DEC-24).

### 4.4 Tab 2 · Overview

| | |
| --- | --- |
| **Question** | "What is happening right now, and is anything stuck?" |
| **For** | Everyone, several times a day. For looking; nothing is typed here (DEC-24). |
| **Change from today** | Keep the approved wireframe. Add a "since you last looked" line only if raghavendra wants it (question 6). Point "See the team →" at the Team page in More. Rename "Delivered today" to **Today** so it can also say what was decided. |

**What it shows, in order (each block hidden when empty):**
1. **The state sentence**, built by code: "The team is building Checkout and Sign-in." When stuck, it says so first: "Work has stopped: Birch's Mac is offline."
2. **Next from Captain**, one line.
3. **You are needed**: one row per thing waiting on you, a small amber dot, "Open in Captain →". Up to 2, then "and 3 more in Captain →".
4. **What went wrong** (only when something did): one coral row, what was done about it, and who can fix it ("Only Ana can restart that Mac").
5. **Who is doing what**: one row per working agent (name · what it's doing · one-word state). Up to 3, then "See the team →".
6. **Goals**: one row per active goal ("3 of 5 done · next: receipts"). Up to 2, then "See all work →".
7. **Today**: what shipped and what was decided since midnight, up to 2 rows, then "See History →".
8. **Start here** (new project only): connect Captain, then tell it your first goal.

**One click deeper:** an agent row opens its ticket · a goal row opens that goal's tickets · a "Today" row opens the record sheet · "See the team", "See all work", "See History".

**Main actions:** none that change anything. Every action is a link: to Captain to answer, to the record to check.

**Deliberately not here:** count tiles, models, machines, cost, the conversation, the board, review queues, anything older than today (that's History).

### 4.5 Tab 3 · History (new)

| | |
| --- | --- |
| **Question** | "What got done, why was it decided, and what did it cost?" |
| **For** | Director and onlooker weekly; anyone checking a claim. |
| **Change from today** | New tab. It is today's Results page, rebuilt as a readable record, with doors to Work, Decisions and the team conversation. |

**What it shows, in order (default: this week):**
1. **The period**, "This week · 13–17 Oct", with "Last 4 weeks" beside it.
2. **One sentence, built by code**: "18 changes shipped this week. You were asked 4 times. Agents worked 31 hours." Real numbers only (amendments: no solo baseline).
3. **Shipped**: one line per goal or ticket that shipped, newest first, each with its plain summary ("Shoppers can pay with Apple Pay") and "Record →". Five, then "See all".
4. **Decided**: one line per decision made this period, in plain words, with who decided and when ("Stay signed in on shared computers: no · Ana · Tue"). Three, then "All decisions →".
5. **Went wrong, and was handled**: one line per problem this period, each with what was done. Hidden when none. (Later, each opens its heads-up page.)
6. **What it cost**: one line per kind of agent. API agents in dollars ("Fjord · DeepSeek · $3.20 of a $5 daily limit"); subscription agents in time ("Birch · Claude Code on Ana's subscription · 9 hours"). Never a made-up dollar figure for a subscription.

**One click deeper:**
- **All the work**: today's Work page (board, by goal, later, all tickets).
- **All decisions**: today's Decisions page, plus the rules in force.
- **Team conversation**: today's Room.
- **Full numbers**: time to merge, where you were asked, by agent, usage by kind of work.
- **Export the audit record** (CSV, JSON).

**Main actions:** choose the period · open a record · export.

**Deliberately not here:** anything happening right now (Overview), anything to answer (Captain), editing tickets or decisions, "AutoKolab traffic" in bytes (move it to a developer view or remove it, question 8).

**Why one tab and not four:** each piece is a different view of the same record, and the question people bring is the same: "what happened, and can I trust it?" Giving each piece its own tab would bring back the eight-item sidebar AK-145 removed.

### 4.6 More (a menu, not a tab)

On desktop it is a folding group at the bottom of the sidebar, as today. On a phone it is the fourth slot and opens a sheet.

| Item | The question | What it shows by default | Who can change things |
| --- | --- | --- | --- |
| **Team** | "Who is on the team, and can they work?" | People (name, place, local time, their agents). Agents (one-line status, tool, whose machine, last seen). Captain marked. **Add an agent**. **Invite someone** (link and "add by GitHub name", together). One click deeper on an agent: model, effort, "last ran", spend and limit, pause. | Owner: invite, choose Captain. Agent owner: their agent's model, effort, limit, pause. |
| **All the work** | "Every goal and ticket, where it is." | Opens on **By goal** (plain), not By agent. By agent, Later and All tickets as view choices. Ticket pages as today. | Anyone can comment. Editing fields stays, but behind a "Detailed" switch on the ticket (AK-145, item 5). |
| **Team conversation** | "What are the agents saying to each other?" | Today's Room. "Show agent activity" off by default. | Anyone can write. |
| **Rules** | "What must every agent follow?" | Guide (Concept, Architecture, Rules) and the decisions in force. | Owner edits the Guide; decisions come from Captain (question 4). |
| **Settings** | "How hands-off is this project?" | How merging works. Later: Pause everyone, what counts as risky. | Owner only; members read. |

### 4.7 You (a small menu on your avatar)

Your name and place · **Notifications** (moved from Settings: they are per person) and later quiet hours · Switch project · New project · AutoKolab on GitHub · Sign out.

### 4.8 Alternatives I rejected

| Option | Why not (💭) |
| --- | --- |
| **Keep Captain · Overview · Team** (AK-145, built in AK-156) | Puts set-up (Team) in front and hides the record. The goal asks for transparency and "why was this decided"; under this option those are three clicks into a menu. |
| **Captain · Overview only, everything else in More** | The smallest, and tempting. But History would be in a menu, and History is where trust is earned. Second choice if raghavendra wants two. |
| **Captain · Overview · Work · Team** | Four primary places, two of them machinery. Work is how agents organise; people ask Captain or look at goals. |
| **One page: Captain with status on top** | Tried and dropped in DEC-24. |
| **A separate Inbox or Activity tab** (Slack, Linear) | Captain's conversation already is the inbox: every "needs you" arrives there, and Overview lists them. A third place would repeat it. |
| **Room as a primary tab** (handoff phone design) | Raw agent chat is noisy for a non-coder. It stays one click from every ticket, goal and History, and in More. |
| **Name the new tab "Results", "Record" or "Activity"** | "Results" sounds like metrics only; "Record" sounds like a log; "Activity" sounds like live status, which is Overview's job. "History" says "the past" plainly. |

---

## 5. The edges

### 5.1 Phone

- **Bottom bar with four slots:** Captain (with the needs-you number), Overview, History, More. Each 44 px or taller, labels at 12 px (✅ the handoff's minimums).
- **Top bar:** project name (tap to switch), search, your avatar (the You menu).
- Today's bar is three tabs plus Project (✅ `styles.css`). The change is one tab swapped and the menu renamed.
- The Captain composer sits above the bottom bar. The ⌘L panel has no phone version: on a phone, Captain is one tap away.
- An answer from a notification opens Captain at that message, as Overview's rows already do (✅ `#need-<key>` in `CaptainHome.tsx`).

### 5.2 First run and empty states

| Situation | What the person sees |
| --- | --- |
| Signed in, no project | Create a project. Then **connect Captain** (one agent, the connect line). Then Captain: "I'm set up. Tell me what you'd like built." Hide the ticket prefix unless "More options" is opened (AK-145). Drop "Give it a first ticket". |
| Invitee | The Join page, sign in, then Captain (with its catch-up), not Team. |
| Project, no Captain yet | **Owner**: Captain says "This project has no Captain yet" with **Choose Captain** right there (a list of connected agents) or **Connect an agent**. **Member**: "Ana hasn't chosen a Captain yet. I've let her know." (✅ today it says "Pick one on People".) |
| Captain, nothing built yet | Overview shows only Start here. History: "Nothing has shipped yet. When it does, it shows here." with "Tell Captain →". |
| An empty page in More | One sentence on what will appear there and a link to Captain (✅ handoff N04). |
| Not in the room yet | Today: "Reload the page, or ask the owner for a new invite link" (✅ `CaptainHome.tsx`). Better: one line, and the owner's name to ask. |

### 5.3 A stalled or broken project

Today Overview already says "Work has stopped on …" and shows a coral row (✅ `glance.ts`, `Overview.tsx`). Keep that, and add:

- **Say who can fix it.** "Birch's Mac is offline. Only Ana can bring it back." Only the agent owner gets the fix (a link to their agent on Team). Everyone else is told nothing is needed from them.
- **Captain itself offline:** Captain's header says "Captain is offline · Ana's Mac is asleep". The composer still takes messages ("I'll read this when I'm back"). Overview's sentence starts with it.
- **Limits reached:** "Fjord reached its $5 daily limit. It starts again tomorrow." No action, no amber.
- **Nothing to do:** "Everything planned is finished. Have another goal? Tell Captain." (✅ already built.)
- **The page itself fails:** one sentence and **Try again** (✅ handoff N05).

### 5.4 Search and ⌘K

- **One box, two jobs:** find anything, or tell Captain. A sentence that matches nothing shows **Send to Captain** (✅ handoff S07; not built).
- **Finds:** pages, tickets and goals (✅ today), plus decisions, people and agents, and plans (new).
- **Commands:** Add an agent, Invite someone, New ticket, Switch project, Change your name, Sign out (✅ today), plus later Pause everyone.
- On a phone: the search icon in the top bar opens the same box.
- Keep `G then …`: `G O` Overview, `G H` History, `G T` Team, `G W` work, `G R` conversation. Show them in tooltips and ⌘K only (✅ handoff 02).

### 5.5 Notifications

- **One badge in the whole app:** the needs-you number on Captain (✅ today). No badges on Overview, History or More.
- **Notify only when someone is stuck on you** (✅ amendments; today's browser switch notifies on any waiting decision, but not on problems, ✅ `decisionNotifications.ts`).
- **Per person**, so the switch moves to **You** (today it is in project Settings).
- Later: the phone app as an installed web app with push and quiet hours (AK-88).
- No separate notification list. The list of what needs you is Overview's "You are needed"; the place to answer is Captain.

### 5.6 Owner, member and agent owner

| Thing | Owner | Member | Agent owner (for their own agent) |
| --- | --- | --- | --- |
| Captain, Overview, History | Sees and uses | Sees and uses | — |
| Answer a risky merge | Yes | Yes, unless they built it (✅ nobody approves their own work) | — |
| Invite people, choose Captain | Changes | Sees who can, no controls | — |
| How merging works, Pause everyone | Changes | Reads, with "Only Ana can change this" | — |
| Model, effort, daily limit, pause | For their own agents | For their own agents | Changes; others read |
| Rules (Guide, decisions) | Edits Guide | Reads | — |
| Export | Yes | Yes 💭 (it's the same record they can already read) | — |
| Cost | Sees all | Sees all 💭 (transparency) | Sees their own in more detail |

Owner-only controls never disappear for members. They show read-only with who can change them (✅ handoff N05, and `Merging` in `People.tsx` already does this).

### 5.7 Where transparency lives

| Question | Glance | One click | All of it |
| --- | --- | --- | --- |
| What are agents doing? | Overview · Who is doing what | The ticket and its steps | Team conversation |
| What did they say to each other? | — | "Conversation about this" on a ticket or goal | Team conversation (More) |
| Why was this decided? | History · Decided | The decision, and the conversation it came from | All decisions (More → Rules) |
| Is this claim true? | Captain's message | How do you know? | Show the work |
| What did it cost? | History · What it cost | Full numbers | Export |

---

## 6. Where every current page and feature goes

| Today | Where it is now | New home | What happens |
| --- | --- | --- | --- |
| Sign in | `/` | Same | Kept. Update the pitch (AK-145). |
| Welcome (name, place) | First sign-in; ⌘K "Change your name" | You menu → Your name and place | Kept, now findable. |
| Create a project | `/new`, project switcher | You menu → New project; switcher | Kept. Ticket prefix behind "More options". Ends on Captain. |
| Join | `/j/<code>` | Same | Kept. Lands on Captain. |
| Add an agent | `/connect`, Team, ⌘K | More → Team, ⌘K, Overview's Start here | Kept. "Give it a first ticket" removed. |
| Captain | First tab | **Captain** tab | Kept. |
| Catch-up, quiet fold, needs-you messages, plans in chat | Captain | Captain | Kept. |
| How do you know? | Captain messages | Same | Kept. |
| Look first | `/look/<key>` | Same | Kept, link only. |
| Show the work sheet | `?show=` | Same, from every tab | Kept, link only. |
| Plan page | `/plans/<id>` | Same; also linked from its goal | Kept, link only. |
| Overview | Second tab | **Overview** tab | Kept. "Delivered today" becomes "Today". |
| Overview · Start here | Overview | Same | Kept. |
| Team: people | Third tab | More → **Team** | Moved under a menu. |
| Team: agents, status, Captain choice | Team | More → Team | Moved. Status in one line by default; model, effort, spend one click deeper. |
| Team: Add a person by GitHub | Team | More → Team → Invite someone | Merged with the invite link. |
| Team: API agent's spend | Team | History → What it cost (project); Team (agent owner's detail) | Kept in both, at two depths. |
| Team: Pause / Remove / Change limit (terminal instructions) | Team, API agents | More → Team, the agent's detail | Kept. A real Pause button is a follow-up. |
| Work · By agent | Project menu | More → All the work → By agent | Moved; no longer the default. |
| Work · By feature | Project menu | More → All the work → **By goal** (the default) | Renamed "By goal", made default. |
| Work · Later | Project menu | More → All the work → Later | Kept. |
| Work · All tickets | Project menu | More → All the work → All tickets | Kept. |
| Ticket page | `/work/<key>` | Same | Kept. Editing behind "Detailed". "Resolved" replaced by answering through Captain (AK-145). |
| New ticket (`C`, Create button) | Header of Team, Decisions, Guide; ⌘K | ⌘K and All the work only | Moved off the pages that aren't about tickets. |
| Room | Project menu → Team conversation | More → **Team conversation**; links from tickets, goals, History | Kept. `@name` hint softened (AK-145). |
| Room's roster | Room | Removed | Same facts are on Team (one fact, one place). |
| Decisions | Project menu | History → Decided (this period); More → Rules (in force) | Split by question: "why" in History, "what holds" in Rules. |
| Record a decision / Replace | Decisions | More → Rules, behind "Detailed" | Kept for experts; normal path is telling Captain. |
| Guide | Project menu | More → **Rules** | Kept. |
| Results: headline, merged, where you were asked | Project menu | **History** | Merged into the History tab. |
| Results: by agent, usage | Results | History → Full numbers | One click deeper. |
| Results: export CSV, JSON | Results | History → Export | One click deeper. |
| Results: AutoKolab traffic | Results | Removed from people's view, or kept under Full numbers | Question 8. |
| Settings: merging | Project menu | More → **Settings** | Kept. |
| Settings: notifications | Project menu | **You** → Notifications | Moved (per person). |
| Settings: invite | Project menu | More → Team → Invite someone | Moved, merged with "add by GitHub name". |
| Sign out | Project menu | **You** | Moved. |
| Project switcher | Sidebar top | Same; phone top bar | Kept. |
| ⌘K | Header, keyboard | Same; phone search icon | Kept; grows (5.4). |
| Old addresses (`/board`, `/backlog`, `/list`, `/guide`, `/t/<key>`) | Redirects | Same | Kept. New: `/history`; `/people` keeps working. |
| Dev previews (`?preview=`) | Development only | Same | Untouched. |

Nothing is removed except the Room's roster (a repeat of Team), "Give it a first ticket", and possibly the traffic line. Everything else is kept, moved or merged.

---

## 7. Risks and questions for raghavendra, most important first

| # | Question | My recommendation | Why it matters |
| --- | --- | --- | --- |
| 1 | **Should History replace Team as the third tab?** This changes the navigation AK-156 just built from AK-145. | **Yes.** Team goes into More; Overview keeps "who is doing what". Watch whether machine hosts struggle to find their agent; if so, add "Your agents" to the You menu, not a tab. | It is the main change in this proposal, and it reverses recent work. It needs a new decision (it changes DEC-22's navigation). |
| 2 | **Is History one tab, or Results and Decisions kept apart?** | **One tab.** Each piece fails the "daily" test alone. | A tab per record brings back the eight-item sidebar. |
| 3 | **May people still edit tickets and record decisions directly?** | **Yes, behind a "Detailed" switch**, never in the normal reading path. The normal path is telling Captain. | Direct edits let people do Captain's job around it, which the goal argues against; removing them would strand experts. |
| 4 | **Who writes decisions?** | Captain records them after a person answers (AK-145, step 5). People may add one in Rules → Detailed. | Decides whether "Record a decision" stays a main button. |
| 5 | **What does "cost" mean for subscription agents?** | Show time worked and "on Ana's subscription"; dollars only where the tool reports them (API agents). | A made-up dollar number would break trust; "free" would be wrong too. |
| 6 | **Should Overview say "since you last looked"?** | **Not yet.** Captain's catch-up already does this; Overview stays "now and today". | Prevents the same fact in two places. |
| 7 | **Can members see cost and export the record?** | **Yes.** It's the same record they can already read piece by piece. | Transparency inside the team; an owner could want it private. |
| 8 | **Keep "AutoKolab traffic" (bytes downloaded) on Results?** | **Move it under Full numbers**, or to a developer-only view. | It answers a question only builders of AutoKolab ask. |
| 9 | **Should the phone keep four slots (Captain · Overview · History · More)?** | **Yes.** The handoff's Work and Room tabs fail the non-coder test. | Phone is where answers to Captain happen. |
| 10 | **Should Pause and Remove for an agent become buttons on the website?** | **Yes, for the agent's owner**, writing to the database for the runner to read. Today they are terminal commands shown as text. | Needed for "pause my agent", and for Pause everyone (DEC-22 build phase 7). |

**Other risks (💭):**
- **GUIDE.md still describes the old navigation** (lead, board, "watch the board", local-only website, ✅ `GUIDE.md` §4 and §12–13). Whatever is chosen, it should be rewritten for people in the same change.
- **One more renaming costs people.** The app's navigation has changed three times in a week (DEC-22, DEC-24, AK-156). Do this change once, with old addresses redirecting.
- **History could become a dashboard.** Keep it to sentences and short lists; no charts by default.

---

## 8. What I could not check

- I did not open the running site at desktop or phone width. Sections 1 and 5 come from the source code.
- The product comparison in section 3 is limited to what the sources below say; I did not use those products for this research.
- "How often" and the job ranking are my estimates from the roles in the code and the handoff's journeys, not from usage data. The app records no page visits.
