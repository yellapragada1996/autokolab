# Overview wireframe v5: every situation (Claude)

AK-176 · yvssaratchandra-claude · 17 October 2026

raghavendra approved v4 (`../../overview-wireframe-v4/claude/`, AK-175). v5 keeps its look, progress lines, review path and heading as they are, and draws them in every situation a real project goes through, on **one scrollable page**. There's no situation switcher: scroll, or use the jump menu.

## What's in the folder

| File | What it is |
|---|---|
| `overview.html` | The wireframe. Double-click to open; no server or build needed. |
| `autokolab-logo.svg`, `autokolab-croc.svg` | Unchanged copies from v4. |
| `a2-dark-1440.png`, `a2-dark-390.png` | You have to act: several things waiting. |
| `a5-light-1440.png`, `a5-light-390.png` | A risky change only the owner can OK, seen by a member. |
| `b8-dark-1440.png`, `b8-dark-390.png` | Brand-new project, nothing connected. |
| `c16-dark-1440.png`, `c16-dark-390.png` | Calm: everyone idle, every goal done. |
| `d19-dark-1440.png`, `d19-dark-390.png` | Stopped: one error, one daily limit. |

**How the page is laid out.** It opens with a jump menu (sticky, with Cards/Rows and Dark/Light) and a list of every situation. Five groups follow, A to E. Each situation has:
- its number and name, and who is looking;
- the desktop frame and the phone frame side by side;
- a caption: what the person sees, what they should do, and where the link goes;
- six facts: the exact heading, what's seen first, what stays quiet, what's hidden because it's empty, where each link goes, and anything that isn't one of the four settled parts.

At the end is **a table of every heading sentence** and **the rules the page follows**: what stands out, the colour legend, motion and contrast.

**Controls** (as in v4): Cards or Rows, Dark or Light, desktop 1440 or 1280, Review path, Reduce motion, Fit to window. New: **Frames: First screen / Whole page** grows every frame to its full height. `?sit=a2&shot=desktop&theme=dark` (or `shot=phone`) shows one frame at 1:1; that's how the screenshots were made.

**One story throughout.** Northstar Shop. Raghav is the owner and runs Captain on their machine. James is a member who asked for Search. Priya is a member who joined today. The agents are Captain, Birch, Fjord, Kestrel, Tern, Oriole, Wren and Moss (plus more in C17). The goals are Checkout, Sign-in, Search and Receipts. Ticket keys stay the same across situations: "Sign-up emails" is always AK-52.

**Rendered from data.** Each situation is a small data entry. Every frame, the heading, the hidden list, the links list and the heading table come from the same Overview code. The design CSS is v4's first 386 lines, copied unchanged; v5's additions follow below it.

## The situations and their headings

