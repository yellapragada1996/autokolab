# AK-182 work and verification

AutoKolab tools are unavailable in this session; the supplied ticket has no comments. This checklist records the plan locally.

- [x] Trace current status data and audit the app; write the glossary.
- [x] Apply supported meanings and solid red styling within Overview.
- [x] Cover classification, headings, legends and contrast with tests.
- [x] Run typecheck, tests, site build and browser checks at 1440 and 390; record unavailable checks.
- [x] Attempt the early commit and record the runner handoff after Git was blocked.
- [ ] Runner: commit, push, open the PR against main and confirm GitHub checks are green.


## Outcome

Overview uses specific supported Failed, Blocked and Limit reached states; Paused and Offline stay separate. Ticket problem labels distinguish Run failed, Checks failed, Limit reached and Blocked. In review has its own count. All problem bars and rings are solid bright red, with lighter red words and no middle mask. Layout, shared tokens, other tabs, database and runner are unchanged. The glossary proposes nine agent statuses and seven ticket statuses, records the data gaps, and audits the site's status surfaces and the older helper UI.

The ticket's explicit local-red exception takes precedence over the handoff's shared-token-only rule. The requested specific words replace the approved wireframe's vague Stopped labels; its layout is retained.

## Checks

- `npm run typecheck`: passed across workspaces.
- `npm test -w autokolab-site`: **436 passed** (30 files), after the final code changes. Includes 71 Overview tests across projection, rendering, headings, interactions and contrast.
- `npm run build -w autokolab-site`: passed; existing bundle-size warning remains.
- `npm test`: exit 1. Site: 436 passed. Helper: 520 passed, 28 failed, 18 skipped, plus four failed suite setups and one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, read-only helper state, process output assertions and timeouts. No helper source changed. Database policy tests were not reached because the workspace test command failed.
- `git diff --check`: passed.
- Contrast: bar/ring 5.06:1 and text 7.79:1 on the dark card; worst tested hover/active surface 4.53:1 and 6.97:1. The test reads actual CSS/token values and guards against a returning middle mask.
- `XDG_STATE_HOME=/tmp/ak182-look npm run look -- '/p/shop/overview?state=paused' --widths 1440,390 --full`: exit 2 before the page loaded. This preview includes a usage-limit hold. Chromium failed with `sandbox_host_linux.cc:41`, `shutdown: Operation not permitted (1)`, SIGTRAP, also confirmed with a direct default Playwright launch. No screenshots were produced. Neither the held/failed situation nor the expanded list could be visually inspected at **1440** or **390**; reviewer inspection remains necessary. No browser flags or sandbox workarounds were used.

## Publication handoff

The early `git add` failed creating the shared worktree's `index.lock`: read-only filesystem. No commit, push or PR was possible, and GitHub checks are unverified. No Git metadata copies, alternate remotes or permission workarounds were attempted. All changes remain in this worktree on `ak-182-overview-bright-solid-red-for-problems` for the runner.

Suggested PR title: **AK-182 show solid red problems and specific Overview statuses**. Base: **main**. Publish this patch and check CI before Captain reviews the exact commit; do not merge from this builder session.

Follow-ups for backlog: align remaining app status words/colors with the glossary after Captain decides; refresh time-based Overview statuses even when source snapshots are unchanged; add structured latest-run outcomes and limit reasons/reset times. Required-answerer and first-visit data already have AK-180; shell freshness copy already has AK-181.
