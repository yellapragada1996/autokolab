# Needle wireframes · AK-190

Open **[index.html](index.html)** by double-clicking it. This single HTML file embeds its CSS, small theme/frame script, Geist font and original artwork. It needs no server, network, sign-in, build or supporting files at runtime. The other files are editable sources and verification evidence. Only this folder changes.

Choose System / Light / Dark and a frame width in the gallery toolbar, then use the contents links. Shell footer appearance buttons change the same preference. System follows the operating system; a manual choice persists when browser storage is available. Switching appearance keeps the existing markup and field values. **Show both side by side** presents fixed dark/light copies of the shell and Overview. The style sheet and shared-state specimens always display both palettes.

Frames use actual CSS pixels, with no scaled-down text. Scroll the gallery horizontally for wide frames, and vertically for complete screen content. App actions are static specimens; native fields and disclosures work, and links move between frames. The gallery does not send, save, approve or sign out.

## Included

- Needle shell at 1440, 1024 and 390, plus a 320 navigation check. All nine labelled destinations remain present. No More, Project menu or collapsed navigation group.
- Captain, Overview, Work board, Work ticket, Team, Room, Decisions, Guide, Results and Settings at 1440 and 390. The global appearance control applies both themes to every ordinary frame. Including the fixed comparison copies, there are **36 device frames**.
- Real top-bar titles, subtitles and actions; Captain’s needs-you count; project switcher closed and open; account name and Sign out; active, hover, focus and pressed navigation specimens.
- Both-theme token/style sheets: twelve-step neutral ramps, surfaces, borders, text, labelled status colours, original croc green, type roles, spacing, radii, elevation, icons, buttons, inputs, pills, avatars, focus and motion.
- Existing loading, empty, error, dialog, dropdown, toast, tooltip, selected-row and disabled-control states. The dialog is the real New ticket form. The dropdown and selected row use the real project choices. The tooltip comes from Results’ CSV export. Saved / Undo is a shared feedback component specimen, not an invented app event.

## What makes Needle work

The desktop rail stays **168px** wide at both 1440 and 1024, as in option 03. Navigation uses **48px rows** with a **2px right-edge selection marker**, immediately beside the working field. The rail shares the page surface; there is no enclosing navigation card or panel. A thin rule along the navigation edge supplies orientation. Active navigation has neutral type and the edge marker, without a filled selection slab.

Ordinary working-field gutters are **48 / 32 / 16px** at 1440 / 1024 / 390. Reading content caps at 780px, records at 860px and data at 1180px. Overview retains its approved 1120px cap, 56px desktop inset and 20px phone inset. Hairlines separate content; essential field edges and focus indicators use stronger contrast tokens. Hover and pressed changes take 120ms; the overlay token is 140ms. Reduced motion removes transitions. No repeating presence animation is used.

On phones the rail becomes a permanently expanded **3×3 grid**, in normal page flow. Every destination remains visible without opening anything. It can scroll offscreen while reading. Rows stay 48px high; phone controls have at least 44px height in the proposed CSS. Actual layout, target geometry and keyboard behaviour could not be verified in a browser here.

Compared with today’s app, the presentation exposes all nine existing destinations directly, uses the slim open rail and right marker, and replaces the bottom Project disclosure on phones with the permanent grid. The **System / Light / Dark appearance control in the rail footer is the only new control**. This is called out beside the shell frames, too.

The unchanged original croc appears beside the neutral AutoKolab name in every rail. It also appears on the brand specimen. Approved v5 calm and welcome source scenes retain their croc; A1, the displayed Overview scene, does not gain one. The working field gets no decorative mascot. Croc green is the sole brand exception; other colour means status and keeps its source word. Agent avatars, navigation, links, preferences and primary actions are neutral.

## Content evidence

The current-app fixture is **Shop**, from `apps/site/src/workspace/demo.tsx` at checkout **79f5f5e**. It uses the repository’s demo tickets, people, agents, conversations, decisions, guide, usage and invite records. It is not live project data. The capture clock is fixed to **18 October 2026, 12:00 UTC**.

