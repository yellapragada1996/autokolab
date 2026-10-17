# Overview: four parts, less to read

AK-169 · Independent proposal; invented examples. Claude's v2 unread.

## Do I agree?

**Yes.** This answers what needs me and what is happening.

1. **Requests first:** decisions matter before routine activity.
2. **Working sentence:** count and work names answer immediately.
3. **Every agent:** explicit idle rows explain absence.
4. **Current goals:** names establish scope without repeating tickets.

Remove Next from Captain (unnecessary promises), What changed (history belongs in Work), routine freshness (another label), count tiles (repeat the heading), goal next steps and task fractions (detail belongs in Work), Free now (duplicates agent rows), and separate problem/hold classes (too much structure).

Keep failures beside affected agents/goals and load errors **inside these parts**; otherwise silence looks like success. Never invent recovery. Catch-up/progress require Work; acceptable for MVP.

## Smallest change from today's build

Checked [Overview](../../../apps/site/src/workspace/Overview.tsx), [glance](../../../apps/site/src/workspace/glance.ts), [shell](../../../apps/site/src/workspace/Workspace.tsx), [wireframe](../overview-wireframe/README.md), and earlier [Codex](codex.md)/[Claude](claude.md) proposals. AK-156/158 today:

| Today | MVP choice and reason |
| --- | --- |
| State sentence, then Next from Captain, then requests | **Change now:** reorder/reword; delete Next. Answers first.|
| Two requests, Captain links, small amber marks | **Keep:** fits. **Change now:** “2 more in Captain” exposes overflow. |
| Three task-bearing agents; idle agents omitted | **Change now:** all agents, Captain included. Shows availability. |
| Two goals, including future/completed; next steps/fractions | **Change now:** all started, unfinished goals, including review/waiting/stopped. Names clarify scope. |
| Conditional What happened, Delivered today, setup checklist, calm footer | **Change now:** failures into rows; setup into empty heading. Delete blocks: four parts suffice. |
| Desktop shell says “Updated just now” unconditionally | **Change now:** delete; avoids false freshness. |
| Neutral avatars, separators, single column, retained data during reload | **Keep. Change now:** Work/Team links for detail; phone status words for clarity. |
| No count tiles, Free now, or general What changed feed | **Later / omit:** these, timers, freshness subsystem, navigation redesign. Unneeded for MVP. |

Proposed change to the wireframe/amendment recipe, retaining DEC-24's plain chat and small amber mark; not a recorded decision.

## Design of the four parts

**1 · Needs you.** First below the page title; no filled box. Semibold 15px label, small amber dot, ordinary 15px question: “Should guests save cards?” Under it: **Answer in Captain** at that question; approvals use **Review in Captain**. Two oldest requests, counted overflow; hide empty, wrap long questions intact.

**2 · Heading.** Neutral 26px medium text, 21px on phone: “3 agents are working on Checkout and Sign-in.” Count agents running here, including review; never assignments. After two names: “and 2 other goals”; ungrouped work uses task names. Wrap long names. Calm: “No agents are working right now.” New: “Nothing has started. Tell Captain your first goal.” Without Captain: “Connect Captain” → Team.

**3 · Agents.** Bold names, ordinary status/task text, neutral avatars; no status icons. “Birch: working on payment retries”; “Wren: idle”; “Tern: stopped — daily limit”; “Fjord: offline”. Also “reviewing”, “waiting for your answer”, “working elsewhere”. Names → Team; tasks → Work records. Concurrent tasks share one row. Empty: “No agents connected. Open Team.” All agents remain; long text wraps; page scrolls.

**4 · Goals in progress.** Small semibold heading; plain linked names: “Checkout → Work”. Hide empty; include waiting goals. If no agent row owns a failure: “Checkout — tests failed”. All current goals, Work order, wrapping names; no bars/badges.

**Shared behaviour.** Use existing tokens: 24px between parts, 12px row padding, 15px body, minimum 12px. Neutral underlined links; amber only for requests. At 390px, one column with 20px sides; links wrap below text, status words remain, targets are 44px. Preserve readable contrast (4.5:1 text, 3:1 focus indicators), visible keyboard focus, semantic headings/lists and descriptive links; hide decorative avatars/dots from screen readers.

All parts: stable keys/order, retained content, no animation or activity-based sorting. Preserve focus/scroll anchors as rows change; announce new requests politely. Loading: “Loading your project…”; failure: “Couldn't update. Showing last known information. Retry.” Use the heading area; omit “last known” without prior data. No empty/calm claims before required reads succeed.

## Sketches

Busy desktop (shell unchanged; arrows are links):

```text
Overview
3 agents are working on Checkout and Sign-in.

Agents
Birch: working on payment retries → Work
Fjord: working on Google sign-in  → Work
Captain: reviewing receipts       → Work
Wren: idle                        → Team

Goals in progress
Checkout → Work
Sign-in  → Work
```

Busy phone, 390px:

```text
Overview
3 agents are working on
Checkout and Sign-in.

Agents
Birch: working on payment retries
  Open in Work
Fjord: working on Google sign-in
  Open in Work
Captain: reviewing receipts
  Open in Work
Wren: idle → Team

Goals in progress
Checkout → Work
Sign-in → Work
```

Question waiting, desktop / phone (same rows continue below):

```text
Overview                         Overview
• Needs you                      • Needs you
Should guests save cards?        Should guests save cards?
Answer in Captain →              Answer in Captain →

2 agents are working on          2 agents are working on
Checkout and Sign-in.            Checkout and Sign-in.
Agents                          Agents
Birch: waiting for your answer   Birch: waiting for your answer
[Remaining agents as above]     [Remaining agents as above]
Goals in progress               Goals in progress
Checkout → Work                  Checkout → Work
Sign-in → Work                   Sign-in → Work
```

## Questions for raghavendra

1. Keep task fractions? **Recommend no:** names establish scope; Work explains progress.
2. Keep stopped goals visible? **Recommend yes:** a pause must not make a feature disappear.
