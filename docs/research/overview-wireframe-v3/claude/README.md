# Overview wireframe v3 (Claude)

AK-174 · yvssaratchandra-claude · 17 October 2026

raghavendra's verdict on v2: too bland, doesn't look like an overview, no progress line, and it shouldn't look AI-generated. v3 keeps the same parts and adds only progress lines. The changes are structure, scale and a few small AutoKolab details.

## What's in the folder

| File | What it is |
|---|---|
| `overview.html` | The wireframe. Double-click to open; no server or build needed. |
| `autokolab-logo.svg`, `autokolab-croc.svg` | Unchanged copies from `apps/site/public/brand/`. |
| `busy-cards-dark-desktop.png`, `busy-cards-dark-phone.png` | Busy, Cards, dark, at 1440 and 390. |
| `busy-cards-light-desktop.png`, `busy-cards-light-phone.png` | The same in light. |
| `busy-rows-dark-desktop.png` | Busy in the Rows alternative, for comparison. |

In `overview.html`:

- **Frames:** desktop 1440 × 900 and phone 390 × 844, with the shell from v2: logo, project name and the eight tabs (Captain, Overview, Work, Team, Room, Decisions, Results, Settings). On the phone the tabs are a bottom bar.
- **Eight situations:** busy, questions waiting (two shown plus "and 1 more"), agent stopped, calm, brand-new, 10+ agents (13 agents, 7 goals), loading, load failed.
- **Structure:** Cards (recommended) or Rows.
- **Theme:** dark or light. **Reduce motion** shows what people with that setting see. **Fit to window** scales the frames.
- **Notes:** a slim column on the right. The first note changes with the situation.
- Links inside the frames show where they'd go in the real app.
- `?state=busy&theme=light&layout=rows&shot=desktop` (or `shot=phone`) shows one frame at 1:1 with nothing around it. That's how the screenshots were made.

## Cards or rows: Cards, and why

**One card per goal.** Each card holds the goal's name, its progress line and the agents building it right now. One box answers three questions together: what is being built, how far it has got, and who is on it. With two flat lists (v2) you have to match agents to goals yourself. That matching is what an overview should do for you.

Rules that keep the boxes honest:
- Every box groups a goal and its crew. Nothing else is boxed.
- Agents with no work aren't boxed. They sit in a plain list after the cards, or in the empty grid cell when there's an odd number of cards.
- No box sits inside another. Cards have no border in dark (a slightly lighter fill) and one hairline in light.
- Goals nobody is working on fold into "and 1 more in Work". Every agent always shows.

**Rows**, the alternative, keeps v2's fixed-order agent list and puts each goal's line beside its name. It's calmer and scans better past about 15 agents. But it leaves the matching to you. Cards has a cost too: an agent moves to another card when its work moves to another goal. That move is the news, so I think the cost is worth it.

## Progress, drawn honestly

- **Goals:** one rounded segment per ticket, so "4 of 7 done" is literally four of seven pieces. Croc green = done, blue = being built now, coral = its agent stopped, track = not started. The count sits beside the line in text, so it's never colour alone. A screen reader hears "Checkout, 4 of 7 done, 2 being built now". Over 16 tickets the segments merge into one continuous line.
- **Agents:** the record has the steps an agent planned for its ticket (`ticket_steps`, already used by `glance.ts` for "step 2 of 5"), not how much of the work is done. So an agent shows "step 3 of 5" as one short bar per step, never a percentage. Steps can be re-planned, so the bars show where it is, not how long is left. An agent with no planned steps (Captain while reviewing, Tern in 10+) shows no bars. Its breathing ring alone says it's working: the indeterminate state.
- The ring should breathe only while the agent's runner is reporting. When that stops, the ring goes still and the word changes.

## Character: what makes it AutoKolab

1. **The croc green means done.** The logo's green (#5DC46A) is used for one thing: finished work in the progress lines. The brand colour grows on the page as the project gets done, and colour still only means status. In light, done segments get the croc's dark ink outline, drawn the way the logo is.
2. **The lines are the croc's back.** Rounded segments with small gaps, like the bumps along its spine, not a generic smooth bar.
3. **The croc turns up when there's nothing to report.** Tilted and resting beside "No agents are working right now"; bigger and looking toward "Tell Captain" in a new project. Never on loading or errors, because a failure isn't cute. The SVG is the original, unchanged.
4. **Presence, not dots.** Each agent is a neutral tile with a ring in its status colour. Working rings breathe slowly and out of step with each other. Idle agents are just an outlined tile.
5. **One big sentence.** The heading is 44 px (30 px on a phone), tight and heavy. Everything else is 21 px or smaller. That's the focal point.
6. **Numbers in Geist Mono**, like a build log: counts and steps.
7. **Section titles are sentence case with a hairline** running to the edge, not tiny spaced capitals.

