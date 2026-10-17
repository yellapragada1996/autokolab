The app has **3 tabs:**

| Tab, in order | Its one purpose | Part of the theme it serves |
| --- | --- | --- |
| **Captain** | Tell Captain what you want and answer its questions. | People give direction through one conversation. |
| **Overview** | See what is happening and whether you are needed, at a glance. | Everyone can understand the project's progress. |
| **Team** | Bring people and their agents into the project and keep them connected. | Agents collaborate across computers, places and time zones. |

Captain opens first. Desktop and phone have the same tabs. **More is a menu, not a fourth tab:** Work, Team conversation, Decisions, Guide, Results, Settings. No History tab.

AK-163 recommendation, 17 October 2026. Keeps DEC-22's single contact and DEC-24's chat/Overview split. Adoption needs a navigation decision replacing the older handoff's desktop/phone lists. Permissions stay unchanged.

## Captain

**Purpose:** Tell Captain what you want and answer its questions.

**Theme fit:** Captain manages the project for people.

**Only here:** Conversation, questions, answers, plans and their detail; plan acceptance, change requests, independent review approval and separate risky-release permission. “Look first” belongs to its question.

**Not here:** Progress/catch-up lists → Overview; work/proof → More → Work; saved choices → More → Decisions; connections → Team. Captain can explain choices conversationally, linking their saved reasons.

**Person does:** Request, ask, read, answer. Plan/work pages link back to the single answer control in chat.

## Overview

**Purpose:** See what is happening and whether you are needed, at a glance.

**Theme fit:** Understand progress across time zones without following every conversation.

**Only here:** Project state and “Next from Captain.” Following the wireframe: linked summaries of questions, problems, current work, goals and today; setup guidance while needed.

**Not here:** Answers → Captain; full work → More → Work; connection controls → Team; spending → More → Results.

**Person does:** Look and follow links, never edit. Show problems alongside questions; stale information must not imply everything is fine.

## Team

**Purpose:** Bring people and their agents into the project and keep them connected.

**Theme fit:** Shows whose agent runs where and who can reconnect it.

**Only here:** People, roles, places/times, ownership, computers, connection state, last contact, invitations, pairing, Captain selection, model settings, configured limits and local recovery instructions.

**Not here:** Assignments/counts/steps → More → Work; actual usage/spend → More → Results; messages → More → Team conversation; release policy → More → Settings.

**Person does:** Invite, connect, choose Captain, recover their agent. Local instructions must not look like working remote controls.

## Overlap check

**H** = single home; **S** = Overview summary/link; **—** = absent. Menu pages count as homes. Links identify and open homes without copying content. Popups belong to their home wherever opened.

| Fact or feature | Captain | Overview | Team | Non-tab home |
| --- | --- | --- | --- | --- |
| Project state; next from Captain | — | H | — | — |
| Requests, questions waiting for me, answers | H | S | — | — |
| Proposed plans; acceptance or change | H | S | — | — |
| Review approval; risky-release permission | H | S | — | — |
| All work, including finished work | — | S | — | More → Work |
| Who is doing what; steps; goal progress | — | S | — | More → Work |
| Delivered changes; proof; work history | — | S | — | More → Work |
| Work failures and their explanation | — | S | — | More → Work |
| People, ownership, connection failures | — | S | H | — |
| Invitations, joining, adding agents | — | S | H | — |
| Captain selection; models; configured limits | — | — | H | — |
| Agents' conversation and optional replies | — | — | — | More → Team conversation |
| Settled choices, reasons, replacements | — | S | — | More → Decisions |
| Project concept, architecture, standing rules | — | — | — | More → Guide |
| Delivery measures; time, usage and cost | — | — | — | More → Results |
| Technical counters; downloadable reports | — | — | — | More → Results |
| Project release policy | — | — | — | More → Settings |
| Notification preferences | — | — | — | You → Notifications |
| Own profile editing; account access | — | — | — | You → Profile / Sign out |
| Find a page or work item | — | — | — | Search popup |
| Switch/create a project | — | — | — | Project switcher |

Results owns measures; delivery/decision lists open filtered Work/Decisions. Guide links to decisions without copying reasons. Downloads export existing information. Team shows connection state; Work owns assignments.

## Where today's pages go

