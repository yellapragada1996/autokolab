# Comparing the two tabs proposals

17 October 2026 · AK-161 · Research by jamesblack-codex · Recommendation, not a product decision

The original research commit (`21a1d9b`, 17 October 2026) records `yvssaratchandra-claude` as its Git author.

## Short summary

- We agree that Captain is for talking and Overview is for looking, with evidence always reachable.
- We disagree most about the third tab: my Team versus Claude's History.
- Claude changed my mind: a clear entrance to past outcomes serves more of the intended audience than a permanent roster tab.
- I recommend Captain / Overview / History, plus More and Your account, while keeping Decisions and Guide separately named.
- History needs honest limits, and Team needs visible recovery links; neither proposal has measured which navigation people understand best.

## What I read and checked

“Mine” means the [Codex proposal](../tabs-codex/proposal.md) and [inventory](../tabs-codex/inventory.md). “Theirs” means the [Claude proposal](../tabs-claude/proposal.md); that folder contains no separate inventory. Section references below point to those documents. I did not read `claude-review.md`.

I checked the app and helper source at `c6b2fa2`, including the disputed controls and database access rules. I also read the [Overview wireframe and its limits](../overview-wireframe/README.md), [amendments](../../../autokolab-ux-handoff/00-AMENDMENTS.md), [principles](../../../autokolab-ux-handoff/01-principles.md), and DEC-22/DEC-24 supplied with this ticket. DEC-24 wins over the old Captain dashboard and old phone navigation. The wireframe's reading order is the supplied starting point; its dialogs are examples, not working app links.

This is a source comparison, not a signed-in usability study. I did not re-audit the external product comparisons; they do not settle AutoKolab's third tab. Neither proposal has page-use measurements or interviews. AutoKolab ticket tools are unavailable in this session, so the supplied ticket is the instruction source; live comments could not be refreshed.

## Where we agree

| Point | Shared recommendation | Are the reasons the same? |
| --- | --- | --- |
| Captain first | Open each project on plain chat. Answer questions and plans there. | Yes: DEC-24 and one person-facing contact. Mine §4; theirs §4.3. |
| Overview's structure | State, requests/problems, current work, goals, then today; setup only when needed. No model forms or metric tiles. | Yes: a quick glance, using the approved wireframe. Mine §4; theirs §4.4. The details still need corrections below. |
| No Inbox tab | Captain owns answers; Overview links to the same requests. | Yes: another queue would repeat responsibility. Mine §4; theirs §4.8/5.5. |
| Work opens by goal | Keep By agent, Later, All tickets and expert editing. Rename By feature. | Yes: people start with outcomes, not assignments. Mine §4–5; theirs §4.6/6. |
| Personal items leave project settings | Profile, notifications and sign-out belong together. Keep the project switcher. | Yes: person and project are different scopes. Mine §5–6; theirs §4.7. |
| Invitations belong with Team | Combine invite links and add-by-GitHub-name; retain owner-only authority. | Yes: one job currently has two homes. Mine §1/5; theirs §1.4/6. There is no substantive invitation disagreement. |
| Evidence stays direct | Keep How do you know?, Show the work, exact review evidence and old URLs. | Yes: transparency must work without asking Captain to retrieve it. Mine §5–6; theirs §5.7/6. |
| Subscription cost is not a bill | Prefer reported working time for subscriptions; show reported API dollars with limits and missing-data notes. | Same honesty principle. Theirs §4.5 makes time more explicit; mine §6 more fully distinguishes estimates, scope and incomplete reports. |
| Notifications stay selective | Only blocking questions should interrupt; no badge for ordinary chatter or delivery. | Yes: amendments. Both distinguish this goal from today's broader notification filter. Mine §6; theirs §5.5. |
| Preserve capabilities and records | Move or simplify entry points; keep work, conversation, decisions, export and local tools accessible. | Mostly. Both remove duplicate roster presentation and misleading setup copy. Theirs leaves traffic removal open; mine preserves diagnostics. |
| Keep machinery out of the default view | Models, effort, detailed usage and ticket editing sit deeper. Keys and machine setup stay local. | Yes: readable defaults without concealing the record. Mine §5–6; theirs §4–6. |

## Where we disagree

Each verdict is my recommendation, not a settled decision. “Evidence” names a way to overturn it.

