# Ten faster shell directions

AK-189. Open [index.html](index.html) by double-click. It contains all markup, styles, Geist and original croc artwork; no server, network, dependency or build is needed. It starts dark. **Dark theme** toggles all frames between paired dark and light tokens.

Use **Inspect at full size** to see each 1280 × 800 desktop at native size. The frame scrolls with keyboard or trackpad. Expand a **390px phone outline** for each option. Gallery thumbnails deliberately scale type down; full-size shells use at least 12px text. Phone rows are at least 44px tall and all nine destinations remain in the left navigation.

| # | Name | Feel | What makes it feel fast | Trade-off |
| --- | --- | --- | --- | --- |
| 01 | Split lane | A narrow identity spine beside a precise navigation lane. | Separate identity from movement; the selected row snaps to an inverted strip. | Two vertical lanes cost horizontal space. |
| 02 | Headerline | A continuous masthead with navigation hung beneath it. | A long command entry and short underlines give every action a clear origin. | The taller masthead takes room from the page. |
| 03 | Needle | A slim, labelled rail with a generous working field. | A right-edge marker lands directly beside the page; no enclosing panels. | Long project names need wrapping. |
| 04 | Command deck | A broad command shelf above a compact, keyed navigation list. | The command field leads; shortcuts and an inverted row make movement explicit. | The command shelf can dominate quiet reading. |
| 05 | Bracket | An exact, unfilled frame drawn with short selection brackets. | The selection changes at its edges; the canvas stays still. | Bracket selection is less familiar than a filled row. |
| 06 | Floating strip | One detached navigation strip beside an uninterrupted canvas. | Only navigation has a boundary; a small pill follows the selection. | Detached navigation can feel less anchored. |
| 07 | Flush canvas | A recessed work surface with navigation joined to its edge. | The selected row meets the canvas, so the destination feels already open. | The joining seam needs careful alignment in a real app. |
| 08 | Bottom anchor | Navigation starts at the top; project and identity sit at the foot. | Destinations are the first thing in the rail, with a thin selection cursor. | People expect the project switcher near the top. |
| 09 | Key index | A numbered shortcut gutter beside a strict text rail. | Tabular key hints form a stable index; the current key inverts immediately. | Nine visible key hints add noise for occasional users. |
| 10 | Right register | A wide, right-aligned rail facing a narrow content column. | Labels terminate on one sharp edge; a short rule points into the page. | Right-aligned navigation is harder to scan by first letter. |

## Recommendation

**01 · Split lane** is my first choice. The separate brand spine gives AutoKolab a recognisable silhouette without putting decoration into the work. The inverted selection is decisive in either theme, and project switching has its own clear position. It is a stronger departure from the first set than another variation on a quiet sidebar.

**07 · Flush canvas** is the more familiar alternative. The selected destination joins the content surface; the eye can follow that connection without an extra breadcrumb or animation. Its inset canvas can frame any existing tab without choosing new content. The seam would need rendered checks with actual page lengths before implementation.

I would **not pick 10 · Right register** for everyday use. It is a useful contrasting outline, but scanning right-aligned labels and paying for the wider rail are poor trades for a tool used repeatedly through the day. These are recommendations, not an adopted design decision.

## What is different from the first ten

These are structural studies, not renamed colour or radius variants. Split lane separates identity from navigation; Headerline creates a continuous horizontal masthead; Needle uses an edge marker and broad canvas; Command deck foregrounds the command shelf; Bracket uses unfilled selection corners; Floating strip detaches only navigation; Flush canvas joins a tab to the inset canvas; Bottom anchor reverses identity placement; Key index adds a numbered gutter; Right register aligns navigation toward the content.

There are shared ingredients with the earlier studies (thin rules, an inset, compact rows), but no warm paper, oversized mascot, serif editorial page, permanently dark rail, decorative icons, heavy workshop frame or floating pair of cards. Floating strip deliberately leaves the page flat, unlike Paper stack. Needle trades Control room's dense short rows for a slim rail with 48px rows. Bracket makes selection geometry the defining feature rather than Quiet precision's general restraint.