This reuses AK-187’s gallery structure, snapshot pipeline, tokens, typography, content adapters and verification. The nine screen snapshots were regenerated against this checkout; they match AK-187’s source snapshots byte for byte. No screen text or controls were invented. The source renderer seeds the existing delayed Captain messages and ticket details in memory, so the gallery shows their loaded demo values. It runs no effects or database requests and writes no app files.

The audit compares every ordinary/comparison frame with the current snapshots, including text, field labels, options, values, disabled states, controls and table counts. The only deliberate text omissions are **existing keyboard hints**, as the ticket requires: the board’s C keycap, shortcut tooltip suffixes and the New ticket dialog’s create shortcut. The unmodified snapshots preserve these for comparison.

**Overview is the requested exception:** approved v5 **A1: one question waiting**, using Northstar Shop, Raghav, Birch, Fjord and Kestrel. Its content, order, classes, goal cards, question, agent rows, progress shapes and responsive geometry are preserved exactly. Only palette aliases, gallery links and the surrounding Needle shell change. Its top bar is taken from today’s actual Overview top bar, with the project name changed to match the approved fixture. It retains **Updated just now** and the existing **Search** action. The unconditional update wording remains separate work in AK-181.

Guide retains today’s **Decisions** page title, subtitle, Create action and Guide / Decisions inner views. Work retains all four inner views, its existing board search, filters, lanes and hidden-empty-column note. Results retains its definitions, caveats, current numbers, tables and exports. Room retains its conversation and bookkeeping folds. No content cleanup or new capability is proposed.

## Left out because it does not exist

- Option 03’s **Command… entry**: it is not today’s top-bar control. No command entry or command-bar specimen is drawn.
- Extra global search fields, navigation search, command history, suggested commands and numbered key gutters: no such visible shell controls exist in these positions.
- Invented project/account menu contents: the real demo project list contains **Shop** and **+ New project** only. No extra projects, workspace controls, billing or profile menu is fabricated. The approved Overview scene substitutes Northstar Shop consistently for its project label.
- Future handoff features absent from current screens, including a Settings quiet-hours form, editable risky-path controls, a Room thread sidebar and a Results solo-baseline comparison. Their older screen specs do not override current app content.

**Existing features deliberately not illustrated:** the ticket excludes keyboard hints even where the app has them. The app also has a command/search dialog, but it is omitted to keep this reference free of command entries. The existing top-bar **Search button** remains, because `Workspace.tsx` renders it on these pages today; the existing **Search this board** field remains only in Work. These are source-verified controls, not additions.

## Deviations from option 03

| Difference | Reason |
| --- | --- |
| Remove Command… and the numbered key gutter | Explicit ticket instruction; they are not the requested current visible shell. |
| Permanent 3×3 phone navigation instead of the shell study’s outline | Required by this ticket and the appearance plan. Every destination stays exposed. |
| Add footer appearance control | The sole explicitly authorised new control, needed for both themes. |
| Use the original croc with neutral live text for AutoKolab | Keeps option 03’s compact identity and readable branding in both themes without recolouring the original artwork. |
| Retain current top-bar titles and actions | The shell study used placeholders; this gallery preserves actual page content. |
| Keep v5 Overview geometry and progress patterns | Explicitly approved layout. SVG status stripes replace CSS gradients; their information is retained. |
| Keep account/appearance below navigation on very long static frames | Avoids placing utilities thousands of pixels below the start of a complete conversation. The eventual short-window rail should scroll as one region. |

The ticket takes precedence over the older handoff’s dark-only theme and hidden phone navigation. The current app takes precedence over unbuilt handoff screen content. Overview v5 takes precedence for the Overview composition.

## Contrast and checks

`tokens.css` has three layers: neutral primitives, semantic roles and component aliases. Existing app/v5 names resolve at each theme boundary. The style sheet shows **28 measured foreground/background ratios**, also recorded in [contrast.json](contrast.json).

| Printed pair group | Dark minimum | Light minimum | Required |
| --- | --- | --- | --- |
| Text and labelled status fills | 5.74:1 | 4.79:1 | 4.5:1; reading/card separately ≥7:1 |
| Essential boundaries, focus and navigation marker | 3.16:1 | 3.10:1 | 3:1 |

