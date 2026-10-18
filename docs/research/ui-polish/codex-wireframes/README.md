# AutoKolab appearance gallery

AK-187. Open **[index.html](index.html)** by double-clicking it. Keep the supporting files beside it. The page needs no server, sign-in, network, build or application environment. It changes only this documentation folder.

Choose **System / Light / Dark** and a frame width in the gallery toolbar, then jump to a screen. The appearance choice changes all ordinary frames without replacing their markup or clearing fields. It follows OS changes in System mode and persists locally when storage is available. **Show both side by side** displays fixed dark/light pairs for the shell and Overview. The reference sheet and shared-state specimens always show both palettes. Shell appearance buttons operate the same shared preference.

Frames stay at **actual CSS-pixel size**, rather than shrinking text to fit the gallery. Scroll a wide gallery region horizontally to inspect it. Desktop and phone frames show the complete content vertically. The narrow-width choices apply to the shell; other tabs remain at 1440 or 390 respectively. App controls are static specimens: this is a visual reference, not a working app. Native fields, selects and project disclosures work; app actions do not save, send, approve or sign out. Links navigate to the corresponding gallery frame.

## What is included

- Style sheet first: both twelve-step neutral ramps; surfaces, text and borders; status pairs with their words; original brand green; named type and spacing roles; radii, elevation, icons, controls, avatars, focus and motion notes.
- Shell at 1440, 1024 and 390, plus the 320 navigation grid. All nine destinations stay present. The shell includes needs-you counts, logo, project selector, account, Sign out and appearance controls. Open project selector and active/hover/focus/pressed navigation specimens follow the shell frames.
- Captain, Overview, Work board, Work ticket, Team, Room, Decisions, Guide, Results and Settings at 1440 and 390. Both themes use the same markup. There are **36 device frames**, including the fixed comparison copies.
- Paired loading, empty, error, dialog, dropdown, toast, tooltip, selected-row, disabled and focus specimens. App text in these examples comes from the relevant screen or shared component. The toast is the generic `Saved` / `Undo` component specimen, not a claim about a new app event.

## Content evidence

The current-screen fixture is **Shop**, from `apps/site/src/workspace/demo.tsx` at checkout **004c99c**. It uses the existing Ana, Lee and agent records, tickets, conversations, decisions, guide, usage and invite data. The snapshot clock is fixed to **18 October 2026, 12:00 UTC**. These are the repository's demo records, not live project data.

`snapshot.mjs` server-renders the real components with that fixture. During generation only, it seeds Captain's normally delayed room/messages and the ticket's delayed detail state from their existing demo values. Those substitutions happen in memory; no app file changes. No app effects or network requests run. The generated page contains plain HTML, CSS and theme/navigation JavaScript; it does not ship React or a working database client.

`build.py` keeps the resulting DOM content, fields, options, controls, disabled states and table structure, then replaces the shell and maps presentation values to the proposed tokens. The content audit compares every main-frame string and every control against the original snapshot, at both widths and in each comparison copy. Gallery links preserve their original route in `data-app-href`. References to unmounted closed evidence panels are omitted from `aria-controls` in the static copy. Form buttons are inert `type="button"` specimens.

**Overview is the explicit exception to the current-app fixture.** It uses approved v5 **A1: one question waiting**, with Northstar Shop, Raghav, Birch, Fjord and Kestrel. Its question, headline, ordering, goal cards, crew, idle agents, progress shapes, ticket-list markup and responsive geometry come directly from the v5 recreation already checked against Claude's reference. The current Shop data is not substituted into this separate reference scene. Every element and class in the Overview subtree is compared with v5. Only colours, gallery destinations and surrounding shell change. The loading/error/calm snapshots are also preserved as source material; the shared-state frame displays the error example.

## Tokens and contrast

`tokens.css` is the colour source of truth for this proposal. Three layers:

1. `--neutral-1` through `--neutral-12`, paired by theme.
2. Semantic roles such as `--page`, `--card`, `--text-quiet`, `--control-edge`, and each status's `text`, `fill`, `mark` and `border`.
3. Component roles such as `--nav-active`, `--field-focus` and `--button-fill`.