## Scope and interaction

- The same six-part shell markup is used in every frame. Grid areas and small overrides change geometry, surfaces, density, radius and selection. The page contains only a title, a placeholder label and two grey blocks; nothing defines real tab content.
- All nine destinations remain visible: Captain, Overview, Work, Team, Room, Decisions, Results, Settings, Guide. Captain carries a neutral sample count of two. There are no hidden navigation groups or overflow menus.
- Tab buttons demonstrate hover, press, focus and selected states. Clicking or pressing Enter/Space changes the selection and placeholder title in that frame only. A 100ms ease-out applies to surface changes; press has no delay. Reduced motion disables transitions. Grey placeholders are static and ready to be replaced by skeletons; no shimmer or spinner.
- Command entry, project switcher, account and sign out are drawings, as stated above the gallery. Shortcut hints show a visual direction, not new app shortcuts. The specimen uses macOS notation; an implementation should use the platform's modifier.
- Geist is embedded unchanged from the first study with its SIL Open Font License retained in the HTML. The operating system's `ui-monospace` is used only for shortcut hints and study numbers to make the key gutter stable; all interface labels and headings stay in Geist. Counts use tabular numerals.
- All shell colours use local paired CSS variables. The unchanged croc artwork is the brand exception. No new status is invented, and there are no gradients, blur, glows, shadows or decorative charts. Light mode changes every surface, selection and text role, including inverse selection.
- The ticket's light theme and nine visible left-side destinations take precedence over older dark-only and collapsed phone navigation sketches in the handoff. Keeping a left rail at 390px makes the placeholder narrow; these phone outlines expose that trade-off rather than settle a responsive app layout.
- Only this directory changes. No app code, application tokens, dependencies or tab content is touched.

## Verification and handoff

I could not render the page: the installed Playwright Chromium exited at launch with `sandbox_host_linux.cc:41`, `Operation not permitted`. No screenshots were produced. Layout, wrapping, focus visibility and visual polish in both rendered themes remain unverified; the reviewer should inspect them.

Source validation passed for ten named options, twenty desktop/phone shells, all 180 navigation rows, one initial active destination per frame, Captain counts, required shell elements, two placeholders per frame, unique IDs and embedded assets. CSS parsed successfully with the installed PostCSS; `node --check` passed for the inline JavaScript. These are source checks, not browser interaction or layout checks.

Calculated WCAG text contrast for normal and muted text against all four neutral surface roles, plus inverse selection, is at least **6.52:1 dark** and **5.19:1 light**. This checks the declared tokens; it does not substitute for rendered inspection.

- `npm run typecheck`: passed across all workspaces.
- `npm test`: failed. Helper tests reported 520 passed, 28 failed, 18 skipped and one unhandled error (10 failed test files). Failures include `spawnSync git EPERM`, a read-only ports lock, prohibited local socket binding, and runner/OpenCode assertion failures. Site tests passed: 436 tests across 30 files. The database policy test command was not reached because the workspace test command failed. No app or helper files were changed.
- Website build and app-page screenshots are not applicable: this change contains standalone research HTML only.
- `git add` failed because the shared Git worktree metadata is read-only (`index.lock` could not be created). No commit, push or PR was possible here; GitHub checks are unverified. Per the ticket's fallback, the runner must commit these two files, push `ak-189-10-more-shell-options-slick-modern`, open a PR against `main`, and confirm its checks. No alternate Git directory or remote was used.
- AutoKolab tools were unavailable, so newer ticket comments and ticket steps could not be fetched or updated. The supplied ticket snapshot guided the work.

- [x] Review the first set, visual plan, handoff and original brand assets.
- [x] Build ten distinct desktop shells, optional phone outlines and the comparison.
- [x] Verify source structure, contrast tokens and script syntax; attempt rendering and repository checks, recording limitations.
- [ ] Commit, push, open the PR against main and confirm GitHub checks.
