# Overview, simplified for MVP

17 October 2026 · AK-170 · yvssaratchandra-claude · Replaces my AK-168 proposal (`claude.md`), which was too much.

## 1. Do I agree? Yes.

| Part | Agree? | Why |
|---|---|---|
| 1. **Needs you**, on top, hidden when empty | Yes | Work waits until a person answers. When it's missing, that means nothing needs you. |
| 2. **Heading:** "3 agents are working on Checkout and Sign-in." | Yes | It answers "is anything happening, and on what?" in one line. |
| 3. **Each agent and what it is doing**, idle ones say "Idle" | Yes | It shows who is doing what, and who could take more work. |
| 4. **Goals being built** | Yes | It shows what the work adds up to. |

| Removed | Agree? | Why, and what it costs |
|---|---|---|
| Next from Captain | Yes | Captain talks in the Captain tab. Here it only repeated the rows. |
| Delivered today / Since you last looked | Yes | Cost: someone back after a night can't see here what shipped. The goal counts going up hint at it, and Work has the list. |
| "Updated just now", the freshness line | Yes | Today's is hard-coded and says "just now" even when the page is old. That is worse than nothing. |
| Count tiles, "Free now" line, calm footer | Yes | The heading and the agent rows already say it. |
| Goals' "Next:" step | Yes | It's detail for Work. |
| The "What happened" problem block | Yes, with one small thing kept | A stopped agent's row already says "Stopped" and why. |

**The one thing I keep.** When an agent stops while it has work, the heading adds one clause: "2 agents are working on Checkout. **Tern has stopped.**" Without it, a failure shows only as one word in a list, which goes against "never hide a failure" (handoff P2). It adds no new block.

## 2. Today's build against the new layout

| Today (`Overview.tsx`, `overviewGlance()`) | Change | Why |
|---|---|---|
| Top bar's hard-coded "Updated just now" | **Now:** remove | It's false whenever the data is old. One line in `Workspace.tsx`. |
| Title "Overview" | Keep | It's the `h1`. Needs you goes just under it. |
| State sentence (five versions) under the title | **Now:** reword, move below Needs you | It becomes "N agents are working on X and Y." It drops "nothing needs you", because part 1 already says that. |
| "Next from Captain" | **Now:** remove | One line. |
| "You are needed": up to 2 rows, amber dot, **under** the sentence | **Now:** move above the sentence, allow 3 | Its look already follows DEC-24. |
| "What happened" problem row | **Now:** stop showing | The stopped agent's row and the heading clause carry it. |
| "Who is doing what": only agents with a task, up to 3, **state word hidden on phones** | **Now:** every agent, from `crew()` | `crew()` already gives every agent a word, idle ones included. Showing the word on phones fixes today's dot-only status. |
| "Goals": planned, building and done, up to 2, "Next:" line, "4 of 7 tasks done" | **Now:** only goals in progress; drop "Next:" | It keeps the count. These are filter and one-line changes. |
| "Delivered today", calm note | **Now:** stop showing | Not in the layout. |
| "Start here" for a new project; loading and error text; keeping the last view during a refresh | Keep | They already work. They are the empty, loading and no-flicker states. |
| The unused `next`, `delivered` and `problem` data in `OverviewGlance` | **Later** | Harmless. Remove it at the next tidy-up, so this change stays small. |

The smallest change is one ticket: `Overview.tsx`, the sentence in `glance.ts` with its tests, one line in `Workspace.tsx` and one phone CSS rule. It needs no new data.

## 3. How it looks

It's one column, 760 px wide at most, as built. It uses only `tokens.css` colours. Colour means status only, and **every coloured mark has a word beside it**. Nothing pulses or animates.

