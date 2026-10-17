# Overview v5 — Codex recreation

AK-178. Open [overview.html](overview.html) by double-clicking it. It recreates [Claude's v5](../claude/overview.html), using the v4 base look, the same Northstar Shop story, names, ticket keys, captions and rules. This is a build reference; it changes no app files.

## What is in the folder

| File | Purpose |
| --- | --- |
| `overview.html` | One self-contained gallery: 26 situations in 29 pairs of desktop 1440 and phone 390 frames, captions, six facts per situation, heading-sentence table and rules note. |
| `autokolab-logo.svg`, `autokolab-croc.svg` | Unchanged copies of the reference assets. |
| `verify.mjs` | Dependency-free comparison of the independently written components with Claude's reference output. Run with `node docs/research/overview-wireframe-v5/codex/verify.mjs` from the repository root. |
| `README.md` | Usage, component map, comparison limits and checks. |

The gallery has the same jump menu, Cards/Rows and Dark/Light controls, 1440/1280 desktop widths, First screen/Whole page, Review path, Reduce motion and Fit to window. Click a progress line to expand its ordered ticket list. Hover a segment to name its ticket; hover or focus a ticket or agent to highlight its segment. Links describe the same app destination as Claude's links. Review path opens the first goal and adds the numbered annotations.

For one frame at its actual size, use `?sit=a2&shot=desktop&theme=dark` or `?sit=a2&shot=phone&theme=light`. The other parameters are `layout=rows`, `w=1280`, `full=1`, `review=1` and `still=1`. Without parameters, all 29 situations appear together.

The page loads no scripts or data over the network. Like Claude's file, it requests Geist and Geist Mono from Google Fonts and falls back to system fonts offline. Keep the two SVGs beside the HTML.

## Parts and their future app files

All rendering functions are named separately in `overview.html`. Each accepts its sample scene and explicit rendering context; there is no shared mutable viewer. `headingSentences` drives both the frames and heading table. The inline `story` JSON holds the reference's sample records, serialized without its implementation. The CSS, component functions and event wiring were written independently, rather than copying the reference renderer or stylesheet.

Paths below are relative to `apps/site/src`. **New** means a suggested home for the later build, not a file created by this ticket.

| Wireframe part | Function(s) in this file | App file to build it in |
| --- | --- | --- |
| Needs you and quiet waiting-on-someone-else rows | `NeedsYou`, `NeedsYouRow`, `requestDetails` | `workspace/overview/NeedsYou.tsx` (**new**); read requests from existing `workspace/useCaptainRoom.ts`. |
| Heading and croc moments | `Heading`, `headingSentences`, `sentenceMarkup` | `workspace/overview/Heading.tsx` (**new**); derive sentence data in existing `workspace/glance.ts`. |
| Agent initial, presence ring, state word and doing line | `AgentRow`, `agentState` | `workspace/overview/AgentRow.tsx` (**new**); adapt existing `workspace/agentStatus.ts`. |
| Planned step ticks | `StepTicks` | `workspace/overview/StepTicks.tsx` (**new**). |
| Goal card and its crew, idle-agent list, Cards/Rows | `GoalCard`, `GoalCards`, `UnassignedAgents`, `Rows` | `workspace/overview/Goals.tsx` (**new**). |
| Segmented/continuous line and words beneath it | `Progress`, `ProgressLine`, `progressCounts` | `workspace/overview/GoalProgress.tsx` (**new**). |
| Expanded tickets, hover label and linked highlighting | `ReviewList`, `ticketState`, `showTicketTip`, `highlightTicket` | `workspace/overview/GoalProgress.tsx` (**new**); use React state and refs instead of the gallery's DOM event delegation. |
| Loading, first-load failure, stale view and overall composition | `Loading`, `Overview` | Existing `workspace/Overview.tsx`. |
| Sidebar, phone header/tabs and Captain count | `Frame`, `Navigation` | Existing `workspace/Workspace.tsx`; the fixed-size device frames remain documentation only. |
| Work, Team, Captain and Settings destinations | `linkTo`, `linkDestinations` | Existing `lib/router.ts`, with `workspace/Board.tsx`, `workspace/People.tsx`, `workspace/CaptainHome.tsx` and `workspace/Settings.tsx` as destinations. |
| Layout, type, status shapes and themes | CSS sections above the components | Existing `styles.css` and `tokens.css`; keep the reference's status meanings and theme values. |
| Jump menu, controls, captions, table, rules and numbered review pins | `Gallery`, `Situation`, `Contents`, `Controls`, `JumpMenu`, `HeadingTable`, `ReviewAnnotations` | Documentation only; not product UI. The expandable review list itself belongs in the app. |

## Comparison and checks

The source was checked for a user-must-act scene (A2), busy (C13), brand new (B8), calm (C16), stopped (D19), and many agents (C17), at the reference's desktop and phone rules. The implementation retains the 232 px sidebar, 1120 px content cap, desktop 56 px content padding, phone 20 px horizontal padding, 44/30 px headings, 20/19 px card titles, card gaps, neutral tiles, presence rings and all five progress shapes. This is source comparison, **not a claim of visual verification**.

**No browser could run.** Playwright found the installed `/usr/sbin/chromium`, but Chromium failed at startup: Crashpad's `setsockopt` returned `Operation not permitted`, followed by SIGTRAP. Consequently there are no new comparison screenshots, and I could not inspect this recreation beside Claude's rendered page at either width. Claude's existing D19 desktop screenshot was opened as a visual reference. Browser interactions, font wrapping and pixel alignment still need the reviewer's browser check; the ticket explicitly permits this no-browser note.

Checks run:

- `node docs/research/overview-wireframe-v5/codex/verify.mjs` — passed. All 29 sample records and headings, hidden-section notes and destination captions match. It compares 232 renders (29 × Cards/Rows × review closed/open × desktop/phone), including row text, link order/destinations, step counts, expansion state and progress words. It checks 58 frames, 29 heading-table rows, 29 contents links, unique IDs, button/list references, identical SVGs and JavaScript syntax. These are markup checks, not browser layout checks.
- `npm run typecheck` — passed.
- `npm test` — exited 1. The site passed all 377 tests. The helper reported 520 passed, 28 failed and 18 skipped, with four failed suite setups and one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, process-dependent assertions and timeouts. The database policy tests were not reached because the workspace tests failed. No application or test files were changed to work around the sandbox.
- `git diff --check` — passed for the tracked tree; the new files were also checked for trailing whitespace.

No site build or `npm run look` is required by this ticket's path scope: only this documentation folder changes.

## Not exactly the same

- The gallery identifies AK-178 instead of AK-176 so readers know whose recreation they opened; the sample project and all frame copy are unchanged.
- Pixel-for-pixel fidelity is unverified because Chromium cannot start in the sandbox. Dimensions, palette, typography and states were matched from the source, but browser rendering differences cannot be ruled out without screenshots.
- Component names, CSS variable names, element IDs and source organization differ because this ticket requires an independent implementation. There are no intentional design departures inside the frames.

## Things I would change later

- None; this recreation preserves Claude's design.

## Work steps

- [x] Read the v5 reference, v4 base and design tokens.
- [x] Rebuild all situations with separate rendering components.
- [x] Compare source and rendered markup; attempt the browser and document its startup failure.
- [x] Finish the component map and run repository checks.
- [ ] Runner: commit, push and open the PR against main; inspect GitHub checks.

The early commit attempt failed because Git cannot create the shared worktree's `index.lock` on the read-only filesystem. The files remain uncommitted on `ak-178-recreate-claude-s-overview-v5-wireframe`. Per the ticket's fallback instructions, the runner must commit, push and open the PR. No alternative Git directory or remote was used.