| # | Situation | Heading, as code builds it |
|---|---|---|
| A1 | One question waiting | 2 agents are working on Checkout and Sign-in. |
| A2 | Several things waiting (3 shown, "and 2 more in Captain") | 2 agents are working on Checkout and Sign-in. |
| A3 | A plan waiting for approval | 3 agents are working on Checkout and Sign-in. |
| A4 | A risky change waiting for your OK | 3 agents are working on Checkout and Sign-in. |
| A5 | Only the owner can answer, seen by a member | 3 agents are working on Checkout and Sign-in. |
| A6 | A goal held up by your answer | Birch is working on Sign-in. |
| A7 | Something needs you and an agent has stopped | 2 agents are working on Checkout and Sign-in. / Tern has stopped. |
| B8 | Brand-new project, nothing connected | Nothing is connected yet. / Connect your computer to bring in Captain. |
| B9 | Captain connected, no agents yet | Captain is here, but nobody builds yet. / Add an agent to start building. |
| B10 | Agents connected, no goal yet | Nothing has started yet. / Tell Captain what you want to make. |
| B11 | First goal just started | Birch is working on Checkout. |
| B12 | A member who just joined, with nothing to do | 3 agents are working on Checkout and Sign-in. / Tell Captain what you want to make. |
| C13 | Busy (the v4 hero) | 3 agents are working on Checkout and Sign-in. |
| C14 | Only one agent working | Birch is working on Checkout. |
| C15 | A goal nearly done, and a goal just done | 2 agents are working on Checkout and Search. / Sign-in is done. |
| C16 | Everyone idle, every goal done | All 3 goals are done. / No agents are working right now. |
| C17 | Many agents (13) and many goals (7) | 8 agents are working on 5 goals. / Moss has stopped. |
| C18 | Very long names | 3 agents are working on 2 goals. |
| D19 | An agent stopped: an error, and a daily limit | 2 agents are working on Checkout. / Moss and Tern have stopped. |
| D20 | An agent offline with work waiting | 2 agents are working on Checkout. / Oriole is offline with 2 tickets waiting. |
| D21 | Captain offline | 2 agents are working on Checkout and Sign-in. / Captain is offline, so reviews wait until your machine is back. |
| D22 | Everyone paused by the owner | You paused everyone. / Resume everyone when you're ready. |
| D23 | Tests failing on a task | 2 agents are working on Checkout and Sign-in. / Tern has stopped. |
| D24a | Loading | Loading your project… |
| D24b | First load failed | Couldn't load this project. |
| D24c | Refresh failed, last view kept | 3 agents are working on Checkout and Sign-in. (with "Couldn't refresh. This is how things were at 9:41." above it) |
| E25a | Owner view | 3 agents are working on Checkout and Sign-in. |
| E25b | Member view, the same moment | 3 agents are working on Checkout and Sign-in. |
| E26 | First-time viewer on a phone | 3 agents are working on Checkout and Sign-in. / Tell Captain what you want to make. |

"/" marks a new line: each sentence gets its own line, as in v4. That's 26 situations in 29 frames: 24 (loading, first load failed, refresh failed) and 25 (owner, member) have more than one frame.

**The Needs you row for each type** (all open the exact message in Captain; nothing is answered on Overview, per DEC-24):

| Type | Grey line | Link |
|---|---|---|
| A question from an agent | "Fjord is waiting · 2 h" | Answer in Captain → Captain, opened on Fjord's question |
| Captain's own question | "Captain is asking · 1 h" | Answer in Captain → Captain's question |
| A plan | "Captain's plan · 4 tickets, about a day · 10 min" | Review the plan in Captain → the plan message |
| A risky change | "Captain is asking · 25 min · it changes the database" | Review in Captain → the merge request message |
| Holding up a whole goal | "Fjord is waiting · 1 day · Checkout is on hold" | Answer in Captain → Fjord's question |
| More than 3 | "and 2 more in Captain" | Captain, at the oldest open question |
| Waiting on someone else (quiet) | "Only Raghav, the owner, can OK a risky change · Captain is waiting · 25 min" | See it on AK-52 → the ticket in Work, read only |

## What I added or changed from v4, and why

Nothing in v4's design CSS changed. Additions:

