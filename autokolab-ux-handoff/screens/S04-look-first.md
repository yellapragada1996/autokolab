# S04 · Look first (risky approval)

- **Source:** `source/RiskyOK.dc.html`
- **Pictures:** `S04-look-first.png`, `S04-look-first--answered-no.png`, `S04-look-first--merged.png`
- **Route:** `/[project]/look/[askId]` (modal over S01)

## Purpose
For a person who wants to see the risky change before agreeing. Turns approval into answering one real question about the change, instead of a rubber stamp.

## Layout
Centred modal, max 680 px, radius 20, padding 26/28, over the dimmed page (`rgba(6,7,10,.7)`). Top to bottom:

1. "Needs you · database change" (amber, 12 px) and × close.
2. Title (26 px): plain-English name of the change ("Record how each person signed in").
3. **The line that matters:** a code block with the single most important change (mono 14 px, green text for additions). Then "In plain words: …" (14 px).
4. Evidence chips: "Tests 48 of 48", "Captain approved this exact commit", "Can be undone in one step", **All the evidence** (opens S02).
5. Divider, then **the question** (17 px, 500).
6. Two large answer buttons (full width, 14/16 padding, radius 14), each with a bold line and a consequence line:
   - **Yes, that's right — merge it** · "Merges now; both machines update within 10 minutes" (amber outline + amber text)
   - **No — some people sign in another way** · "Nothing merges; you tell Captain who, and it fixes the brief" (neutral)
7. Footer: "You only see this step for risky changes. Everything else merges itself."

## States
- **Answered no:** a field appears under the buttons: label "Who signs in differently?", textarea with placeholder, **Send to Captain**. Sending closes the modal and posts the reason to the conversation.
- **Merged:** content is replaced by a green panel: ✓ "Merged", "The database update is applying on your Mac. Fjord has been told the column is in." with **Back to Captain** and **Undo**.
- **Already answered elsewhere** (e.g. on the phone): "James already answered this at 11:04 — merged." with **Back to Captain**.

## Rules
- The question is always specific to the change and answerable yes/no.
- The "No" option's label is phrased as the most likely real reason, generated with the question; the reason field accepts anything.
- Keyboard: 1 = yes, 2 = no, Esc = close.

## Acceptance criteria
1. The question and "line that matters" come from the actual change, not a template.
2. After yes, the decision card in S01 shows the merged state when the modal closes.
3. Focus is trapped in the modal; Esc returns focus to "Let me look first".