Avoided on purpose: grey count tiles, gradient or purple, emoji, stock icons, a dot per row, even spacing everywhere, a page title competing with the heading.

## Principles applied

1. **One focal point.** The heading is the largest thing by far. A waiting question comes before it by position, and it's the only amber on the page. Squint test: one dark mass (the heading), one colour mass (the green lines).
2. **Five-second path.** Question (if any), then the heading, then the lines (how far), then the rings (who is moving).
3. **Gestalt common region.** A card groups what belongs together: a goal, its progress and its crew. Nothing else is boxed.
4. **Colour only means status (handoff), never colour alone (WCAG 1.4.1).** Green done, blue working, amber needs you, coral stopped. Every one has a word or count beside it. Avatars are neutral.
5. **Honest data.** Ticket counts as segments, agent progress as planned steps, an indeterminate ring when there are no steps. No percentages.
6. **Purpose rule.** Only the settled parts plus progress lines: Needs you, the heading with its "has stopped" clause, every agent with its work or Idle, and goals being built. No Next from Captain, delivered list, freshness label, count tiles or calm footer.
7. **Never hide a failure.** A stopped agent adds a coral clause to the heading, a coral ring and "Stopped" on its row, and a coral segment in its goal's line.
8. **Stable layout.** Inside a card or list the order is fixed (Captain, then by name). Loading shows still shapes where the cards or rows will be.
9. **Contrast (WCAG 1.4.3, 1.4.11).** Text is at least 5.3:1 in both themes, and rings and lines at least 3:1. The page works this out from the colours in use and shows the table in its notes. In light, the croc green alone is only 2.2:1 on white, so the ink outline (16:1) is what makes done segments pass.
10. **Phone and keyboard.** Every phone target is at least 44 px. Each card header and each agent row is one link and one Tab stop. The card itself isn't a link, so there are no links inside links. Visible focus ring.
11. **Calm motion (WCAG 2.3.3).** Only the ring breathing and a 160 ms hover fade. Under reduced motion both stop, and the rings stay as still rings.

## What changed from v2, and why

| v2 | v3 | Why |
|---|---|---|
| "4 of 7 done", no bar | A segmented line per goal plus the count | raghavendra asked for a progress line. Segments keep it honest: each is a real ticket. |
| No agent progress | "step 3 of 5" bars from the ticket's steps, or a ring alone | Shows movement without inventing a percentage. |
| Two flat lists (Agents, Being built) | A card per goal with its crew; agents with no work unboxed below | It reads as an overview: what, how far and who, together. Rows is still one click away. |
| 26 px heading in a 760 px column | 44 px heading, 1120 px wide content, two-column cards | Real scale contrast and a focal point. The desktop no longer looks like a phone page. |
| 7 px status dot beside each word | Status ring round the avatar; working rings breathe | Richer presence, still with the word beside it. |
| Tiny uppercase section labels | Sentence-case titles with a hairline | Less template-like, still quiet. |
| No brand beyond the logo | Croc green means done; croc in calm and brand-new | AutoKolab's own colour and character, used only where they mean something. |
| Cool grey light theme | Warm paper light theme | Sits better next to the croc green. |
| Eye-path markers on the frame | Dropped; the path is in the notes | Fewer bench controls. |
| Notes under the frames | A slim notes column beside them | Asked for in the ticket; easier to read while switching states. |

Kept from v2: the logo, the eight-tab shell, both frame sizes, all eight situations, both themes, status always with a word, the "has stopped" clause, at most two questions plus "and N more", 44 px phone targets, the contrast checks, the focus ring choice and reduced-motion safety.

## Where this goes against the handoff (say so in review)

- **Progress lines.** My v2 spec said "no bar". The ticket reverses that, and this follows the ticket.
- **Done colour.** `tokens.css` has `--green` #5CCB9A for done. This uses the logo's #5DC46A so brand and done are one colour. If kept, the token should change; that's a decision for raghavendra.
- **Light theme** is a proposal; `tokens.css` has none.
- **Focus ring** uses `--text-muted`, as in v2, because `--border-focus` is under 3:1.
- **Geist** loads from Google Fonts, as the site does. Offline, the page falls back to the system font.

## How I checked it

- Opened it in headless Chromium (Playwright) and ran a script over all 8 situations × 2 structures × 2 themes. In every case: neither frame scrolls sideways, no text is under 12 px, every phone link and button is at least 44 px tall, desktop and phone show the same text, and there are no console errors.
- Looked at screenshots of busy, questions, stopped, calm, brand-new, 10+ agents, loading and load failed, in both themes and both widths. Busy at 1440 and 390, dark and light, is in this folder.
- Contrast ratios are computed by the page from the colours in use.
- Squint test: the heading and the green lines are the only masses. Five-second test on busy: "three agents, Checkout over half done, Sign-in started, Wren and Oriole free".
- Not checked: a real screen reader, Safari or Firefox. Fit to window uses CSS `zoom` (Firefox 126 or later).
