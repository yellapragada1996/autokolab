# Overview · wireframe v3

AK-173. Independent study by jamesblack-codex. All people and work are fictional fixtures. The other agent’s v3 folder has not been opened. Only this folder changes; the app is untouched.

Open [overview.html](overview.html) by double-clicking. Everything runs offline. The review controls switch eight states, light/dark, and Cards/Rows together in actual-size **1440 × 960** and **390 × 844** frames. Scroll across the comparison or use Open desktop / Open phone. Notes are outside the product frames.

## Work plan

- [x] Read v2, the Overview proposals, amendments, tokens and original brand assets.
- [x] Build the two structures, progress lines, themes and eight states.
- [x] Verify fixtures, controls, palette contrast and honest progress; attempt browser inspection (blocked below).
- [x] Run required checks, finish documentation and prepare the review handoff (Git blocked below).

AutoKolab tools are unavailable in this session, so this checklist tracks the steps locally.

## Structure and character

**Recommend Cards:** compact agent rows on the left, shallow goal panels on the right. A panel groups a goal name, progress line and count. Agent rows share alignment and stay easy to scan as the roster grows. No nested boxes. On phones both parts follow the same single reading order. **Rows** is a real alternative: the same content becomes one broad reading column, with goals on open ruled rows. It is denser and useful for long lists, but gives goals less visual presence.

The working sentence is the focal point: 48px desktop, 26px phone, with the goal names on its second line. It reads as a statement, not a count tile. Unequal column widths, compact people and more open goals break the uniform dashboard rhythm. The shell uses words instead of stock icons. The original croc and wordmark retain their green; completed task lengths echo it. Neutral initial tiles have a small asymmetric corner. In calm and brand-new states the unchanged croc accompanies the existing heading, without a new block or footer.

## What changed from v2

| v2 | v3 and reason |
| --- | --- |
| Flat list for everything | Goal panels beside a compact roster give the overview a clearer structure; Rows lets the reviewer compare. |
| Goal counts only | A proportional line accompanies each count, as explicitly requested by AK-173. |
| Monochrome logo | Original green artwork restores AutoKolab’s identity. No asset is redrawn or recoloured. |
| 30px desktop sentence | 48px type gives the main answer a clear focal point. Phone rises from 21px to 26px. |
| Plain working dot | A small double ring pulses beside Working/Reviewing. Reduced motion stops it. |
| Same quiet treatment everywhere | Active work has structure and rhythm; idle rows step back, while the croc makes the empty states recognisable. |

The settled four parts remain: Needs you when waiting → working sentence → every agent → goals being built. No Next from Captain, delivery list, freshness, count tiles or calm footer. Amber remains a small mark without a filled box. Requests stay complete, with two visible questions and counted overflow. The eight shell destinations are unchanged from v2.

AK-173’s explicit request for progress lines and original brand colour takes precedence over the v2 no-bar proposal and the handoff’s monochrome/status-only treatment of branding. Its four-part content also takes precedence over the older amendments’ longer Overview block list. All other colour remains semantic: blue activity, amber needs you, coral stopped, green completed tasks; agent avatars are neutral. This is a design proposal, not a recorded product decision.

## Honest progress

Each goal fixture contains numeric completed and total task counts. One pair supplies both the visible “x of y done” text and the line’s `done / total` width. The progressbar exposes the same numbers and a task-count label to accessibility tools. Counts are equally weighted tasks, not effort, time remaining or an ETA. Scope changes can move the fraction backwards. An app implementation should omit a determinate line when the total is unknown or zero.

The agent ring is **indeterminate activity only**, paired with Working or Reviewing. Fixtures do not contain step totals, so there are no invented step fractions or agent percentages. In a real app it must follow the runner’s running state, not assignment or a timer. A stopped, waiting, idle or offline agent never pulses.

## Files and states

- `overview.html`, `overview.css`: offline fixture renderer, review controls and responsive styling.
- `autokolab-logo.svg`, `autokolab-croc.svg`: unchanged copies from `apps/site/public/brand/`.
- `geist-latin.ttf`, `OFL.txt`: v2’s bundled Geist and its license.
- `verify.mjs`, `validation.json`: repeatable static checks and their result. The script also includes browser checks and screenshot capture for a host where Chromium can run.

