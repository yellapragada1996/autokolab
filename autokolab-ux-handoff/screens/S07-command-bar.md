# S07 · Command bar (⌘K)

- **Source:** `source/Command.dc.html`
- **Pictures:** `S07-command-bar--sentence.png` (typing a request), `S07-command-bar--search.png` (searching "board")
- **Route:** none (overlay)

## Purpose
One box that both **talks to Captain** and **finds or does anything**. Also the place where keyboard shortcuts are taught.

## Layout
Modal 720 px max, top offset 110 px, radius 18, over the page blurred and dimmed (`rgba(6,7,10,.72)`, blur 6 px). Enters with a 280 ms pop (fade + 8 px drop + 0.985 scale).

1. **Mode tabs:** Tell Captain · Search · Commands (Tab switches). Default mode is inferred from input; the tabs make it explicit.
2. **Input row:** Captain avatar + one-line input, 20 px text.
3. **Send to Captain box** (shown when the input reads like a sentence: longer than ~18 characters, or no command matches):
   - Title row: send icon, "Send to Captain", **Send ⏎** button.
   - "Captain reads the code, the guide and every decision in force, then writes back with a plan. Nothing big starts until you say OK."
   - Prediction chips (only when relevant): "Touches sign-in, so it counts as big work" (amber-tinted text), "Looks like 2 goals", "Related: DEC-24 sessions contract".
4. **Results list** under a group label ("Suggested" / "Matches"): rows with a 26 px glyph tile, label, hint, and the shortcut in a kbd chip. The first match is pre-selected (filled background).
5. **Footer:** "↑ ↓ move · ⏎ send or open · ⇧⏎ new line · esc close".

## Command catalogue (minimum)
Answer the open decision · Go to Work (G W) · Open the Room (G R) · Open a ticket by name or key · Read a decision by number · Pause every agent (⌘⇧P) · Change merge setting · See this week's results · Invite someone · Talk to an agent (opens a side thread).

## Behaviour
- Matching: every word typed must appear in the label or hint (case-insensitive). Results update per keystroke with no visible delay.
- ⏎ with a sentence → sends to Captain, closes, and shows the message in S01 (or S03 if open).
- Sending from ⌘K behaves exactly like the composer (same intent hint logic).

## Acceptance criteria
1. Results update in < 50 ms per keystroke for up to 2,000 indexed items.
2. Every command shows its shortcut if it has one.
3. A sentence never triggers a command by accident: ⏎ on a sentence always means "Send to Captain".