Generation also checks all text/status roles on page, navigation, card, inset, hover, pressed, selected and floating surfaces, plus status marks, control edges and focus at ≥3:1. `verify.py` checks **96 explicit text/background pairs** in generated presentation rules, including the disabled New ticket action. All pass. These are opaque sRGB token-pair calculations; they do not certify rendered contrast, native widgets or accessibility. Decorative hairlines are not essential control boundaries. Original brand artwork is the declared exception.

| Check | Actual result |
| --- | --- |
| Source capture and static build | Passed: nine current screen snapshots, actual Overview top bar, real New ticket dialog and approved v5 source. |
| `python .../verify.py` | Passed: 36 frames, nine navigation links each, source text/control/table preservation with explicit shortcut omissions, exact v5 structure, embedded resources, IDs/links, palette pairs, type minimum, reduced motion and Needle geometry rules. This is a source audit, not a rendered-layout check. |
| JavaScript syntax | `node --check` passed for gallery, snapshot and browser scripts. |
| Browser / screenshots | **No browser ran.** Four system/bundled Chromium launch configurations all failed with `Operation not permitted` and `SIGTRAP`: Crashpad `setsockopt` or `sandbox_host_linux.cc` `shutdown`. `look.mjs` exited 2. [browser-check.json](browser-check.json) records the attempts. No screenshots exist; wrapping, layout, focus, touch targets, both-theme rendering and side-by-side rendering remain unverified. |
| `npm run typecheck` | Passed across workspaces. |
| `npm test` | Exit 1. Site: **436 passed**. Helper: **520 passed, 28 failed, 18 skipped**, 10 failed test files and one unhandled socket error. Failures include `spawnSync git EPERM`, blocked sockets, read-only helper state and process-output/assertion failures. Database policy tests were not reached. No unrelated changes were made. |
| Site build / `npm run look` | Not required: no app/site files changed. The dedicated gallery browser check was attempted above. |
| Scope / whitespace | Only this folder is added. `git diff --check` and the new-folder text whitespace audit pass. |
| Commit / push / PR / CI | Staging failed: the shared Git directory is read-only and cannot create `index.lock`. No commit, push or PR was possible here; no GitHub check status is claimed. Publication is left to the authorised runner. |

The font is the bundled Geist Sans from AK-187, under the included SIL Open Font License. The mono role uses platform fallbacks because Geist Mono is not bundled. No remote font request occurs.

## Frame-to-file map

Paths are relative to `apps/site/src` unless specified. These implementation files are not changed.

| Frame / part | Existing source for later implementation |
| --- | --- |
| Needle shell, nine links, project choices, account and top bars | `workspace/Workspace.tsx`, `styles.css`, `lib/router.ts`; account/profile wiring in `App.tsx` |
| Theme tokens, type and gutters | `tokens.css`, `styles.css`; proposal in this folder’s `tokens.css` |
| Shared buttons, icons, pills and avatars | `ui/index.tsx`, `ui/kit.tsx`, `ui/avatars.tsx`, `workspace/bits.tsx` |
| Captain | `workspace/CaptainHome.tsx`, `workspace/captain.ts`, `workspace/useCaptainRoom.ts`, `workspace/ApproveChange.tsx` |
| Overview frame | `workspace/Overview.tsx`, `workspace/overview-parts/overview.css`; reference `docs/research/overview-wireframe-v5/codex/overview.html` |
| Overview question, headline and crew | `workspace/overview-parts/NeedsYou.tsx`, `workspace/overview-parts/Heading.tsx`, `workspace/overview-parts/AgentRow.tsx`, `workspace/overview-parts/StepTicks.tsx` |
| Overview goals/progress/ticket lists | `workspace/overview-parts/Goals.tsx`, `workspace/overview-parts/GoalProgress.tsx`, `workspace/overview-parts/Link.tsx` |
| Work board and existing inner views | `workspace/Board.tsx`, `workspace/work.ts`, `workspace/Backlog.tsx`, `workspace/ListView.tsx` |
| Work ticket | `workspace/TicketPage.tsx`, `workspace/bits.tsx`, `workspace/useFullTicket.ts` |
| Team | `workspace/People.tsx`, `workspace/agentOptions.ts`, `workspace/agentCosts.ts`, `workspace/useAgentCosts.ts` |
| Room | `workspace/Room.tsx`, `lib/room.ts` |
| Decisions | `workspace/Decisions.tsx`, `workspace/bits.tsx` |
| Guide | `workspace/GuidePage.tsx`, `workspace/bits.tsx` |
| Results | `workspace/ResultsPage.tsx`, `workspace/results.ts`, `workspace/efficiency.ts` |
| Settings | `workspace/Settings.tsx`, `workspace/People.tsx` (`Merging`, `InvitePanel`), `workspace/useDecisionNotifications.ts` |
| Loading/empty/error | `workspace/CaptainHome.tsx`, `workspace/Board.tsx`, `workspace/Overview.tsx`; approved v5 error specimen |
| Dialog | `workspace/NewTicket.tsx`; all current fields/options, with the ticket-required shortcut omission |
| Dropdown / selected project row | `workspace/Workspace.tsx` project selector |
| Toast / Saved / disabled Record | `ui/feedback.tsx`, `workspace/Decisions.tsx` |
| Tooltip | `workspace/ResultsPage.tsx`, CSV export title |
| Demo records | `workspace/demo.tsx` |
| Original artwork | `apps/site/public/brand/autokolab-{logo,croc,wordmark}.svg` |