| Difference | Their position and reason | My original position and reason | Who I think is right, and why | Evidence that would settle it |
| --- | --- | --- | --- | --- |
| Third tab | **History**; outcomes, reasons and usage deserve a visible entrance. Team is mostly setup (§4.1, §4.5, §7.1). | **Team**; distributed ownership, availability and recovery are distinctive and important (§4, §7.3). | **Theirs, provisionally.** The product should make past outcomes easy to inspect. This changed my mind. Team's job remains distinct from Overview, but a distinct job need not be a tab. Their claim that History passes a daily-use test is unproved; §4.5 itself says weekly. | Compare both trees with non-coders and machine owners: find a past decision, check delivery, add an agent and recover an offline one. Record first choice and unaided completion. |
| Combine Results, Decisions and Room? | History presents delivery, period decisions, handled problems and cost; detailed Work, Decisions and Room remain linked (§4.5). It is not a proposal to put all chat into History. | Separate Results and Decisions in Project; Room via Team; no new catch-all Records page (§4). | **Blend, led by theirs.** A readable past-period summary helps. Keep the underlying pages and explicit links, so History does not become an all-events feed or a second archive. | Ask someone to explain a shipped change and then find the original decision and conversation. Check that summaries lead to the same records. |
| Guide and Decisions | **Rules** combines Guide and decisions in force; History contains decisions from its period (§4.6). | Keep **Guide** and **Decisions** named separately (§4). | **Mine.** Guide includes concept and architecture, not just rules. “Why did we choose this?” differs from “What must we follow now?” Keep current/replaced decisions together; History links to them. | Ask people to find the product concept, an active contract and a superseded choice. Test Rules against the two plain names. |
| Menu name and contents | **More**: Team, All the work, Team conversation, Rules, Settings (§4.6). | **Project**: Work, Decisions, Guide, Results, Settings (§4). | **Theirs on More.** Project can be confused with the project switcher. Use More with Team, Work, Team conversation, Decisions, Guide, Settings. History owns period results. Keep the existing Work label for continuity. | Find Work and settings without coaching; check whether people open the project switcher by mistake. |
| Room's normal entrance | Independent Team conversation entry in More, plus contextual links (§4.6/5.7). | A prominent Team → Team conversation link (§4–5). | **Theirs.** Reading collaboration should not require visiting a roster. Keep a Team cross-link too. | Ask an observer to find what two agents agreed, starting on Captain and on a ticket. |
| Phone menu placement | Captain / Overview / History / More in four bottom slots (§5.1). | Three bottom tabs, with Project in the header (§6). | **Theirs.** It retains the current bottom-menu placement and makes secondary pages reachable by thumb. Keep account and switcher above. | At 390px, find Team and a decision, then answer Captain with the keyboard open. Check target sizes and focus/Back behavior. |
| Overview's final section | Rename Delivered today to **Today**, including decisions; link longer history (§4.4). | Deliveries only, linking Results (§4). | **Theirs.** DEC-24 already calls for what was decided today. Keep it compact and link the period record, rather than adding weekly figures here. | Use a day with a decision but no shipment, and a day with both. Can people distinguish the two? |
| Search and Captain | An unmatched sentence offers **Send to Captain** (§5.4). | Separate explicit Tell Captain action; unsupported search is not “no matches” (§6). | **Blend.** Their explicit button fits the handoff. My scope warning is necessary: an unsupported decision search must not imply that no decision exists. Search alone never sends anything. | Search a missing ticket, an existing unsearchable decision and a natural-language request; verify each outcome is understood before sending. |
| Guide editing rights | Rules becomes owner-editable; members read (§4.6/5.6), despite §1.2 correctly describing today's member editing. | Preserve member editing as a deliberate expert path (§6). | **Mine.** Changing rights is a product/security change, not a navigation simplification. Their proposal does not explain why members should lose this ability. | A separately approved authority policy, supported by a real misuse case, could justify the restriction. Current code settles today's rights. |
| Remote controls | Add website Pause/Remove buttons; §4.6/5.6 also lists limit changes, while §6 says limits stay local (§7.10). | Keep local instructions; reserve future supported controls (§5–6). | **Mine for this navigation decision.** Theirs identifies a useful future task, but existing helper APIs are not automatically available to the signed-in website. Specify authority and project-versus-machine scope first. | Test the full human-login path, ownership, older helpers, multiple projects and what happens to an active run. No new control until that contract works. |
| Pause everyone home | Project Settings (§2.2/4.6). | Team owner controls (§5–6). | **Theirs for the control; blend for visibility.** It is project authority. Team and Overview should link to it and show that work is paused. This remains future work. | Ask an owner to pause the project versus only their laptop; confirm they understand the difference and effect on running work. |
| Offline Captain | Continue accepting messages with a clear later-read promise (§5.3). | Do not imply an imminent reply; prioritize owner recovery (§6). | **Blend.** Preserve a durable queued message if supported; name the offline state and avoid promising when it will be read. Let records remain usable. | Disconnect Captain, send, reload and reconnect. Verify message retention, ordering and that retry cannot duplicate the request. |
| Traffic diagnostics | Hide under Full numbers or possibly remove (§6/7.8). | Keep under Results technical detail (§5). | **Mine on retention; both on depth.** Moving diagnostics removes default clutter without losing a troubleshooting tool. | Ask operators which counters support actual diagnoses; remove only through separate approved work. |

