# Overview: the answer before the records

AK-167 · 17 October 2026 · Independent research and recommendation by jamesblack-codex

**Recommendation:** show the project's current state, anything that needs attention, what agents are doing, goal progress, and a short account of meaningful changes. Each item links to its owning tab. Keep one reading column. Do not add a miniature version of every tab.

This is a proposal for review, not a new product decision. Examples are invented. **Source** below means checked public guidance or product documentation; **Code** means inspected repository source; **Recommendation** means my judgement, still to be tested with people. No usability study or rendered layout measurement has been performed. I have not read the other agent's Overview proposal.

## 1. Research and the rules it leads to

Public sources were checked on 17 October 2026. Product documentation establishes patterns a product offers, not proof that its design works for AutoKolab. The source-backed observations and my applications are separated below.

### Reading, attention and trust

| Checked source | What it supports | Application to Overview — recommendation |
| --- | --- | --- |
| [Lyssna: five-second testing](https://www.lyssna.com/videos/five-second-testing/) | Brief exposure followed by recall questions tests first impressions and clarity. | Test whether people understand work, action and trouble after five seconds. This is a test method, not a universal human attention limit. Also retain the handoff's stricter three-second check. |
| [NN/g: inverted pyramids](https://www.nngroup.com/articles/inverted-pyramids-in-cyberspace/) | Put the conclusion before supporting detail. | Start with the answer, not a greeting, date, chart or count tile. |
| [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Defer less-used detail to a secondary view to reduce complexity. | Show short summaries and link directly into the owning tab. No accordion or extra overview detail page is necessary. |
| [Weiser and Brown: Designing Calm Technology](https://calmtech.com/papers/designing-calm-technology) | Information can remain available at the edge of attention and move into focus when needed. | Stable rows, quiet updates, no scrolling ticker or animated celebration. Looking should not create another chore. |
| [NN/g: reading patterns, including mobile](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) | People scan in several patterns; headings and meaningful opening words help. The F pattern is not an ideal layout to copy. | Put the work or consequence first. Use short labelled sections, one column and visible words for status on phones too. |
| [NN/g: empty states](https://www.nngroup.com/articles/empty-state-interface-design/) | Explain why content is absent and give a direct next step; loading must not masquerade as no records. | Hide truly empty optional sections. Keep a page-level explanation for new, calm, failed and unknown states. |
| [Datadog: reduce alert flapping](https://docs.datadoghq.com/monitors/guide/reduce-alert-flapping/) | Rapid changes between OK and alert create noise and fatigue. | Group one cause into one problem row. A slow task is not automatically a failure. Only a real request for a person gets amber. |

### Comparable products and monitoring boards

| Checked source | Pattern observed in documentation | Borrow / do not borrow — recommendation |
| --- | --- | --- |
| [Linear: projects](https://linear.app/docs/projects) and [project graph](https://linear.app/docs/project-graph) | Project context sits alongside milestones; the graph depends on collected issue activity and weekly velocity. | Borrow named outcomes and direct access to work. Do not promise an end date from a small, changing agent workload. |
| [GitHub: managing agent sessions](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents) | Sessions can be tracked centrally and opened for their underlying work. | Borrow a short activity row with a route to evidence. Do not put session logs in the glance. |
| [Cursor: Cloud Agents](https://cursor.com/docs/cloud-agent) | Background agents have a separate surface for running and inspecting work. | Make delegated work visible without requiring someone to watch a terminal. Do not make the person supervise every tool call. |
| [Vercel: managing deployments](https://vercel.com/docs/deployments/managing-deployments) | Deployment records can be filtered by branch, status and environment. | Preserve distinctions between work completed, merged and available to users. A merged change alone does not prove production delivery. |
| [Statuspage: components](https://support.atlassian.com/statuspage/docs/show-service-status-with-components/) and [overall status](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations) | Component states give incident scope; overall status summarises the components. | State what is affected and what continues. A single headline must not hide a second problem. |
| [Notion: task databases](https://www.notion.com/en-gb/help/guides/give-your-to-dos-a-home-with-task-databases) | Assigned tasks can be gathered from multiple databases into My Tasks. | Gather the viewer's actionable questions. Do not copy a general recent-pages or unread-content feed. |
| [Basecamp: Show Progress](https://basecamp.com/shapeup/3.4-chapter-13) | Task lists can grow as work is discovered; Hill Charts distinguish figuring something out from executing it. | Show what is being resolved and what remains. Task counts are not a percentage of effort or certainty. Do not invent a Hill Chart position from tickets. |
| [Basecamp: Lineup](https://5.basecamp-help.com/article/1164-lineup) | A timeline gives a view across projects and their dates. | Keep project context obvious. A portfolio timeline belongs to a separate future need, not every project's glance. |
| [TfL: status board presentation guide](https://content.tfl.gov.uk/tube-status-presentation-user-guide.pdf) | Named lines, consistent status language and limits on displayed delay instances make a board scannable. | Use repeatable rows, a visible time reference and bounded lists. Borrow the reading pattern, not transit colours or an arrival-time promise. |

**Signal versus noise and vanity metrics.** A useful fact changes what someone understands or does: “Checkout waits for your answer” qualifies; “18 messages today” does not. Basecamp's discussion explains why counting completed tasks can mislead about remaining work. My conclusion is to omit activity totals, agent rankings and decorative charts from Overview. This does not make all numbers bad: an overflow count tells someone what is hidden, and a labelled time helps them judge freshness.

**Limits of this research.** This is a source review, not a hands-on comparison of signed-in products. Older Cursor web/mobile and Notion Home URLs now redirect; the table uses current reachable documentation instead. An attempted Devin session-management URL did not resolve, so no Devin-specific claim informs the recommendation. Public patterns do not establish our ideal row limits or page height; those are testable design choices below.

### Eight concrete rules to apply

1. Answer “what is happening, do I need to act, is anything wrong?” before details; test recall in five seconds.
2. Put genuine requests and unresolved trouble before routine work. Keep both visible when they coexist.
3. Give each row one purpose, one plain summary and one direct route to the owning record.
4. Bound every list and name any omitted items with a meaningful link; never use endless activity scrolling.
5. Show recorded facts and their age. Unknown is not healthy, assigned is not running, and merged is not live.
6. Describe progress through outcomes and remaining work; do not equate task counts with time or value.
7. Keep normal operation calm. Hide empty optional sections; explain an empty or unavailable page and its next step.
8. Preserve meaning on phones and by keyboard: one reading order, text statuses, readable type and usable targets.

## 2. Who opens Overview, and why

| Person | Moment | What they need |
| --- | --- | --- |
| Owner or sponsor, often a non-coder | Returning after a few hours | Know whether the team continued and whether they owe an answer. |
| Product lead or collaborator | Just before a meeting | Explain current goals, meaningful changes and remaining work without reading tickets. |
| Developer or agent owner | A task seems slow or a computer disconnected | Distinguish active work, waiting, failure and missing information; reach the evidence. |
| Occasional member managing several projects | Checking in from a phone | Confirm the project, see anything consequential and leave without managing agents. |

Rank the three five-second questions:

1. **Do I need to do anything?** If yes, what decision and where?
2. **What is happening now?** What goal is moving, and who is doing the work?
3. **Is anything wrong or uncertain?** What is affected, and is recovery actually underway?

The headline answers all three briefly, with action or trouble first when present. “What changed while I was away?” is the next reading depth on the same page, not a fourth demand on five-second recall.

## 3. Exactly what Overview displays

**Recommendation, top to bottom:** state and freshness → requests → problems → current work → goals → meaningful changes. A new project replaces the empty work sections with one next setup step. This is the complete content list; no separate summary tiles, review queue or conversation feed.

| Block | The question it answers | Maximum rows, desktop / phone |
| --- | --- | --- |
| Where things stand | What is happening, and how current is this? | One sentence, freshness, optional next action |
| Needs you / Needs a teammate | Who must decide what? | 2 / 2 |
| Problems and holds | What is affected, and what is being done? | 2 / 2 |
| Working now | Who is doing which step, for how long? | 3 / 2 |
| Goals in motion | What has advanced, and what remains? | 2 / 2 |
| What changed | What finished or was decided? | 3 / 2 |
| Start here, only before work begins | What is the next setup step? | 1 / 1, replacing empty work blocks |

### Link and data conventions

Every link below names a destination contract: open that tab with the specified item visible and focused, preserving the way back. These are proposed interactions, not claims that all deep links exist today. Full records stay inline in their owner tabs under the tab-list brief; do not implement the wireframe's placeholder dialogs as extra destinations. Captain stays the project's opening page.

All rows use the records the viewer is allowed to see. A project-wide question is not automatically *your* question: show “Needs Raghavendra” for an owner-only decision when another member is viewing. Never expose another person's private Captain conversation. If a shared question lacks a shared destination, link to the visible ticket in Work and say who can answer; do not invent access to a message.

“Empty” below means successfully loaded and known to contain no qualifying items. Loading, denied access and failed reads are different states. Limits apply after permissions and duplicate removal. Overflow counts require a complete result set; otherwise say “See all…” without an invented count. Plain words accompany status dots; colour alone never carries meaning.

### 1 — Where things stand

- **Shows:** one state sentence, plus a quiet freshness label. Project name remains in the shell. Example: “Checkout and account access are moving; nothing needs you and no problems are reported.” Then “Checked just now.”
- **Optional next line:** only a distinct, recorded next action: “Next: Captain reviews receipt emails.” Do not repeat a question below or generate a promise on Captain's behalf.
- **Source:** loaded work states, open questions and plans, unresolved problems, project-scoped agent reports and read timestamps. Code builds the sentence; no new model-written briefing. Choose action/trouble first, otherwise work, otherwise calm/new.
- **Owner and link:** Overview owns the synthesis. Its facts link through the corresponding blocks below; the optional next action links to that item in Work or Captain. “Checked…” is a timestamp, not a dead link. A failed read offers **Retry** here.
- **Limit / hide:** always present, including loading and errors. Aim for one sentence of at most 32 words; freshness on its own line; at most one next-action line. Mention at most two goals, then “other work”. Hide the next line without a recorded next action.

### 2 — Needs you / Needs a teammate

- **Shows:** the actual short question, who must answer, the consequence of waiting and the age when known. Example: “Allow guest checkout? Receipt testing waits for your answer · asked 25 min ago.” Link: **Open in Captain**.
- **Source:** unresolved ticket questions, risky-change permission requests, pending plans and direct Captain questions. Deduplicate the same request across its ticket and conversation. Use the recorded wording; do not turn technical failures into product questions.
- **Owner and link:** Captain owns answering and approving; open the exact shared question or plan. A question for someone else shows **View question**, if accessible, and their name rather than an answer control.
- **Limit / hide:** two rows total on desktop and phone. Viewer-actionable blockers first, then other blockers, then nonblocking requests; oldest first within each group. An overflow link names the rest, for example **3 more questions in Captain**. Hide when no open questions are visible. No yes/no or merge controls on Overview.

### 3 — Problems and holds

- **Shows:** consequence, current recovery state and observed age. Example: “Receipt tests failed; Birch is retrying them · reported 8 min ago.” Without a recovery record: “Receipt tests failed; no recovery has been reported.” A deliberate pause says “Work is paused by its owner”, with neutral styling.
- **Source:** current failed checks, unresolved runner failures, confirmed pause/limit reports, and availability failures that affect assigned work. A past failure followed by a successful check on the same current change is resolved. A failure on an old version must not label the new version as failing.
- **Owner and link:** Work for work/check failures (**See receipt tests**); Team for connection, pause or agent-limit problems (**See Captain's connection**). A project policy hold links to Settings (**See release policy**). Do not reproduce the same cause in several rows. A product decision needed to resolve it belongs in block 2, with the consequence there.
- **Limit / hide:** two rows; stopped project coordination first, then stopped work, then a failure with recovery underway, oldest first within a class. Use compact overflow links to each affected owner, for example **2 more work problems · 1 more connection problem**, or **See policy holds** for Settings. Hide when no unresolved issue or material hold remains. Keep visible alongside block 2.

### 4 — Working now

- **Shows:** one row per active assignment: agent name, concrete current step, named work and labelled elapsed time. Example: “Birch — checking payment retries · Checkout · on this step 12 min.” If no step is reported: “Birch — working on payment retries · started 12 min ago.” If only observation time exists: “Birch — assigned payment retries · last update 12 min ago.” These mean different things.
- **Source:** project-scoped live runs when available, agent current-work reports, ticket titles/summaries and current steps with their own timestamps. The explicit step is preferred to a broad ticket summary. Include Captain's actual review or planning activity when reported, with that verb. Do not claim a general ticket update started a run.
- **Owner and link:** Work owns the assignment and steps. The work title opens the exact ticket, with **See work** as its accessible link name. Overflow opens Work filtered to current activity, not Team's roster.
- **Limit / hide:** three rows on desktop, two on phone; **4 more active assignments in Work** when needed. Use recorded work priority, then stable agent name and ticket order; do not reorder on every heartbeat. One agent may appear twice for separate concurrent assignments. Collapse duplicate run reports for the same assignment. Waiting/stopped work already explained above does not repeat here. Hide if there is no confirmed active work; an unverified last state is shown only as last-known data under block 1's warning.

### 5 — Goals in motion

- **Shows:** goal name, meaningful achieved part or present stage, and next unfinished part. Example: “Checkout — saved cards finished; payment retries are being tested. Next: receipt review.” If the goal is blocked above: “Checkout — waiting on the guest-checkout choice above.” Do not print the full question again.
- **Source:** goal records, their child work, current steps and explicit ordering/dependencies. Pick the recorded next unfinished part, not a guessed schedule. If no meaningful summary exists, use the honest fallback “Checkout — 4 of 7 listed tasks done; next step not recorded.” This is a task count, never “57% complete”.
- **Owner and link:** Work, opening the named goal and its children. Link: **See Checkout**; overflow: **3 more active goals in Work**.
- **Limit / hide:** two goals on both sizes. Blocked active goals first, then other active goals in recorded priority order. No whole backlog. Recently finished goals appear in block 6 instead; hide if there are no active goals. Work with no goal still appears in block 4. Do not invent a goal for it.

### 6 — What changed

- **Shows:** short outcome lines for completed work and newly settled decisions. Example: “Completed: saved-card checkout passed review and was merged.” Or “Decided: guests can check out without an account.” Each includes a quiet time and a direct link. Call something “available to users” only with release evidence; a research document can simply be “Completed”.
- **Source:** completion/merge events and corresponding summaries; current decisions with creation times. Do not turn raw Room messages or ordinary step changes into news. Reopened work is no longer presented as an unqualified completion. Use an explicit release record if one exists; absence is not a successful deployment.
- **Owner and link:** Work (**See completed work**, exact ticket) and Decisions (**Read decision**, exact decision). Overview owns only selection and the time-window label.
- **Limit / hide:** three rows desktop, two phone. Reserve one slot for a decision if both kinds exist; otherwise fill by newest event. Remaining items link separately, e.g. **4 more completed items in Work · 2 more decisions**. Default label **Today · your time zone**, since local midnight. If a reliable personal last-visit marker exists, prefer **Since your last visit · Fri 16:20–Sat 10:00**, capped at seven days and explicitly labelled when capped. Without that marker, use Today, never invent “since you left”. Hide when the known window has no qualifying changes.

### New-project replacement — Start here

- **Shows:** the single next unmet prerequisite: “Connect Captain so it can manage the work.” Once connected: “Tell Captain what you want to make. A sentence is enough.” Other members see who can complete a restricted step.
- **Source:** project setup and Captain selection/connection state, plus whether any goal/work has begun. It is not a completion-percentage checklist.
- **Owner and link:** Team (**Connect Captain**) or Captain (**Tell Captain your goal**), whichever is next. No setup terminal command on Overview.
- **Limit / hide:** one row below the state sentence. Replace empty blocks 4–6; retain genuine questions or failures above it. Hide once the project has begun. An established project that loses its Captain uses the problem state, not onboarding.

### What comes from every other tab

| Tab | Brief on Overview, or reason for none |
| --- | --- |
| Captain | Pending questions/plans/permissions in block 2; a recorded next action when useful. No chat excerpt, composer or duplicate approval control. |
| Work | Current assignments, meaningful goal progress, consequential failures and completed outcomes in blocks 3–6. It owns all work evidence and review detail. |
| Team | Availability only when it prevents work or explains a hold; the first connection step for new projects. No roster, location, model, machine inventory or ordinary idle-agent count. |
| Room | Nothing by default. Messages explain coordination in depth; message volume does not prove progress. A settled choice comes from Decisions, and a failure from its work record. |
| Decisions | New recorded choices in What changed, linked to reasons. Standing decisions are not a repeating feed. |
| Results | No routine totals, cost tile, charts or agent rankings. They need a time range and context. An actual reported limit stopping work belongs in Problems and holds, with Team as owner; it is not a spending estimate. |
| Settings | No routine policy summary or switches. Show only a verified policy hold that explains current work, linked to its setting. No invitation or notification-preference panel. |
| Guide, if present | No excerpt. Standing instructions do not answer what is happening now. If Guide stays within Decisions, the same omission applies; this proposal does not depend on that tab choice. |

**Deliberately absent:** total tickets, percent busy, messages/tool calls, token use, spend-to-date, graphs, calendars, agent leaderboards, a separate review queue, raw error logs and the complete activity history. They either need interpretation, repeat a row above or answer a different question. A real recorded deadline may appear in its affected goal or hold; no generated ETA. Overflow counts and specifically labelled task/time facts remain useful exceptions to omitting count tiles.

### Truth and freshness contract

These are proposed behaviour requirements, not claims about today's implementation:

- Only use “nothing needs you” after the questions and plans have loaded successfully. Only use “no problems reported” after the relevant work and availability reads have succeeded. It means no known report, not a guarantee of health.
- Track successful reads, not just the last *changed* value. A connected subscription without fresh confirmations does not establish freshness. Keep separate status for work, requests and agent availability so partial failure can say “Work checked now; questions unavailable.”
- As a starting threshold, after two minutes without a successful confirmation mark the affected data “May be out of date”; show its actual last-check time. A read error is labelled immediately. This threshold is a recommendation to test against the implemented refresh cadence, not a researched universal constant.
- Heartbeat age is separate from page freshness. The inspected agent-status helper uses five minutes to treat a computer as offline. Explain “not heard from for 6 min”; it does not prove a machine crashed. Do not reset that clock because the page reloaded.
- Unresolved failures remain listed while recovery runs. Display “retrying” only from a corresponding live step/run; “Captain is handling it” is not the default for any error.
- Assignment, run start, step start and last update each have their own labels. No elapsed timestamp means no invented duration. Long duration alone is not a coral failure.
- Summary text is bounded, but the question's deciding consequence must remain intact. Prefer a short authored summary; otherwise show the subject and **Read question in Captain**, never cut a yes/no question into a misleading fragment.

## 4. Test the existing wireframe, block by block

**Code/source review:** [overview.html](../overview-wireframe/overview.html) and its [README](../overview-wireframe/README.md), across busy, needed, calm, problem and new variants. This is not a claim to have visually tested the HTML in a running browser.

| Wireframe element | Verdict | Reason and proposed replacement |
| --- | --- | --- |
| Project header and local time | Change | Keep project identity; the wall clock is not proof of freshness. Show a real last-check label with the headline. |
| State headline | Keep, tighten | It answers before detail. Bound its length and qualify unknown data. A failure must not automatically imply someone is fixing it. |
| Next from Captain | Change | Keep only a recorded, distinct next action. Drop the repeated “after you answer” sentence and unverified first-person promises. |
| You are needed | Keep, extend | Small mark and a direct Captain link are right. Add consequence, recipient and age; cap at two and show overflow. |
| What happened | Change | Show unresolved problems independently of questions; add affected work and verified recovery, not repeated reassuring prose. |
| Who is doing what | Change | Keep concrete actions and neutral identities. Add accurately labelled duration and work links; show assignments, including concurrent ones, rather than a roster. Do not repeat waiting rows. |
| Goals: title, next step, task fraction | Change | Keep named goal and remaining work. Prefer an outcome/stage sentence; use a labelled task fraction only as fallback. No implication of time or effort percentage. |
| Finished goals in the calm variant | Drop from Goals | Move recent finishes into What changed; Work holds the complete history. Avoid repeating the same completion in two blocks. |
| Delivered today | Change | Become What changed, including newly recorded decisions and an explicit time window. “Ready to use” requires release evidence. |
| “Have another goal?” calm footer | Drop | Captain is already visible. A calm state is a successful outcome, not always a prompt for more work. |
| Two numbered Start here steps | Change | Show only the next unmet step with the correct owner tab. The second becomes useful after connection succeeds. |
| See all work / Show the record links | Keep intent, change destination | Open the exact owning record inline, not generic modal text. Overflow says how many and what kind. |
| Captain / Overview / Team / Project navigation | Drop this proposal | The ticket fixes eight tabs, possibly Guide. The wireframe README admits its reduced navigation needs a decision; use the supplied tab set. |
| Phone clone and hidden row-end labels | Change | Keep reading order. Remove decorative avatars before status words; preserve explicit Working/Waiting/Unknown meaning and labelled time. |
| State picker, explanatory side notes and example dialogs | Keep as research scaffolding only | Useful for comparing scenarios; none belongs on the product page. |

**What the inspected app already does:** [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx) caps requests/team/goals/delivery at 2/3/2/2, shows setup, and links requests into Captain. [glance.ts](../../../apps/site/src/workspace/glance.ts), especially `overviewGlance`, constructs the five state variants and delivery since browser-local midnight. The [coherence review](../coherence-review.md) describes an earlier count-tile version; that is not what the current component renders.

**Material gaps in the inspected code:** a question selects the `needed` state, while the problem section renders only for `problem`, so coexistence can hide trouble. The problem sentence asserts Captain is handling it without verifying recovery. `Overview` captures its clock on mount; its displayed state has no last-successful-check label. Agent rows can fall back to a single current ticket, and general ticket timestamps are not always run/step start times. The proposed catch-up window, concurrent activity, decision selection and ownership links therefore need later implementation work. This research changes none of that code.

**Decision precedence:** DEC-24, as supplied on the ticket and reflected in [00-AMENDMENTS](../../../autokolab-ux-handoff/00-AMENDMENTS.md), restores Overview and keeps Captain as chat. It wins over DEC-22's earlier removal of Overview. The ticket's tab list supersedes the wireframe's reduced navigation. [01-principles](../../../autokolab-ux-handoff/01-principles.md) still supplies calm styling, purposeful content and evidence on request. This proposal recommends changes to the amendment's detailed Overview recipe: one setup step, outcome-first goals and a bounded What changed section. These are review recommendations, not silently adopted amendments. The proposed personal catch-up window is optional until its data and semantics are agreed.

## 5. States

States can coexist. A primary headline chooses what matters most; it does not suppress other relevant blocks.

| State | What changes |
| --- | --- |
| Busy | Show active assignments, active goals and recent meaningful changes; explicitly say whether a person is needed. |
| A person is needed | Lead with the blocked outcome and recipient; questions appear before routine work, with other work and problems still visible. |
| Calm | Say “Nothing is running; nothing needs you” only with complete data; keep recent changes, hide empty sections, and distinguish queued work from all work finished. |
| Something went wrong | Lead with impact and recorded recovery state; keep the problem visible even if another item needs a person. |
| Brand-new project | Explain that nothing has begun and show the next connection or goal-setting step; no dummy rows or zero counters. |
| Captain offline | Say “Captain has not checked in for 6 min; new coordination may wait”; show Team's connection link and any workers still confirmed active. |
| Data stale/unknown | Replace confident present-tense claims with “Last known…” and last-check time; retain known rows, label missing sections and offer Retry. |
| Many projects | Keep this page scoped to the named project; use the existing switcher, and show only “working elsewhere” when necessary to explain availability—never another project's private task. |

If a new project has a failed connection, show that failure above the setup action. If Captain is offline but a question can still be answered, leave its accessible link available; do not promise that the answer will be acted on immediately. If there is queued work and no run, say so rather than “all done”.

## 6. Phone: same meaning, fewer rows

At 390 px, keep the same order: state/freshness, questions, problems, current work, goals, changes. Keep two questions, two problems, two active assignments, two goals and two changes. Omit empty sections. The new-project state still shows only its next step.

Cut avatars, redundant “Working” badges where the verb already says working, repeated action labels and secondary metadata before cutting meaning. Keep who is needed, the affected work, status words, time labels and every overflow link. Goal rows wrap beneath the name. The short summary and its link can occupy separate lines. No sideways content table, hover-only evidence, carousel or nested scrolling region.

Use the handoff's tokens, at least 12 px metadata, normally 15 px body text, visible keyboard focus and at least 44 px phone targets. Keep the agreed full tab set reachable; do not restore the wireframe's four-destination navigation. A question opens in Captain at the question, and Back returns to the same Overview position. Updates must not steal focus or repeatedly announce every elapsed minute to a screen reader.

## 7. Length and scroll budget

These are **design targets to test**, not measurements of the existing page. Width alone does not define a fold: use **1440 × 900** and **390 × 844** viewports, 100% zoom, normal text. Budget for shell/navigation as well as content. Keep a desktop reading column around 720 px; do not spread the content into three dashboard columns.

| Budget | 1440 × 900 desktop | 390 × 844 phone |
| --- | --- | --- |
| Shell allowance | About 80 px at the top | About 180 px total for header, navigation and browser/safe-area allowance; revise against the final shell |
| Ordinary busy page, no requests/problems | Target total height ≤900 px | Target total height ≤1,300 px, about 1.6 screens |
| Fully populated mixed state | Target total height ≤1,450 px, about 1.6 screens | Target total height ≤1,950 px, about 2.3 screens |
| Must be above the fold | State, freshness, requests and first problem when present; otherwise current work and first goal | State, freshness, first full question or problem and its link; otherwise at least two current assignments |
| Below the fold when needed | Remaining routine work, goals and changes | Remaining attention rows, then work, goals and changes |

Allocate roughly 160 px to the desktop title/state/freshness area, 48–64 px per routine desktop row and 80–112 px per phone row including wrapping/actions. Sections get about 24 px separation; there is no oversized hero space. With two questions and two problems, the headline names both categories even when the phone cannot fit every row above the fold.

Limits and overflow links bound length; there is no “load more” that keeps extending Overview. These are budgets, not CSS clipping heights. Long questions, larger text, translation and zoom may exceed them. Preserve meaning and reflow instead of shrinking type or hiding an urgent row to hit a pixel target. Never truncate the deciding consequence merely to meet the fold.

## 8. Busy desktop sketch

Illustrative project, three active assignments, two goals, two completions and one decision. No known problems or pending questions. Links open their owning tabs.

```text
+------------------+---------------------------------------------------------+
| Shop project   v | Overview                                                |
|                  | Checkout and account access are moving; nothing needs   |
| Captain          | you and no problems are reported.                       |
| Overview         | Checked just now                                        |
| Work             |                                                         |
| Team             | WORKING NOW                                             |
| Room             | Birch   Checking payment retries   On this step 12 min >|
| Decisions        | Fjord   Testing Google sign-in     On this step  8 min >|
| Results          | Tern    Writing receipt emails     Started      20 min >|
| Settings         |                                                         |
| Guide (if kept)  | GOALS IN MOTION                                         |
|                  | Checkout: saved cards finished; retries being tested.   |
|                  | Next: receipt review.                    See Checkout > |
|                  | Account access: sign-in being tested.                   |
|                  | Next: review the wording.          See Account access > |
|                  |                                                         |
|                  | WHAT CHANGED · TODAY · YOUR TIME ZONE                    |
|                  | Completed: saved-card checkout merged.  09:10   Work > |
|                  | Completed: account-access help reviewed.08:50   Work > |
|                  | Decided: guests need no account.        08:30 Decision >|
+------------------+---------------------------------------------------------+
```

Questions and problems insert above Working now. Their absence leaves no empty placeholders. The sketch is a content model, not a new visual style.

## 9. How to know it works

Run five short tasks with six people: three non-coders who direct projects and three developers/agent owners. Include returning and occasional members; use desktop and a real phone. Rotate scenarios so prior exposure does not teach the answer. These are proposed tests, not completed research; six people reveal problems, not a statistically reliable success rate.

| Test | Task | Proposed pass signal |
| --- | --- | --- |
| Five-second recall | Show busy or mixed state for five seconds, hide it, ask the three ranked questions without hints. | At least five of six correctly identify the main work, need to act and presence of trouble; any false “everything is fine” prompts revision. |
| Own the right action | Show a question for the viewer, an owner-only question and a separate failing task; ask what they would do. | Nobody treats retrying tests as their approval task or tries to answer another person's restricted question; their question is reached in one navigation. |
| Judge trust | Compare fresh, stale, Captain-offline and long-running-but-active states; ask which claims they can rely on. | At least five distinguish unknown from healthy and elapsed time from a stuck diagnosis; nobody equates merged with released without evidence. |
| Find proof and catch up | After a simulated absence spanning midnight, ask what changed and how they know. | At least five understand the stated time window, find a completion and a decision, and reach each owning record within two actions. |
| Phone, keyboard and scale | Use long names, six questions, ten assignments and multiple projects; ask for the first action and one omitted item. | All can use links without horizontal content scrolling or focus loss; at least five recognise overflow and the current project, and find the item in its owner tab. Check 200% text/zoom too. |

Record wrong answers, navigation attempts and wording people use. Do not optimise for time spent on Overview: a confident quick departure is success. Validate the height targets with representative content and both widths before implementing a final layout.

## 10. Open questions for Raghavendra

These are recommendations for the research review, not blockers or requests to change app code now.

| Choice | Recommendation |
| --- | --- |
| Should goals lead with a task fraction or a meaningful stage? | Lead with achieved/remaining work. Keep “4 of 7 listed tasks” as a fallback, never a percentage of effort. |
| Should the change window be Today or Since your last visit? | Start with Today and visible time zone; use Since your last visit only after an explicit personal visit marker and its multi-device meaning are agreed. Cap at seven days and label the cap. |
| Should Overview include normal spending or usage? | No. Keep comparison and costs in Results; surface only a reported hold affecting work. Revisit if people repeatedly cannot detect consequential spending through Results. |
| How much trouble belongs in the glance? | Show unresolved failures, even during recovery, with a two-row cap and explicit overflow. Do not alert merely because a task takes a long time. |
| What if several people can answer a request? | Say “Needs a project owner” or the named recipient; show “Needs you” only when this viewer can act. Captain owns the shared resolution. |
| Is a combined view across projects needed? | Keep this ticket's Overview project-scoped. Do not add portfolio charts or private cross-project task details; assess a portfolio need separately. |

## 11. Review scope and validation

Only this document is changed. Read the amendments before the principles and relevant Work, Team, Results and phone specs; treated the ticket's DEC-22/DEC-24 text as authoritative context. Read both tab-list v2 proposals, the coherence review, the wireframe, Overview and glance code. Did not read `overview-spec/claude.md` or change app behaviour, decisions or other documents.

The next implementation should verify data availability before promising personal catch-up, accurate run durations or concurrent assignments. Existing missing fields must produce honest fallback wording; this proposal does not authorise a migration or dependency change.

Validation in this worktree: `npm run typecheck` passed. `npm test` exited 1: helper tests reported 520 passed, 28 failed, 18 skipped and one unhandled error; all 377 site tests passed. Failures include `spawnSync git EPERM`, denied local port binding, and runner/mock output assertions. Database policy tests did not run because the workspace test command failed. No app files changed, so a website build or page screenshot check was not required. Local document links and whitespace were checked.

Handoff limitation: Git could not create the worktree's index lock because its metadata is read-only. The completed document remains uncommitted for the ticket runner to commit, push and open a PR against `main`. No PR or green GitHub checks are claimed here. AutoKolab ticket tools were unavailable, so the final ticket-update block supplies the runner handoff.
