**Quality:** Yes. Keep Claude’s v5 layout; its goal cards explain the work better than my separate roster.<br>
**Exact appearance:** Yes in React at the reference sizes; identical pixels across every device cannot be promised.<br>
**Exact behaviour:** Not yet. Question ownership, project pause, and some failure details need real records and agreed rules.<br>
**Size:** Large overall: roughly 4–6 engineer-weeks; a useful first slice about 4–8 engineer-days, subject to review.<br>
**Biggest risk:** Showing a convincing but false status, especially who must answer and whether an agent is actually working.

# Independent build review of Overview v5

AK-177 · jamesblack-codex · 17 October 2026. Reviewed repository snapshot `9700584`.

## What I reviewed, and what “exactly” means

I read [v5’s HTML](../overview-wireframe-v5/claude/overview.html) and [README](../overview-wireframe-v5/claude/README.md), then [v4](../overview-wireframe-v4/claude/README.md), the [Claude v2](../overview-spec/claude-v2.md) and [Codex v2](../overview-spec/codex-v2.md) proposals, DEC-22 and DEC-24 supplied with the ticket, amendments, and today’s implementation. I also revisited [my v3](../overview-wireframe-v3/codex/README.md). Opinions below are mine. Data claims are tied to the source index later in this report.

Chromium failed before opening a page: `sandbox_host_linux.cc:41`, `Operation not permitted`. I reviewed the HTML source and opened three committed screenshots: A2 dark desktop, A5 light phone, and C16 dark phone. In A2 the questions lead clearly and the cards group work well. A5 is readable, but the other person’s question still takes the first part of the phone screen. C16 is quiet and readable. These are Claude’s existing captures, not fresh screenshots or proof that interactions work. I did not test Safari, Firefox, a screen reader, or a touch device.

The verdict covers the **product inside the frames**. The gallery, situation selector links, fit control, review pins, and comparison controls are review tools. They do not belong in the app. The intended layout, typography, stripes, rings, spacing and expanding ticket list can all be built in React with CSS and the existing SVG assets. The browser does not need to be replaced. A real app also needs real links, permission checks and reliable state. Copying the HTML alone would leave those unfinished.

The estimates are engineering judgment, not measured delivery times. They include tests and review. Reusing completed work from AK-87 and AK-122/127 would reduce the remaining effort; parallel work can reduce elapsed time. No app code, schema, wireframe or decision is changed by this report.

## My opinion of each part

| Part | Verdict | Reason and recommendation |
| --- | --- | --- |
| Needs you first, three rows | **Keep** | Answers the person’s most urgent question before routine activity. Three is enough if overflow is explicit. |
| Four request types | **Keep** | A worker question, Captain question, plan and risky merge need different action words. Also preserve today’s separate approval request when Captain built the work. |
| Links into Captain | **Keep** | Fits DEC-24. Each must land on its request, not merely open the conversation at the bottom. |
| Newest requests first | **Change** | A2 hides the two oldest blocked agents. Use oldest unresolved first, with a stable tie-breaker. This disagrees with Claude’s v2 and v5 order. |
| Full heading sentence table | **Keep the structure; change unsupported claims** | Working counts, single-agent names and a separate stopped sentence are clear. Setup, pause, completion and offline sentences need the conditions checked below. |
| 44px desktop / 30px phone heading | **Keep** | It gives the page a clear focal point. One sentence can wrap across lines; “one line per sentence” cannot be a literal device-independent promise. |
| Agent state words | **Keep** | Working, Reviewing, Waiting, Idle, Offline, Stopped, Limit reached and Paused explain more than a dot. Keep “Busy in another project” too. |
| Neutral initial tile and presence ring | **Keep** | Status is visible without assigning a colour to a person. A blue ring must mean a recent report of work here. |
| Breathing ring | **Keep, cautiously** | Helps locate live work. Stop it for stale views, pause and reduced motion. A heartbeat alone is not evidence of building. |
| Step ticks and “step 3 of 5” | **Keep when reported** | Shows where work reached. Never invent five steps for an agent that has no plan. Steps are not a percentage or an ETA. |
| One goal card with its crew | **Keep; preferred structure** | Proximity answers “who is building this?” without matching two lists. This beats my v3 roster beside separate goal panels. |
| Segmented goal line | **Keep** | Shows done, underway, waiting, stopped and unstarted tickets together. Equal segments count tickets, not effort or time remaining. |
| Words under the line | **Keep** | Makes the line readable without learning a colour key. This beats my v2 omission of counts and my v3 done-only fraction. |
| Review path: hover label, expanding list, Work links | **Keep; improve accessibility** | It makes each segment inspectable on desktop, keyboard and phone. The expanding list is an inline disclosure, not a floating menu. |
| Cards versus Rows | **Keep Cards; drop a production switch initially** | Rows is a useful comparison, but maintaining two layouts adds cost without answering a new question. Build Rows only if explicitly selected as a product feature. |
| Idle/offline crew outside cards | **Keep** | They do not belong to the active goal. Keep their names stable within that list. |
| Croc in calm and setup moments | **Keep** | It gives the page character without competing with work. Keep it absent from errors; hide its decorative image from assistive technology. |
| Dark theme | **Keep** | Fits the handoff and gives the status shapes clear emphasis. The screenshot looks restrained. |
| Light theme | **Keep as a proposed theme** | The paper surfaces work well, but this needs shared tokens and checks across the shell and linked pages before shipping. |
| Phone layout | **Keep, with responsive safeguards** | One-column cards, visible state words, 64px line button and 52px ticket rows are good. Test smaller widths, text zoom, safe areas and the overflowing tab bar. |
| “Waiting on Raghav” row | **Keep the explanation; change its assumed rules** | It explains a hold to another member. It must name an actual required respondent. The screenshot shows it above the heading, so it is quieter in style, not lower in reading order. |
| No Next, delivery feed or separate problem block | **Keep, conditionally** | Removing repetition is good. A merge or review failure with no current agent still needs a sentence in the heading or affected card. It must not disappear. |

Claude also beats my v2/v3 proposals in the count-to-detail path, explicit waiting segments and one sentence per heading block. My preference for stable order and full questions still stands. Cards necessarily move an agent between goals when its work changes. They cannot also promise that every agent stays at the same screen position forever.

## Claude’s choices and assumptions, one by one

“Conflict” below means a conflict with an existing rule or specification, not a reason to reject the design. The ticket says v4’s look was approved. That supports preserving it; it does not establish new database permissions. DEC-24 supersedes DEC-22’s removal of Overview. Everything else in DEC-22 still applies. The proposed data contract is not proof that a field has been implemented.

### The eight things Claude was unsure about

