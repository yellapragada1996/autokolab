# S15 · Results

- **Source:** `source/Results.dc.html`
- **Pictures:** `S15-results.png` (this week), `S15-results--four-weeks.png`
- **Route:** `/[project]/results?period=week|4weeks`

## Purpose
*Is the team beating me running agents alone?* The measurement screen, and the audit export for managers.

## Layout
Header: period toggle (This week · Last 4 weeks) and **Export audit report**.

1. Period line ("Oct 5 – Oct 10 · this week") and a 38 px headline that answers the question in words.
2. **Key numbers** (component `StatTile`, wrap):
   - Hero tile (green-tinted, flex 2): "Reviewed tickets per hour of your time" – big number (54 px) – "vs 3.4 running agents yourself" – footnote "Your baseline: the two weeks before AutoKolab, measured the same way".
   - Merged ("all reviewed, all tested"), Time to merge ("median, start to main"), Interruptions ("all of them decisions"), Rework ("tickets reopened after merge").
3. **Merged tickets chart:** bars per day (week) or per week (4 weeks), value labels on top, a dashed horizontal line for the solo baseline; legend "With AutoKolab" / "Your solo baseline". Accessible text label describing all values.
4. **Where your interruptions went:** one row per kind (OK a risky merge, Answer a product question, Approve a plan) with count and an amber bar; footer "Zero chores: no manual merges, machine updates or database steps."
5. **By agent** table: Agent (avatar + name + model), Merged, Time to merge, Reopened, Hours worked; Captain's row shows reviews instead of merges.

## Rules
- No baseline yet → hero says "Your baseline starts this week" and the chart has no baseline line. Never invent a comparison.
- All numbers come from the record; hovering a number explains how it's computed.

## Acceptance criteria
1. Switching period animates bars (450 ms) without layout jump.
2. The export produces every ticket, approval, merge and decision for the period with timestamps and actors (CSV + JSON).