| Addition | Why |
|---|---|
| **"Waiting on Raghav" row** (A5, E25): the Needs you row, quieter. 17 px grey words, a hollow amber mark, no Captain count, and it links to the ticket in Work, not to Captain. | The one element outside the four settled parts. A member can't answer an owner-only question, so it isn't "Needs you". But without it, nothing tells the member why Sign-in is held or who can free it. It has no answer control. It shows only when the question holds up a ticket, at most 2 rows. |
| **Waiting words name the person**: "1 waiting on Raghav", "Waiting on Raghav". | The same amber segment and word as v4, but true for whoever is looking. |
| **New heading lines**: setup steps (B8, B9), "You paused everyone." (D22), "Oriole is offline with 2 tickets waiting." (D20), "Captain is offline, so reviews wait until your machine is back." (D21), "Sign-in is done." (C15), "All 3 goals are done." (C16), "Tell Captain what you want to make." for someone who has never written to Captain (B12, E26). | Each fills a situation v4 didn't draw. Each is one sentence on its own line, like v4's "Tern has stopped.". No boxes. The setting-up and paused headings each carry one link: the next step. |
| **One agent is named**: "Birch is working on Checkout." | The spec says so. v4 never drew one agent. Captain alone reads "Captain is reviewing…". |
| **"Paused"** state word, grey with no ring (D22). Paused tickets read "Birch · paused". | "Paused" is a status in the data contract (`09-ui-data-contract.md`). |
| **Refresh-failed line** above the page (D24c): "Couldn't refresh. This is how things were at 9:41." | Worded as in the spec. It reuses v4's failure line (coral dot and words), so it isn't new. It answers how old the view is, which nothing else does. |
| **Rings stop breathing** when nothing on screen is live (paused, stale). | Movement would claim the agents are live when the view can't say that. |
| **A finished goal stays until the end of the day** (C15), with "Finished today at 14:20." in its card. | The spec drops it at the next refresh, so anyone who looked later would never see it finish. |
| **Needs you shows 3 rows**, then "and N more in Captain". | The spec says 3. v4 showed 2. |
| **To-go tickets can say why**: "To go · on hold" (A6), "To go · Oriole, offline" (D20). | The tray and hover label already show a state for every ticket; this fills in the reason. |

## Where the spec or handoff wins, or is gone against

- Same as v4: the done green is the logo's #5DC46A, the light theme is a proposal, the focus ring uses `--text-muted`, and progress lines replace "4 of 7 done".
- **Spec over wireframe:** 3 Needs you rows (v4 had 2) and one agent named in the heading. v4's look of both is unchanged.
- **Against the spec:** a finished goal stays for the day (above).
- **Needs you order:** newest first, as the spec says ("a new question adds a row at the top"). "and N more" opens the oldest.

## What I wasn't sure about

1. **Who answers what.** I assumed: risky merges and "what next" questions go to the owner; a ticket's question goes to whoever asked for its goal (James for Search). If anyone can answer anything, A5 and E25 lose their quiet rows, and the waiting words go back to "waiting on you".
2. **Can a member see an owner-only question at all?** I show it quietly, linking to the ticket in Work, because Captain's chat is the owner's. If Work doesn't show it on the ticket, the link has nowhere to go.
3. **Newest first may hide the longest wait.** In A2, Fjord (2 h) and Tern (3 h) fold under "and 2 more", though they block agents. Oldest first, or blocking first, might be better. I followed the spec.
4. **Where "Pause everyone" lives.** The amendments say it's a project switch the owner can flip, without saying where. I pointed "Resume everyone" to Settings.
5. **Paused tickets stay striped blue** (still in progress), while their agents are grey. Honest about the ticket, but a glance might read the blue as moving. The words say "paused".
6. **A goal with a plan waiting** (A3) gets no card until it has tickets. If raghavendra wants to see it waiting, it would need a card with no line, which would be a new thing.
7. **Offline isn't coral.** Oriole offline with work, and Captain offline, are grey sentences, not coral like "has stopped". The machine may just be asleep. Captain offline does stop all merging, though; coral there is arguable.
8. **"Connect your computer"** (B8) assumes Team is where the connect line lives (S12 People).

## How I checked it

- **Headless Chromium (Playwright), the whole page**, in 16 combinations: Cards and Rows × dark and light × 1440 and 1280 × review path on and off. Each time, across all 29 frames on both widths:
  - no console errors;
  - no frame scrolls sideways;
  - no text under 12 px;
  - every phone link and button is at least 44 px tall (the bottom tab bar is the same as v4);
  - all 29 situations and 29 table rows are there.
- **By eye**, at 1:1: A2, A4, A5, A6, B8, C13 (Rows), C15, C16, C18, D19, D22, D24c and E26, at 1440 and 390. Also the gallery itself: contents, a situation block, the heading table and the rules.
- **Fixed after looking:** the risky question was cut off at two lines on the phone. It's shorter now ("It can't be undone."), and the reason moved to the grey line.
- **Not checked:** a real screen reader, Safari or Firefox, or a real touch device.