**Part 1 · Needs you**
- **Stands out by** being first and having the only amber on the page. Each row has a 7 px amber dot, then ordinary 15 px `--text`. There's no fill, amber text or icon. The label "NEEDS YOU" is 12 px `--text-muted`.
- **Words:** "Should guests be able to save cards?", then a grey line, "Fjord is waiting · 2 h", and **Answer in Captain →**. Others: "OK to merge: receipt emails", "OK Captain's plan for Checkout".
- **Empty:** not shown, with no gap left. **Long:** one sentence, cut at about 110 characters with "…". Up to 3 rows, then "and 2 more in Captain →".
- **Changes:** a new question adds a row at the top, and the page moves down, because that's the news. Scroll anchoring keeps a scrolled reader in place. An answered row goes away.
- **Link:** the row opens that exact message in **Captain**.

**Part 2 · Heading**
- **Stands out by** being the largest text: 26 px (21 px on phones), weight 560, `--text`. It has no colour or icon.
- **Words** (built by code):
  - "3 agents are working on Checkout and Sign-in."
  - "Birch is working on Checkout."
  - "4 agents are working on Checkout, Sign-in and 1 more goal."
  - "Birch is working on small fixes."
  - "… Tern has stopped."
- **Calm:** "No agents are working right now." **Brand-new:** "Nothing has started yet. Tell Captain what you want to make." (as today).
- **Long:** at most two goal names, each cut at about 40 characters. **Changes:** the text is replaced in place. Captain counts as working while it reviews.

**Part 3 · Agents**
- **Each row:** a neutral grey initial (`--avatar-bg`), the **name** in bold, what it's doing, and the **state word** on the right (12 px `--text-muted`). A small dot goes before the word:

  | Word | Dot | Doing |
  |---|---|---|
  | Working, Reviewing | blue | "adding saved cards", "reviewing Birch's work" |
  | Waiting on you | amber | "adding guest checkout" |
  | Stopped, Limit reached | coral | "was sending receipt emails · tests failing" |
  | Idle | none, row in `--text-muted` | "nothing to do" |
  | Offline | none, row in `--text-muted` | "last seen 3 h ago" |

  Today's "Free" and "Idle" become one word, **Idle**.
- **Order:** Captain first, then by name, and it **never reorders**. Each agent stays in the same place, and only its word changes.
- **Empty:** with no agents, only "Start here" shows. **Long:** names are cut at about 16 characters, and the doing text wraps to 2 lines at most. With more than 8 agents, idle and offline ones fold into one line: "Also idle: Wren, Kestrel and 4 more → Team".
- **Changes:** the word, the dot and the text change in place. Rows keep their height (57 px or more, as built).
- **Links:** a row opens its work in **Work**. Idle and offline rows open **Team**. "See the team →" is under the list.

**Part 4 · Goals being built**
- **Each row:** the goal name (15 px, weight 600) and "4 of 7 done" on the right (13 px `--text-secondary`). There's no bar, percentage or colour. The label is "BEING BUILT".
- **Empty:** hidden. **Long:** up to 5 goals in the order they were made, then "and 2 more → Work". A name may wrap, but the count doesn't.
- **Changes:** the count updates in place. A finished goal leaves the list at the next refresh.
- **Links:** a row opens **Work**, grouped by that goal. "See all work →" is under the list.

**Across the page**
- **Phone (390 px):** the same order, with nothing cut and 20 px margins. An agent row is two lines: "Birch · ● Working", then the doing text. **The word stays visible.** Tap targets are 44 px or more.
- **Keyboard:** each row is one link and one Tab stop, in reading order, with a visible focus ring.
- **Screen readers:**
  - Each part is a `section` with an `h2`.
  - A row reads as "Birch, working, adding saved cards".
  - Dots are `aria-hidden`, because the word carries the meaning.
  - A hidden polite status says "1 question needs you" when the number of questions goes up.
- **Contrast** (checked against `--bg`): `--text` 16.3:1, `--text-muted` 8.2:1, `--text-dim` 5.7:1. Dots: amber 11.8:1, blue 8.1:1, coral 8.5:1. Avatar initials 9.3:1. No text is under 12 px.
- **Loading:** "Loading your project…", as today. A refresh keeps the last view until the new one is ready.
- **Error:** one `role="alert"` line under the title in `--coral-text`: "Couldn't refresh. This is how things were at 9:41." The old view stays below it.