| # | Agree? | Why | My recommendation and rule check |
| --- | --- | --- | --- |
| 1. Risky merges and “what next” go to the owner; ticket questions go to the goal requester | **Disagree as an existing rule** | Today human members can OK risky merges. A goal reporter may be Captain, rather than the person who asked. “What next” can be asked in any member’s Captain conversation. | Keep current permissions until a product decision changes them. Record a required respondent explicitly if routing is wanted. DEC-22/24 do not impose owner-only answers. [M, N] |
| 2. A member can see an owner-only question in Work; Captain chat is the owner’s | **Agree about a shared ticket; disagree about the chat premise** | Members can read ticket questions. Each person has a Captain conversation; the underlying Room is shared, not private owner storage. | Link to the shared ticket, with no answer control in the Overview row. Do not claim the whole ticket page is read-only today. Preserve each member’s own Captain chat. [N, R, T] |
| 3. Newest first may hide the longest wait | **Agree with the concern; disagree with the chosen order** | A2 demonstrates starvation of blocked workers below the fold. | Oldest unresolved first, stable by request identity. This changes Claude v2/v5, not DEC-24. Keep three rows and counted overflow. |
| 4. Resume everyone opens Settings | **Agree on destination** | This is a project setting. Today it does not exist there. | Add the real project control under AK-87, with an anchor that the heading can target. Members see who paused; only the owner gets Resume. Amendment supports a project switch. [P] |
| 5. Paused tickets remain striped blue, agents go grey | **Disagree with unqualified blue words** | The line’s legend defines blue as someone building or reviewing. After pause that claim may be false. | Keep the ticket’s underlying status, static stripes and layout. In the paused view label its bucket “paused”, with explicit ticket words. If pause merely prevents new runs, keep genuinely running agents live until they stop. P7’s blue means live/moving. |
| 6. A plan waiting has no goal card until tickets exist | **Agree with hiding unstarted cards; disagree with the explanation** | The current plan flow already creates draft Backlog tickets before approval. Having tickets is not the correct display condition. | Hide a plan-only goal until work starts. Keep its request in Needs you. Do not add a zero-ticket progress line. This follows the amendment’s draft-plan flow. [N] |
| 7. Offline is grey, not coral | **Agree** | A sleeping or unreachable computer is not proof of a failed run. | Keep grey Offline and last seen. Name the blocked review work separately; show coral when a failed operation is recorded. Do not infer failure from absence. |
| 8. Connect your computer opens Team | **Agree with Team as the entry point; partial today** | Team can open Add an agent; the pairing flow is a separate connection component. | Route through the existing Team/connect flow and focus the right action. Membership or a selected Captain alone is not a successful connection. [A, S] |

### The other recommendations and inherited v4 choices

| Choice | Agree? | Reason | Recommendation / conflict |
| --- | --- | --- | --- |
| Four core parts, code builds all status sentences | **Agree** | Consistent with DEC-22/24. | Use one shared projection for heading, lines, rows and counts. Captain writes questions and judgments, not dashboard facts. |
| Finished goal stays until end of day | **Agree** | Someone checking later should see it finish. | Explicitly changes Claude v2’s next-refresh removal. Use one agreed day boundary; clear at midnight even without new events. Keep finished cards last. |
| “Finished today at 14:20” | **Agree if known** | A timestamp is stronger evidence than a celebratory label. | Use recorded completion, not the goal’s last edit. Missing time means omit the clock. [G, B] |
| “All 3 goals are done” the following morning | **Agree with a scope rule** | C16 hides old cards but still needs to count them. | Count non-canceled goals from the full record, not displayed cards. Any planned or unfinished goal prevents “all”. |
| Three Needs you rows, then “and N more in Captain” | **Agree** | Restores Claude v2; v4 only showed two. | Count all eligible unresolved requests once. Use the same count in Captain’s badge. |
| Overflow goes to the oldest open question | **Agree** | Gives a useful starting point. | With oldest-first rows, prefer the oldest *hidden* request so overflow does not repeat the first row. |
| One working agent is named | **Agree** | “Birch is working” is natural and specific. | Distinguish Captain reviewing from building. Do not count idle assignments. |
| One goal or two short names; otherwise a count | **Agree** | Keeps the heading readable. | Keep the 32-character rule for two names as a deterministic starting point. Allow wrapping; test fonts and long names. |
| Captain counts while reviewing | **Agree** | Reviewing is real work. | A ticket merely sitting in Review does not mean Captain is reviewing it now. [G] |
| Stopped, offline-with-queue, Captain-offline, finished, newcomer heading clauses | **Agree with conditions** | Each explains something outside the normal count. | Preserve their order. Avoid an unbounded list of offline names; summarize long cases and link to Team. Do not suppress failures during setup or pause. |
| Captain offline means reviews/merges wait for “your machine” | **Partly agree** | Captain’s runner matters, but its owner need not be the project owner or current viewer. Previously approved work can still be merged by a person. | Name Captain’s actual owner/computer. Say “Captain’s reviews are waiting” rather than “nothing can merge”. [A, M] |
| “Tell Captain” for someone who never wrote | **Agree** | Gives a newcomer one next step. | Check an authoritative prior-message existence query, not absence from the latest 300 Room messages. This does not mean “nothing assigned”. [R] |
| Waiting row names the required person | **Agree when known** | “Waiting on you” is wrong for everyone else. | Use IDs for identity, names for display. Unknown audience gets “Waiting for an answer”, with no invented name. |
| Other-person row only for ticket holds, maximum two | **Agree with an overflow safeguard** | Avoids exposing someone else’s unrelated planning conversation. | Derive the held ticket and add a quiet counted link when more than two exist. v5 silently truncates this list. |
| Hollow amber for someone else; amber line and ring | **Disagree under the current strict rule** | P4 says amber means “needs you, and nothing else”. v5 broadens it to “needs a person”. | Prefer one explicit approved exception covering other-person waits if exact v5 is chosen. Otherwise use neutral marks for those waits. DEC-24 does not itself authorize the wider meaning. |
| Cards recommended; Rows quieter past about 15 agents | **Agree on Cards; unproven threshold** | Goal grouping helps. The 15-agent threshold is design judgment, not measured usability. | Ship Cards. Keep Rows as a future choice only if use justifies it. |
| All agents shown, Captain first then name within each list | **Agree** | Idle and offline explain capacity. | Normalize Free to Idle. Preserve Busy elsewhere. Current `crew()` sorts by activity and must change. Never hide an agent when a card is folded. [G] |
| Goal cards for goals with agents; other goals behind Work | **Partly agree** | Useful density, but a held goal can have no current agent. | Include started unfinished goals, including held/stopped ones; fold only nonessential planned work. Derive the overflow count. C17’s extra goal is a fixture literal. |
| One segment per ticket, equal width | **Agree** | Honest count if membership and exclusions are consistent. | Exclude canceled work, follow goal ancestry, include every remaining work ticket once. State that scope changes can lower the done share. [G, B] |
| Order done → in progress → waiting → stopped → to go | **Agree** | Matches legend and tray, so inspecting is predictable. | Preserve a stable secondary ticket order within each bucket. Moving buckets on a state change is expected; do not steal focus. |
| Over 16 tickets the line is continuous | **Agree as a visual rule** | Avoids a dense fence of tiny marks. | Preserve individual ticket identity and full list access. Test very large totals: v5 still gives each span a 4px minimum, even when its percentage is smaller. |
| Striped blue instead of the apparently violet solid blue | **Agree** | Adds shape and makes underway work distinguishable. | Use shared token aliases for `--blue` and `--blue-switch`; keep stripes static. No image, canvas or new dependency needed. |
| Amber stripes, broken coral, outlined to-go | **Agree, subject to the amber rule** | Shape plus words improves access. | Keep words and the disclosure as the reliable fallback. Do not rely on the broken shape alone at tiny widths. |
| Croc green `#5DC46A` rather than `--green` `#5CCB9A` | **Agree visually; conflicts with token source** | It fits the original artwork. | Record an approved semantic done token in the handoff and app. Do not hard-code a component exception. The existing logo itself remains unchanged. |
| Light theme and light stripe mixes | **Agree as a proposal** | The screenshot is pleasant and legible. | Adopt semantic light values across shared tokens and linked surfaces; not a local Overview override. DEC-22’s current package defines dark only. |
| Dark palette is “copied unchanged” from tokens | **Disagree literally** | v5 adds custom card edge, hover, shadow and tooltip values; `--surface-active` also differs (`#1B2028` versus `#181C23`). | Inventory and approve all differences, not just green. Map them to semantic tokens before porting. [V, K] |
| Focus uses `--text-muted` instead of `--border-focus` | **Agree** | Focus must remain easy to see. | Keep visible 2px focus with a shared semantic token. This is a handoff-token adjustment worth recording, not a DEC-24 conflict. |
| Progress lines replace “4 of 7 done”; 44px heading | **Agree** | More explanatory and visually stronger. | Supersedes v2’s no-bar and smaller-heading proposals. The requested and approved v4 work supports these visual choices. |
| Hover label, one line button, expanded ticket links | **Agree** | Separates navigation from disclosure; avoids nested controls. | Use `aria-expanded` and `aria-controls`; expose the same facts in the keyboard/touch list. Add proper tooltip dismissal and pointer behaviour. |
| Goal → Work by goal; active agent → ticket; no ticket → Team | **Agree** | Destinations match the question behind the click. | Add exact goal/agent targeting. Today a goal-grouped board is not a filter for this specific goal. [S] |
| Croc only in setup/calm; never on failure | **Agree** | Appropriate restraint. | Preserve original SVG, dimensions and placements. No new bitmap assets. |
| Static skeletons, keep old view on refresh error | **Agree** | Preserves AK-158’s progress against flicker. | Keep stable React components, disclosure state and focus; distinguish failed initial reads from empty projects. [O, W] |
| Stale timestamp line and stop breathing | **Agree** | Makes old information explicit. | Record last successful snapshot time. An unchanged poll can be fresh even when the data object keeps its identity. |
| To-go can explain “on hold” or offline assignee | **Agree** | Explains why the next ticket has not begun. | Derive actual blockers/assignment. Offline is not proof the whole goal is held. [B, W] |
| Remove problem blocks; repeat failures in heading/agent/segment | **Partly agree** | The three levels support glance and inspection, though P3 normally discourages duplication. | Keep the short heading alert and detailed reason in its row. Preserve failures without an agent or goal; the removal must not erase them. |
| Clamped questions and hover for full names | **Disagree for decision-critical text** | A phone has no hover. Truncation can hide the actual decision or its consequence. | Let the short question wrap fully. Keep optional detail in Captain. This retains the layout but sometimes makes a row taller. |
| “It can’t be undone” for a database change | **Disagree** | The amendment says “can’t be undone automatically”. A manual recovery may exist. Other risky changes need different consequences. | Use the recorded specific review question and “can’t be undone automatically” only when accurate. Never infer irreversibility from “risky”. |
| “Your agents keep working” after failed load | **Disagree as a guarantee** | A database outage can also prevent runners from obtaining work or reporting. | “Your agents run on their own computers.” Say the screen cannot confirm current progress. |
| Preview controls: theme, Rows, widths, review pins, fit, still/full frames | **Agree for review only** | These compare designs; they are not product settings. | No production gallery, fit scaling or review pins. Respect the operating system’s reduced-motion preference. A real theme switch is a separate intentional setting. |

