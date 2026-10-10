# S16 · Heads up (recovery)

- **Source:** `source/Recovery.dc.html`
- **Picture:** `S16-heads-up-recovery.png`
- **Route:** `/[project]/heads-up/[incidentId]`

## Purpose
*Something went wrong. What happened, is it fixed, and do I need to do anything?* This screen earns trust for unattended work. It is reached from Captain's catch-up ("What happened") and never requires action unless something couldn't be fixed.

## Layout
Main content (flex 2, min 560) + side column (flex 1, min 300).

### Content
1. Pills: "Heads up" (coral text) and "✓ Handled · nothing needs you" (green).
2. Headline (36 px) in two sentences: what went wrong, and that it's undone. ("A PR merged into the wrong branch. It was undone 40 seconds later.")
3. One paragraph naming what happened and what AutoKolab did.
4. **What happened, second by second** (component `Timeline`): mono time (to the second) + one sentence each. Markers: grey circle = normal, coral square = the problem, blue = detection, green = fix, grey diamond = decision recorded. The problem row's time is coral.
5. **Why it happened:** one paragraph, plain, no blame ("Kestrel did exactly what the brief said. Nothing was wrong with the code.").

### Side column
- **How far it got:** big number ("47 s") + "on release/0.9", then ✓ lines: "Nobody deployed from it", "No machine pulled it", "No database change involved". If something *did* get further, these lines are coral with what was affected.
- **If you want to:** optional controls only: a switch ("Ask before Kestrel's next merges"), **Undo the revert** (outline), **Looks right** (primary). After "Looks right": "Marked as reviewed. It stays in History for anyone who audits this later." + **Back to Captain**.

## Rules
- If the problem was **not** fixed automatically, this becomes a blocking decision in the Captain conversation, and this page shows the decision card at the top.
- The preventive rule (e.g. DEC-26) is always linked.

## Acceptance criteria
1. Times are exact to the second and come from the record.
2. "Handled" is only shown when nothing remains to be done.
