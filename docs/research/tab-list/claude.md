# The final tab list

17 October 2026 · AK-164 · by yvssaratchandra-claude · A recommendation, not a decision

## The answer

**The app has 5 tabs:**

| Tab | Its one purpose | The part of the theme it serves |
| --- | --- | --- |
| **Captain** | Talk to Captain: tell it what you want, and answer when it asks you something. | "People give the project direction by simply talking to Captain", and Captain "asking people for decisions in simple language". |
| **Overview** | See at a glance what is happening right now and whether anything needs you. | "People understand, very simply, what is happening." |
| **Work** | See everything being built, goal by goal: what is done, what is being worked on, what comes next, and the proof. | "What agents are doing", and Captain "managing the work". |
| **Team** | See who is on the project, people and agents, where they work from, whether each can work, and what they say to each other. | "A team of agents collaborate on a project, wherever the agents are, across geographies or systems." |
| **Decisions** | See what has been decided and why, and the rules every agent follows. | Captain "taking decisions, explaining them". |

**Not tabs:** two small menus (the **project menu** on the project's name, and the **You menu** on your picture), **Search** (⌘K), and pages that open over a tab from a link (a plan, "Let me look first", "How do you know?", "Show the work"). Each is listed in section 5.

**The one exception to "no overlap":** Overview. Everything it shows, apart from the state sentence and "since you last looked", is a short summary that links to its home on another tab.

---

## 1. The tabs

### Captain

- **Purpose:** the place to talk to Captain. You tell it what you want; it answers, proposes plans, and asks you when it needs a decision.
- **Theme:** direction comes from talking to one point of contact, and Captain asks for decisions in plain words.
- **Lives only here:** your conversation with Captain · Captain's questions and your answers · OK or change a plan · "Yes, merge it" for a risky change · approving someone else's change.
- **Not here:** the state of the project, problems and "while you were away" (**Overview**) · task details and proof (**Work**) · who is online (**Team**) · past decisions (**Decisions**).
- **What you do:** write a message, answer a question, OK a plan.

### Overview

- **Purpose:** one look tells you what is happening now and whether anything needs you. It is for looking; nothing is changed here.
- **Theme:** transparency, at the simplest depth.
- **Lives only here:** the one-sentence state of the project, with a real "updated at" time · **Since you last looked**: what was delivered and decided while you were away (moved from Captain's catch-up message, *needs to be built*) · **Start here** steps for a new project.
- **Summaries only (each links to its home):** you are needed (→ Captain) · problems (→ Work or Team) · who is doing what (→ Work) · goal progress (→ Work) · what Captain does next (→ Work).
- **Not here:** anything to type or change. Answers go to **Captain**, detail to the tab that holds it.
- **What you do:** read, then click through.

### Work

- **Purpose:** everything being built, goal by goal: what is done, what each agent is working on now, what is next, and the proof behind each piece.
- **Theme:** shows what agents are doing and the work Captain manages, in full.
- **Lives only here:** goals and their progress · every task with its steps, comments, history and proof · **who is doing what** (By agent view) · what is planned for later · **what got delivered, how fast, how often people were asked, and what it used** (today's Results, as a **Results** view of Work) · the export · problems with a task (failed tests, sent back).
- **Views:** By goal (default) · By agent · Later · All · Results.
- **Not here:** an agent's machine and whether it is online (**Team**) · why something was decided (**Decisions**) · answering a question (**Captain**).
- **What you do:** look closer at a goal or task. Experts can still create and edit tasks here; the normal path is telling Captain.

### Team

- **Purpose:** the people and agents on this project: who they are, where they work from, whether each agent can work right now, and what they say to each other.
- **Theme:** the team working together from anywhere is the core of the theme. This tab shows the team and its conversation.
- **Lives only here:** people (name, place, local time) · agents (whose machine, online or offline, paused, at its daily limit) · which agent is Captain, and choosing it · add an agent · invite people (link and "add by GitHub name" together) · an agent's model, effort and daily limit · pause my agent and remove someone (*needs to be built*) · **the team conversation** (today's Room, as a **Conversation** view of Team).
- **Views:** Members (default) · Conversation.
- **Not here:** what each agent is working on (**Work**, By agent) · what agents spent (**Work**, Results) · open-task counts per person (removed; Work shows it).
- **What you do:** check your agent can work, add one, invite someone, read what the agents agreed.

### Decisions

- **Purpose:** what has been decided for this project and why, and the standing rules every agent follows.
- **Theme:** Captain takes decisions and explains them. This is where every explanation stays.
- **Lives only here:** decisions in force, with who decided, when and why · replaced decisions · the project guide (Concept, Architecture, Rules), as a **Guide** view.
- **Views:** Decisions (default) · Guide.
- **Not here:** questions still waiting for an answer (**Captain**) · what was decided since you last looked (summarised on **Overview**).
- **What you do:** read why. Experts can still record or replace a decision and edit the guide; the normal path is telling Captain.

---

## 2. Overlap check

● = the single home. ○ = a summary on Overview that links to the home. Nothing else repeats.

| Fact or control | Captain | Overview | Work | Team | Decisions | Menu |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| State of the project (one sentence) | | ● | | | | |
| Since you last looked | | ● | | | | |
| Start here (new project) | | ● | | | | |
| Talk to Captain | ● | | | | | |
| A question waiting for me, and my answer | ● | ○ | | | | |
| OK a plan · OK a risky merge · approve a change | ● | ○ | | | | |
| Who is doing what | | ○ | ● | | | |
| Goals and progress | | ○ | ● | | | |
| What comes next | | ○ | ● | | | |
| All work, task details, proof | | | ● | | | |
| A task's problem (failed tests, sent back) | | ○ | ● | | | |
| Delivered work, delivery numbers, export | | ○ | ● | | | |
| Cost and usage | | | ● | | | |
| Team members | | | | ● | | |
| Agent online, paused, at its limit; an agent's machine is down | | ○ | | ● | | |
| Model, effort, daily limit | | | | ● | | |
| Add an agent · choose Captain | | | | ● | | |
| Invitations | | | | ● | | |
| Agent conversation | | | | ● | | |
| Decisions made, and why | | ○ | | | ● | |
| Rules agents follow (guide) | | | | | ● | |
| Merging setting · Pause everyone | | | | | | ● project |
| Notifications · your name · sign out | | | | | | ● You |
| Switch or create a project | | | | | | ● project |

**Where my earlier proposals broke this rule, and the fix:**

| Earlier (AK-160, AK-162) | Problem | Fixed by |
| --- | --- | --- |
| A History tab with "Shipped", "Decided" and "What it cost" | Repeated Work, Decisions and Team | No History tab. Each past fact stays with its home. |
| Agent spend on Team *and* on History or Results ("two depths") | Cost in two places | All spending lives in Work → Results. Team keeps only the limit, which is a setting. |
| Decisions split: "this period" in History, "in force" in Rules | One fact, two homes | All decisions on Decisions. |
| Results with a "Decided this period" list (AK-162) | Repeated Decisions | Dropped. Overview's "Since you last looked" is the only summary. |
| Team showing each agent's current task (as today) | Repeated Work's By agent view | Team says *whether* an agent can work; Work says *what* it works on. |
| Captain's catch-up message and problem notices (as today, kept in both proposals) | Summaries outside Overview | Moved to Overview. Captain writes only replies, plans and questions. |
| Approving a change both in Captain and on the task page (as today) | One control, two places | Captain only. The task page shows the result. |

---

## 3. Where today's pages go

| Today | Goes to | What happens |
| --- | --- | --- |
| Captain | **Captain** | Kept. Catch-up and problem messages move to Overview. |
| Plan page | Opens from a Captain message | Kept, as a page over Captain. |
| Let me look first (risky merge) | Opens from a Captain message | Kept, as a page over Captain. |
| Overview | **Overview** | Kept. Adds "Since you last looked" and a real "updated at" time. |
| Work: By agent, By feature, Later, All tickets | **Work** | Kept. "By feature" renamed **By goal** and made the default. |
| Ticket page (one task) | **Work** | Kept. "Resolved" and "OK to merge" leave it; answering happens in Captain. |
| New ticket (C, Create button) | **Work**; ⌘K | Kept. The Create button leaves Team, Decisions and Guide. |
| Show the work, How do you know? | Opens over any tab | Kept. Shows Work's facts, does not copy them. |
| Results | **Work** → Results view | Kept whole: delivery numbers, usage, cost, export. Traffic goes under "Technical details". |
| Team (People) | **Team** | Kept. Open-task counts and "current ticket" removed (they are Work's). |
| Add an agent (/connect) | **Team**; ⌘K | Kept. "Give it a first ticket" relabelled "Tell Captain what to build first". |
| Room | **Team** → Conversation view | Kept. `/room` still works. Its roster is removed (Team lists everyone). |
| Decisions | **Decisions** | Kept. |
| Guide | **Decisions** → Guide view | Kept. |
| Settings: merging | Project menu → Project settings | Kept. |
| Settings: invite people | **Team** | Moved, joined with "add by GitHub name". |
| Settings: notifications | You menu | Moved. It says it works only in this browser. |
| Search (⌘K) | Header, every page | Kept. A shortcut that opens a control's home; it holds nothing of its own. |
| Change your name, Sign out, AutoKolab on GitHub | You menu | Moved out of ⌘K and the Project menu. |
| Project switcher, New project | Project menu | Kept. |
| Sign in, Welcome, Create a project, Join | Before any tab | Kept. Joining and creating a project land on Captain. |
| Old addresses (`/board`, `/list`, `/guide`, `/t/…`, `/people`, `/results`) | Redirect to their new home | Kept. |

Removed: the Room's roster, open-task counts on Team, and the duplicate approve controls on the task page. Nothing else.

---

## 4. Menus and non-tabs

- **Project menu** (click the project's name, top left; phone: top bar): Switch project · New project · Project settings (merging; later the project's name and repo) · Pause everyone (*needs to be built*). These act on the whole project, are used rarely, and must be reachable from every tab, so they are not a tab.
- **You menu** (your picture): Your name and place · Notifications on this browser · AutoKolab on GitHub · Sign out. These are about you, not the project.
- **Search** (⌘K, and the search icon on a phone): find a page, task or goal; run a command.
- **Pages that open over a tab:** a plan, Let me look first, How do you know?, Show the work, Add an agent.
- **Phone:** the 5 tabs in the bottom bar (Captain carries the only badge). The project menu, Search and You sit in the top bar.

---

## 5. What changed, and the one open question

In AK-160 I proposed three tabs (Captain, Overview, History). In AK-162 I switched to Codex's Captain, Overview, Team with a Project menu of five pages. Both used "is it used daily?" as the test, which pushed important pages into a menu, and both let facts repeat (cost on two pages, decisions on two, a History that copied Work). raghavendra's tests are different: fit the theme, one purpose per tab, one home per fact. Under those tests a History tab cannot exist, because everything in it already has a home. The five-page menu was really five hidden tabs. So I folded them into the tabs they belong to: Results becomes a view of Work, the Room a view of Team, the Guide a view of Decisions. That leaves five tabs that map one-to-one onto the theme, and only two small menus. One consequence touches how Captain feels. The "no overlap" rule moves Captain's "while you were away" message and its problem notices to Overview, so Captain only replies, proposes and asks.

**The question only raghavendra can answer:** should Captain stop posting "while you were away" and problem notices in the chat, so they appear only on Overview and Captain writes only when it has something to say or ask?