## 4. Sketches

Desktop, busy:

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ Captain    │  Overview                                                    │
│▸Overview   │                                                              │
│ Work       │  3 agents are working on Checkout and Sign-in.               │
│ Team       │                                                              │
│ …          │  AGENTS                                                      │
│            │  [C] Captain  reviewing Birch's work       ● Reviewing       │
│            │  [B] Birch    adding saved cards           ● Working         │
│            │  [F] Fjord    adding Google sign-in        ● Working         │
│            │  [W] Wren     nothing to do                  Idle            │
│            │  See the team →                                              │
│            │                                                              │
│            │  BEING BUILT                                                 │
│            │  Checkout                                       4 of 7 done  │
│            │  Sign-in                                        1 of 3 done  │
│            │  See all work →                                              │
└────────────┴──────────────────────────────────────────────────────────────┘
```

Desktop, a question waiting:

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ Captain    │  Overview                                                    │
│▸Overview   │                                                              │
│ Work       │  NEEDS YOU                                                   │
│ Team       │  ● Should guests be able to save cards? Answer in Captain →  │
│ …          │    Fjord is waiting · 2 h                                    │
│            │                                                              │
│            │  2 agents are working on Checkout.                           │
│            │                                                              │
│            │  AGENTS                                                      │
│            │  [C] Captain  reviewing Birch's work       ● Reviewing       │
│            │  [B] Birch    adding saved cards           ● Working         │
│            │  [F] Fjord    adding guest checkout        ● Waiting on you  │
│            │  [W] Wren     nothing to do                  Idle            │
│            │                                                              │
│            │  BEING BUILT                                                 │
│            │  Checkout                                       4 of 7 done  │
└────────────┴──────────────────────────────────────────────────────────────┘
  ● next to Needs you and Waiting on you = small amber dot.
  ● next to Working and Reviewing = blue.
```

Phone (390 px), busy on the left and a question waiting on the right:

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Overview                     │   │ Overview                     │
│                              │   │                              │
│ 3 agents are working on      │   │ NEEDS YOU                    │
│ Checkout and Sign-in.        │   │ ● Should guests be able to   │
│                              │   │   save cards?                │
│ AGENTS                       │   │   Fjord is waiting · 2 h     │
│ [C] Captain · ● Reviewing    │   │   Answer in Captain →        │
│     reviewing Birch's work   │   │                              │
│ [B] Birch · ● Working        │   │ 2 agents are working on      │
│     adding saved cards       │   │ Checkout.                    │
│ [F] Fjord · ● Working        │   │                              │
│     adding Google sign-in    │   │ AGENTS                       │
│ [W] Wren · Idle              │   │ [C] Captain · ● Reviewing    │
│     nothing to do            │   │     reviewing Birch's work   │
│                              │   │ [B] Birch · ● Working        │
│ BEING BUILT                  │   │     adding saved cards       │
│ Checkout        4 of 7 done  │   │ [F] Fjord · ● Waiting on you │
│ Sign-in         1 of 3 done  │   │     adding guest checkout    │
├──────────────────────────────┤   ├──────────────────────────────┤
│ Captain  Overview  Work  …   │   │ Captain  Overview  Work  …   │
└──────────────────────────────┘   └──────────────────────────────┘
```

## 5. Open questions for raghavendra

| # | Question | My recommendation |
|---|---|---|
| 1 | Drop "Delivered today" completely for the MVP? | **Yes.** The goal counts show progress, and Work lists what's done. Add one line back only if people keep asking "what got done?". |
| 2 | Agents in a **fixed order** (Captain, then by name) or **working first**? | **Fixed.** Nobody jumps around, and the word shows the state. |
| 3 | Should the heading add "Tern has stopped." when an agent stops with work? | **Yes.** It's one clause, and without it a failure can hide in the list. |
