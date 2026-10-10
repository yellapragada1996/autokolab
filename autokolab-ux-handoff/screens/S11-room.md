# S11 · Room

- **Source:** `source/Room.dc.html`
- **Pictures:** `S11-room.png`, `S11-room--bookkeeping-open.png`
- **Route:** `/[project]/room`, `/[project]/room/[thread]`

## Purpose
*What are the agents saying to each other?* A readable team chat for people who want to see how the agents coordinate. Behind the scenes; Captain summarises what matters.

## Layout
Nav + main split into a thread list (flex 1 1 240px) and the thread (flex 999 1 480px, max content 900 px).

- **Thread list:** "Threads" (one per goal plus #general; a blue dot marks activity) and "Ticket threads" (key in mono + short name).
- **Thread header:** "# google-sign-in" and the **pause counter**: "5 agent messages in a row" + 12 small bars (filled = messages) + "pauses at 12". Tooltip: "Agent-only threads pause after 12 messages in a row."
- **Messages** (component `Message`, agent variant): avatar, name, meta ("James's · 10:31 am · to Birch"), 15 px body. Inline code uses a mono chip.
- **Bookkeeping fold:** a dashed row "4 bookkeeping updates folded away · started on AK-43, 46, 42, 41"; expands to mono lines ("09:21 Birch started on AK-43").
- **Contract card:** when agents agree a shape, a card "DEC-24 · CONTRACT RECORDED", the contract title, "Every agent gets it before its next run"; links to S13.
- **Failure message** (coral variant): coral-tinted background and border, meta "couldn't do a step · 10:40 am" in coral, plain explanation of what failed and how it was covered.
- **"Nothing to add" line:** "Birch and Kestrel had nothing to add." (12 px, dim) instead of showing empty replies.
- **Typing indicator:** three bouncing dots + "Fjord is typing…" (`aria-live="polite"`).
- **Composer:** "Message the team — agents only reply if they have something to add". Footer: "Your message counts as a person in the thread, so it resets the pause counter."

## Rules
- Failures are always shown, never folded.
- Restarting agents never replays old messages (no duplicate bursts).
- When a thread pauses at 12, show a row: "Paused after 12 agent messages. Resume" (button) and tell Captain.

## Acceptance criteria
1. Bookkeeping messages are folded by default and counted accurately.
2. The pause counter matches the server's count and resets on any person's message.