Gallery controls, annotations, fixed comparisons and verification tools are documentation only.

## Files and reproduction

| Files | Purpose |
| --- | --- |
| `index.html` | Complete single-file offline deliverable. |
| `tokens.css`, `gallery.css`, `overview.css`, `snapshot-styles.css`, `gallery.js` | Editable source for the embedded presentation/runtime. |
| `snapshots.json`, `shared-snapshots.json`, `overview-snapshots.json`, `content-manifest.json` | Frozen source markup and exact content-audit input. |
| `snapshot.mjs`, `overview-snapshot.mjs`, `build.py` | Build-time capture and generation, reusing AK-187. |
| `verify.py`, `contrast.json` | Scope/content/palette evidence. |
| `look.mjs`, `browser-check.json` | Optional browser checks, 16 requested screenshots when a browser runs, and actual launch results. |
| `autokolab-*.svg`, `geist-latin.ttf`, `OFL.txt` | Original local artwork and font/license inputs; embedded into the HTML. |
| `PR-description.md` | Reviewable PR description ready for the runner. |

Run from the repo root using existing Node dependencies and Python with BeautifulSoup. No dependency was added. Do not refresh the source captures casually after app changes; re-audit the result.

```sh
node docs/research/ui-polish/needle-wireframes/snapshot.mjs
node docs/research/ui-polish/needle-wireframes/overview-snapshot.mjs
python docs/research/ui-polish/needle-wireframes/build.py
python docs/research/ui-polish/needle-wireframes/verify.py
node docs/research/ui-polish/needle-wireframes/look.mjs
```

Screenshot mode: `index.html?shot=overview&width=390&theme=light`. Other frame IDs are `shell`, `captain`, `work`, `ticket`, `team`, `room`, `decisions`, `guide`, `results`, `settings`. Browser checks cover every ordinary frame in each theme and request shell/Overview/Work/Captain screenshots at 1440 and 390. Exit 2 means no browser; exit 1 means a rendered check failed.

## Work steps

- [x] Read Needle, AK-187, the current shell/screens, handoff and Overview v5.
- [x] Capture the current app and build the Needle rail, phone grid and paired frames.
- [x] Audit controls, style sheet, shared states and annotations.
- [x] Verify content/contrast, attempt screenshots and document the frame map and limitations.
- [x] Run repository checks and prepare the PR description.
- [ ] Runner: commit, push, open the PR against main and confirm green GitHub checks.

AutoKolab tools are unavailable here, so ticket steps/comments could not be fetched or updated beyond the supplied ticket snapshot. The final `autokolab` block hands publication to the runner, as the ticket permits. Its Review handoff does not claim that a PR already exists or that CI passed.
