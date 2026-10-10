# S08 · Plan

- **Source:** `source/Plan.dc.html`
- **Pictures:** `S08-plan.png` (proposed), `S08-plan--started.png` (after OK)
- **Route:** `/[project]/plans/[planId]` (opened from a plan card in S01)

## Purpose
The full detail of a plan Captain proposes for big work: *what will happen, in what order, by whom, and when will I be asked?* The plan card in the conversation is the summary; this page is for people who want to inspect or adjust it.

## Layout
Nav + main. Main is a two-part row: the plan (flex 2, min 600) and a narrow side column (flex 1, min 300) that wraps below on narrow screens.

### Plan (left)
1. The person's request as a right-aligned bubble with "You · 9:15 am · from Claude Code on your Mac" (requests can arrive from Claude Code or the web).
2. Captain's reply: meta "Captain · 9:17 am · Opus, high effort", then the reply in 26 px: "Two goals, six tickets. Sign-in touches auth, so it's big work under our rules. **OK to start?**" (question in amber).
3. "What I read" chips: "Read the auth module", "Read the Project Guide", "Checked DEC-12 sessions, DEC-19 presence".
4. **One section per goal** (component `PlanGoal`): header "GOAL 1" (mono), goal name, risk tag ("Big work · auth", amber text), ticket count. Rows (component `PlanTicketRow`):
   - order badge (1, 2, 3… or ↔ for "any time"),
   - title (15 px) and one sub-line: the reason or dependency ("Database migration · goes first, the callback needs it", or Captain's quoted reason for the model choice: "'Opus at high: auth is risky' · after 1"),
   - merge-path tag: **Waits for your OK** (amber text on dark amber) or **Merges itself** (green),
   - model · effort chip (mono, neutral).
5. Actions: **OK, start both goals** (amber primary, 48 px), **Change something** (outline; opens "Tell Captain what to change" textarea), helper text "or reply in Claude Code: 'yes'".
6. Started state: green panel "Started. Six tickets are on the board and agents on both machines are picking them up." + **Watch the board**.

### Side column (right)
- **What you'll be asked:** big number "2" + "decisions, at most", then one line per ask with an amber dot, and a green-dot line: "Everything else merges itself once tests pass and Captain approves the exact commit."
- **Not in this plan:** one sentence listing what's out of scope.

> The wireframe also has a "Who picks it up" panel (four avatars, "By load, across both machines"). **Don't build it**: it doesn't change any decision the person makes here (P3). Assignment shows on the board once started.

## Editing (not wireframed; required)
- Drag a ticket row to reorder (dependencies block invalid moves with a short reason).
- Remove a ticket (row menu → Remove) or move it to "Not in this plan".
- These edits are sent to Captain as structured changes and Captain confirms with an updated plan card.

## Acceptance criteria
1. The number of asks shown equals the number of tickets with "Waits for your OK".
2. Every model/effort choice that differs from the agent's default shows Captain's reason.
3. OK here and OK on the plan card are the same action; whichever happens first wins and the other updates live.
