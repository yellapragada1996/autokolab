# AK-179 implementation and verification

## Steps

- [x] Read the approved references, scoped files and available data.
- [x] Build the data projection and Overview components with scoped styles.
- [x] Cover data, disclosure, loading and refresh stability with tests.
- [x] Attempt browser comparison at 1440, 1280 and 390; run repository checks and record limitations.
- [x] Attempt the early commit; prepare the runner handoff after the read-only Git failure.
- [ ] Runner: commit, push, open the PR against main and confirm green GitHub checks.

AutoKolab ticket tools are unavailable in this session. This file records the work and the gaps that would otherwise be a ticket comment.

## Scope and known data gaps

- The shell owns the project top bar and its “Updated just now” text. They remain unchanged because `Workspace.tsx` and shell styling are explicitly out of scope. The Overview content follows the wireframe within that shell.
- A project with agents but no selected Captain says “Captain hasn’t been chosen yet” and links to Team, rather than suggesting that an unassigned Captain can answer. This true setup situation is absent from the reference.
- There is no theme switch in the app. Only the current dark theme is built.
- There is no project-wide pause record, required-answerer field, or reliable first-time-viewer flag. No owner-only request rows, “You paused everyone”, whole-goal hold claims, or newcomer prompts are invented. Individual agents can truthfully say Paused.
- Heartbeats support Offline; they do not prove why a computer is offline or that all reviews are blocked. The headline says “Captain is offline.” without a machine/review claim.
- Step numbers come only from a recorded current step. When no step is marked current, ticks show the recorded done/todo states without inventing a current step.
- Runner problems and limit notes supply stop reasons when present. Check results count checks, not individual tests; no failing-test count is inferred.
- Plan size comes from its tickets. Estimated time and risky-change reasons are omitted when not recorded as structured facts.
- Exact request links use Captain’s existing `#need-…` anchors. Ticket links use existing Work ticket routes. Goal links open Work grouped by goal, and agents without tickets open Team; those tabs have no supported per-goal/per-agent landing anchors.
- Tickets without a goal remain visible under “Fixes and upkeep”; active agents without a ticket are shown separately so no live work is hidden or assigned an invented goal.
- Long unbroken names may wrap rather than widen the phone viewport; long ticket metadata truncates visually while retaining its full accessible text. These safeguards extend the reference to arbitrary real names.
- Local Overview tokens preserve the reference’s croc green, amber stripe, card edge/hover/shadow, and skeleton shades. Shared tokens and global styles are unchanged.

## Verification

- Focused Overview tests: 62 passed, including all 27 data-bearing reference situations and both loading situations. Tests also exercise disclosure toggling, hover/focus highlighting, 20-ticket continuous lines, source refreshes, no timer/fetch loop, real steps, long names, and stable order.
- `npm run typecheck`: passed across workspaces.
- `npm run build -w autokolab-site`: passed (the existing large bundle warning remains).
- `npm test`: exit 1. All 427 site tests passed. The helper had 520 passing, 28 failing and 18 skipped tests, four failed suite setups, and one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, read-only helper state, process-output assertions and timeouts. Database policy tests were not reached. No unrelated helper code or tests were changed.
- `git diff --check`: passed. CSS parsed with PostCSS: every selector is scoped beneath `.ak-overview-scope` (except its uniquely named keyframes).
- `XDG_STATE_HOME=/tmp/ak179-look npm run look -- /p/shop/overview --widths 1440,1280,390 --full`: exit 2. Chromium cannot start: `sandbox_host_linux.cc:41`, `shutdown: Operation not permitted (1)`, SIGTRAP. No screenshot was produced. A direct Playwright launch confirmed the same failure without changing browser flags.
- Unable to visually compare the question-waiting, busy, brand-new, calm, stopped-agent and many-agent situations at any of 1440, 1280 or 390. Font wrapping, focus appearance, touch targets, disclosure interaction in a real browser, and pixel alignment remain for the reviewer. Opened the reference's D19 desktop screenshot; this is not an app comparison.
- The first `git add`/commit attempt failed because the shared worktree Git directory is read-only (`index.lock`). No Git metadata copies, remote changes or permission workarounds were attempted. The runner must commit, push, open the PR against main and check GitHub CI.

## Follow-up work outside this scope

- Supply project-wide pause, required-answerer and first-visit data for the remaining reference variants.
- The shell's “Updated just now” text is still unconditional. `GUIDE.md` also describes the old Overview (including Today and a setup checklist). Updating these is outside the ticket's strict file allowlist.

Final checks after the edge-case review: all 427 site tests, workspace typecheck and site build passed. All 15 changed files are inside the ticket’s Overview allowlist; no shell, other-tab, shared-token or global-style file changed. GitHub checks remain unverified until the runner publishes the branch and PR.