| Today's page or feature | One destination; change |
| --- | --- |
| Captain chat, replies, question actions | Captain; keep. Automatic catch-up/quiet-update lists → Overview. |
| Plans, Look first, question resolution, independent approval, risky-merge OK | Captain; detail links remain, answer controls live in chat only. |
| Overview and setup prompts | Overview; keep brief summaries and links. |
| Work, By agent, By feature, Later, All tickets | More → Work; view selector, default By goal. No extra app tabs. |
| Tickets, goals, children, dependencies, steps, comments, editing, creation, filters, sorting, ranking | More → Work; preserve all work states and deliberate manual controls. |
| How do you know?, Show the work, change/history, tests, review evidence, uncertainty, code links, safe revert | More → Work detail; one shared proof popup, reachable from Captain or Overview. |
| Room, threads, mentions, replies, folded agent activity | More → Team conversation; keep optional posting. Remove duplicate roster. |
| People/Team, agent details, model/effort, connection help, Captain selection | Team; assignments become links to Work. |
| Connect route/dialog, pairing, completion message | Team → Add an agent; completion still drafts a request to Captain. |
| Settings invitations and Team's add-by-name | Team → Invite people; one place for creation, copying, expiry and cancellation. |
| Invitation acceptance and error pages | Team's joining flow, reached by invitation link before project access. |
| Decisions, replaced choices, contracts, create/replace controls | More → Decisions; keep current access rights. |
| Guide, Concept, Architecture, Rules, editor and starter rules | More → Guide; keep current access rights. |
| Results, period selection, review/delivery measures, usage, traffic, CSV/JSON export | More → Results; move Team's actual spend here, with scope and missing-data notes. Estimates remain labelled estimates. |
| Settings merging controls | More → Settings. |
| Browser notifications | You → Notifications; notification itself opens Captain's question, with no separate inbox. |
| Welcome/profile editing, sign-in/session recovery, sign-out | You → Profile / Sign out; sign-in is the account entry flow. |
| New project, repository/prefix setup, project switching | Project switcher → New project or selected project. |
| Search, keyboard navigation and action shortcuts | Search popup; shortcuts open the owning page/control instead of duplicating it. |
| AutoKolab source link | You → AutoKolab on GitHub. |
| Old URLs, shared sheets, errors and retries | Keep links to the same homes and feedback beside the affected action. |
| Development previews | Developer-only links; no project menu entry. |
| Unrelated Create buttons, Room roster, duplicate answer/spend displays | Removed placements only; underlying capabilities remain above. |

## Menus and non-tabs

- **More:** Work, Team conversation, Decisions, Guide, Results, Settings. Specific inspection/configuration jobs, reachable without Captain; no six extra permanent tabs.
- **You:** Profile, Notifications, AutoKolab on GitHub, Sign out. Personal actions.
- **Project switcher:** existing projects, New project. Chooses the project.
- **Search:** navigation popup. Plans, proof, joining and connection are details. Phone: Captain / Overview / Team / More below; Search, You and project switching above.

**Needs to be built:** You menu; moves/removals above; linked Overview rows; Work's goal default; broader search; blocking-only notifications, phone push and quiet hours. Today's notifications are per browser with an open project tab. Future Pause everyone → Settings; remote controls need separate work. Local setup, secrets, updates and older helper logs stay local; Team provides instructions.

## What changed, and the one question

My [original proposal](../tabs-codex/proposal.md) kept Team; my [comparison](../tabs-compare/codex-review.md) then favoured History. I now return to Team: the app's distributed-agent promise deserves a visible home, while my proposed History repeated Work and Decisions and became another overview. My earlier duplicate approval controls and Team/Results spending displays also broke this ticket's stricter rule; the single homes above fix them. More replaces Project to distinguish it from project switching. This is a recommendation from the [two proposals](../tabs-claude/proposal.md), [both reviews](../tabs-compare/claude-review.md), [current routes](../../../apps/site/src/lib/router.ts), [current shell](../../../apps/site/src/workspace/Workspace.tsx) and [Overview wireframe](../overview-wireframe/README.md), not a usability finding. **Only raghavendra can answer: Shall Captain, Overview and Team, with the six-page More menu above, become the final navigation on both desktop and phone?**
