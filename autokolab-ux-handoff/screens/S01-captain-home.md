# S01 · Captain home

- **Source:** `source/LeadHome.dc.html`
- **Pictures:** `S01-captain-home.png` (default), `S01-captain-home--briefing-open.png` (briefing, catch-up and quiet updates expanded), `S01-captain-home--merged.png` (after "Yes, merge it"), `S01-captain-home--typing-big-work.png` (composer hint), `S01-captain-home--narrow-720.png` (narrow window)
- **Route:** `/[project]`

## Purpose

The home of the product. Answers: *What's going on, do you need me, and what do I want next?* A person should be able to open it, read one sentence, answer at most one card, and leave.

## Layout

```
┌ nav 220 ┐┌──────────────────── main (fills) ─────────────────────┐
│         ││ header: [C] Captain · "Your point of contact…"  [Search]│
│ Captain ││ ┌─ column, max-width 780, centred, 28px side padding ─┐ │
│ Work    ││ │ PINNED BRIEFING (sticky top)                         │ │
│ Room    ││ │ ── This morning ──                                   │ │
│ People  ││ │ conversation (messages, cards)                       │ │
│ ─────── ││ │ …                                                    │ │
│ …       ││ │ COMPOSER (sticky bottom)                             │ │
└─────────┘└─┴──────────────────────────────────────────────────────┴─┘
```

One reading column. No right-hand panel (it was removed because it repeated the conversation; see `01-principles.md` P3).

## Content, top to bottom

### 1. Header (56 px)
Captain avatar (neutral tile "C", blue live dot when Captain is working), title "Captain", subtitle "Your point of contact for this project", **Search** button at right (opens ⌘K).

### 2. Pinned briefing (component: `Briefing`)
Sticky to the top of the scroll area with the page background behind it, 22 px above, 14 px below.

- Kicker: blue live dot + "Where we are · updated just now" (12 px, dim). "just now" becomes "2 min ago" etc.
- **Headline sentence** (26 px, 500, -0.02em): state of work + what needs you. The "needs you" clause is amber ("1 thing needs you.") or green when clear ("Nothing needs you.").
- **Next line** (14 px, muted): what Captain will do next. ("Next from me: the sessions column is waiting on your OK, then the callback review.")
- **Who's doing what** link (right of the next line) expands the briefing in place (fade-up), adding:
  - one row per active goal: name (130 px), segmented progress bar (one segment per ticket, coloured by ticket status), "n of m";
  - one row per working agent: name (52 px, muted), a lowercase sentence of what it's doing, step "4 of 7" (or "needs you" in amber); each row links to that agent's ticket; hover shows the owner ("James's agent");
  - **Open the board** link and **Pause everyone** text button.
  The link becomes **Hide**.

Headline rules (generate from state, in this order): `<n> agents are building <goal>` if one goal dominates; otherwise `<n> agents are working on <k> goals`; if nobody is working: `Everyone is idle.` Then the needs clause. Never more than two sentences.

### 3. Day divider
"This morning" / "This afternoon" / "Yesterday" centred between hairlines.

### 4. Conversation messages
Rendered with the `Message` component. Kinds:

| Kind | Look | Example |
| --- | --- | --- |
| Captain message | 28 px avatar tile "C", meta line "Captain · 8:40 am", body 15 px / 1.6, no bubble | "Two goals, six tickets…" |
| Person message | right-aligned bubble, `--surface-raised`, radius 16/16/4/16, meta "You · 9:15 am" above | "We need Google sign-in…" |
| Catch-up card | inside Captain's return message: summary row "● 3 shipped ■ 2 handled · Show all 5"; expands to one line per item | see J2 |
| Plan card | title "Plan · 2 goals, 6 tickets"; status pill. Pending: buttons **OK, start** (primary) and **Change something**; approved: green pill "You said OK · 9:18"; whole card links to S08 | |
| Quiet updates fold | dashed outline row, chevron, "3 quiet updates while you worked · 2 shipped, 1 decided"; expands to mono time + one line each | FYI tier lives here |
| Decision card | amber card (see below) | |
| Heads-up line | Captain message starting "Heads up, no action:" | |
| Live steps | while Captain works: up to three grey lines ("Reading the auth module…") that collapse into one line when done | |