The existing app and v5 names are aliases to those roles, declared at every theme boundary so nested comparisons resolve correctly. The plan gave colour directions, not exact hex values; this gallery supplies concrete values. Dark uses charcoal layers and light edges. Light uses a softly warm off-white canvas, white cards, darker control edges and a lighter shadow. Ordinary rows and cards have no shadow. Muted text is a foreground colour, never reduced opacity.

The style sheet prints **26 measured contrast rows**: primary, reading, supporting, muted, selected, action and all four status pairs, plus field edges and focus. `contrast.json` records their exact hex pairs and results. `build.py` additionally checks:

- Every text role on page, navigation, card, inset, hover, pressed, selected and floating surfaces: **at least 4.5:1**.
- Reading text on its card: **at least 7:1**.
- Every status text on those surfaces and its own fill: **at least 4.5:1**.
- Status marks, control edges and focus rings against their relevant surfaces: **at least 3:1**.

`verify.py` also checks all **94 explicit foreground/background combinations** emitted in the generated app presentation rules, including disabled controls. These are computed opaque sRGB token-pair checks. They do not certify rendered contrast, screen readers, browser-native widgets, grayscale, zoom or high-contrast mode. The unchanged brand artwork is the declared green exception. Outside it green means done/safe, amber needs you, blue live/moving, and coral failure/heads-up. Navigation, enabled preferences, primary actions, ordinary links and agent identity remain neutral.

## Where the plan was made concrete or could not be matched

- **Geist Sans is bundled** from the repository's v3 reference, with its SIL Open Font License. It covers weights 100–900, so the page uses real 400/500/600 weights offline. Geist Mono was not available locally, and font download failed because the host could not resolve. The mono role therefore uses the plan's system-monospace fallback; no external font request is made.
- **No browser could run, including the review retry.** Four launches were attempted with `CHROME_CRASHPAD_PIPE_NAME` unset: system Chromium; system Chromium with `--no-sandbox`, `--disable-crashpad`, `--disable-crash-reporter` and `--headless=new`; Playwright’s bundled headless Chromium; and its bundled full Chromium. Three failed at Crashpad `setsockopt`; the bundled headless version failed at `sandbox_host_linux.cc:41` during `shutdown`. All reported `Operation not permitted` and exited with `SIGTRAP`. Consequently **there are no screenshots**, and layout, wrapping, 44px targets, focus rings, dark/light rendering and the side-by-side view remain **unverified in a real browser**. The ticket permits this limitation. `browser-check.json` records each attempt; no earlier screenshots are presented as this work.
- **Geometry follows the plan:** 232px rail, 208px at 1024; 32/24/16px outer gutters; 44px nav targets and phone controls; 780px reading, 860px record and 1180px data widths. The permanently expanded phone grid is in normal flow and can scroll offscreen while reading. The 320 frame intentionally shows the navigation and account, not another entire tab.
- **Overview retains its documented exception:** 1120px cap, 56px desktop inset, 20px phone inset, 44/30px headline and original card hierarchy. Its status stripes use small SVG patterns instead of CSS gradients; the informative striped shape is retained. No decorative gradients, glass, glows or hover lift are introduced.
- The long static frames keep utilities directly below navigation rather than pinning them to the end of a many-thousand-pixel conversation. The eventual app's short-window rail must scroll as one region. Room keeps a bounded conversation scroll area with the composer and participants available below/alongside it. This is a visual framing choice, not removal of messages.
- Shared-state dialogs, toasts and tooltips stay open for inspection. Their real timing, focus trapping and lifecycle are not simulated. Existing tab disclosures and actions are shown at their initial demo state; the gallery is not a functional app prototype.
- Motion tokens are 140ms for surfaces and 200ms for eventual overlays. Reduced motion removes transitions and the retained v5 presence animation. Theme changes have no whole-page colour animation.

The ticket and plan explicitly override the older handoff's dark-only theme and hidden/sideways phone navigation. Existing screen source takes precedence over older screen-spec content; the v5 composition takes precedence for Overview. No additional navigation grouping, new tab copy or future feature is introduced.

## Not changed on purpose

