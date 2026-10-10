# S10 · Ticket

- **Source:** `source/Ticket.dc.html`
- **Pictures:** `S10-ticket.png` (Plain), `S10-ticket--detailed.png` (Detailed: file list visible)
- **Route:** `/[project]/work/[ticket]`, `?detail=1`

## Purpose
*What exactly is this, and is it right?* The deepest view of one unit of work.

## Layout
Header: breadcrumb "AutoKolab / Work / AK-42", **Plain | Detailed** toggle at right. Main: content column (flex 2, min 600) + details column (flex 1, min 280; wraps below on narrow).

### Content column
1. Status pills: "● Building · step 4 of 7" (blue), "Auth · waits for your OK to merge" (amber text on dark amber), "Goal: Google sign-in" (neutral, links to goal).
2. Title: key in mono muted ("AK-42") + name (34 px).
3. **Plain summary** (17 px, secondary): what it does for a user, then where it is now. 2 sentences.
4. **Live steps** (component `StepList`): one row per step; done = green tick in a circle, current = spinning ring (blue) with blue text, upcoming = empty circle; the step where a person acts uses an amber ring and an amber suffix ("· auth is a risky change"). Connector lines between steps (green for done). Time at right (mono). A step can include a link (e.g. "agreed DEC-24").
5. **Pull request box:** header "Pull request #219 → main" + "6 files · +184 −12". Three cells:
   - Tests: progress bar (green passed + blue shimmer running), "31 of 48 passed · none failed".
   - Captain's approval: "Not yet · reviews when tests finish", note "Fjord can't approve its own work".
   - Merge: "Waits for your OK", note "Pinned to the approved commit".
   - Detailed view adds the file list (mono, +/− counts) and "+ 2 more · open on GitHub".
6. **The brief** ("written by Captain at 9:20 am"): tiles "What to do", "Not in scope"; a "Done means" checklist (ticked items green; unticked empty squares).
7. **History:** mono time + one line; footer "Every line here is written by the database, not by the agents."

### Details column
- **Assignee:** avatar, name, "James's agent · Linux · Sweden"; Model; Effort (5-segment meter, neutral grey fill); "Set by Captain for this ticket: 'auth is risky'".
- **Limits:** "Time on this ticket 41 of 90 min" + bar; "James's daily limit 2.4 of 6 h" + bar; note "Limits are James's, enforced on his machine".
- **Where:** Branch (mono), Depends on (link), Blocks, Decisions in force (links).
- Link row: "3 messages about this ticket →" (Room thread).

## Acceptance criteria
1. Plain view never shows file paths; Detailed adds them without moving anything above.
2. The approval cell can never show the assignee as the approver.
3. Steps update live; the current step's spinner respects reduced motion (becomes a static half ring).