| State | Behaviour |
| --- | --- |
| Busy | Three active agents (including Captain reviewing), one Idle, two progressing goals. |
| Questions waiting | Two full questions, two more in Captain, an agent Waiting on you. |
| Agent stopped | Tern’s stop appears in the heading; its row explains the daily limit. |
| Calm | Croc, calm heading, all connected agents Idle or Offline; no empty goals section. |
| Brand-new | Croc, existing first-goal heading and Open Team action; no invented records. |
| 10+ agents | Thirteen visible-through-scroll agents, long names, four goals, a question and a named stop. |
| Loading | Static placeholders and loading words; no pretend idle or progress. |
| Load failed | Plain error, alert semantics and retry; no false calm. |

Prototype links go to the boundary explanation beneath the comparison, not real app pages. They preserve state, theme and layout. In the app, requests open Captain, active agents/goals open Work and idle/offline agents open Team. Retry switches the current frame to the busy fixture and preserves its theme and layout. It does not fetch data.

## Accessibility and principles

Hierarchy and proximity make the current work readable before detail. The purpose rule keeps all content within the settled four parts. Stable ordering (Captain, then names) avoids jumping rows. Status words, complete wrapping text, 12px minimum type, 44px phone targets, semantic navigation, a skip link and visible focus support keyboard and phone use. Longer states scroll with space above the fixed navigation. Reduced motion removes the presence pulse and all transitions. Real updates should retain known data, focus and scroll; this study replaces entire fixtures.

Dark tokens come from `autokolab-ux-handoff/tokens.css`. Light semantic overrides are carried forward from v2. AK-173 adds the original croc green as `--brand-green`; light-theme progress uses a darker green for contrast. All component colours reference tokens. Original SVG colours stay inside unchanged brand assets.

## Validation

Run `node docs/research/overview-wireframe-v3/codex/verify.mjs --static` from the repo for the checks available here. Omit `--static` to also run the browser checks and produce busy screenshots at 1440 and 390 in dark/light, plus the Rows alternative and selected edge states. It uses the repo’s existing Playwright and PostCSS; no dependencies were added.

**Passed here:**

- 64 fixture renders: eight states × two layouts × two themes × two sizes. Checked complete agent rosters, all eight navigation destinations, question overflow, stop clauses, loading/failure separation, balanced markup and matching progress counts/widths.
- 32 review-control combinations using a minimal document stub. Both frame URLs and open-frame links retain the selected state, theme and layout; button selection updates. This is JavaScript verification, not browser interaction testing.
- CSS parsing, token-only component colours and local asset references. Original logo/croc copies remain unchanged.
- Palette calculations: minimum checked text **4.74:1**, status marks **4.76:1**, progress fill against track **3.20:1**, focus against page **8.10:1**. These are specified-colour calculations, not a rendered accessibility audit.
- `npm run typecheck`: passed across all workspaces.

**Unavailable or failed here:**

- Chromium failed before opening a page: `sandbox_host_linux.cc:41`, `Operation not permitted`. No screenshots were produced, and neither width was visually inspected. Actual overflow, rendered contrast, phone target geometry, keyboard focus and reduced-motion behaviour remain unverified by a browser. The included browser checks cover them when the reviewer or runner can launch Chromium.
- `npm test`: failed. Helper: **520 passed, 28 failed, 18 skipped**, with one unhandled socket error. Failures include `spawnSync git EPERM`, denied process/socket operations and assertions in fake-runner tests. Site: **377 passed**. The database phase was not reached because workspace tests failed. No product or test code was changed to bypass these failures.
- Commit attempt failed at `git add`: the worktree’s shared Git metadata is read-only (`index.lock`). No commit, push, PR or GitHub checks were possible. Per the ticket’s fallback, the runner must commit this folder, push the existing `ak-173-overview-wireframe-v3-give-it-character` branch and open the PR **against main**. Suggested title: **AK-173: Give Overview character and honest progress**. No website build was needed because no app files changed.

**Design self-review, with limits:** the five-second copy check answers “three agents working on Checkout and Sign-in”; needs-you states put the questions first, and stopped states name the stopped agent. The intended squint-test focal point is the 48px working sentence above smaller, denser rows. The template check is addressed through the original croc, unequal grouping, squared progress lines, asymmetric neutral initials and word-only navigation. The latter two are source-level design judgments; their visual result could not be confirmed without a browser. No human usability test is claimed.
