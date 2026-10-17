# What Overview should display

17 October 2026 · Research for AK-168 · yvssaratchandra-claude · A proposal, not a decision

✅ = a fact I checked (a source I opened, or the code in this repo). 💭 = my opinion or judgement.

## The short version

💭 Overview answers three questions, in this order, in one sentence at the top: **Do I need to do anything? Is anything wrong? Is the work moving?** Under the sentence come at most six short blocks, each hidden when empty:

1. **Needs you**: the questions waiting for you, who is waiting, and for how long.
2. **Something's wrong**: failures and stuck work, and who is fixing them.
3. **Working now**: one line per busy agent, with what it is doing right now and for how long.
4. **Goals**: how far each goal has got, and what comes next.
5. **Since you last looked**: what shipped, what was decided, what went wrong and was fixed.
6. **Start here**: setup steps, only while setup is unfinished.

Everything else (counts, charts, cost, models, machines, the agents' conversation, settings, the guide) stays on its own tab. In a normal day the whole page fits on one laptop screen without scrolling, and the first phone screen answers all three questions.

The biggest changes from the wireframe: the "Next from Captain" line goes (it repeated the rows under it), "Delivered today" becomes "Since you last looked" (it now includes decisions and fixed problems), each working agent says what it is doing *right now* and for how long, and "you're needed" and "something's wrong" can show at the same time.

## 1. Research: what makes a good "at a glance" page

I could reach the web. Every source below was opened and checked on 17 October 2026 (✅). Quotes are short and exact; what I take from each for Overview is my judgement (💭).

### Principles

| Idea | What the source says ✅ | What it means for Overview 💭 |
|---|---|---|
| **The 5-second test** | People see a design for five seconds, then answer what they remember and understood. [Lyssna, five second testing guide](https://www.lyssna.com/guides/five-second-testing-guide/). The handoff already has a stricter "three-second test" (`01-principles.md`). | The page passes only if the top answers the three questions before anyone scrolls or reads a list. |
| **Inverted pyramid** (answer first) | "Start content with the most important piece of information so readers can get the main point, regardless of how much they read." [NN/g, Inverted pyramid](https://www.nngroup.com/articles/inverted-pyramid/) | The state sentence comes first and carries the answer. Everything under it is supporting detail. |
| **What a dashboard is** | Information "arranged on a single screen so the information can be monitored at a glance"; a dashboard "quickly tells you what's happening, but not why." [Stephen Few, Dashboard Confusion (PDF)](https://www.perceptualedge.com/articles/ie/dashboard_confusion.pdf). Dashboards should be consumed "with a minimum of interaction or cognitive processing." [NN/g, Dashboards](https://www.nngroup.com/articles/dashboards-preattentive/) | One screen on a laptop. Overview says *what*; the "why" is one tap away on the owning tab. |
| **Signal vs. noise** | Executive dashboards: every element should be "grounded in a question, and clearly connected to a business outcome." [Datadog, executive dashboards](https://www.datadoghq.com/blog/datadog-executive-dashboards/) | This is our purpose rule (P3). Each block must answer one of the three questions or it goes. |
| **Progressive disclosure** | "Initially, show users only a few of the most important options. Offer a larger set of specialized options upon request." [NN/g, Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Top 2 to 5 rows per block, then "and N more →" to the owning tab. Matches the handoff's three depths. |
| **Calm technology** | "Technology should require the smallest possible amount of attention"; it "can communicate, but doesn't need to speak." [calmtech.com](https://calmtech.com/). Calm technology moves "back and forth" between the centre and the edge of attention. [Weiser & Brown, Designing Calm Technology](https://calmtech.com/papers/designing-calm-technology) | When all is well the page is quiet: grey text, one small blue dot per live agent. Colour and position get loud only when a person is needed or something broke. |
| **Avoid vanity metrics** | "The only metrics that entrepreneurs should invest energy in collecting are those that help them make decisions." [Eric Ries, Vanity vs. actionable metrics](https://tim.blog/2009/05/19/vanity-metrics-vs-actionable-metrics/). A hit count "counts a technical process, not a number of human beings." [Ries, Why vanity metrics are dangerous](http://www.startuplessonslearned.com/2009/12/why-vanity-metrics-are-dangerous.html) | No "42 tasks done", no token counts, no tiles. A number appears only next to a decision it helps (for example "waiting 2 h"). |
| **Progress is not a task count** | "To-do lists actually grow as the team makes progress"; work has an "uphill phase of figuring out" and a "downhill phase of execution." [Shape Up, Show Progress](https://basecamp.com/shapeup/3.4-chapter-13), [Basecamp Hill Charts](https://basecamp.com/hill-charts) | "4 of 7 done" alone can mislead when Captain adds tasks along the way. Pair it with a stage word (planned, building, in review). |
| **Zero-state design** | Empty states can "communicate system status," "help users discover unused features," and "provide direct pathways for getting started." [NN/g, Empty states](https://www.nngroup.com/articles/empty-state-interface-design/) | A new project shows the next setup step, not empty blocks. A calm project says so in words and offers "Tell Captain →". |
| **Alert fatigue** | "Every page should be actionable"; spend "much more effort on catching symptoms than causes." [Google SRE book, ch. 6](https://sre.google/sre-book/monitoring-distributed-systems/). In one ICU study, 63.8% of alarms were false. [Cho et al., 2016](https://synapse.koreamed.org/articles/1075821). [PagerDuty on alert fatigue](https://www.pagerduty.com/resources/digital-operations/learn/alert-fatigue/) | Amber only when a person must act; coral only for a real problem people can see the effect of (failing tests, stopped work), not for every hiccup Captain already absorbed. |
| **How people read screens** | People "rarely read Web pages word by word; instead, they scan." [NN/g, How users read](https://www.nngroup.com/articles/how-users-read-on-the-web/). They read across the top, then a shorter line, then scan down the left side, also on mobile. [NN/g, F-shaped pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) | The first line holds the answer; every row starts with its most important word (an agent's name, a goal's name, "Decided:"), on the left. |
| **Reading on phones** | Short, simple text reads as well on a phone as on a desktop, but people "slow down when reading difficult text on mobile." [NN/g, Reading content on mobile](https://www.nngroup.com/articles/mobile-content/) | Same plain sentences on the phone; fewer rows, not shorter words. |
| **Glanceable displays** | Peripheral displays "improve our ability to multitask." [Matthews, Glanceable peripheral displays (thesis)](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2007/EECS-2007-56.html) | Overview is checked between other things. It must make sense with no memory of the last visit, which is why it says "since you last looked". |

### What real products do

| Product | What its glance shows ✅ | Lesson for Overview 💭 |
|---|---|---|
| **Atlassian Statuspage** | A top-level status: "the overall condition your product/service is in", then components, then incidents. [Top-level status](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations/), [Components](https://support.atlassian.com/statuspage/docs/what-is-a-component/), [Incidents](https://support.atlassian.com/statuspage/docs/what-is-an-incident/) | One overall answer first, then the parts, then what went wrong. Our order is the same. |
| **London Underground status boards** | Most commuters "preferred the placement of disrupted lines together at the top." People understood there was a good service "on any part of the line not specified by a disruption notification." [TfL / London TravelWatch redesign (PDF)](https://londontravelwatch.org.uk/wp-content/uploads/2021/02/Presentation_on_Electronic_Service_Update_Boards.pdf). The 2019 boards used a "simplified design and larger fonts." [IanVisits](https://www.ianvisits.co.uk/blog/2019/09/19/london-underground-tests-new-design-information-boards) | Problems go to the top. What is fine does not need a row each: silence means fine. |
| **Airport departure boards** | Displays should be "easily read, and provide sufficiently complete and current information." [Van Dyke, FIDS (1978)](https://trid.trb.org/View/78937) | "Current" matters: say when the page is out of date. |
| **Devin** | Sessions grouped "Working / Ready / Blocked / Inactive", so ones that "need your input are listed separately"; hovering shows status, "the last few lines of Devin's latest response (updating live while Devin is working)" and its pull requests. [Devin release notes 2026](https://docs.devin.ai/release-notes/2026) | Split "needs you" from "working". Show what an agent is doing right now, live. |
| **Claude Code on the web, Cursor, Codex** | Session lists with a status and a "+42 -18" change size ([Claude Code](https://code.claude.com/docs/en/claude-code-on-the-web)); an agents dashboard, also on phones ([Cursor](https://cursor.com/docs/cloud-agent)); task status and the diff ([Codex](https://learn.chatgpt.com/docs/cloud)) | These are built for one developer watching their own agents. Line counts and diffs mean nothing to a non-coder, so Overview leaves them on the work itself. |
| **GitHub** | The home dashboard shows agent sessions (running and past) and recent pull requests and issues ([Personal dashboard](https://docs.github.com/en/account-and-profile/reference/personal-dashboard)); the inbox filters by "assigned", "review requested", "@mentioned" ([Inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox)) | "What waits on me" is its own list, apart from "what is running". |
| **Linear** | Inbox for updates on your issues ([Inbox](https://linear.app/docs/inbox)); Pulse for project updates ([Pulse](https://linear.app/docs/pulse)); each project update has one health label: "On track, At risk, or Off track" ([Project updates](https://linear.app/docs/initiative-and-project-updates)) | A goal deserves one plain stage word, not a chart. |
| **Vercel** | The project overview shows "the latest production deployment, including the generated URL and commit details." [Vercel deployments](https://vercel.com/docs/deployments) | The latest *outcome* is what people want first, not the queue. |
| **Datadog / Google SRE** | Four golden signals: "latency, traffic, errors, and saturation." [SRE book, ch. 6](https://sre.google/sre-book/monitoring-distributed-systems/) | Our plain versions: is it moving (traffic), is anything failing (errors), is anyone stuck or out of capacity (saturation: limits, offline agents). Speed belongs in Results. |
| **Slack Activity, Notion Home** | Slack: "a single, consistent place to stay informed, manage your messages, and take action." [Slack Activity](https://slack.com/help/articles/46751260742035-Introducing-the-new-Activity-view-in-Slack). Notion Home: upcoming events, recents, favourites, agents, teamspaces. [Notion Home](https://www.notion.com/help/home-and-my-tasks) | Home pages that collect *everything* become feeds. Overview must stay an answer, not an inbox. |
| **Basecamp Lineup** | "Every project plotted on a timeline based on start and end dates." [Basecamp features](https://basecamp.com/features) | Useful across many projects with dates. We have no honest end dates, so not now. |

### The rules I apply (8)

1. **Answer first.** One sentence at the top says, in this order: do you need to act, is anything wrong, is work moving.
2. **Trouble on top, fine stays quiet.** Needs-you and problems sit right under the sentence. Work that is fine gets one short row; nothing that is fine gets a warning colour.
3. **Only numbers that help a decision.** No tiles, totals or charts. A number appears only beside something you might act on ("waiting 2 h", "4 of 7 done" with a stage word).
4. **One row, one plain sentence, one link.** Each row names its subject first and links to the tab that owns the full record. No ticket keys.
5. **Show a few, link to the rest.** Each block shows 2 to 5 rows, then "and N more →". It never scrolls inside itself.
6. **Empty means hidden.** A block with nothing to say disappears. A new or calm project gets one plain line and the next step.
7. **Say what is live, and when it isn't.** Working agents show what they are doing right now and for how long. When the data is old, the page says so and stops claiming "nothing needs you".
8. **One laptop screen, one phone thumb.** In a normal day the page fits a 1440 × 900 screen, and the first phone screen answers the three questions.

## 2. Who looks at Overview, and why

✅ The app already records when each person last caught up (`lastCaughtUp` / `markCaughtUp` in `useCaptainRoom.ts`), so "since you last looked" can be per person.

💭 Ranked by how often they will open the page and how much it matters to them:

| Rank | Who | When they open it | What they want to know first |
|---|---|---|---|
| 1 | **The owner, coming back** after hours away (morning, after a meeting, after lunch) | First thing on return, often on the phone | Do I need to do anything? What happened while I was away? |
| 2 | **The worried owner or member**, mid-task elsewhere | When it has been quiet too long, or after a notification | Is anything stuck or broken? Is anyone actually working? |
| 3 | **The non-coder stakeholder** (a manager, a client, a co-founder) | Before a meeting or a status update | How far along is the goal? What has shipped? |
| 4 | **The developer with an agent on the team** | When their agent has gone quiet | Is my agent working? If not, why, and is it mine to fix? |

**The three questions, ranked.** Everyone above asks them, in this order:

1. **Do I need to do anything?** A person who is needed is the most expensive thing in the system: work waits until they answer.
2. **Is anything wrong?** Failures must never be hidden (handoff principle P2).
3. **Is the work moving, and on what?** The reassurance question: who is doing what, and is it getting somewhere.

Then, with a few more seconds: *what changed since I last looked*, and *how far along is each goal*.

## 3. The proposal: what Overview displays

One reading column, top to bottom. Every block is hidden when it has nothing to say. No block ever shows a zero, an empty list, or "None".

### The blocks, in order

| # | Block | What it shows (sample text) | Comes from | Full version lives on | Limit | Hidden when |
|---|---|---|---|---|---|---|
| 0 | **Freshness line** (under the title) | "Not updated since 9:41. Reconnecting…" | The live connection and the time of the last load | (Overview owns it) | One line | The data is live and less than 2 minutes old |
| 1 | **The state sentence** | "Checkout and Account access are moving. 3 agents are working. Nothing needs you." | Built by code from tickets, agents and open questions (`overviewGlance`) | Overview owns it | One or two sentences, at most about 25 words | Never |
| 2 | **Needs you** (small amber dot) | "Should guests be able to save cards? · Birch is waiting · 2 h" with **Answer in Captain →** | Open questions: ticket questions, risky merges waiting for OK, plans waiting for OK, Captain's own questions | **Captain**: opens that exact message (`/p/<project>#need-<key>`) | Top 3, oldest first, then "and 2 more in Captain →" | Nothing waits on a person |
| 3 | **Something's wrong** (small coral dot) | "Payment retry tests are failing. Birch is fixing it." with **Show the record →** · "Tern's computer has been offline 3 h with 2 tasks waiting. Only jamesblack can restart it." with **See Team →** | Failing tests, work sent back twice or more, an agent offline or at its limit with work waiting, a merge that was refused, a run that failed (`watch()` and runner problems) | **Work** (the piece of work and its proof), or **Team** for an agent that can't work | Top 2, most serious first, then "and 1 more →" | Nothing is going wrong |
| 4 | **Working now** | "Birch · fixing payment retries · running the tests · 4 min" | Each busy agent's current task, plus its live activity label and when that started (AK-129, not built yet; until then, how long it has been on this task) | **Work**, filtered to work in progress; each row opens its piece of work | Up to 5 agents (waiting on you first, then stopped, then the longest-running), then "and 3 more working → Work". One quiet line after: "Free now: Fjord, Wren." | No agent is busy, waiting or stopped. The "Free now" line is hidden when nobody is free |
| 5 | **Goals** | "Checkout · building · 4 of 7 done · next: a full test purchase" | Goals (epics) and their tasks | **Work**, grouped by goal; each row opens that goal | Up to 3 open goals with activity, the one waiting on you first, then "and 2 more goals → Work" | No goal is open. Finished goals move to block 6 |
| 6 | **Since you last looked** (with the time: "Since yesterday 6:10 pm") | "✓ Saved cards now appear at checkout." · "Decided: guests can't save cards." · "Fixed: payment tests failed and Birch corrected them." | Tickets finished, decisions recorded, problems that came up and were fixed, goals finished, since this person last looked (fallback: since midnight) | **Work** for delivered work and fixes; **Decisions** for decisions. Each line opens its record | Top 4, shipped first, then decided, then fixed, then "and 6 more" (shows the rest on this page, since Overview owns this list; the scroll budget counts the page before it is opened) | Nothing changed; then one quiet line instead: "Quiet since 6:10 pm." |
| 7 | **Start here** | "1 ✓ Connect an agent · 2 Choose Captain · 3 Tell Captain your first goal" | What the project still lacks: an agent, a Captain, a first goal | **Team** (connect, choose Captain), **Captain** (first goal) | All undone steps, done ones ticked | Every step is done |
| 8 | **Calm footer** | "Want something else built? **Tell Captain →**" | – | **Captain** | One line | Anything is moving, or anything needs you |

**How the state sentence is built** (💭, extending today's `overviewGlance`). It always answers the three questions, in that order, and says the most urgent thing first:

| Situation | Sample sentence |
|---|---|
| A person is needed | "Checkout is waiting on 2 answers from you. Account access work continues." |
| Something is wrong | "Payment tests are failing. Birch is fixing it; nothing needs you." |
| Both | "Checkout is waiting on your answer, and payment tests are failing. Captain is handling the failure." |
| Busy | "Checkout and Account access are moving. 3 agents are working. Nothing needs you." |
| Calm | "All current work is done. Nothing needs you." |
| Paused by the owner | "Everyone is paused (raghavendra, 9:02). Nothing new will start until it's turned back on." |
| Captain offline | "Captain has been offline for 40 min, so your messages and finished work wait. 2 agents are still working." |

Rules for the sentence: no ticket keys, no counts of things that are zero, no "you do not need to act" unless that is true for *everyone looking* (an offline computer needs its owner).

### What Overview shows from each other tab

| Tab | What Overview shows from it | Why |
|---|---|---|
| **Captain** | Only the open questions (block 2), each opening its own message. Captain being offline changes the state sentence. | Being needed is the first question. The conversation itself is for talking, not looking (DEC-24), and repeating Captain's messages would make two places to answer. |
| **Work** | The busiest part of the page: problems with work (block 3), who is working on what (block 4), goal progress (block 5), and what shipped or was fixed (block 6). Every row opens the piece of work it names. | "Is it moving, and is anything wrong?" is answered by the work. Work holds every task; Overview shows only what is live, broken or new. |
| **Team** | Only agents that **can't work while they have work** (offline, at their limit, paused) as problem rows, and one quiet "Free now" line. | An agent that can't work is a reason work stopped. Members, invitations, models, machines and limits change rarely and answer none of the three questions. |
| **Room** | **Nothing.** | The agents' back-and-forth is process, not outcome. What they agree turns into work, decisions or questions, which Overview already shows. Raw messages on a glance page are noise. The Room is one tab away for anyone curious. |
| **Decisions** | Only **new** decisions since you last looked, as one line each in block 6, opening the decision. | A new decision can change what gets built; people should not have to hunt for it. Old decisions are reference material. |
| **Results** | **Nothing.** | Results answers "how are we doing over weeks?", a question for reflection, not for a glance. Totals and trends on a glance page tempt people to read vanity numbers ("42 tasks done!") as progress. Cost shows up only when it stops work (an agent at its daily limit, block 3). |
| **Settings** | **Nothing**, except that "Pause everyone" being on changes the state sentence. | Settings change rarely and don't describe what is happening. |
| **Guide** | **Nothing.** | The rules agents follow are reference, not news. |

### What I deliberately leave out

| Left out | Why |
|---|---|
| **Count tiles** ("3 working · 0 free · 1 stopped") | They make you add up numbers to reach an answer the sentence already gives. Zero tiles are pure noise. |
| **Charts and burn-downs** | A chart needs reading and comparing; a glance needs an answer. Trends belong in Results. |
| **Cost and token use** | Not one of the three questions, and alarming without context. Shown only when a limit stops work. |
| **Raw Room messages, an activity feed or event log** | High volume, low meaning. Block 6 is the edited version: only outcomes. |
| **Models, machines, versions** | Developer detail; on Team. |
| **Ticket keys, branches, PR numbers** | Mean nothing to a non-coder; one tap away on the work itself. |
| **"Next from Captain"** | It repeated the rows below it ("I'll move Checkout forward as soon as you answer" restates the waiting question). Where it carried something new, it now sits in that row ("Birch is fixing it"). |
| **Free/idle agents as full rows** | An idle agent is not news. One quiet line names them so an owner knows more work could start. |
| **An "Updated just now" stamp when the data is live** | It answers nothing when true. It only appears when the data is old. |
| **Estimates and due dates** | We have no honest way to predict them. |
| **A separate "in review" list** (the amendments put it under "today") | Review is part of the work moving. When Captain is reviewing, Captain has its own row in Working now ("Captain · reviewing the receipt change · 3 min"). Work that has waited too long for review becomes a problem row. |

## 4. The existing wireframe, block by block

The wireframe is `docs/research/overview-wireframe/overview.html` (AK-156/158).

| Wireframe block | Verdict | Why |
|---|---|---|
| Navigation: Captain · Overview · Team, plus a "Project" menu (and Captain · Overview · Team · Project on the phone) | **Drop** | Replaced by the nine-tab list with no menus (AK-165, AK-166). Not Overview's to decide. |
| Top bar: "Northstar Shop · Updated just now" | **Change** | Show freshness only when the data is old or the connection is lost. The project name is already in the side bar. |
| Page title "Overview" | **Keep** | It tells you where you are. |
| State headline (26 px, one or two sentences) | **Keep, change the rules** | It is the right first thing. It should always cover all three questions and allow "needed" and "wrong" together. |
| "Next from Captain" line | **Drop** | It repeats the rows under it, and it puts words in Captain's mouth on a page meant for looking. The useful part moves into the problem row. |
| "You are needed" rows | **Keep, change** | Add who is waiting and how long ("Birch is waiting · 2 h"), so the cost of waiting is visible. Rename the link "Answer in Captain →". Show up to 3, not 2. |
| "What happened" (problem) | **Keep, change** | Rename "Something's wrong". Show up to 2 problems, not 1, and show them even when someone is also needed. When the fix is a person's (an offline computer), say whose. |
| "Who is doing what" | **Keep, change** | Rename "Working now". Add the live activity and how long ("running the tests · 4 min", AK-129): "Working" for 40 minutes tells you nothing. Drop the word "Working" next to the blue dot (it repeats the dot); keep words only for "Waiting on you" and "Stopped". Show up to 5. Add the quiet "Free now" line. |
| "Goals" (name, next step, "4 of 7 tasks done") | **Keep, change** | Add the stage word (planned, building, in review) next to the count, because task counts grow as work is discovered and "4 of 7" alone can mislead. Finished goals move to "Since you last looked". Up to 3. |
| "Delivered today" | **Change** | Becomes "Since you last looked": shipped work plus new decisions and fixed problems, counted from this person's last visit, not from midnight. Someone back from a weekend needs more than today. |
| Calm note "Have another goal? Tell Captain when you're ready." | **Keep** | It is the one useful thing to say when all is quiet. |
| "Start here" (two setup steps) | **Keep, change** | Steps follow what is really missing (an agent, a Captain, a first goal) and tick when done. Shown only while something is undone, at the top. |
| Annotation "Empty blocks disappear rather than showing zero" | **Keep** | It is the purpose rule. |
| "Updated just now" when fresh | **Drop** | See above. |

## 5. The states

| State | What changes (one line) |
|---|---|
| **Busy** | Sentence names the moving goals and how many agents work; Working now, Goals and Since you last looked show; Needs you and Something's wrong are hidden. |
| **A person is needed** | Sentence leads with what waits on you; Needs you appears directly under it with who is waiting and for how long; everything else stays. |
| **Calm** | Sentence says all work is done and nothing needs you; only Goals (if any are open), Since you last looked, and the "Tell Captain →" footer show. |
| **Something went wrong** | Sentence leads with the failure and who is handling it; Something's wrong appears under Needs you (if any); the affected agent's row says "Stopped". |
| **Brand-new project** | Sentence says nothing has started; only Start here shows, with the next undone step first. |
| **Captain offline** | Sentence says Captain is offline, for how long, and what waits because of it; a problem row names whose computer Captain runs on and links to Team. |
| **Data stale or unknown** | The freshness line appears ("Not updated since 9:41. Reconnecting…"); the sentence starts "At 9:41:" and never claims "nothing needs you" from old data; blocks whose data hasn't loaded are left out, not shown empty. |
| **Many projects** | Overview stays about one project; the project switcher puts a small amber dot beside any other project that needs you. |

## 6. Phone (390 px)

✅ Today's wireframe keeps the same reading order on the phone. I agree.

| Order | Block | On the phone |
|---|---|---|
| 1 | Freshness line | Same, only when stale. |
| 2 | State sentence | Same, 21 px. |
| 3 | Needs you | Same, up to 3. The whole row is the tap target (44 px or more). |
| 4 | Something's wrong | Same, up to 2. |
| 5 | Working now | Up to 3 agents, then "and 2 more →". Each row wraps to two lines at most: name and task, then activity and time. The "Free now" line is cut. |
| 6 | Goals | Up to 2. Name, stage and "4 of 7 done"; the "next:" line is cut. |
| 7 | Since you last looked | Up to 3 lines. |
| 8 | Start here, calm footer | Same. |

Cut on the phone: the "Free now" line and the goal's next step. Nothing moves; the order never changes, so a person who learned the desktop page knows the phone page.

## 7. Length and scroll budget

💭 Row heights assume today's tokens: about 48 px for a one-line row on desktop and 64 px for a two-line row on the phone.

| | Desktop 1440 × 900 | Phone 390 × 844 |
|---|---|---|
| Visible page height | About 830 px (900 minus the top bar) | About 670 px (844 minus the system bar, top bar and tab bar) |
| Normal day (busy: 3 agents, 2 goals, 3 updates) | **Fits on one screen.** No scrolling. | **About 1.5 screens.** |
| Worst case (every block at its limit) | **At most 1.5 screens** (about 1,250 px) | **At most 2 screens** (about 1,350 px) |
| Above the fold, always | State sentence, Needs you, Something's wrong, Working now | State sentence, Needs you, Something's wrong |
| May fall below the fold | Since you last looked, in the worst case | Working now (in part), Goals, Since you last looked |

If a block would push the page past its budget, it shows fewer rows and a "more" link; it never scrolls inside itself.

## 8. Sketch: desktop, busy state

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ AutoKolab  │                                                              │
│ Northstar  │   Overview                                                   │
│            │                                                              │
│  Captain   │   Checkout and Account access are moving. 3 agents are       │
│ ▸Overview  │   working. Nothing needs you.                                │
│  Work      │                                                              │
│  Team      │   WORKING NOW                                                │
│  Room      │   [B] Birch · fixing payment retries                         │
│  Decisions │       ● running the tests · 4 min                         →  │
│  Guide     │   [F] Fjord · checking Google sign-in                        │
│  Results   │       ● editing the sign-in page · 12 min                 →  │
│  Settings  │   [T] Tern · finishing receipt emails                        │
│            │       ● waiting for the checks · 2 min                    →  │
│            │   Free now: Wren                                             │
│            │                                                              │
│            │   GOALS                                                      │
│            │   Checkout        building · 4 of 7 done                     │
│            │     next: try a full test purchase                        →  │
│            │   Account access  building · 2 of 4 done                     │
│            │     next: check the sign-in wording                       →  │
│            │                                                              │
│            │   SINCE YESTERDAY 6:10 PM                                    │
│            │   ✓ Saved cards now appear at checkout.                   →  │
│            │   ✓ Decided: guests can't save cards.                     →  │
│            │   ✓ Fixed: receipt emails had the wrong date.             →  │
│            │                                                              │
└────────────┴──────────────────────────────────────────────────────────────┘
  ● = small blue dot (live). Amber and coral dots appear only in the
  "Needs you" and "Something's wrong" blocks, which are hidden here.
```

## 9. How to know it works

💭 Five quick tests with 5 real people each (at least 2 non-coders), on a laptop and on a phone, using a sample project in each state. Each takes under a minute.

| # | Test | How | Passes when |
|---|---|---|---|
| 1 | **"What is happening?"** (5-second test) | Show the busy page for 5 seconds, hide it, ask. | 4 of 5 name at least one moving goal and say agents are working. |
| 2 | **"Do you need to do anything?"** | Show the needed page for 5 seconds. Ask, then ask "what?". | 5 of 5 say yes; 4 of 5 can say roughly what the question is about. |
| 3 | **"Is anything wrong?"** | Show the problem page and the busy page, 5 seconds each, in random order. | 5 of 5 tell them apart; 4 of 5 say who is fixing the problem. |
| 4 | **"What happened since yesterday?"** | Give the phone. "You were away overnight. What changed?" | 4 of 5 answer from the first screen or one scroll, without opening another tab. |
| 5 | **"Show me the proof"** | "Something shipped. Show me that it works." | 4 of 5 reach the work's proof in 2 taps or fewer. |

Also watch for: anyone reading a number as good news when it isn't, anyone scrolling to look for something that isn't there, and anyone trusting the page while the freshness line says it is stale.

## 10. Open questions for raghavendra

| # | Question | My recommendation |
|---|---|---|
| 1 | The amendments list "Next from me" under the state sentence, and "what's in review" under today. May Overview drop both? | **Drop both.** "Next from me" repeats the rows under it; what's useful in it moves into those rows. Review shows as Captain's row in Working now, and a long wait for review as a problem. |
| 2 | Should the "what changed" block count from **your last visit** or **from midnight**? | **Your last visit**, falling back to midnight on a first visit. The app already records when each person last caught up. Someone back from a weekend needs the weekend. |
| 3 | Should "Since you last looked" include **new decisions**, not only shipped work? | **Yes.** A decision can change what gets built, and it is one line. |
| 4 | Should Overview ever show **cost**? | **Only when it stops work** (an agent hit its daily limit). Everything else stays on Results. |
| 5 | With several projects, do you want **one Overview across all projects**? | **Not now.** An amber dot beside a project in the switcher is enough until people run many projects at once. |
| 6 | Should a goal show **task counts** ("4 of 7 done") or **stage words** ("building")? | **Both.** The stage says where it really is; the count gives a sense of size. No percentage. |
| 7 | When someone is needed, should Overview let them **answer right there**? | **No.** DEC-24 says nothing is typed on Overview. Answers stay in Captain, so there is one place to answer and it is in the conversation's record. Overview links straight to the message. |
