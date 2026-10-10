# S02 · Evidence ("How do you know?") and Show the work

- **Source:** `source/LeadEvidence.dc.html`
- **Pictures:** `S02-evidence-and-show-the-work.png` (evidence open + sheet on Summary), `S02-evidence--the-change-tab.png`, `S02-evidence--history-tab.png`
- **Route:** evidence is inline (no route); the sheet is `?show=[ticket]&tab=summary|change|history` on the current page.

## Purpose

The transparency layers. *Why should I believe this?* (evidence) and *Show me everything* (the sheet). Both are only shown when asked for.

## Part A · Evidence panel (inside a decision card or under any Captain message)

Opened by **How do you know?**; the link becomes **Hide how I know**. Renders inside the card as a darker inset (`#0E0D0A` on amber cards, `--surface-sunken` elsewhere), rows separated by hairlines. Order is fixed:

| # | Row | Icon | Main line | Sub line | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | Tests | green ✓ (coral ✕ if failing) | "Tests: 48 of 48 passed on GitHub" | "6 of them are new and cover this column" | View run |
| 2 | Review | green ✓ | "Reviewed by me at commit 9f3c2e1" | "Checked against the ticket's 'done means'. Birch built it, so Birch couldn't approve it." | – |
| 3 | What changes | lines icon | "What changes: 1 database update, 2 code files" | "+62 −4 lines" | See the change (opens sheet on The change) |
| 4 | Decisions followed | book icon | "Follows DEC-12 and DEC-24" (links) | one-line summary of each | – |
| 5 | Trail | path icon | "Trail: your request → plan → AK-43 → room, 10:31" | "Every step is in the record" | Room |
| 6 | Where I'm less sure | "?" circle | "Where I'm less sure" | Captain's honest uncertainty in 1–2 sentences | – |

Row 6 is **mandatory** whenever Captain has any uncertainty; if it has none, it says "Nothing I'm unsure about here." Never omit the row silently.

Rows with nothing to show are omitted (e.g. no decisions followed). Never show raw chain-of-thought; this is evidence, not reasoning.

## Part B · Show the work sheet

A right-hand sheet that slides in (420 ms, ease-out) over the right side of the page; on desktop it is 460 px min, `flex 1 1 460px`; below 1100 px it becomes a full-width sheet from the bottom. Closes with ×, Esc, or clicking the page.

- **Header:** kicker "Show the work", title = the ticket's plain-English name, close button.
- **Tabs:** Summary · The change · History (`role="tablist"`).
  - **Summary:** one paragraph in plain English; "Built by / Reviewed by / Waiting on it" rows; "Done means" checklist with ticks.
  - **The change:** "The line that matters" (the single most important diff hunk, chosen by Captain, green for additions) then the file list with +/− counts (mono). Full diff opens on GitHub.
  - **History:** mono time + one line per event, oldest first; footer "Written by the database, not by the agents."

## States
- Loading: rows show skeleton lines for ≤ 300 ms, then content (never a spinner).
- Tests still running: row 1 is blue with "31 of 48 so far".
- Evidence unavailable (e.g. CI down): row says so plainly: "GitHub isn't answering right now; tests were passing at 10:46."

## Acceptance criteria
1. Evidence opens in place within 100 ms using data already loaded with the card.
2. "Where I'm less sure" is present on every evidence panel.
3. The sheet is shareable by URL and restores the tab on refresh.
4. Closing the sheet returns focus to the link that opened it.
