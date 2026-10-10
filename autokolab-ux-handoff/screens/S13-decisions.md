# S13 · Decisions

- **Source:** `source/Decisions.dc.html`
- **Picture:** `S13-decisions.png`
- **Route:** `/[project]/decisions`, `/[project]/decisions/[DEC-n]`

## Purpose
*What's been settled?* Settled choices and contracts that every agent receives before every run, plus the Project Guide.

## Layout
Header tabs: **Concept · Architecture · Rules** (the Project Guide, read-mostly markdown) and **Decisions** (default).

Decisions tab:
1. Title "24 decisions in force"; sub-line: "Settled once, then handed to every agent with the Project Guide before every run. Changing one counts as big work, so Captain asks first."
2. Two columns (wrap on narrow): the **list** (flex 1, min 460) and the **detail** (flex 1, min 420). This is a master–detail pair; both have a purpose (scan vs read), so it stays two columns.
3. **List rows** (buttons, `aria-pressed`): mono ID (DEC-26), title (15 px), meta ("Today · Captain, after the 4:52 am heads up"), kind tag (Rule, Product, Contract, Process, Architecture) in neutral text. Selected row: raised background and border.
4. **Detail article:** ID, "In force" (green pill), kind pill; title (22 px); why (15 px); for contracts a mono code block of the shape; rows "Came from" (link), "Decided by", "Last handed to an agent" ("2 min ago, to Fjord"); actions **Read the conversation** and **Ask Captain to change it** (opens ⌘K prefilled).

## Rules
- Decisions are never edited in place. Changing one creates a new decision that replaces it; the old one shows "Replaced by DEC-n".
- Filters (not wireframed, optional): In force · Replaced · by kind.

## Acceptance criteria
1. Deep links open with the item selected and scrolled into view.
2. "Last handed to an agent" reflects real delivery.