## What can ship first

A first slice can already look like C13/C14: the large sentence, dark goal cards, labelled segments, neutral agent tiles, rings, real step ticks, idle agents outside cards, and the same phone stack. It can include three existing request rows and the expandable ticket list. Setup, loading and error states can use the same visual structure.

Use the existing records. Missing steps stay absent. Unknown stop details say only what was reported. Unknown respondent names stay unnamed. The current shared human-member permission model stays in force. Fixtures can demonstrate unsupported states in development; production must never manufacture them.

That slice is visually close, but it cannot claim full A5/E25 routing, D22 project pause, or D23’s exact test and retry counts. It also cannot claim light-theme parity until the shared palette is approved. Those parts must wait for their dependencies.

## Verified source index

These are repository checks, not a live-database audit. “Exists” means the checked schema and reader support it; old installations and older runners may omit optional facts. Line anchors refer to snapshot `9700584`. The following tables use these short references plus line numbers.

| Ref | Source and relevant lines |
| --- | --- |
| V | [v5 HTML](../overview-wireframe-v5/claude/overview.html#L628): state maps 628–635; fixtures 644–1029; heading 1047–1094; lines 1098–1126; agent rows 1130–1162; requests 1165–1199; cards 1207–1234; loading/error 1252–1276. |
| O | [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx#L10): caps 10–11; readiness and held view 15–29; Captain target 34; current rendering 36–89. |
| G | [glance.ts](../../../apps/site/src/workspace/glance.ts#L130): current ticket/running 130–156; rows and steps 183–224; goals and completion 302–406; team states 586–607; crew 790–834; current Overview projection 849–899. |
| A | [data.ts types](../../../apps/site/src/lib/data.ts#L33): project 33–48; agent 75–110; membership 125–129; ticket 131–178; PR checks 180–189; steps 201–208. |
| D | [data.ts readers](../../../apps/site/src/lib/data.ts#L277): people 277–289; lightweight ticket list 442–467; full detail 460–462; realtime 729–759. |
| W | [useWorkspace.ts](../../../apps/site/src/workspace/useWorkspace.ts#L37): unchanged-snapshot retention 37–40; reads and request race protection 52–74; project reset and realtime 76–116. |
| N | [captain.ts](../../../apps/site/src/workspace/captain.ts#L37): per-person conversation 37–52; plans 244–280; request de-duplication 379–404; request sources and ages 408–433. |
| C | [useCaptainRoom.ts](../../../apps/site/src/workspace/useCaptainRoom.ts#L125): retained room reads 125–139; current person’s turns/plans/needs 161–170; live Captain 183–187. |
| B | [004 workspace migration](../../../packages/autokolab/sql/004_workspace.sql#L49): tickets 49–75; steps 79–87; blockers 89–94; first-start/completion triggers 286–289; needs event 331–333; shared access 421–463. |
| M | [012 merge policy migration](../../../packages/autokolab/sql/012_merge_policy.sql#L22): owner sets policy 22–35; humans may approve 37–59; any human project member may OK merge 61–75. [merge.ts](../../../packages/autokolab/src/runner/merge.ts#L385): actual merge gates 385–411. |
| U | [019 usage migration](../../../packages/autokolab/sql/019_agent_usage.sql#L12): daily usage and wait time 12–16. [runner.ts](../../../packages/autokolab/src/runner/runner.ts#L850): reported usage 850–859; daily limit test 879–884. |
| F | [018 PR facts migration](../../../packages/autokolab/sql/018_pr_facts.sql#L13): snapshot and check validation 13–69. [merge.ts](../../../packages/autokolab/src/runner/merge.ts#L97): counts GitHub checks 97–109. |
| P | [001 initial migration](../../../packages/autokolab/sql/001_init.sql#L320): individual pause 320–334. [runner.ts](../../../packages/autokolab/src/runner/runner.ts#L1227): owner pause aborts current run 1227–1234; work gates 1308–1330. [Settings.tsx](../../../apps/site/src/workspace/Settings.tsx#L8): current settings 8–29. |
| R | [Room access](../../../packages/autokolab/sql/001_init.sql#L273): shared Room reads 273–274. [room.ts](../../../apps/site/src/lib/room.ts#L107): initial last 300 messages and incremental feed 107–139. |
| S | [router.ts](../../../apps/site/src/lib/router.ts#L17): route shapes 17–24; Work grouping 43–48. [Workspace.tsx](../../../apps/site/src/workspace/Workspace.tsx#L42): navigation 42–54; hard-coded freshness 171; connection modal 243; shell 253–280. [Connect.tsx](../../../apps/site/src/workspace/Connect.tsx#L33): pairing flow. |
| T | [TicketPage.tsx](../../../apps/site/src/workspace/TicketPage.tsx#L178): editable steps/status 178–189. [CaptainHome.tsx](../../../apps/site/src/workspace/CaptainHome.tsx#L81): exact need anchors and absent-target fallback 81–94. |
| K | [handoff tokens](../../../autokolab-ux-handoff/tokens.css#L4): active surface 11; green 38; blues 45–48. [site styles](../../../apps/site/src/styles.css#L154): shell/layout 154–177; current phone-hidden state word 230. |
| X | [agentStatus.ts](../../../apps/site/src/workspace/agentStatus.ts#L4): project-scoped status, limit and offline precedence 4–22. [story.ts](../../../apps/site/src/workspace/story.ts#L10): five-minute online rule and activity 10–20; goal ancestry 23–30. |
| H | [Overview tests](../../../apps/site/src/workspace/Overview.test.ts#L93): unchanged-snapshot/render tests from 93. [poll.ts](../../../apps/site/src/lib/poll.ts#L1): five-minute safety poll and visibility refresh 1–16. [useHistory.ts](../../../apps/site/src/workspace/useHistory.ts#L28): existing error/last-success time and readiness 28–32, 49–63, 105. |
| E | [runner.ts](../../../packages/autokolab/src/runner/runner.ts#L2438): errors, limits, comments, needs and final status 2438–2510. [020 run usage migration](../../../packages/autokolab/sql/020_run_usage.sql#L17): usage records, not structured test-failure/retry outcomes. |

## Data-by-data check

**Exists:** stored and readable now; presentation still needs building. **Partly there:** useful facts exist but do not prove the exact displayed claim. **Needs building:** the required authoritative record or behaviour is absent. All example people, names, ticket keys, times and counts in v5 are fictional; no example is a measured project result.

### Identity, questions, counts and links

| Item on the wireframe | Data source (file/table) | Status | Work needed |
| --- | --- | --- | --- |
| Project name, eight tab names, selected Overview | `projects.name`; Workspace/router [A 33, S 42] | Exists | Match the shell: 232px sidebar and small logo, eight visible destinations, and scrollable phone tabs. Today several destinations sit under Project. Keep project switching/sign-out accessible. |
| Agent name/initial, Captain label | `agents.display_name`, `projects.lead_agent_id` [A 75, G 77] | Exists | Compare IDs, not the literal display name “Captain”; initials are derived. |
| Owner/member identity and “you” | `projects.owner_id`, `project_members.role`, profiles [A 33, 125; D 277] | Exists | Pass current profile ID to the projection. Do not infer role from a name. |
| Ticket key/title; goal name | `tickets.key/title/type/parent_id`; `goalName()` [A 131; G 35; X 23] | Exists | Reuse short goal names; handle long text and ancestor chains. |
| Worker question text | `tickets.needs_human` [B 67; N 408] | Exists | Separate actual questions from runner problems and merge requests. Preserve full decision text. |
| “Fjord is waiting” and which work it blocks | Assignee/current ticket, needs and runner status [G 183; A 82] | Partly there | A question can be set without a matching waiting status; use the ticket hold, not a guessed active run. |
| Captain’s own question | `messages.kind/to_id/thread_id`, per-person turns [N 37, 76] | Exists | Keep recipient/thread identity and whether it was answered/closed. |
| Plan question and “4 tickets” | Message plan block plus draft tickets [N 244–280] | Exists | Count actual non-canceled draft tickets. A plan already has goal/ticket records; exclude unstarted goals from cards. |
| Plan estimate “about a day” | Plan prose, no structured estimate in `Plan` [N 220–238] | Needs building for an exact reliable estimate | Omit unless Captain records an explicit estimate tied to that plan. Do not turn ticket count into a duration. |
| Risky merge question, reason “changes the database” | `needs_human`, `review_question`, full `review`, `pr_facts.files.risky` [A 150–170; F] | Partly there | List loads question/check projections, not risky file detail. Read/cache the small risk summary or load evidence on demand. Preserve specific consequences; distinguish database from auth/dependency/CI risk. |
| Approval when Captain built it | Existing `Need.kind=approval` [N 416; A 65] | Exists; absent from v5’s four-type examples | Reuse a plain “Review in Captain” row. Never let redesign erase the independent-review requirement. |
| “2 h”, “25 min”, “1 day” waiting | Message `created_at`; ticket `updated_at` used as `since` [N 413–431] | Partly there | Ticket edits reset `updated_at`. Reconstruct current question’s `needs_human` event or store its timestamp. A new request must reset age; unrelated edits must not. |
| Three rows, “and 2 more”, Captain badge 5 | De-duplicated needs [N 379; S 261] | Partly there | Change current cap 2 to 3 [O 11], choose order, share recipient-aware count, and exclude ordinary problems. |
| Exact message destination in Captain | Existing `#need-<key>` [O 34; T 81] | Partly there | It works for loaded outstanding needs. Support old questions outside the last 300 messages, resolved-between-click-and-arrival requests, and repeated navigation while Captain remains mounted. Show the record if the request is already settled. |
| Who may answer: owner versus James who asked for Search | No audience on ticket; `reporter_id` is creator [A 146; B 63; N 408] | Needs building | Explicit respondent/authorized-answer rules, backfill/fallback, runner routing, shared badge and Captain behaviour. Changing permissions requires server enforcement and policy tests. |
| “Only Raghav, the owner, can OK a risky change” | `allow_merge()` permits all human members [M 61] | Needs building if selected | This is a new access rule, not a current fact. Change RPC, UI and tests together only after product approval. |
| “Waiting on Raghav/James”, hollow mark, two rows | Shared ticket need exists; no required respondent [B 421; N 408] | Partly there | Render the row after audience rules exist. A member can see the ticket need now. No guarantee that Captain’s fuller message is copied to ticket detail. |
| “See it on AK-52”, read only | Ticket route and shared read access [S 43; B 421; T 178] | Partly there | Navigation exists. Today members can edit tickets/steps; “read only” needs a limited viewing surface or a separately agreed permission change. Hiding one control is not server enforcement. |
| Goal name opens Work at that goal | Work `?group=goal` [S 43–48] | Partly there | Grouping exists; an exact goal ID filter/anchor and history/back behaviour do not follow from grouping alone. |
| Agent opens its ticket or its Team entry | Ticket route, Team page [S, G 809] | Partly there | Ticket links exist. Add stable Team agent anchors/focus. Queue-only offline agent D20 should go to Team, not an arbitrary waiting ticket. |

### Agent words, presence, steps and failures

| Item on the wireframe | Data source (file/table) | Status | Work needed |
| --- | --- | --- | --- |
| Working, Reviewing; 1/2/3/8 agents in heading | Scoped runner status/current ticket; `agentDot`, `agentRows` [X; G 130–224] | Partly there | Count actual running agents here; map current ticket to goal. Review is live only with a reviewing runner, not just `status=review`. Existing Overview maps reviewing rows to “Working” [G 885]. |
| Waiting on you | `needs_human`, `waiting_human`, `Need` [G 205; N] | Partly there | Truth of a ticket hold exists; exact “you” needs respondent identity. Merge waits can happen while Captain is idle, so do not blindly reuse Captain’s one global status. |
| Idle, including today’s Free | Team state/queue [G 592–607, 812] | Exists | Normalize both words to Idle in Overview. Keep queue detail available. |
| Offline, last seen “3 h ago” / “yesterday” | `agents.last_seen_at`, five-minute rule [A 87; X 10] | Exists | Format relative time and refresh it as time passes. “Never connected” must differ from last seen. |
| Captain offline, actual computer to wake | Captain agent plus owner profile/machine [A 77, 107; C 183] | Partly there | Use Captain’s owner, not project owner. Offline is a heartbeat inference, not proof the computer is powered off. |
| Stopped; reason “GitHub couldn’t be reached” | `blocked`, status note, runner `needs_human` and comment [G 209–215; E 2460–2466] | Partly there | Existing prose often gives a reason. Add structured stop kind and persisted ticket association for complete coverage; show unknown instead of inventing an error. |
| Limit reached; “daily limit, back at 09:00” | Usage totals/day/waiting_until; runner-local daily cap [U; E] | Partly there | Distinguish daily hours, daily spend and provider/session limit. `waiting_until` alone does not identify which limit. Do not promise a reset time when none was reported. |
| Paused agent, grey/no ring | Agent status supports paused [A 82; P] | Exists raw; projection partial | `teamState()` currently maps paused to stopped [G 597]. Add Paused and preserve what it was doing if known. |
| “You/Raghav paused everyone”, who/when, Resume | Only individual `members.paused`, owner-controlled [P] | Needs building | Project switch, actor/time, all runner start gates, realtime project updates and real Settings action. Do not infer a project pause from several individually paused agents. |
| State word and doing text, present-tense task phrase | Ticket summary/title plus current row [G 40–50, 183–224] | Partly there | Many summaries are completed outcomes, not live descriptions. Reuse actual current step label or safe “working on [title]”. Do not generate invented activity prose. |
| Neutral tile, blue/amber/coral ring, breathing | Derived visual mapping [V 628, 1145; X] | Exists inputs | Build CSS; keep explicit words, fresh report requirement, reduced motion and stale freeze. |
| “step 3 of 5”, five ticks; other displayed fractions | `ticket_steps.idx/status/label/updated_at`, `ws.steps` [B 79; W 59; G 199] | Exists when planned | Render real step states. v5 assumes all ticks before current are done; the schema allows gaps or several current steps. Define fallback for no current step/all done; omit when no plan. |
| “Fixing 2 failing tests” | PR facts count check jobs, not test cases [F 97] | Needs building for that exact claim | Runner must report test-case results and active repair intent, or show “Fixing failing checks” only when reported. `total - passed` can include pending jobs and is not failed-test count. |
| “Tests still failing after 3 tries” | Runner comments/local review history; no structured ticket test-attempt count [E; F] | Needs building | Persist actual failed repair attempts and outcome if that wording is required. Do not use review-round count or usage rows as test retries. |
| Failure being fixed stays blue; abandoned failure coral | Check failure plus running/stopped evidence [G 680; E] | Partly there | Join facts at the right commit with current activity; a red check alone does not prove the agent stopped. Preserve a failure even without a current agent. |
| Busy in another project; several concurrent tickets | `status_project_id`, singular `current_ticket_id` [X 4; A 84] | Partly there; v5 has no example | Keep a quiet “Busy in another project” state without leaking other project details. Exact parallel task rows need AK-122/127’s active-run model; one singular current ticket cannot represent all runs. |

### Goal lines, totals, completion and empty states

| Item on the wireframe | Data source (file/table) | Status | Work needed |
| --- | --- | --- | --- |
| Seven tickets; “4 done · 2 in progress · 1 to go” | Non-canceled goal descendants, ticket status [G 313–344; X 23] | Exists raw | Derive stable per-ticket segments, legend and total from the same set. Current `OverviewGlance.goals` retains only done/total [G 890]. |
| Done solid green | `tickets.status=done` [B 58] | Exists | Use approved semantic done token. Done is not the same as all steps checked. |
| Build/review striped blue | In-progress/review ticket plus runner state [G 320–335] | Partly there | Separate active building/review from queued review. D21 deliberately keeps review blue while Captain is offline, so call it “in progress”, with “Waiting for review” in the tray; do not describe every blue segment as live work. |
| Amber waiting, person-specific counts | Needs and ticket holds [N; G 325] | Partly there | Needs audience before names can be exact. Approved merge OK should remove the hold consistently. |
| Broken coral stopped | In-progress ticket without running work; stop evidence [G 329–332; E] | Partly there | Avoid classing offline/paused as failed. Use one precedence table for hold, pause, limit, error and missing report. |
| To go outline | Ready/Backlog statuses [B 58; G 333] | Exists | Include assigned-but-unstarted tickets. Do not draw “no-one started” for a ticket that was returned to Ready after earlier work without explaining it. |
| “To go · on hold”, whole Checkout held A6 | `ticket_links`, needs on dependency [B 89; W 110] | Partly there | Calculate runnable remaining work from dependencies. One blocking question does not automatically hold every ticket or an entire goal. |
| “To go · Oriole, offline”; two tickets waiting | Assignee plus ready/in-progress queue and last seen [G 592; X] | Exists raw | Define queue precisely (ready versus backlog/dependency-blocked) and count the same set in heading/tray. |
| Agent grouped under goal; “Nobody on this right now” | Current ticket → epic ancestry [G 130; X 23] | Exists for one current ticket | Include stopped/held work when association is known. Do not fabricate an agent from the ticket’s assignee while the agent works elsewhere. |
| Ordered segments, continuous after 16; 18-ticket Receipts | Ticket identity/count plus visual rule [V 1098–1126] | Exists raw | Implement sorting, continuous mode and ID highlighting. The number 16 is a design threshold, not backend data. |
| “Finished today at 14:20”; Sign-in done | Child `completed_at`, goal’s own `completed_at`; existing `finishedAt` [G 349; B 286] | Partly there | Prefer reliable all-children completion; define empty/reopened/added-scope cases. Existing fallback to epic `updated_at` can misstate completion time. |
| Keep finished cards today; “All 3 goals are done” tomorrow | Full goal list plus completion times [G 397–406] | Partly there | Apply agreed timezone/day cutoff; retain count independently of visible cards. C16’s `allDone:3` is fixture input, not derived evidence. |
| Many goals: “on 5 goals”, “and 1 more in Work” | Working agents’ goal IDs and full goals [G; V 869] | Partly there | Derive active distinct count and overflow. C17 includes six goal objects plus a literal extra-goal string; the seventh goal is not in that fixture’s data. |
| Nothing connected / only Captain / agents but no goal | Membership, chosen Captain, heartbeat, tickets [A, X] | Partly there | Separate registered from connected and unstarted from empty. A lone Captain can also build; do not universally say nobody can build until a worker joins. |
| First goal just started, no green, “1 in progress · 4 to go” | `started_at`, current runner and five children [B 286; G] | Exists raw | Display nonzero legend entries; remove setup croc once real work starts. Do not depend on the first goal being named Checkout. |
| New member with nothing assigned, “Tell Captain” | Human assignments exist; `joined_at` stored but not selected in Member; recent conversation [B 39; A 125; R] | Partly there | Separate no assignment, recently joined and never messaged. Use a prior-message existence read; do not use a local first-visit flag. |
| Calm croc, idle rows, no empty headings/cards | Real ready snapshot + no active work/requests [O 24; G] | Exists inputs | Hide empty sections only after all required reads succeed. Unanswered requests and errors prevent a false calm claim. |
| Loading after about 0.4s, still placeholders | Local read state [O 24–29; C 125] | Partly there | Distinguish initial load from refresh, add delay if wanted. Two skeleton cards cannot promise zero layout shift for any eventual roster. |
| Initial failure, Try again | Workspace/Room errors and `ws.reload()` [W 71; C 135] | Partly there | Build retry for all required reads, including Room/history. History already exposes an error, but Overview reads only rows/ready [O 18; H]; failed history must not silently look empty. Do not assure continued work without evidence. |
| Refresh failure, old view at 9:41, automatic recovery | Held snapshot [O 25–28; W 38]; history `at/error` and safety polling [H] | Partly there | Reuse history’s successful-read time; add equivalent freshness for Workspace/Room and combine required sources. Freeze breathing on stale data; keep prior UI and retry. Error is not an empty project. |
| Full names on desktop hover and phone detail | Full stored names/title, native title, routes [A; V 1155] | Exists | Ensure full accessible name and a tap path; `title` alone is not a phone or keyboard solution. |

### Every heading situation, checked against the actual generator

I evaluated v5’s fixture/heading JavaScript in Node without a browser and obtained all **29 heading cases**, matching the README table. This verifies the generated words, not layout or the truth of live inputs. The groups below cover every row in the table at the end of v5. Entries marked partial still need the mapping described above.

| Case | Exact heading content, with sentences separated by “/” | Live readiness |
| --- | --- | --- |
| A1 | 2 agents are working on Checkout and Sign-in. | Partly there: working count/goals available; recipient-aware question needs work. |
| A2 | 2 agents are working on Checkout and Sign-in. | Partly there: same, plus three rows/overflow/order. |
| A3 | 3 agents are working on Checkout and Sign-in. | Exists inputs; hide unstarted planned goal, retain plan request. |
| A4 | 3 agents are working on Checkout and Sign-in. | Exists inputs; accurate risk consequence still required. |
| A5 | 3 agents are working on Checkout and Sign-in. | Heading inputs exist; owner-only audience needs building. |
| A6 | Birch is working on Sign-in. | Exists inputs; whole-goal hold needs dependency calculation. |
| A7 | 2 agents are working on Checkout and Sign-in. / Tern has stopped. | Partly there: use real stop evidence. |
| B8 | Nothing is connected yet. / Connect your computer to bring in Captain. | Partly there: setup inference and exact connect target. |
| B9 | Captain is here, but nobody builds yet. / Add an agent to start building. | Partly there: only true if Captain is not building. |
| B10 | Nothing has started yet. / Tell Captain what you want to make. | Exists inputs after successful reads. |
| B11 | Birch is working on Checkout. | Exists inputs; remove setup treatment once running. |
| B12 | 3 agents are working on Checkout and Sign-in. / Tell Captain what you want to make. | Partly there: complete prior-message check missing. |
| C13 | 3 agents are working on Checkout and Sign-in. | Exists inputs; new presentation/projection. |
| C14 | Birch is working on Checkout. | Exists inputs. |
| C15 | 2 agents are working on Checkout and Search. / Sign-in is done. | Partly there: reliable completion/day retention. |
| C16 | All 3 goals are done. / No agents are working right now. | Partly there: count full eligible goal set, not visible cards. |
| C17 | 8 agents are working on 5 goals. / Moss has stopped. | Partly there: complete active-run/state mapping, limit distinction. |
| C18 | 3 agents are working on 2 goals. | Exists inputs; deterministic long-name rule. |
| D19 | 2 agents are working on Checkout. / Moss and Tern have stopped. | Partly there: distinguish real error and daily limit. Caption reverses their order; generator follows agent order. |
| D20 | 2 agents are working on Checkout. / Oriole is offline with 2 tickets waiting. | Exists raw inputs; define queue eligibility and tick the clock. |
| D21 | 2 agents are working on Checkout and Sign-in. / Captain is offline, so reviews wait until your machine is back. | Partly there: correct Captain owner/machine, limited assurance about reviews. |
| D22 | You paused everyone. / Resume everyone when you’re ready. | Needs building: project pause and real Resume action. |
| D23 | 2 agents are working on Checkout and Sign-in. / Tern has stopped. | Heading partial; exact failing-test and three-try row details need building. |
| D24a | Loading your project… | Exists read state; skeleton presentation new. |
| D24b | Couldn’t load this project. | Exists error state; retry/reassurance need changes. |
| D24c | 3 agents are working on Checkout and Sign-in. | Partial: retain old view, add separate real 9:41 freshness line. |
| E25a | 3 agents are working on Checkout and Sign-in. | Heading exists inputs; owner/member audience split needs building. |
| E25b | 3 agents are working on Checkout and Sign-in. | Same as E25a; member badge must count only eligible requests. |
| E26 | 3 agents are working on Checkout and Sign-in. / Tell Captain what you want to make. | Partial: first-message check and real phone disclosure/navigation. |

The generator also has branches beyond these examples: member setup reads “Raghav is setting it up”; member pause reads “Raghav paused everyone” and “Nothing new starts until Raghav resumes”; member Captain-offline names Raghav’s machine; a single reviewer reads “Captain is reviewing [goal]”. Those need the same owner, pause and running-state rules. Ungrouped work, a human working, busy elsewhere, and several simultaneous runs are not drawn in v5. They still exist in the product and must not disappear.

## Smallest build sequence

This is a proposed sequence for Captain to turn into tickets after decisions. No tickets were created. **S** is roughly one day; **M** two–four days; **L** about a week. The total is a range because permissions, shared theme scope and existing parallel-work tickets affect it. Items 1–2 give the first slice. Items 3–7 complete the less common situations and polish. Do not bundle migrations, permissions and visual work into one large PR.

| Order / proposed ticket | Effort | Files | Depends on | Backend / runner needs; what can go first |
| --- | --- | --- | --- | --- |
| 1. Build one truthful Overview view from the records already available. | M | `workspace/glance.ts`, `agentStatus.ts`, `Overview.test.ts`, `glance.test.ts`, fixtures | Agreed state precedence and initial scope | No migration needed for existing facts. Preserve AK-158 retention. Output ticket IDs/states, real steps, all crew, stable order, goal totals, known completion and request types. Handle unknowns explicitly. Can start first. |
| 2. Match the approved dark Cards layout and make its review path work. | M | `Overview.tsx`, `Workspace.tsx`, `styles.css`, `tokens.css`, `router.ts`, `Board.tsx`, `People.tsx`, existing UI tests | 1; approved semantic palette changes | No new runner data. Real Captain anchors, goal filter/anchor and Team targets; responsive shell, labelled lines, disclosure, rings and cropped names. Remove old duplicated blocks/fake freshness. This ships the first useful slice. |
| 3. Keep Overview fresh without losing place or pretending old data is live. | M | `useWorkspace.ts`, `useCaptainRoom.ts`, `useHistory.ts`, `lib/room.ts`, `lib/data.ts`, `Overview.tsx`, regression tests | 1–2 | No new runner telemetry. Add last-success/freshness metadata, visibility clock, initial/refresh failure and retry paths, retained disclosure/focus. Query old target messages and whether this member ever wrote. Ordinary completion-day filtering can ship here. |
| 4. Give each question a real audience and the same answer rules everywhere. | L | New numbered SQL migration if needed, `core/projects.ts`, MCP ticket tools, runner routing, `lib/data.ts`, `captain.ts`, `useCaptainRoom.ts`, policy tests | Product decision on owner/member routing; 1 | Backend owns allowed respondents and question time; older clients get shared-question fallback. If owner-only merges are chosen, enforce them in `allow_merge` and tests. Then add A5/E25 quiet rows, correct badges and exact waiting names. Can proceed beside 2 after the rule is settled. |
| 5. Report reliable stop reasons, live task associations and test outcomes. | L | Runner `runner.ts`, `merge.ts`, reporting code/types, new SQL only for required missing fields, site data/projection, policy and runner tests | 1; coordinate with AK-122/127 | Persist error versus daily/provider/spend limits, known resume time, affected ticket and optional failed-test/attempt counts. Reuse parallel active-run records from AK-122/127 rather than creating another model. Omit unsupported numbers until runners report them. |
| 6. Connect the project-wide pause control to Overview. | M, as part of existing AK-87 | Project schema/readers, runner start gates, `Settings.tsx`, `glance.ts`, `Overview.tsx`, policy/runner tests | AK-87’s project switch; agreed pause semantics; 1–3 | Actual actor/time and owner-only control; subscribe to project changes. Older runners cannot be claimed paused until supported. Reuse AK-87 instead of filing duplicate pause infrastructure. |
| 7. Finish light-theme parity and verify the whole situation set in browsers. | M | Shared/handoff tokens, shell and linked surfaces, Overview fixture/browser tests; Rows files only if requested | Palette approval; 2–6 for full acceptance | No runner data beyond earlier items. Light must work in Captain, Work and Team too. Test all 29 cases at 1440/1280/390, plus smaller phones, keyboard, reduced motion and update transitions. If light/Rows are deferred, state that full v5 coverage is deferred too. |

A literal requirement to ship both Cards and Rows adds work to 2 and 7, including duplicate visual coverage; no new backend is needed. If “exactly” includes only the chosen Cards structure, omit that switch. Unknown facts can be omitted in the first slice; false hard-coded states are never acceptable production placeholders.

Future migrations must be new numbered files, bump `SCHEMA_VERSION`, include grants and policy tests, and work with older databases/helpers. Any new table needs RLS. Nothing in this report authorizes applying a migration or changing the live service.

## Risks and honest limits

| Risk | What can be matched; what must be checked |
| --- | --- |
| React versus HTML | React can reproduce these elements and CSS. Keep independent goal links, line buttons and ticket links. Do not transplant the prototype’s whole-page `innerHTML` rerendering: it would discard focus and open lists. |
| Fonts and exact pixels | Same Geist weights, dimensions and SVGs can closely match the reference browser. Font loading, fallback, OS rendering, zoom and browser wrapping change pixels. v5 loads Google fonts; the source review did not establish that fonts loaded in every screenshot. Compare after fonts settle and also test fallback. |
| Stripes, mask and contrast | CSS gradients and mask can reproduce the pattern; no image asset is required. On narrow/zoomed lines a coral break or stripe may collapse. v5’s contrast table checks the stronger stripe, not every stripe pixel or outline. Test actual backgrounds, focus and non-colour comprehension; keep the legend/list as equivalent text. |
| Very large goals | `cont` still creates one span per ticket with `min-width:4px`. At large totals that can overflow or clip, despite continuous mode. Aggregate runs of the same state for the drawing if necessary; keep the ticket list complete and accessible. Lazy-render closed trays for large boards. |
| “Popover” accessibility | The tray is inline disclosure; it need not trap focus or cover the page. Keep `aria-expanded`, `aria-controls` and reading order. Return focus if collapse removes the focused row. Hover tooltip content must be dismissible and usable without pointer precision; v5’s `pointer-events:none` label is not a complete tooltip accessibility solution. |
| Phone behaviour | The 390px framed design is feasible. A fixed 18px bottom pad is not a device safe-area solution. Test 320/360px, 200% text, keyboard, browser bars and landscape; use safe-area insets. Scrollable eight-tab navigation hides later tabs initially, so preserve discoverability and focus scrolling. |
| Step display | Tick order must reflect actual states; “current third” does not prove the previous two completed. Plan edits can change the denominator. No percentage of engineering completion should be inferred. |
| AK-158 flicker | Keep unchanged snapshots [W 37], readiness barriers [O 24], and retained Room reads [C 125]. Use stable agent/ticket/goal keys, not index or state. Preserve scroll and expanded goals through heartbeats and room refreshes. Crossing goals will move an agent under Cards; that is a visible consequence of the chosen design. |
| Time and freshness | Overview captures `now` once [O 15]. Without a ticking clock it can keep a vanished runner live, show old wait ages, and retain yesterday’s card indefinitely. Use a modest visible-page clock plus visibility refresh. Timestamp successful reads separately from object identity. |
| Realtime consistency | Ticket/step changes reload, agent changes patch locally, and Room/history load separately [D 729; W 52]. They are not one atomic snapshot. Avoid momentarily showing an answered question with a waiting segment or conflicting counts. Use one derived view and guard transitions. Five-minute polling is a fallback, not instant recovery. |
| Read volume | Workspace already reads all tickets and steps. Avoid adding full PR file lists, descriptions, per-ticket network calls or more full-history polling to the glance screen. Build maps once and derive counts in one pass; cache detail at the requested depth. |
| Privacy and access | Project-local status redaction already exists [X]. Preserve it. A recipient-specific Captain screen is not a new private storage guarantee; Room members can read the Room. Required respondents must be enforced by the backend if exclusive. |
| Failure coverage | A stopped agent can have lost its current-ticket pointer, or a merge can fail with no agent working. Do not remove the old problem projection until equivalent heading/card text covers those failures. Offline and daily limit must not become invented software errors. |
| Pause claims | Individual pause currently aborts a run; the project amendment promises checks before new runs. Decide which behaviour project pause means. Never show every agent stopped simply because the switch was requested. A failed/old runner may not have observed it. |
| Exact risk wording | “Can’t be undone” overstates the database rule. Exact factual language must override a fictional example. Approvals must retain the exact-commit/no-self-review guarantees and real evidence. |
| Layout stability | Three long requests, several secondary heading clauses or an expanded list can push cards below the first screen. That is scrolling, not a rendering failure. “Nothing jumps” cannot mean fixed geometry across all data changes. Keep scroll anchoring and avoid cosmetic reorder animations. |

The future build needs tests alongside the existing ones, not only screenshot comparison:

| Test group | Required evidence |
| --- | --- |
| Projection | All 29 situations, single reviewer, no goal, human work, busy elsewhere, concurrent runs, canceled/reopened work, missing optional fields, contradictory/out-of-order reports. Totals equal their segment buckets. |
| Question handling | Duplicate ticket/Captain questions, stable wait time after an unrelated edit, owner/member audiences and badge parity, more than three own/two other requests, old/resolved deep links. |
| Time and failures | Five-minute offline boundary, midnight/timezones, daylight saving, frozen/stale data, partial initial read failure, successful unchanged refresh and reconnect. |
| Live UI | Heartbeats do not remount cards; focus, scroll and open trays survive updates; no initial false calm; answering a question updates all related views consistently. Extend AK-158’s existing retention checks. |
| Access and runner | Selected audience rules at RPC level, member-read versus action controls, no foreign-project status leakage, project pause gates and old-runner behaviour, actual limit/error/test outcomes. |
| Browser and access | Reference sizes/themes, reduced motion, keyboard-only disclosure/navigation, full names and question access, screen reader labels, tooltip dismissal, touch target sizes, horizontal overflow and safe-area behaviour. |

## Minimal deviations I propose

These keep the approved composition. No new dashboard block or redesign is needed.

| Proposed difference | Reason | Cost of leaving v5 unchanged |
| --- | --- | --- |
| Oldest unresolved questions first; overflow targets oldest hidden | Prevents a steady stream of new requests hiding a long block. | Work can wait for hours unseen, as A2 already illustrates. |
| Keep existing human-member answer permission until an explicit change | v5’s owner-only model is not today’s access contract. | Either false “Only Raghav” text or an unplanned restriction on members. |
| Recorded risk consequence, full question wrapping, “not automatically” where accurate | Protects the meaning of the decision on phones. | The page can hide or misstate what the person approves. Row height may increase with the fix. |
| Name the actual Captain host; soften the load-error reassurance | The project owner’s machine and continued progress are not guaranteed. | Members may wake the wrong machine or believe stalled work continues. |
| Explicit paused words; unknown reasons/counts omitted | Prevents stripes and fictional numbers claiming progress. | A visually exact page tells a false operational story. |
| Shared semantic tokens for the chosen colours and light theme | Preserves DEC-22 while retaining the approved appearance. | Local hard-coded colours drift between Overview, Captain and evidence. |
| Overflow for other-person waits; scalable continuous rendering | Keeps holds visible and lines usable beyond the examples. | More than two holds silently vanish; very large goals clip segments. |

Other-person amber should be an explicit recorded exception if the exact colour treatment is retained. Otherwise make those marks neutral. That is a small palette change, not a reason to discard the quiet row.

## Questions for raghavendra

These are recommendations for the design decision, not blockers to delivering this report.

| # | Question | My recommendation |
| --- | --- | --- |
| 1 | Should the v5 palette, light theme and amber-for-other-people meaning become the shared design rules? | **Yes to the palette and light proposal, with a recorded amber exception.** Keep Cards as the product layout. Put all semantic colours in shared tokens and validate linked screens. |
| 2 | Should only the owner answer risky merges, or should human members retain today’s permission? | **Keep human-member permission.** Route a ticket question to an explicitly selected person when needed; do not infer that person from the goal’s reporter. Owner-only is a separate permission change. |
| 3 | Should Needs you show oldest unresolved requests first? | **Yes.** Three rows, full short questions, stable order and overflow to the oldest hidden request. |
| 4 | Should finished goal cards stay until the day ends, and whose day is it? | **Yes; use the project owner’s profile timezone, with UTC as a documented fallback.** Show the finish clock only when recorded. Keep “all goals done” based on the full goal set. |
| 5 | Does project pause stop running work or just prevent new runs? | **Prevent new runs, as the amendment states; show running work honestly until it finishes.** A separate stop-now action would need its own wording and agreement. Do not reuse the current individual abort switch invisibly. |

## Verification and handoff

- Read the specified design/spec files and checked the implementation, runner and SQL migrations. No live database or secret files were read.
- Executed the v5 heading generator without a browser: all 29 heading cases matched the README. Opened the three committed screenshots named above.
- Checked the report’s five-line verdict, local source links and line anchors; all 29 heading rows exactly match the evaluated generator.
- Fresh browser inspection was unavailable because Chromium could not launch. No new screenshot, rendered accessibility or cross-browser result is claimed.
- `npm run typecheck`: passed across all workspaces.
- `npm test`: failed. Helper tests: **520 passed, 28 failed, 18 skipped**, plus one unhandled socket error. Failures include `spawnSync git EPERM`, a denied local listener, timeouts and fake-runner assertions. Site tests: **377 passed**. The database policy phase was not reached because the workspace test command failed. No app or test code was changed to bypass these failures.
- No site build or `npm run look` was required for this documentation-only change; no file under `apps/site` or `apps/web` changed.
- AutoKolab tools are unavailable here. Git staging failed because the shared worktree metadata is read-only (`index.lock`). Per the ticket fallback, leave this file for the runner to commit, push on `ak-177-review-claude-s-overview-design-v5`, and open a PR against `main`. Suggested title: **AK-177: Review Overview v5 design and build feasibility**. GitHub checks must be green before normal Review acceptance; they cannot be checked before the runner creates the PR.

Review checklist:

- [x] Read v5, v4, the two v2 specifications, amendments and principles.
- [x] Inspect the live page code, agent projection, schema and runner.
- [x] Complete the design judgments and recommendation inventory.
- [x] Complete the data audit, build sequence and limits.
- [x] Run required checks, record failures and prepare the runner’s PR handoff.