- Guide still has today's **Decisions** page title and Guide / Decisions inner tabs; its direct shell link does not rewrite that content.
- Overview still says **Updated just now** in its desktop shell; the unconditional wording is already separate work in AK-181.
- Team retains its existing model, effort, machine, permission and usage explanations, including technical wording.
- Room retains its current plan-code blocks and agent-activity folds; this ticket does not rewrite messages or hide additional records.
- Results keeps every current statistic, definition, caveat, usage breakdown and export. No baseline or performance claim is added.
- Work retains all four inner-view controls and the source's hidden-empty-column note. Only the requested board and ticket views are drawn as full frames.
- Existing status words, source-derived needs-you counts, app errors and control labels are unchanged. Any glossary/content work belongs to its existing separate tickets.

## Frame-to-file map

Paths below are relative to `apps/site/src`; these files are **not changed** by this ticket.

| Frame / reference part | Existing implementation files |
| --- | --- |
| Shared tokens, type, spacing, theme aliases | `tokens.css`, `styles.css`, `index.html` in `apps/site/` for font entry |
| Shell, all nine links, account, project selector, page header, inner tabs | `workspace/Workspace.tsx`, `styles.css`, `lib/router.ts` |
| Buttons, icons, pills, switches, avatars | `ui/index.tsx`, `ui/kit.tsx`, `ui/avatars.tsx`, `workspace/bits.tsx` |
| Loading, toast, Saved, focus | `ui/feedback.tsx`, `styles.css`; screen-local loading text stays local |
| Search dialog / selected row / tooltip | `ui/CommandPalette.tsx`, `workspace/Workspace.tsx` |
| Captain | `workspace/CaptainHome.tsx`, `workspace/captain.ts`, `workspace/useCaptainRoom.ts`, `workspace/ApproveChange.tsx` |
| Overview outer state and approved hierarchy | `workspace/Overview.tsx`, `workspace/overview-parts/overview.css` |
| Overview question, heading and agents | `workspace/overview-parts/NeedsYou.tsx`, `Heading.tsx`, `AgentRow.tsx`, `StepTicks.tsx` |
| Overview goals, progress and ticket list | `workspace/overview-parts/Goals.tsx`, `GoalProgress.tsx`, `Link.tsx` |
| Work board | `workspace/Board.tsx`, `workspace/work.ts`; existing inner-view links also lead to `Backlog.tsx` and `ListView.tsx` |
| Work ticket | `workspace/TicketPage.tsx`, `workspace/bits.tsx`, `workspace/useFullTicket.ts` |
| Team | `workspace/People.tsx`, `workspace/agentOptions.ts`, `workspace/agentCosts.ts`, `workspace/useAgentCosts.ts` |
| Room | `workspace/Room.tsx`, `lib/room.ts` |
| Decisions | `workspace/Decisions.tsx`, `workspace/bits.tsx` |
| Guide | `workspace/GuidePage.tsx`, `workspace/bits.tsx` |
| Results | `workspace/ResultsPage.tsx`, `workspace/results.ts`, `workspace/efficiency.ts` |
| Settings | `workspace/Settings.tsx`, `workspace/People.tsx` (`Merging`, `InvitePanel`), `workspace/useDecisionNotifications.ts` |
| Current-screen fixture | `workspace/demo.tsx` |
| Original brand assets | `apps/site/public/brand/autokolab-{logo,croc,wordmark}.svg` (outside `src`) |

The gallery controls, annotations, fixed-width frames, contrast tables and verification scripts are documentation only. They do not belong in the product UI.

## Files and reproduction

| Files | Purpose |
| --- | --- |
| `index.html` | Complete static gallery, with every frame already in its HTML. |
| `tokens.css` | Named paired palette, type, spacing, shape, motion and alias tokens. |
| `gallery.css`, `snapshot-styles.css`, `overview.css` | Shared appearance, generated presentation rules, preserved v5 geometry. |
| `gallery.js` | Theme preference and navigation between frame widths / screenshot views only. |
| `autokolab-logo.svg`, `autokolab-croc.svg`, `autokolab-wordmark.svg` | Byte-identical original assets from `apps/site/public/brand/`. |
| `geist-latin.ttf`, `OFL.txt` | Bundled font and license, copied from `overview-wireframe-v3/codex/`. |
| `snapshots.json`, `overview-snapshots.json`, `content-manifest.json` | Frozen source markup and the exact tab-text audit input. |
| `snapshot.mjs`, `overview-snapshot.mjs`, `build.py` | Build-time source capture and static gallery generation. |
| `contrast.json`, `verify.py` | Contrast evidence and content/structure/scope checks. |
| `look.mjs`, `browser-check.json` | Optional browser checks / paired screenshots and actual browser-launch outcome. |

