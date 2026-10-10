# 05 · Components

Build these first; every screen is assembled from them. Names are suggestions. Token names refer to `tokens.css`.

## Layout

### `AppShell`
Sidebar (`Nav`) + main. Flex row with wrap. Sidebar `flex: 1 1 220px`; main `flex: 999 1 560px; min-width: 0`. Below 1100 px the sidebar becomes a top row (see `07`).

### `Nav`
Logo + project block (hidden < 1100 px) · items · divider · items · footer (team clocks + person; hidden < 1100 px).
- Item: 16 px stroke icon, label 14 px, optional badge. Padding 9/10, radius 9. Default text `--text-muted`; hover `--surface-hover`; active `--surface-active` + `--text`; `aria-current="page"`.
- Badge: amber pill (`--amber`, text `--amber-ink`), 12 px 600, only on Captain, only when > 0.
- Tooltip (`title`): label + shortcut.

### `ReadingColumn`
`max-width: 780px; margin: 0 auto; padding: 0 28px` (16 px below 640 px). Used by Captain, side thread, conflict.

### `Sheet`
Right-side panel for Show the work. Desktop: slides in from right (420 ms, `--ease-out`), `flex 1 1 460px`, `--surface-sunken`. < 1100 px: bottom sheet, 85 % height, drag handle. Header with kicker + title + close; Esc closes; focus returns to opener.

### `Modal`
Centred, max 680–720 px, radius 20, `--shadow-lg`, backdrop `rgba(6,7,10,.7)`. Pop-in 280–320 ms. Focus trap.

### `SlideOver`
Floating right panel (S03): 460 px, inset 12 px, radius 18, non-modal (no backdrop).

## Conversation

### `Briefing`
Props: `kicker`, `headline` (parts: work clause + needs clause with tone `amber|green`), `next`, `expanded`, `goals[]`, `agents[]`.
Surface card, radius 18, padding 20/22. Sticky top. Kicker 12 px with live dot. Headline 26 px/500/-0.02em (21 px < 640). "Who's doing what" ⇄ "Hide" link. Expanded content per S01.

### `Message`
Variants: `captain`, `person`, `agent`, `agent-failure`, `captain-note` (inline indented dashed), `system-quiet` (12 px dim line).
- Captain/agent: 28 px avatar tile, meta 12 px dim ("Captain · 10:50 am"), body 15 px/1.6 `--text-body`. No bubble.
- Person: right-aligned bubble `--surface-raised`, radius 16 16 4 16, padding 11/15, max 480 px.
- agent-failure: background `--coral-bg`, border `--coral-border`, meta in coral, body `#F0D6D1`.
- Optional context label ("About: Google callback") under meta when sent from the slide-over.

### `LiveSteps`
While Captain or an agent is working on a reply: up to 3 lines of 13 px dim text with a small spinner; collapses into one line "Read 3 files and 2 decisions" when done.

### `DecisionCard`
Variants: `risky-merge`, `product-question`, `plan` (pending), `conflict`, `ambiguity`.
- Container: `--amber-bg`, 1 px `--amber-border`, radius 16, padding 18, gap 14.
- Kicker row: "Needs you · <what>" 12 px amber 500; right: **How do you know?**.
- Question: 17 px/500/1.4.
- Evidence chips (`Chip`): green for verified facts, neutral for properties.
- Actions: primary amber button (44 px, radius 11, 15 px 600) + outline button + text button. On phone the primary is full width 50 px.
- Resolved states: green panel (`--green-bg`, `--green-border`) with ✓, one sentence, and **Undo** while possible; or neutral "Replaced" / "Answered by James at 11:04".
- Options variant (product question/conflict): radio buttons 48–72 px tall with label + consequence line; recommended option has amber outline and a tag.
- `role="region"`, `aria-label` = the question.

