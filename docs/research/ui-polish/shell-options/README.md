# Ten shell directions

AK-188. Double-click [index.html](index.html). It is one self-contained file: plain HTML/CSS, embedded original croc and Geist, no network or build. The only JavaScript switches all ten options between light and dark.

Compare the desktop outlines, use **Inspect at full size** for readable 1280px frames (scroll with the keyboard or trackpad), and expand **Phone outline** for each 390px study. All nine tabs stay in the left rail; Overview is selected and Captain has a sample count of two. Frame controls are drawings, not working app controls. Two grey blocks deliberately avoid tab-content decisions.

| # | Name | Feel | Distinctive point | Trade-off |
| --- | --- | --- | --- | --- |
| 01 | Open air | Relaxed, spacious, soft around the edges. | Wide rail, pill selection, generous inset and rounded surfaces. | Consumes space; long records may feel sparse. |
| 02 | Quiet precision | Crisp, calm and deliberately understated. | Thin dividers, small radii, restrained title and a steady rhythm. | Less distinctive on its own. |
| 03 | Kitchen table | Warm, friendly and slightly informal. | Warm neutral paper, rounded project tile and a welcoming croc. | Warmth may feel too casual for technical work. |
| 04 | Croc studio | Recognisably AutoKolab before you read a word. | Large original mascot in the rail; a green brand rule only at the masthead. | Mascot takes space and can distract on repeat visits. |
| 05 | Field notes | An editorial workspace with room to read. | Georgia headings, an open rail and a narrow reading column. | Serif headings may feel separate from the rest of the app. |
| 06 | Control room | Compact and direct for frequent users. | Narrow rail, 32px desktop rows, small inset and wide content. | Tighter desktop targets and less breathing room. |
| 07 | Paper stack | A clear sheet of work on a quiet desk. | Inset floating sidebar and content sheet on a neutral tinted canvas. | Extra edges and gutters use space. |
| 08 | Night spine | A steady dark anchor in either theme. | Dark navigation stays fixed while the main canvas changes. | High contrast split can pull attention toward the rail. |
| 09 | Wayfinding | Easy to scan by shape as well as words. | Outline icons with neutral section marks and explicit labels. | Nine icons add visual noise; section colour would misuse status. |
| 10 | Workshop | Bold, utilitarian and a little unconventional. | Square geometry, heavy rules, offset sheet edge and oversized title. | The shell competes with the work; tiring for daily use. |

## My recommendation

I would pick **02 · Quiet precision** for AutoKolab: its quiet frame gives Captain and real status signals room to carry attention, and it fits both reading and work views. **08 · Night spine** is the alternative if we want a more recognisable silhouette while keeping the content equally restrained. Keep the croc as the brand signature in either.

I would not pick **10 · Workshop** for the everyday app. Its strong rules make the comparison useful, but compete with conversations and evidence over a long session. These are recommendations for the choice, not an adopted design decision.

## Deliberate limits

- One shared shell structure and small CSS overrides per option; no separate components or design systems. Colours are local CSS tokens in the HTML. App tokens and code are untouched.
- Geist is embedded with its SIL Open Font License in the HTML; option 05 deliberately uses the system Georgia/Times New Roman serif for headings. Croc artwork is unchanged from `apps/site/public/brand/autokolab-croc.svg`.
- Option 09 uses outline icons and **neutral** section separators. The ticket's status-only colour rule takes precedence over its illustrative suggestion of colour-coded sections. Only the croc and option 04's adjacent brand rule use brand green. Counts are neutral, not invented coloured statuses.
- This ticket's nine visible tabs, light theme and left rail override older handoff navigation sketches. Phone frames retain every label in that rail, making the content narrow; this is a visible trade-off, not a settled responsive design.
- Desktop thumbnails intentionally scale below reading size. Full-size inspection restores at least 12px text; phone navigation uses 44px rows. No loading behaviour, real page layout or interactions are proposed.

## Work steps

- [x] Read the plan, gallery, brand assets and handoff amendments.
- [x] Make ten desktop and optional phone outlines, plus the comparison and recommendation.
- [x] Check structure and theme script; attempt browser rendering and run repository checks.
- [x] Prepare runner handoff after Git staging was blocked. Publication remains pending.

## Checks and publication

- Source audit passed: ten named options, twenty desktop/phone frames, nine navigation labels in order, one active item and Captain count per frame, every requested shell element, exactly two placeholder blocks, unique IDs, embedded original croc and at least 12px unscaled text. Theme script syntax and both toggle directions passed. These are source checks, not visual approval.
- `npm run typecheck`: passed.
- `npm test`: exit 1. Site: 436 passed. Helper: 520 passed, 28 failed, 18 skipped, plus one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, runner output/assertions and timeouts. Database policy tests were not reached. No app or test files were changed.
- Browser: Playwright Chromium could not start (`Operation not permitted`, `SIGTRAP`). No screenshots were produced; desktop/phone layout, wrapping, focus and both rendered themes remain unverified. Website build is not required for this docs-only change.
- Publication: `git add` failed because the shared Git directory is read-only (`index.lock`). No commit, push or PR was possible; GitHub checks are unverified. Only this directory changed.

Runner: commit these two files on `ak-188-10-quick-shell-style-options-outlines`, push it, and open a PR against **main** titled **AK-188: Compare ten shell directions in light and dark**. Include the check results and browser limitation above. Confirm GitHub checks are green before normal review; do not merge. The final Review status is the ticket's permitted runner handoff, not a claim that publication or CI succeeded.
