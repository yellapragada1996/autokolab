# Overview · wireframe v2

AK-171. A finished-looking study of the settled four-part Overview: Needs you → working sentence → every agent → goals being built. All project names, agents and work are fictional. Claude’s separate v2 wireframe folder has not been opened.

Open [overview.html](overview.html) by double-clicking. It works offline, including Geist and the logo. No server, installation, sign-in or network connection is needed.

## What is here

- `overview.html`: plain HTML, inline CSS and fixture-switching JavaScript. Desktop **1440 × 960** and phone **390 × 844** appear side by side at actual size. On narrower displays, scroll the comparison horizontally or use **Phone** / **Open phone**. Review controls and numbered design notes sit outside the product frames.
- `autokolab-logo.svg`: an unchanged copy of `apps/site/public/brand/autokolab-logo.svg`, referenced relatively. A CSS grayscale filter keeps the brand neutral in this status-only colour study.
- `geist-latin.ttf`, `OFL.txt`: the bundled variable Geist font and its SIL Open Font License, from [Google Fonts’ Geist directory](https://github.com/google/fonts/tree/main/ofl/geist). The filename is local; the font includes the source file’s full character coverage.
- `busy-1440-dark.png`, `busy-390-dark.png`, `busy-1440-light.png`, `busy-390-light.png`: browser screenshots of the busy state in both themes and sizes.
- `questions-1440-dark.png`, `questions-390-dark.png`: additional screenshots showing two full questions and counted overflow.
- `verify.mjs`, `validation.json`: repeatable browser checks and their recorded results. Run `node docs/research/overview-wireframe-v2/codex/verify.mjs` from the repository with its existing Playwright and a working Chromium installation. It regenerates the screenshots and report.

The state selector changes both frames together. The theme selector changes the frames and the review canvas. Separate frame links preserve both selections.

## Eight states

| State | What it demonstrates |
| --- | --- |
| Busy | Three working agents, counting Captain’s review; an explicit idle row; two goal counts. |
| Questions waiting | Two complete questions, one intentionally long; **2 more in Captain**; an agent **Waiting on you**. |
| Agent stopped | The sentence names Tern’s stop; Tern’s row gives the daily-limit reason. |
| Calm | Every connected agent remains, with **Idle** or **Offline**; empty Needs you and Being built disappear without gaps. |
| Brand-new project | No agents or goals; the heading offers one next action, **Open Team**, to connect Captain. |
| Many agents | Thirteen agents, including long names and work, every status and four goals. Everyone remains in the list. |
| Loading | A plain loading sentence and static placeholders; no invented idle or goal counts. |
| Load failed | An explicit error and retry in the heading area; no false calm state. |

Links mark the prototype boundary with a note below the frames. They illustrate their intended destinations; other pages are not drawn. Questions open Captain, active agents and goals open Work, and idle/offline agents open Team in the proposed app. Retry selects the busy fixture; it is not a real data fetch.

## UX principles applied

- **Visual hierarchy:** questions get the first position; the state sentence is the largest type; names and ordinary work follow.
- **Progressive disclosure:** questions route to Captain, work to Work and agent availability to Team; the overview stays brief.
- **Purpose rule / minimalism:** exactly the four settled parts, without tiles, delivery history, next steps, freshness or a footer.
- **Proximity and alignment:** a single reading column, shared row columns and subtle separators group related facts.
- **Consistent rhythm:** spacing uses a 4/8px grid; desktop sections have 40px separation, phone sections 24px.
- **Typographic hierarchy:** Geist at 30px for the desktop sentence, 21px on phone, 15px names, 14px activity and 12px quiet labels/status.
- **Recognition over recall:** ordinary status words accompany every dot; progress reads “4 of 7 done”.
- **Stable spatial memory:** Captain first, then alphabetical names; status never sorts the list. Thirteen agents scroll naturally without folding idle people away.
- **Responsive reflow:** phone work moves below the name; long names and activities wrap fully, while status and goal counts retain their columns.
- **Accessible interaction:** semantic headings/lists/navigation, a skip link, one link per row, explicit accessible names, visible neutral focus and at least 44px phone targets.
- **Honest feedback:** loading and failure never claim that nothing is working; a stopped agent is named in the sentence and explained in its row.
- **Calm motion:** only a gentle hover/press surface transition; reduced-motion preferences remove it. No pulse, shimmer or automatic scrolling.
- **Continuity during change:** the proposed app retains known rows during refresh, updates them in place and preserves focus/scroll; this static study swaps complete fixtures.

Desktop names truncate with an ellipsis, full native tooltip and full accessible name. Phone names and activities wrap without a line clamp. Questions and goal names wrap at either width. Goal counts never wrap. The busy phone state fits all four agents and both goals above the fixed bottom navigation; longer states scroll with clearance below their final row.

All eight destinations fit in a two-row phone bottom bar. This deliberately spends 109px to keep the requested shell visible, with no horizontal tab hunt and no targets below 44px. The real product’s navigation is not changed.

## Tokens and precedence

The dark colour tokens and font/spacing scale come from `autokolab-ux-handoff/tokens.css`. The handoff has no light palette: the light theme proposes equivalent semantic-token overrides, only inside this study. All component colours use variables. The neutral focus ring uses `--text-secondary` to meet contrast requirements.

Amber appears only as a 6px dot next to a need or waiting word; working/reviewing dots are blue, stopped/error dots coral, idle/offline dots grey. Agent avatars remain neutral. Navigation selection and hover are neutral too.

AK-171’s settled content wins over the older proposal details (no task fractions or folded idle-agent summaries), and over the older amendment list of Overview blocks. DEC-24’s separation of Captain chat and Overview, small amber marks, and the amendments’ purpose rule remain in force. The source reads were both v2 prose proposals, the first structural wireframe, amendments, principles and tokens.

## Validation

**Previewed in Chromium through `file://`**, including the side-by-side board. I opened the desktop and phone screenshots in both themes, the question layouts, the stopped phone, the long-list phone and the new-project desktop. Desktop columns align; phone status words remain readable, long names wrap and the bottom bar clears the busy goal list. Long lists scroll rather than dropping agents.

- Browser verification: **32 views** (eight states × two themes × two sizes), **16 synchronized selections**, no horizontal overflow in either product frame, no failed requests/page errors and no external network requests.
- Contrast: lowest checked text **5.13:1**, status dots **5.13:1**, focus ring **8.10:1**. Minimum text **12px**; minimum phone target **44px**. These are computed colour checks, not a claim of a full assistive-technology audit.
- Keyboard: skip link → main → first agent, visible focus, plus hover/pressed surfaces verified. Reduced-motion views have no animation.
- `npm run typecheck`: passed in all workspaces.
- `npm test`: **941 passed, 2 skipped** across helper and site unit tests. The database phase could not start because `createdb` is unavailable in this environment; GitHub’s checks run it with Postgres.

The AutoKolab ticket tools were unavailable; work was tracked locally and the runner’s ending block supplies the ticket update. Only this ticket’s `codex/` folder is changed.