### `EvidencePanel`
Rows per S02 (tests, review, what changes, decisions followed, trail, where I'm less sure). Inset `--surface-sunken` (or `#0E0D0A` inside amber cards), hairline dividers, 12/14 padding per row, 16 px icons.

### `PlanCard`
Pending: title "Plan · n goals, m tickets", one line "You'll be asked k times", buttons **OK, start** / **Change something**, link **Open the plan**. Approved: title + green pill "You said OK · 9:18"; whole card links to S08. Replaced: dim with "Replaced by a newer plan".

### `CatchUpCard`
Summary row: "● n shipped ■ n handled" + "Show all n"/"Hide". Expanded rows: one line, dot by type, optional right link ("What happened").

### `QuietFold`
Dashed row with chevron (rotates 90° on open) and a count summary; expands to mono-time rows.

### `Composer`
Textarea 15 px, auto-grow 2–8 rows; footer: intent hint (13 px muted + clock icon), voice button (38 px outline), send (38 px, `--text` bg, `--bg` icon). Focus: border `--border-focus`. Variants: full (S01), compact single-line with context chip (S03), worker ("Message Fjord").

### `ContextChip`
12 px, `--surface-hover`, radius 7, "About: <object>" + 20 px × button.

### `QuickReplies`
Up to 3 pill buttons, 32 px tall, outline.

## Work and records

### `AgentAvatar`
Square tile, radius ≈ 30 % of size, `--avatar-bg` + `--avatar-fg`, letter 600. Sizes 22, 24, 28, 32, 34, 40. Optional status dot (8–11 px, 2 px ring in the surrounding background colour): blue + pulse = working, grey = idle, amber = waiting on a person. **Never a per-agent colour.**

### `PersonAvatar`
Circle with initials, 700. Current person: `--text` bg + `--bg` text; others `#3A4150` + `--text`.

### `StatusPill`
Pill 12 px, padding 3/10. Tones: live (blue text on `--blue-bg` + pulsing dot), done (green), needs (amber text on `--amber-bg-2`), neutral.

### `SegmentedProgress`
One segment per ticket, gap 3–4 px, height 5–6 px, radius 3. Segment colour by ticket status: done `--green`, needs you `--amber`, in progress `--blue` + shimmer, not started `--track`.

### `TicketCard`
See S09. Radius 12, padding 14, hover lifts 2 px with `--shadow-md`.

### `StepList`
See S10. Circle 20 px; connectors 2 px × 26 px.

### `Timeline`
See S16. Marker 10 px; mono time 12 px; one sentence per row.

### `AgentCard`, `PersonCard`
See S12.

### `EffortControl`
5 buttons (22 × 10 px, radius 3), filled `--text-secondary` up to the level, `--track` after; label at right ("High"). `role="group"`, each button `aria-pressed` and `aria-label` ("High").

### `ChoiceCard`
Radio card (S14): radius 16, 1.5 px border; selected = `--blue-text` border + `#141A26` bg + filled radio.

### `FlowSteps`
Inline chips joined by "→"; step tones: neutral, done (green), you (amber), skipped (struck through, dim).

### `Switch`
48 × 28 px track, 22 px knob, 220 ms knob slide; on = `#3E7FE0`; `role="switch"`, `aria-checked`.

### `StatTile`, `BarChart`
See S15. Bars radius 6 6 2 2; value labels mono 12 px; baseline dashed 2 px `--text-secondary` at 55 % opacity.

### `Chip`, `Kbd`, `Tooltip`
- Chip: 12 px, radius 999, padding 4/10.
- Kbd: mono 12 px, 1 px `--border-strong`, radius 5, padding 0/6.
- Tooltip: native `title` is fine for the first version.

## Feedback

### `Toast`
Bottom-centre, `--surface-raised`, radius 12, 14 px text, one action (**Undo**). Auto-dismiss after 6 s; pauses on hover. Used for undoable non-card actions (merge mode change, pause everyone).

### `InlineSaved`
"Saved" in 12 px green next to a control for 1 s after an auto-saved change.

### `Skeleton`
Neutral bars (`--surface-hover`) with no shimmer. Shown only if content takes > 300 ms.
