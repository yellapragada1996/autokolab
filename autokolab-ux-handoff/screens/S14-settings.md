# S14 · Settings

- **Source:** `source/Settings.dc.html`
- **Pictures:** `S14-settings.png` (default mode), `S14-settings--fully-hands-off.png`
- **Route:** `/[project]/settings`

## Purpose
*How hands-off is this project?* Plus what counts as risky, machine updates, notifications and invites. "Changes save as you make them" (no Save button).

## Sections, top to bottom

### 1. How hands-off is this project?
Title (30 px) and the invariant: "In every mode a merge needs passing tests and Captain's approval of that exact commit, and nobody approves their own work."

**Three radio cards** (component `ChoiceCard`, `role="radiogroup"`), each: radio ring, name, tag, one-line description, expected asks at the current pace:
- **Ask me** – "Every merge waits for a person, even a one-line copy fix." – "About 12 asks a day at today's pace" (amber text)
- **Auto-merge safe changes** · DEFAULT – "Safe changes merge themselves. Risky ones wait for your OK." – "About 2 asks a day at today's pace" (green)
- **Fully hands-off** – "Everything merges once tests pass and Captain approves. Captain tells you about each one afterwards." – "No asks; you can still undo any merge" (the wireframe still says "in Catch up"; use this wording)

Selected card: blue border (`--blue-text`), raised background, filled radio.

**Merge path diagram** below (component `FlowSteps`): PR opened → Tests pass → Captain approves the exact commit → **You OK it** → Merges → Every machine updates when idle. The "You OK it" step is amber in Ask me / Auto modes and struck through and dim in Fully hands-off. A note under it explains the selected mode in one sentence.

### 2. What counts as risky
Amber-outlined chips: Database changes · Sign-in and security · New dependencies · Tests and CI · and a dashed **+ Add a path** chip (opens a path-glob input, e.g. `infra/**`).

### 3. Machines and updates
Rows with label, description and control:
- Apply database updates automatically – "From the admin's machine, in one all-or-nothing step after each merge" – switch.
- Machines update themselves – "When idle, within 10 minutes of a merge · both machines on the latest version" – "● Always on" (not a control).
- Invite link – "New people join as members; admins can change roles" – link field + **Copy**.

### 4. Notifications (not in the desktop wireframe; build it)
Same content as P04: Blocking (switch, "waits for a pause, never while you're typing"), Can wait (never notifies), Just so you know (never notifies), Quiet hours (time range + switch). Per person, not per project.

## Rules
- Only admins can change sections 1–3; members see them read-only with "Only Raghav can change this".
- Changing the merge mode posts a quiet update in the Captain conversation for everyone.

## Acceptance criteria
1. Each change saves immediately with a 1 s "Saved" confirmation next to the control and an undo toast for the merge mode.
2. The diagram always matches the selected mode.
