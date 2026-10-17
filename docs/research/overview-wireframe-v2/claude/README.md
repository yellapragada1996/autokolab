# Overview wireframe v2 (Claude)

AK-172 · yvssaratchandra-claude · 17 October 2026

A finished-looking wireframe of the simplified Overview: the four settled parts (Needs you, the heading, Agents, Being built) and nothing else. Built from `docs/research/overview-spec/claude-v2.md` and `codex-v2.md`, `autokolab-ux-handoff/tokens.css`, `00-AMENDMENTS.md` and DEC-24.

## What's in the folder

| File | What it is |
|---|---|
| `overview.html` | The wireframe. Double-click to open; no server or build needed. |
| `autokolab-logo.svg` | Copy of `apps/site/public/brand/autokolab-logo.svg`, used by the shell. |
| `busy-1440.png`, `busy-390.png` | Screenshots of the busy state, dark theme, at 1440 and 390 px. |

In `overview.html`:

- **Frames:** desktop 1440 × 900 and phone 390 × 844, side by side, with the shell: logo, project name, and the tabs Captain, Overview (selected), Work, Team, Room, Decisions, Results, Settings. On the phone the tabs are a bottom bar.
- **Eight situations:** busy, questions waiting (two shown plus “and 1 more”), agent stopped, calm, brand-new, 10+ agents (13), loading, load failed. The phone always shows the same one.
- **Theme:** dark and light.
- **Eye path:** numbered markers on the desktop frame for where the eye goes in the first five seconds.
- **Fit to window:** scales both frames to fit your screen. Turn it off to see them at 100%.
- **Notes:** under the frames there are 14 numbered notes, plus one note for the situation you picked.
- Links inside the frames show a short message saying where they'd go in the real app.
- `?state=busy&theme=light&shot=desktop` (or `shot=phone`) shows one frame at 1:1 with nothing around it. That's how the screenshots were made.

## UX principles applied

1. **Visual hierarchy by position, size and weight before colour.** Needs you comes first, the heading is the largest text, and the goal counts are the quietest.
2. **One accent per meaning (pre-attentive colour).** Amber only means needs you, and it's only a 7 px dot. Blue is working, coral is stopped. Idle and offline have no colour.
3. **Never colour alone (WCAG 1.4.1).** Every dot has a word beside it, and dots are hidden from screen readers.
4. **Purpose rule / less but better (handoff P3).** There's no visible page title, no “See all” links, no dividers, no tiles and no freshness line, because each would repeat something already on the page.
5. **Consistent alignment for scanning (Gestalt continuity).** The state words sit at one x position, so the eye runs down them.
6. **Stable layout.** Rows keep a fixed order (Captain, then by name) and never move; only their words change. Loading shapes sit where rows will be.
7. **Progressive disclosure (handoff P2).** The page is the glance. Every row is one link to its detail in Captain, Work or Team.
8. **Never hide a failure (handoff P2).** A stopped agent adds one clause to the heading as well as its row.
9. **Honest progress.** “4 of 7 done” without a bar or percentage, because a bar suggests precision a ticket count doesn't have.
10. **One spacing scale (4/8 px) and one type family (Geist, four sizes, three weights).**
11. **Contrast that passes (WCAG 1.4.3, 1.4.11).** Text is at least 5.6:1 in both themes. Dots and the focus ring are at least 3:1. No text is under 12 px.
12. **Keyboard and screen readers.** Each row is one link and one Tab stop. There's a visible focus ring, a section and heading per part, rows that read as a sentence (“Birch, working, adding saved cards”), and a polite status line when a question arrives.
13. **Thumb-sized targets.** Every tappable thing on the phone is at least 44 px tall.
14. **Calm motion (WCAG 2.3.3).** The only motion is a 120 ms colour fade on hover and press, and it's off under reduced motion.
15. **Plain, specific copy (handoff 08).** The page uses short sentences built from the record, says who is waiting and for how long, and has a plain error with one action.

## Where I went beyond or against the handoff (say so in review)

- **Light theme.** `06-design-tokens.md` says light mode is “not designed”. The ticket asks for a toggle, so the light values here are a proposal, not tokens. The status dots are darker there to stay above 3:1. Dark stays the default.
- **Focus ring.** The `--border-focus` token (`#4A515D`) is only 2.3:1 on `--bg`, under the 3:1 a focus ring needs. The wireframe uses `--text-muted` for the ring instead. I suggest changing the token.
- **Needs you shows at most two requests**, not three as in my `claude-v2.md`. With two, the heading stays on the first phone screen; Codex's v2 also chose two.
- **No “See the team →” or “See all work →” links**, which `claude-v2.md` had. The rows already link, and Work and Team are one tab away.
- **10+ agents: all rows stay.** `claude-v2.md` folded idle agents into one line after eight. That would make rows appear and disappear as agents start and stop, which breaks “rows never jump”. Instead, idle and offline rows are greyed so a long list still scans.
- **Geist** is loaded from Google Fonts, as the site does. Offline, the page falls back to the system font.

## How I checked it

- Opened it in headless Chromium (Playwright) and looked at all eight situations at 1440 and 390, in dark, plus busy, questions and 10+ agents in light. No console errors.
- A script checked every situation:
  - every phone link and button is at least 44 px tall;
  - no frame scrolls sideways;
  - no text is under 12 px;
  - the phone and desktop show the same content.
- Contrast ratios were computed from the colour values; the table is in note 13 of the wireframe.
- I didn't check it with a real screen reader, or in Safari or Firefox. The fit-to-window scaling uses CSS `zoom`, which needs Firefox 126 or later.