## Disputed facts checked in the code

✅ means the narrow claim is supported by source. ❌ means it is wrong or overbroad as a statement of current behavior. Proposed features are not marked wrong merely because they are unbuilt. Line links refer to the inspected revision.

| Claim and source | Finding | Code evidence and consequence |
| --- | --- | --- |
| Both: today's shell is Captain / Overview / Team plus Project. | ✅ Verified. | [Workspace.tsx](../../../apps/site/src/workspace/Workspace.tsx#L268) renders three links and a folding menu. Menu → Decisions is two activations from a closed menu. Claude §4.8's “three clicks into a menu” is ❌ wrong for reaching that page; reading detail can add another action. |
| Claude §4.1: Overview already shows current work, so Team repeats it. | ✅ Current work exists; the duplication claim is too broad. | [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx#L65) shows at most three work rows. [People.tsx](../../../apps/site/src/workspace/People.tsx#L49) has people, ownership, connection details and controls. Overview does not replace that job. |
| Claude §1.2: “Each row links” to detail; my mapping implies current goal/work detail paths. | ❌ Wrong as a blanket current claim in both. | Agent and goal rows are plain `div`s in [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx#L67). Requests and deliveries have working actions; section links reach Team/Work. Individual agent/goal links are proposed work, not existing capability. |
| My inventory E06 and proposal §4: current Overview says “Updated just now.” | ❌ Wrong, including at my stated baseline `6686733`. | That literal is in the [sample wireframe](../overview-wireframe/overview.html#L189), not [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx). I confused a mockup with the app. A real freshness indicator remains a recommendation. |
| Both: Overview has problems and delivered-today rows. | ✅ Verified, with limits missed in Claude's current-page summary. | [glance.ts](../../../apps/site/src/workspace/glance.ts#L862) gives requests precedence; [Overview.tsx](../../../apps/site/src/workspace/Overview.tsx#L59) shows the problem block only in problem state. A question can hide an independent failure. “Captain is handling it” is unconditional in [glance.ts](../../../apps/site/src/workspace/glance.ts#L873). Today's data at line 896 contains completed tickets, not decisions. |
| Claude §1.3/6: pause is backend-only, with no page offering it. | ❌ Too broad. Correct for the hosted site, wrong for the local app. | [apps/web App.tsx](../../../apps/web/src/App.tsx#L380) has own-follower Pause/Resume buttons. Hosted [People.tsx](../../../apps/site/src/workspace/People.tsx#L532) buttons reveal instructions. [SQL 001](../../../packages/autokolab/sql/001_init.sql#L321) checks helper identity. [SQL 007](../../../packages/autokolab/sql/007_join.sql#L48) can give a website profile that same identity, but [SQL 008](../../../packages/autokolab/sql/008_link_person.sql#L23) also supports linking a different helper identity. A universal website button still needs verification. |
| Claude §1.3 groups CLI removal and project-owner removal rights as one capability. | ✅ Both exist; ❌ treating their scopes as interchangeable. | [CLI remove](../../../packages/autokolab/src/cli.ts#L538) calls [revokeMember](../../../packages/autokolab/src/setup/team.ts#L173), revoking a helper member. [SQL 004](../../../packages/autokolab/sql/004_workspace.sql#L414) permits deleting a non-owner project membership. Removing someone from one project must not silently revoke their helper elsewhere. |
| Claude §5.6's proposed owner-only Guide could be read as existing authority. My proposal preserves members. | ✅ My account of today's rights; ❌ owner-only if treated as current. | [GuidePage.tsx](../../../apps/site/src/workspace/GuidePage.tsx#L94) saves without an owner gate; [SQL 004](../../../packages/autokolab/sql/004_workspace.sql#L448) permits project-member updates. Claude's earlier §1.2 is correct; its later table proposes a restriction. |
| Both: invites and notification preferences currently sit in Settings; add-by-name sits in Team. | ✅ Verified. | [Settings.tsx](../../../apps/site/src/workspace/Settings.tsx#L8) and [People.tsx](../../../apps/site/src/workspace/People.tsx#L91). [decisionNotifications.ts](../../../apps/site/src/workspace/decisionNotifications.ts#L6) filters out problems, not all nonblocking requests. The [preference](../../../apps/site/src/workspace/useDecisionNotifications.ts#L14) is browser storage keyed by profile; moving it to account does not make it sync across devices. |
| Claude §5.4 marks Invite someone among today's search commands. My inventory E24 says “repository link.” | ❌ Both need correction. | [Workspace commands](../../../apps/site/src/workspace/Workspace.tsx#L138) contain no Invite someone. The GitHub link opens the AutoKolab source repository, not the selected project's repository. Add an agent, name editing and sign-out do exist. |
| Claude §6 calls joining on Captain “Same/Kept”; my proposal calls it a flow change. | ✅ My distinction; ❌ unchanged for a new invitee. | [Join.tsx](../../../apps/site/src/workspace/Join.tsx#L24) sends existing members to Captain, but new joiners to Connect at line 33. Also, [Connect.tsx](../../../apps/site/src/workspace/Connect.tsx#L198) already turns “Give it a first ticket” into a Captain draft. Its label needs improvement; it is not a direct ticket-creation bypass. |
| Claude §4.5: recorded seconds support subscription working time. | ✅ Fields exist; complete totals are not established. | [SQL 020](../../../packages/autokolab/sql/020_run_usage.sql#L20) records project, run kind, seconds and optional cost. [ResultsPage.tsx](../../../apps/site/src/workspace/ResultsPage.tsx#L24) says costs are API-price estimates and asks omit Captain chat questions. A new time summary needs coverage checks; it must not present agent-hours as elapsed delivery time or money saved. |
| Claude §5.6: Team and Results show every agent's spend to everyone. | ❌ Overstated. Member access is real; complete spend is not. | [agentCosts.ts](../../../apps/site/src/workspace/agentCosts.ts#L11) handles only `opencode` agents and may return unknown. [results.ts](../../../apps/site/src/workspace/results.ts#L342) withholds incomplete agent totals. [ResultsPage.tsx](../../../apps/site/src/workspace/ResultsPage.tsx#L159) also warns that traffic totals include other projects. |

These corrections do not establish a winning tab through click counts alone. In particular, my original freshness error and Claude's overstated menu depth should not drive the decision.

## What each proposal missed

| Coverage gap | Who covered it better? | What the final design should retain |
| --- | --- | --- |
| A clearly named entrance to past outcomes | Claude. I treated stronger links as enough and tested Team against Work, not History. | A visible History tab, with short summaries and exact sources. |
| Phone overflow placement | Claude. My header menu added a reach and a placement change. | Keep the fourth bottom slot for More. |
| A past plan reached from its goal | Claude §1.4/6. My mapping preserved plan URLs without solving rediscovery. | Link goal to its plan and replacement, without creating a Plans tab. |
| Combined question and failure, stale reads, offline Captain | Mine §6 gives more precise cases. Claude covers outages but not the hidden-problem combination. | Show independent failures alongside questions; distinguish unknown data from quiet work. |
| Cost scope and missing reports | Mine §6. Claude's weekly History example mixes a daily dollar cap with period time. | Put period usage in History and today's capacity in Team. Label time zone, completeness and project/machine scope. |
| Rights and local legacy records | Mine §5–6 explicitly preserves member edits, local work logs and pinned records. | A navigation change neither narrows rights nor retires older records. Keep local help accessible. |
| Interrupted links and multiple people answering | Mine §6 covers replaced questions, exact commits and stale actions more fully. | Old links show the settled answer; two people must not accept different versions of one request. |
| Queued messages while Captain is offline | Claude proposes accepting them more clearly; mine focuses on recovery. | Preserve supported queued messages, with honest delivery state and a recovery link. |

**Neither fully covered these:**

- **History before delivery:** a research task can be Done without shipping a product change. Show completed work with its outcome, and distinguish shipped code where the record proves it. Keep canceled and reverted work reachable; do not count it as successful delivery.
- **A claim that a problem was handled:** clearing a question or moving a ticket does not prove recovery. History must distinguish a reported problem, a recorded response and a verified resolution. Neither defines the source for that full lifecycle.
- **Browsing beyond four weeks:** both inherit Results' two periods. A top-level History promises more than those windows. Offer an all-time route to Work and Decisions immediately; a future date search must state its actual coverage.
- **Stable context when following links:** History's period/filter, Room's thread and the originating goal need durable navigation. [Room.tsx](../../../apps/site/src/workspace/Room.tsx) currently keeps thread selection in component state. A generic Room link cannot promise to open the cited exchange after reload.
- **Removal scope and ownership transfer:** distinguish leaving one project, removing an agent from that project, revoking its helper identity and deleting a local key. Neither provides the complete owner/Captain handover path.
- **Time totals with overlapping work:** sum recorded agent run time, label it agent-hours, and do not call it wall-clock time or subscription cost. Missing and ongoing runs need explicit treatment.

These are requirements for later design work, not extra implementation or new tickets in this comparison.

## One final navigation to adopt

**Recommendation: Captain / Overview / History, with More and Your account.** Use those same three tabs on desktop and phone; More is the phone's fourth bottom slot. Keep the project switcher and visible Search. This changes my original Team-tab recommendation and the wireframe's navigation, while preserving its Overview layout and DEC-24's separation.

| Destination | What it shows in one line |
| --- | --- |
| **Captain** — first tab and project home | Your conversation, questions, plans and answers, with evidence beside the relevant message. |
| **Overview** — second tab | Current state, needed answers, independent problems, active work, goals and a compact Today section. |
| **History** — third tab | Completed outcomes, period decisions, recorded problems/responses and reported usage, each linked to its source. |
| More → **Team** | People and their agents, ownership, availability, invitations, connection and supported owner controls. |
| More → **Work** | All goals and tickets, opening By goal, with By agent, Later, All tickets and deliberate editing. |
| More → **Team conversation** | The shared Room with threads and optional posting; routine bookkeeping stays folded. |
| More → **Decisions** | Current choices and contracts, rationale, source and replaced history, with existing editing rights. |
| More → **Guide** | Concept, rules and architecture, readable first, with existing member editing. |
| More → **Settings** | Project merge authority; future project pause only when implemented. |
| **Your account** | Name/place, this browser's notifications, sign-out and the AutoKolab source link. |
| **Project switcher** and **Search** | Switch/create projects; find supported records or explicitly choose Tell Captain. |

**What moves:** Team leaves the tab bar for More. Invitations move from Settings to Team. Personal notifications and sign-out move to Your account. Results becomes History's period report and Full numbers detail, retaining calculations, audit export and traffic diagnostics. `/results` must still reach that report; preserve its period selection. Room remains independently reachable in More, with Team and ticket cross-links. Guide and Decisions keep separate named entries and records; History merely previews decisions in its period. Work opens By goal. No records or existing permissions are removed.

History defaults to this week with the existing four-week option. Give longer-lived records a visible “All work” and “All decisions” path. The first view uses short lists, not a combined chat feed or metric dashboard. Keep reported usage usable even before any delivery. Unknown cost stays unknown; time is not a subscription invoice. A no-data state must distinguish no records from a failed read.

Moving Team is conditional on discoverable links: a relevant Overview problem links straight to the responsible agent, setup links straight to Add an agent, and More always contains Team. Those links are implementation requirements; the audit above shows they cannot all be assumed to exist today. Keep local instructions until a hosted action has separately proven authority and behavior.

Only two choices need raghavendra's decision:

1. **Adopt History instead of Team as the third tab?** I recommend yes, with the Team access requirements above. Record the navigation and phone change before implementation. A short task test can still overturn this recommendation.
2. **Keep Guide and Decisions separately named inside More, rather than merge them into Rules?** I recommend yes. It preserves the distinction between project context, standing choices and the period history without changing anyone's rights.

Neither choice authorizes new remote controls, narrower permissions, removal of diagnostics or deletion of records. Those need separate scoped work. No app or original proposal is changed by this review.