The checked-in HTML opens without running any of these tools. To regenerate from the repository, use its existing Node dependencies plus Python with BeautifulSoup (already available in the builder environment; no npm dependency was added):

```sh
node docs/research/ui-polish/codex-wireframes/snapshot.mjs
node docs/research/ui-polish/codex-wireframes/overview-snapshot.mjs
python docs/research/ui-polish/codex-wireframes/build.py
python docs/research/ui-polish/codex-wireframes/verify.py
node docs/research/ui-polish/codex-wireframes/look.mjs
```

The optional browser script first tries four system/bundled Chromium launch configurations with the crashpad pipe variable unset. If one starts, it checks all tab frames in both themes and writes the requested **16 screenshots** of shell, Overview, Work and Captain at 1440 and 390. It exits 2 for browser startup failure, 1 for a rendered check failure. Individual screenshots can also be opened as `index.html?shot=work&width=390&theme=light` (replace `work` with any frame ID). Do not regenerate source snapshots casually after app changes: this deliverable deliberately records the reviewed checkout and should be re-audited if refreshed.

## Checks and publication

| Check | Actual result |
| --- | --- |
| `python .../build.py` | Passed. Nine current demo views retained; 26 printed contrast pairs and all tested surface combinations pass. |
| `python .../verify.py` | Passed. 36 frames; nine nav links per frame; exact text, control and table preservation; exact v5 element/class structure; 94 explicit generated CSS contrast pairs; IDs, local assets, link targets, named colours, minimum text sizing and reduced-motion rules. JavaScript syntax checks pass. |
| `node .../look.mjs` | Review retry: exit 2 after all four launch configurations failed with `Operation not permitted` / `SIGTRAP`. No rendered checks or screenshots produced; layout, wrapping, targets, focus rings, both themes and side-by-side rendering remain unverified. |
| `npm run typecheck` | Passed across workspaces, including the review revision. |
| `npm test` | Review revision rerun: exit 1. Site: **436 passed**. Helper: **520 passed, 28 failed, 18 skipped**; 10 failed test files and one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, read-only helper state and process-output/assertion failures. Database policy tests were not reached. No unrelated test/app changes were made. |
| Website build / `npm run look` | Not required for this docs-only scope; no file under `apps/` or `packages/` changed. The dedicated gallery browser attempt is recorded above. |
| Git scope / whitespace | Changes remain confined to this folder; `git diff --check` passes. Generated text is also checked for trailing whitespace. |
| Commit / push / PR | Commit `5c32b71` was pushed on `ak-187-wireframes-of-the-polished-look-whole`; [PR #138](https://github.com/yellapragada1996/autokolab/pull/138) is open against `main`. |
| GitHub checks | **Green for `5c32b71`**, as confirmed by Captain in the AK-187 review comment. Local sandbox test failures above are a separate result. The GitHub API was unreachable during this revision, so no check result for a later commit is claimed. |

The review requested corrected publication facts and another browser attempt. Both are recorded here. [PR-description.md](PR-description.md) contains the corresponding PR text, including the explicit unverified-layout limitation. Updating the PR body was attempted, but the GitHub API was unreachable; that file is ready to apply to the existing PR.

## Work steps

- [x] Read the appearance plan, current screens, demo records and Overview v5 reference.
- [x] Build paired tokens, the style sheet and shared states.
- [x] Draw the shell and every requested tab at desktop and phone widths.
- [x] Check content, contrast and browser availability; document the frame map and limitations.
- [x] Run repository checks.
- [x] Publish [PR #138](https://github.com/yellapragada1996/autokolab/pull/138); Captain confirmed green checks for `5c32b71`.
- [x] Correct publication notes and retry all four browser launch configurations after review.
