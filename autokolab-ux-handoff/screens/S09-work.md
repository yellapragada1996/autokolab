# S09 · Work (board)

- **Source:** `source/Board.dc.html`
- **Pictures:** `S09-work-board.png`, `S09-work-board--filtered.png` (filtered to Google sign-in)
- **Route:** `/[project]/work` with `?goal=`, `?group=agent|goal`, `?view=backlog`

## Purpose
*Who is doing what, right now?* A look-closer view; nobody needs to visit it to keep work moving.

## Layout
1. Header: breadcrumb "AutoKolab / Work", **New goal** (white button; tooltip "Shortcut: C").
2. Title row: 28 px sentence that summarises the board ("4 agents building, 1 waiting on you"), sub-line "Lanes are agents; columns are where each ticket is. Cards move by themselves." Right side: goal filter (segmented: All goals · Google sign-in · Who's typing) and view switch (By agent · By goal · Backlog · 9).
3. **Board grid** inside a rounded container (`--surface-sunken`), horizontally scrollable below its min width (980 px):
   - First column 176 px: agent lane header (avatar with status dot + name; hover shows owner, machine, model).
   - Status columns, equal width: **To do**, **Building** (blue label), **Needs you** (amber), **Shipped today** (green), each with a count. **Columns with zero cards are hidden**; a dashed chip under the board says "Hidden while empty: Captain reviewing".
   - Last lane: **Captain**, spanning all status columns with one sentence of its job: "Plans, answers questions and reviews every PR. Never builds and approves the same ticket. Next review: the Google callback, when its tests finish."
4. Footer hints: "Press J K to move between cards, ⏎ to open, C to add a goal".

## Card (component `TicketCard`)
- Building: title (14 px), live step row (blue dot pulse, step text, "4 of 7"), 3 px progress bar with shimmer. Optional one-line note (e.g. "The runner runs its tests: this account blocks Codex's shell").
- To do: dashed border, title, "Next, after the sessions column".
- Needs you: amber card, title, "● OK a risky merge"; links to the decision card in S01.
- Shipped: green-tinted, muted title, ✓, "Merged itself · 10:12".
- **No ticket key on the card face**; it's in the hover tooltip and on the ticket page.

## Behaviour
- Cards animate between columns (layout animation 250 ms) when status changes; never jump.
- Goal filter dims non-matching cards to 28 % opacity rather than removing them, so the layout doesn't shift.
- By goal: lanes become goals; agent avatars move onto cards.
- Backlog: a simple list of to-do tickets grouped by goal, drag to reorder (sends to Captain).

## Acceptance criteria
1. Status changes appear within 1 s of the server event, animated.
2. Empty columns never render.
3. Keyboard: J/K moves card focus across lanes in reading order; ⏎ opens; Esc returns focus to the board.