### 5. Decision card (component: `DecisionCard`, variant risky-merge)
- Captain's message above it explains in one sentence why it's the person's call.
- Card: `--amber-bg`, `--amber-border`, radius 16, padding 18.
- Row: "Needs you · database change" (12 px amber) … **How do you know?** link (opens S02 evidence inline).
- **The question** (17 px, 500): one yes/no question generated from the change.
- Evidence chips: "Tests 48 of 48" (green), "Reviewed by me, built by Birch" (green), "Can be undone" (neutral).
- Buttons: **Yes, merge it** (amber primary, 44 px), **Let me look first** (outline → S04), **No, something's off** (text → opens a reason field; see S04 "answered no").
- After yes: card cross-fades to green: ✓ "Merged. Applying the database update on your Mac now; Fjord can carry on." + **Undo**.

### 6. Composer (component: `Composer`)
Sticky bottom. Textarea (2 rows, grows to 8), placeholder "Tell Captain anything — a goal, a question, a change of plan". Footer row: **intent hint** (clock icon + text), voice-note button, send button (white, arrow-up).

Intent hint, live as the person types:

| Input | Hint |
| --- | --- |
| empty | "Big work gets a plan first. Small things I just do." |
| mentions sign-in, auth, login, database, migration, payment, delete, security, dependency | "Sounds like big work — I'll show you a plan before starting" |
| ends with "?" | "A question — I'll answer from the code and the record" |
| anything else | "Small change — I'll just do it and tell you after" |

(The keyword list is a placeholder for the real classifier; the UI contract is the three outcomes.)

## States

| State | What changes |
| --- | --- |
| Needs you (1+) | Headline clause amber; nav badge shows count; the latest open decision card is in the conversation |
| Nothing needs you | Clause green "Nothing needs you."; badge hidden |
| Captain thinking | Live steps under the last person message; send button becomes a stop button |
| Empty project (no messages) | Briefing: "Nobody is working yet." Single Captain message: "I'm set up. Tell me what you'd like built." Composer focused |
| Offline / reconnecting | Thin bar under the header: "Reconnecting… your messages will send when you're back." Messages queue locally |
| Captain unreachable (machine asleep) | Briefing kicker turns grey: "Captain is offline · Raghav's Mac is asleep". Composer still accepts messages: "I'll pick this up when I'm back." |
| Long history | Load older messages on scroll-up in pages of 50; keep the briefing pinned |

## Interactions and keyboard

- ⏎ sends, ⇧⏎ new line. ↑ in an empty composer edits your last message (if Captain hasn't acted on it yet).
- When a decision card is the newest unanswered card, ⏎ with an empty composer focuses its primary button; number keys 1–3 pick its buttons.
- Clicking the nav badge or the amber clause scrolls to the oldest unanswered decision card and briefly highlights it (1 s outline pulse).
- Opening the page scrolls to the first unread message; if none, to the bottom.
- ⌘L elsewhere opens this same conversation in the slide-over (S03).

## Responsive
- ≥ 1100 px: sidebar left.
- < 1100 px: sidebar becomes a top row; column fills width.
- < 640 px: headline 21 px; this is the phone layout (P01) if accessed in a browser.

## Data needed
Project; current person; briefing (headline parts, next action, goals with ticket statuses, working agents with step n/m); messages (paged) with kind and payload; open decisions for this person; Captain presence; intent classification endpoint (fast, < 150 ms) for the hint. See `09-ui-data-contract.md`.

## Acceptance criteria
1. A first-time visitor can say what's happening and whether they're needed within three seconds of load.
2. No fact on the page appears twice (goal progress appears only in the expanded briefing; the plan card does not repeat bars).
3. Answering a decision updates the card, the headline, and the nav badge within 100 ms (optimistic), and rolls back with a visible message if the server rejects it.
4. Undo after merge works until the change can no longer be cleanly reverted; then the card says why Undo is gone.
5. The composer hint changes within 150 ms of typing pause and never blocks typing.
6. Works with keyboard only; screen readers announce new Captain messages politely (`aria-live="polite"`) and decision cards as regions with their question as the label.
