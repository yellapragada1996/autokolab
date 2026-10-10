# S03 · Captain slide-over (⌘L)

- **Source:** `source/LeadSlideOver.dc.html`
- **Picture:** `S03-captain-slide-over.png`
- **Route:** none (overlay on any screen)

## Purpose
Talk to Captain without leaving what you're looking at. Captain already knows which screen and object you're on.

## Layout
A floating panel on the right: 460 px wide (max: viewport − 24 px), inset 12 px from top, right and bottom, radius 18, `--surface`, strong border, large shadow. **Non-modal**: the page behind stays visible and usable (not dimmed).

- **Header:** Captain avatar with live dot, "Captain", **Open full** (goes to S01 at this message), × close.
- **Body:** the last few messages of the same conversation, then the new exchange. Centre note at top: "Captain knows which screen you're on".
- **Quick replies:** up to three chips relevant to the current object ("What's left?", "Who reviews it?", "Pause this ticket").
- **Composer:** context chip "About: Google callback ×" above a single-line input; placeholder "Ask about this ticket" (or "Ask Captain about anything" once the chip is removed). Footer note: "Same conversation as the Captain page: nothing said here gets lost."

## Behaviour
- ⌘L toggles. Focus goes to the input. Esc closes and returns focus.
- The context chip is attached automatically from the current route (ticket, goal, decision, person, agent). Removing it sends the next message without context.
- Messages sent here appear in S01 with a small context label ("About: Google callback").
- Decision cards can appear and be answered here exactly as on S01.

## Acceptance criteria
1. Opens within 100 ms with the last 5 messages already rendered.
2. The page behind keeps scroll position and is still clickable.
3. Context is correct for every route in `02-information-architecture.md`.
