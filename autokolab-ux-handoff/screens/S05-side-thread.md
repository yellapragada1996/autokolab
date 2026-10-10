# S05 · Side thread with a worker

- **Source:** `source/SideThread.dc.html`
- **Picture:** `S05-side-thread.png`
- **Route:** `/[project]/threads/[agent]`

## Purpose
Let a person speak to one agent directly without breaking the rule that Captain is the single point of contact.

## Layout
Same frame as S01 (nav + one centred column, max 760 px). The header becomes **tabs**: "Captain" (avatar C) and one tab per open side thread ("Fjord · side thread", avatar F with live dot). At the right of the tab row: **Talk to another agent** (opens an agent picker: neutral avatar + name per agent).

Content, top to bottom:
1. **Notice** (surface card with an eye icon): "You're talking to Fjord directly. Captain sees this thread and keeps the plan in sync."
2. Messages: person bubbles right; the agent's messages left with its avatar and "Fjord · 11:06 am".
3. **Captain note** (inline, indented 40 px, dashed outline, small C avatar): what Captain changed as a result ("I updated the Google callback's brief: use the existing error toast. No other ticket is affected.") with **See what changed in the brief** (opens S02 sheet on The change of the brief).
4. Composer: "Message Fjord". Footer: "Side threads never skip the rules: Fjord still can't approve its own work."

## Rules
- If the instruction changes a ticket's brief or scope, the agent must tell Captain and Captain must post a note in the thread. If it affects other tickets, the note lists them.
- If the instruction is big work (per J3), the agent replies "That's big work, so Captain will plan it" and Captain posts a plan card in the Captain tab.
- Side threads close themselves after 24 h of silence (tab disappears; history stays in the Room under the ticket thread).

## Acceptance criteria
1. Every brief change caused by a side thread produces a Captain note in the thread and a history line on the ticket.
2. Captain's tab shows a dot when Captain has posted something new while you're in a side thread.
