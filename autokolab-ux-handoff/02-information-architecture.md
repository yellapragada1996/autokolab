# 02 · Information architecture

## The mental model

There are three depths, and the navigation mirrors them:

| Depth | Where | Question it answers |
| --- | --- | --- |
| Talk | **Captain** (home) | What's going on, what do you need from me, and here's what I want. |
| Look closer | **Work**, **Room**, **People** | Who is doing what, what are agents saying, who's on the team. |
| Rules and records | **Decisions**, **Results**, **Settings** | What's been settled, is it working, how hands-off are we. |

Most people spend nearly all their time on Captain. Everything else is a place you go on purpose.

## Desktop navigation

Left sidebar, 220 px, two groups separated by a divider.

```
[logo] AutoKolab
       2 people · 5 agents        ← hidden below 1100px

Captain              (1)          ← badge = open decisions for *this* person (amber)
Work
Room
People
─────────────
Decisions
Results
Settings

Toronto 11:02  Sweden 17:02       ← one small line, each team member's city; hidden below 1100px
(RY) Raghav
```

- Shortcut hints are **not** printed on items. They appear in the item's tooltip (`title`) and in ⌘K.
- The active item has a filled background (`--surface-active`) and full-strength text; others are muted.
- Below 1100 px wide the sidebar becomes one horizontal row of items across the top (logo, then items, scrollable sideways if needed). The project name, divider, clocks and user hide. See `07-interaction-motion-a11y.md` → Responsive.
- There is no per-agent list or status pill in the sidebar. Live status belongs to Captain's briefing.

## Global overlays (available on every screen)

| Overlay | Open | Close | Spec |
| --- | --- | --- | --- |
| Command bar | ⌘K / Ctrl K, or the Search button | Esc, click outside | S07 |
| Captain slide-over | ⌘L / Ctrl L | Esc, × | S03 |
| Show the work sheet | "Show the work", "See the change", or any record link from Captain | Esc, × | S02 |
| Look first (risky approval) | "Let me look first" on a decision card | Esc, ×, answering | S04 |

## Routes

Suggested for the Next.js App Router. Adjust names to the existing codebase, but keep the structure: one project segment, Captain at the project root, everything else one level down.

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | – | Redirect to the last project the person opened (`/[project]`). |
| `/[project]` | S01 Captain home | The default landing. Scroll position restores to the first unread message. |
| `/[project]?show=[ticket]&tab=summary\|change\|history` | S02 sheet over S01 | The sheet is URL-addressable so it can be shared and survives refresh. |
| `/[project]/look/[askId]` | S04 Look first | Modal route over S01 (intercepting route). Direct visit renders it over Captain home. |
| `/[project]/threads/[agent]` | S05 Side thread | Tabs at the top switch between Captain and open side threads. |
| `/[project]/plans/[planId]` | S08 Plan | Opened from a plan card. |
| `/[project]/work` | S09 Work (board) | `?goal=[id]` filter, `?group=agent\|goal`, `?view=backlog`. |
| `/[project]/work/[ticket]` | S10 Ticket | Ticket key in the URL (`AK-42`). `?detail=1` = Detailed view. |
| `/[project]/room` and `/[project]/room/[thread]` | S11 Room | Default thread = the most recently active goal thread. |
| `/[project]/people` | S12 People | |
| `/[project]/decisions` and `/[project]/decisions/[DEC-n]` | S13 Decisions | Tabs: Guide (Concept, Architecture, Rules) and Decisions. |
| `/[project]/settings` | S14 Settings | Sections: How hands-off, What counts as risky, Machines and updates, Notifications, Invite. |
| `/[project]/results` | S15 Results | `?period=week\|4weeks`. |
| `/[project]/heads-up/[incidentId]` | S16 Heads up | Linked from Captain's catch-up message. |

Conflict cards (S06) and decision cards are **messages in the Captain conversation**, not routes. Each message has a stable ID so it can be deep-linked (`/[project]#m-[messageId]`), which is what notifications open.

## Phone

The phone experience has four tabs:

| Tab | Screen | Notes |
| --- | --- | --- |
| Captain | P01 | Same conversation as desktop, single column, big voice-note button. |
| Work | P03 Goal (and goal list) | Progress per goal; tap through to tickets. |
| Room | S11 in phone layout | Read-mostly. |
| You | P04 What reaches you | Notification tiers, quiet hours, account. |

P02 (Answer a question) is what a blocking notification opens. P05 (Earlier today) is the expanded catch-up list.

Whether the phone app is a PWA or native is not decided. Push notifications with one-tap answers need either native or web push; see `10-build-order.md`.

## What was dropped, and why

| Was | Now | Why |
| --- | --- | --- |
| Overview screen | Captain home's pinned briefing | One sentence of state is enough at a glance; detail opens on demand. |
| Catch up screen | Captain's first message when you return, with "3 shipped · 2 handled" that expands | Returning is a conversation, not a separate page. |
| Goals nav item | The briefing's "Who's doing what" and Work → By goal | Avoids a page that only repeated the plan. |
| "On shift" agent list in the sidebar | Briefing → Who's doing what | It repeated the same information on every screen. |
| Status pill "4 working · 2 machines" in the sidebar | The briefing | Same reason. |
| Right-hand "desk" on Captain home | Removed | It repeated the decision card, plan and briefing (P3). |
| Separate "Guide & decisions" label | "Decisions" with a Guide tab | Shorter label; one place for rules and settled choices. |
| Name "Lead" | **Captain** | Product decision, 10 Oct 2026. |

## Naming in the UI

| Concept | UI word | Never say |
| --- | --- | --- |
| The agent people talk to | Captain | Lead, orchestrator, manager, bot |
| Other agents | agents (by name: Fjord, Birch…) | workers (fine in docs, not in UI copy), bots |
| A unit of work | ticket | task, issue (except when quoting GitHub) |
| A group of tickets toward one outcome | goal | epic |
| Something a person must decide | "needs you" / a decision | approval request, task |
| A settled choice agents must follow | decision (DEC-n), or contract when it's an interface shape | rule, policy |
| Agent-to-agent chat | the Room | channel, Slack |
| Problems that were handled | heads up | incident, alert (fine in code) |
