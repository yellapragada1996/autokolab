# A polished AutoKolab, in dark and light

I understand this as a redesign of AutoKolab's appearance: its navigation, page frame, type, spacing, surfaces and interaction states. Every tab keeps its current words, data, features, controls and purpose. All destinations become visible navigation items. This report proposes that visual system and a safe way to introduce it. It does not propose new tab content, fewer tabs, wireframes, mockups or implementation. Nine readable destinations cannot fit in one phone navigation row. I recommend three always-expanded rows instead. Keeping every destination on screen at every moment is not feasible on every short screen, at high zoom, or beside an open phone keyboard; those cases need ordinary vertical scrolling, never a menu of hidden destinations.

## Scope and evidence

Reviewed on 18 October 2026, against checkout `158aaf8`. This is a recommendation for Raghavendra, not an adopted project decision. Only this report changes in AK-186.

The request takes precedence over older navigation advice. The [amendments](../../../autokolab-ux-handoff/00-AMENDMENTS.md), then [principles](../../../autokolab-ux-handoff/01-principles.md), guided the review. I also read the token, motion and relevant screen specifications. Their proposed content is not permission to change today's content. In particular, I do not carry forward the earlier [coherence review's](../coherence-review.md) proposals to merge destinations or move material between tabs.

Three conflicts need explicit treatment:

| Tension | Resolution proposed here |
| --- | --- |
| The ticket says eight or nine tabs; Guide already exists inside Decisions. | Plan for nine: Captain, Overview, Work, Team, Room, Decisions, Results, Settings, Guide. Keep Guide and give it a direct navigation link. Keep the existing inner views and routes. |
| The handoff specifies dark-only styling and, at some widths, sideways navigation or four phone destinations. | This request explicitly asks for both themes and every destination visible. Design both themes and an expanded phone grid. These departures should be recorded when implementation is approved. |
| Colour should mean status, but the croc is green. | Keep the original green logo as the existing brand signature. Outside the logo, green means the existing done/safe status only. No green selection, generic action button or focus ring. |

**Evidence limit.** I inspected source and opened the existing [light Overview reference](../overview-wireframe-v5/claude/a5-light-1440.png). That image is a design reference, not today's app. A direct Playwright Chromium launch failed with `sandbox_host_linux.cc:41`, `Operation not permitted`, and `SIGTRAP`. I could not inspect the running app at desktop or phone width. Wrapping, perceived contrast, touch behaviour and rendered alignment remain unverified. Web sources below were reachable. No new visual artifact was made.

AutoKolab ticket tools are unavailable in this session, so I cannot update ticket steps or retrieve newer comments directly. The supplied ticket and its zero-comment snapshot are the available instructions. Work status:

- [x] Review source, handoff and constraints.
- [x] Check official inspiration sources and browser availability.
- [x] Write the visual system, shell, tab treatments and rollout.
- [x] Audit scope and references; run repository checks and record results.
- [ ] Runner: commit, push, open the PR against main and confirm green GitHub checks.

## Why the app does not yet feel polished

My judgment is that the main problem is inconsistent visual rules, rather than a lack of decoration. Several good individual treatments compete. The evidence below distinguishes code facts from their likely visual effect. It is not a claim that I measured usability or saw the live application.

| Area | Verified in this checkout | Design judgment and consequence |
| --- | --- | --- |
| Navigation | [Workspace.tsx](../../../apps/site/src/workspace/Workspace.tsx#L253) renders only Captain, Overview and Team as primary links. Work, Room, Decisions, Guide, Results and Settings sit inside a closed `Project` disclosure, alongside Sign out. | Navigation presents important destinations as secondary utilities. It directly fails this ticket's visibility requirement. The full list of routes in the file does not mean those routes are visible. |
| Phone shell | [styles.css](../../../apps/site/src/styles.css#L207) gives three links 75% of a fixed bottom bar and Project the remaining 25%. Earlier rules at lines 99–115 describe sideways navigation, but the later shell rules override it. | Assessing only the earlier responsive rules would miss the actual design. A new phone treatment must replace this combined cascade, not add a third competing layer. |
| Theme coverage | [tokens.css](../../../apps/site/src/tokens.css#L6) contains a dark palette. [styles.css](../../../apps/site/src/styles.css#L24) sets a dark colour scheme. [Overview implementation notes](../../../apps/site/src/workspace/overview-parts/IMPLEMENTATION.md) confirm that no app theme switch is built. | Light mode needs its own surface and contrast decisions. Changing the page background alone would leave controls and nested surfaces unfinished. |
| Local palette | [overview.css](../../../apps/site/src/workspace/overview-parts/overview.css#L3) introduces literal card, hover, skeleton, green and bright-red colours. It overrides the active surface locally. The shared token file's claim that it is the only colour source is therefore no longer true. | The new Overview can look internally coherent while disagreeing with every neighbouring tab. Preserve its approved structure, but make its visual roles part of the shared system. |
| Two component styles | [StatusPill](../../../apps/site/src/ui/kit.tsx#L8) uses rounded pills and 500-weight text. [StatusLozenge and LeadBadge](../../../apps/site/src/workspace/bits.tsx#L87) use tight 20px or 18px boxes, 4px corners, and heavier text, sometimes uppercase. Captain uses plain messages and small dots in [CaptainHome.tsx](../../../apps/site/src/workspace/CaptainHome.tsx#L191). | These are concrete examples of the coherence review's two “visual dialects.” Different content can have different layouts; equivalent labels and actions should still feel related. |
| Type hierarchy | [Workspace.tsx](../../../apps/site/src/workspace/Workspace.tsx#L170) uses a 22px, 500-weight page heading. [GuidePage.tsx](../../../apps/site/src/workspace/GuidePage.tsx#L110) uses 18px section headings; [Settings.tsx](../../../apps/site/src/workspace/Settings.tsx#L14) uses 16px. Overview has its own title and card hierarchy. [index.html](../../../apps/site/index.html#L14) loads Geist and Geist Mono from Google Fonts. | The family is already appropriate. Hierarchy needs named roles rather than independent sizes. Network font loading is also a possible source of layout movement; it is not proof that movement happened here. |
| Spacing and alignment | The shell uses 28px gutters, with 48px on the Overview top bar. Captain centres a 780px column. Settings caps at 780px, Team and Guide at 860px, Results at 1180px. Overview's scoped frame has 56px padding and a 1120px maximum. See [Workspace](../../../apps/site/src/workspace/Workspace.tsx#L195), [Captain](../../../apps/site/src/workspace/CaptainHome.tsx#L60), [Settings](../../../apps/site/src/workspace/Settings.tsx#L11), [People](../../../apps/site/src/workspace/People.tsx#L63), [Results](../../../apps/site/src/workspace/ResultsPage.tsx#L118), [Overview styles](../../../apps/site/src/workspace/overview-parts/overview.css#L35). | Some width differences are necessary. The missing rule is how the frame, heading and content edges relate. Arbitrary gaps make switching tabs feel like switching applications. |
| Borders, corners and depth | [tokens.css](../../../apps/site/src/tokens.css#L76) defines six non-pill corner sizes. Shared buttons also use literal 10px and 11px corners. Work cards lift 2px and gain a shadow; Overview cards use a fine edge and inset highlight. See [ui/index.tsx](../../../apps/site/src/ui/index.tsx#L12), [styles.css](../../../apps/site/src/styles.css#L136), [overview.css](../../../apps/site/src/workspace/overview-parts/overview.css#L162). | A card, an interactive row and a floating dialog need different depth. Current shape choices do not consistently communicate those roles. Hover lift can make a dense board feel restless. |
| Colour semantics | Older `--primary` and `--warn` names already map to neutral text and amber in [styles.css](../../../apps/site/src/styles.css#L3); the names alone are not evidence of wrong colours. However, the shared switch uses blue for “on,” and person presence maps “away” to amber: [kit.tsx](../../../apps/site/src/ui/kit.tsx#L68), [avatars.tsx](../../../apps/site/src/ui/avatars.tsx#L4). | Fix visual role mapping without changing the underlying state or wording. An enabled preference is not live work; an away person is not necessarily asking for a decision. |
| Icons and avatars | The shared [SVG icon set](../../../apps/site/src/ui/index.tsx#L74) uses rounded strokes. The sidebar currently renders text only, although navigation definitions include icons. Person circles and neutral agent tiles already exist in [avatars.tsx](../../../apps/site/src/ui/avatars.tsx). | Keep this restrained identity system. Do not add vendor colours or a new decorative icon family to each tab. Text-only navigation is a valid deliberate choice. |
| Top bar | Overview gets a project title and “Updated just now”; Search is hidden there and the top bar disappears below 1100px. Other tabs get a heading, subtitle and conditional actions. See [Workspace.tsx](../../../apps/site/src/workspace/Workspace.tsx#L170) and [styles.css](../../../apps/site/src/styles.css#L173). | A shared spacing and surface treatment would make the shell more predictable. Do not invent a new status strip. The unconditional update wording is already separate work in AK-181 and stays out of this report's rollout scope. |
| Empty and loading states | [Room](../../../apps/site/src/workspace/Room.tsx#L116) uses loading text and a dashed unavailable panel. [Decisions](../../../apps/site/src/workspace/Decisions.tsx#L34) and [Guide](../../../apps/site/src/workspace/GuidePage.tsx#L70) use dashed empty panels. [Overview](../../../apps/site/src/workspace/Overview.tsx#L18) has its own skeleton cards and retained stale content. [ui/feedback.tsx](../../../apps/site/src/ui/feedback.tsx#L84) provides delayed skeleton bars. | Equivalent states need consistent padding, type and quiet surfaces. Preserve each screen's exact messages, actions, timing and data-retention behaviour. No new onboarding or empty-state copy is needed for this work. |
| Interaction visibility | A global 2px focus ring and reduced-motion rules exist. Work cards override the ring with `--border-focus`; Board's search input removes its outline. Phone sizing depends partly on explicitly adding `ak-tap`. See [styles.css](../../../apps/site/src/styles.css#L34), [Board.tsx](../../../apps/site/src/workspace/Board.tsx#L45), [ui/index.tsx](../../../apps/site/src/ui/index.tsx#L30). | Focus and touch sizing should be properties of controls, not exceptions remembered by each screen author. Code inspection identifies risk; it does not establish that every control currently fails. |

## Design direction

AutoKolab should feel like a calm, well-run team workspace. Captain is approachable. The work around Captain is easy to inspect. Neutral surfaces, readable text and precise alignment give the real status signals room to matter. The green croc supplies warmth and recognisability without turning the workspace into a green dashboard.

Keep Geist, the original brand artwork, neutral agent tiles, plain Captain messages, the existing evidence layers and the approved Overview composition. Change the consistency of the surrounding frame, the visibility of navigation, the assignment of type and spacing roles, and the treatment of shared controls. Light should feel clear and softly lit; dark should retain the quiet night-shift character. Neither needs gradients, glass panels, glows, giant statistics or decorative AI symbols.

## Inspiration: specific lessons, not copies

These official sources were reached on 18 October 2026. The borrowing and avoidance columns are my recommendations, not claims that these products endorse this design. No new library or dependency is implied.

| Source | What I would borrow | What I would avoid |
| --- | --- | --- |
| [Linear: redesigning the UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | The careful alignment between sidebar, headers and content. A quiet application frame. Treating dark and light as one system of surface and text roles. | Copying its information architecture, hidden destinations, dense issue-tracker habits or custom-theme feature. AutoKolab's tab list is already fixed. |
| [Vercel Geist: typography](https://vercel.com/geist/typography) and [system overview](https://vercel.com/geist/introduction) | Geist Sans and Mono used by purpose. Repeatable text roles and a limited set of component treatments. Neutral primary actions with crisp contrast. | A marketing-style display scale, decorative grid backgrounds, or making every record feel like a deployment console. |
| [GitHub Primer: colour usage](https://primer.style/product/getting-started/foundations/color-usage/) | Colours named for their function, with surface, foreground and border choices considered together. The same meaning survives a theme change. | GitHub's full badge vocabulary and dense chrome. Do not import colours or attention marks that add meanings the app does not have. |
| [Radix Colors: scale use cases](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) and [theme colour](https://www.radix-ui.com/themes/docs/theme/color) | Separate steps for backgrounds, hover states, borders and readable text. Paired light and dark scales rather than automatic inversion. | Making an accent colour the default for every button, link and selected control. The status-only rule is stricter than a typical component kit's accent model. |

The existing light Overview reference is useful for its warm neutral canvas, white cards and quiet sidebar. It is not a template for the other tabs' content. The report does not rely on remembered details of inaccessible products.

## The visual system

The numbers below are proposed working dimensions. They make the direction concrete; they are not measured acceptance results. Implementers should tune them with the real content, especially long names and phone text scaling.

### Type and density

Keep Geist for interface text and prose. Use Geist Mono only where it already helps distinguish IDs, code, commits, times and shortcuts. Use 400 for body text, 500 for emphasis and controls, and 600 for headings and active navigation. Avoid making every label bold. Existing brand lettering stays unchanged.

| Role | Size and line height | Treatment |
| --- | --- | --- |
| Metadata | 12px / 18px | Minimum size. Muted but readable. Never lower opacity to simulate hierarchy. |
| Secondary labels | 13px / 20px | Supporting information and compact controls. |
| Navigation, tables and ordinary rows | 14px / 20px | Regular by default; active navigation 600. |
| Conversation and reading text | 15px / 24px | Comfortable paragraph rhythm. Preserve the existing text and emphasis. |
| Phone editable text | 16px / 24px | Give form entry room without shrinking labels or disabling browser zoom. |
| Section heading | 17px / 24px | Weight 600. Keep current words and casing. |
| Card heading | 20px / 26px | For existing prominent card titles, not every row. |
| Page title | 26px / 32px; 22px / 28px on phone | One consistent role where a visible page title already exists. |
| Existing Overview headline | Preserve its approved responsive scale | Do not enlarge or restructure it as part of shell alignment. |

Use natural letter spacing for body text. Reserve slightly tighter spacing for larger headings. Preserve current capitalisation; this is not a copy cleanup. Numeric columns align consistently, with equal-width numerals where useful. Labels can wrap. All text remains at least 12px; zoom remains available.

Use one comfortable default density. Desktop navigation targets are 44px high. Ordinary buttons are 40px high, compact desktop controls at least 32px, and touch targets at least 44 by 44px. Reading rows use roughly 12px vertical padding and can grow with text. Tables may be denser, but their actions keep adequate hit areas. Do not add a density preference or remove fields to make a screen look cleaner.

### Neutral ramps, status and brand

A neutral ramp is simply a small ordered set of greys. Give each theme approximately twelve steps, assigned by purpose. The same purpose can use a different step in each theme. Do not define light as dark with inverted colours.

| Role | Dark direction | Light direction |
| --- | --- | --- |
| Page canvas | Near-black charcoal with a very slight cool cast | Soft off-white, slightly warm, without a beige tint dominating the UI |
| Navigation | A small step lighter than the canvas | A small step darker than the canvas |
| Reading surface | Canvas for plain reading; a gently lighter surface for existing cards | Canvas for plain reading; white for existing cards |
| Inset / input | Slightly darker than its surrounding card | Very pale grey, distinct from white cards |
| Hover / pressed | Successive lighter neutral steps | Successive darker neutral steps |
| Selected item | Clear neutral fill plus stronger text and a non-colour marker | The equivalent darker neutral fill and marker |
| Subtle separator | Quiet charcoal line | Quiet grey line |
| Control boundary | Stronger line that remains identifiable against its surroundings | Stronger grey than a decorative divider |
| Primary / secondary / muted text | Near-white / light grey / readable middle grey | Near-black / dark grey / readable middle grey |
| Floating layer | Lighter charcoal, visible edge, restrained shadow | White, visible edge and a small soft shadow |

Surfaces should be mostly opaque. This makes a panel predictable above any page and keeps text contrast testable. Dark elevation reads mainly through surface lightness and edges; light elevation uses edges and modest shadows. Flat lists need neither a shadow nor a box around every row.

| Meaning | Dark treatment | Light treatment | Limit |
| --- | --- | --- | --- |
| Needs you | Warm amber mark and readable amber text | Deeper amber-brown text and a strong amber mark | Never generic activity, an enabled control or an away person |
| Done / safe | Green status mark; pale green text when needed | Deep green text; green mark with a visible edge where needed | No green primary navigation or generic action buttons |
| Live / moving | Blue mark and light blue status text | Darker blue text and a clear blue mark | No blue switch merely because it is enabled |
| Failure / heads-up | Coral mark and pale coral text | Deep red-coral text and a clear mark | Keep current status wording and causes; do not invent severity levels |
| Neutral / inactive | Grey plus the existing text or shape | Grey plus the existing text or shape | Quiet must remain readable |

The current handoff explicitly permits blue links as an exception to status-only colour. Prefer neutral underlined ordinary links in this proposed system, so blue can concentrate on live work. If the existing blue-link convention is retained, document that exception once. Do not let each tab choose separately.

Keep the croc and wordmark exactly as supplied in [brand](../../../brand/README.md). Their green is a brand signature, not a general accent token. Place the original artwork on a suitable neutral surface in both themes. Never recolour the asset to rescue contrast. Status green needs its own readable text and boundary choices; the logo's green is not automatically safe for small text on white.

### Spacing, shape and elevation

| Property | Proposed rule |
| --- | --- |
| Space scale | 4, 8, 12, 16, 20, 24, 32, 40, 48 and 56px. Name uses as well as numbers: control gap, row inset, card inset, section gap, page gutter. |
| Typical rhythm | 8px between related controls; 12px between an avatar and text; 16–24px inside cards; 32–40px between sections. Keep approved Overview gaps unless a local conflict requires adjustment. |
| Corners | 8px small tiles and controls; 12px ordinary cards; 18px existing prominent Overview cards; 20px dialogs. Fully round only for people, status dots and established pills. |
| Borders | One fine separator per boundary. Stronger edges for fields and selected controls. Avoid a card border plus a redundant inner box around the same content. |
| Shadows | None for ordinary page rows. Small shadows for floating menus and toasts; larger restrained shadows for dialogs and sheets. No persistent glow or hover lift on static cards. |
| Alignment | Share a text start line within each list; keep avatar and action columns stable. Align multi-line rows at the first meaningful text line. |

The existing structure determines whether something is a card or a row. Harmonise its treatment; do not convert tables into cards or collapse sections under the name of polish.

### Icons, avatars, states and motion

Keep the current stroke-icon family. Use 16px icons in compact controls, 18px for ordinary controls, and 20px only where space warrants it. Use a consistent stroke weight and optical alignment. Icons must explain an action or state; they should not decorate every heading. Keep sidebar labels text-only. Agent avatars remain neutral rounded squares; people remain circles. Use consistent 28px compact and 32px standard sizes, with existing larger sizes only where needed. Any status attachment reflects existing state, never agent identity.

| State | Shared treatment |
| --- | --- |
| Default | Stable neutral surface, readable text and an identifiable control boundary |
| Hover | One neutral surface step; underline text links. No geometry change. |
| Pressed | A slightly stronger neutral fill or inset edge. Keep the target stationary. |
| Active navigation | Neutral fill, 600-weight text and a narrow neutral leading marker; current-page semantics for assistive technology |
| Keyboard focus | A continuous 2px outline with a 2px gap; visibly different from selection and tested against both adjoining surfaces |
| Disabled / read-only | Distinguish the control state without fading the whole row. Preserve readable information and current permission explanations. |
| Error / saved / loading | Retain the existing words and timing. Use the shared type, padding and state colours; never replace a meaningful message with a bare spinner. |

Use 120–160ms surface transitions and about 180–240ms for opening overlays. This is a proposed reduction from the handoff's slower sheet timings, not a measurement of current latency. No decorative page entrance or layout bounce. Keep data updates in place. Preserve scroll position, drafts, selected periods and open disclosures. A slow live pulse is optional only where it already communicates live work; no extra shimmer across the app. Reduced-motion mode removes loops, movement and animated transitions. Nothing should require animation to understand.

### Tokens and contrast targets

Organise tokens in three layers: paired dark/light colour ramps; shared meanings such as page, border, muted text and needs-you text; then a few component roles such as navigation-active and field-focus. “Token” means one named design value that components reuse. Keep type, spacing and corners common across themes. Give status foregrounds, backgrounds, borders and focus colours explicit theme values. Keep brand assets separate.

Move Overview's local colour values into shared roles without changing its composition. Temporarily map older names to the same roles so old screens inherit the same palette. A rename alone is not a redesign. Review each alias's meaning before changing it. All future component colour must come through `tokens.css`; no screen-specific colour literals.

Require at least **4.5:1 for all text**, including metadata, placeholders and text on badges. Aim for **7:1 for ordinary reading text**. Applying 4.5:1 even to large headings is a stricter project target than WCAG's large-text minimum. Require **3:1 for essential control boundaries, state indicators and focus rings** against adjacent colours. Decorative dividers need not carry that burden. Measure actual foreground/background pairs, including hover, selected, disabled-looking readable content, and overlays. The current token comments are not a substitute for those measurements. See W3C's [text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Keep status words and existing shape cues beside colour. Test grayscale, browser high-contrast settings, keyboard focus, 200% text enlargement and reflow at 320 CSS pixels. No claim of accessibility compliance is made from this source review.

## The shell

### Desktop and narrower windows

Use a 232px left navigation at wide desktop sizes, with 16px inner gutters. Keep a compact original logo at the top, then the project switcher, then all nine tab links. Use the order **Captain, Overview, Work, Team, Room, Decisions, Results, Settings, Guide**. Every tab is a peer link. A small gap after Room is enough to distinguish working views from records; no group heading, disclosure, More item or Project menu is needed.

Each link has a 44px minimum target, consistent left padding, 14px text and the states above. Captain retains its existing needs-you count at the right. Keep the exact count visible, allow space for multiple digits, and retain its accessible meaning. Zero stays absent as today. Do not add unread dots, activity counts or new attention logic to other tabs. The active marker remains neutral even when Captain has an amber count.

Put account and Sign out below the tab list, separated by space and one quiet divider. Account shows the existing person's name and neutral avatar, opening the existing profile action. Sign out is a separately labelled, neutral text button, not a coral warning. It does not sit among project destinations. Put System / Light / Dark appearance controls here as shell preferences, leaving Settings tab content untouched. The project switcher remains a clearly labelled control with a visible chevron and 44px target. Its dropdown contains projects and the existing New project action only; it never contains tabs.

At widths around 900–1099px, reduce the left rail to about 208px and the page gutter to 24px. Keep labels; do not collapse to icons. Below the width at which that rail and content can both remain usable, replace the rail with the expanded phone/tablet layout below. Widths are starting points; long labels and zoom decide the final threshold. There is no user-operated collapsed sidebar in this proposal.

Nine 44px links plus eight 4px gaps occupy 428px. Logo, project selector, account, sign out and appearance controls take the total beyond many short laptop windows. On a sufficiently tall desktop, all fit together. On a short window, make the rail one vertically scrollable region; do not pin utilities over the last links or make tabs disappear into an overflow menu. At extreme zoom, switch to document flow. This is a disclosed physical limit on “always visible,” not a reason to shrink text.

### Phone: every destination present without opening anything

Below the sidebar threshold, show a compact logo and project-switcher row, followed by a permanently expanded **three-column navigation grid** above page content. It has three rows: Captain / Overview / Work; Team / Room / Decisions; Results / Settings / Guide. All nine labels appear at once at ordinary 390px and 320px portrait widths. Use text labels, 44px minimum row height and 4px gaps. With 16px page gutters, cells at 320px are about 93px wide. Labels may wrap and rows may grow; never truncate a destination or reduce text below 12px.

The grid is about 140px high before outer padding. This is a real cost. I recommend accepting that cost because it directly honours the requirement. A nine-item single bottom row would be cramped; a drawer or sideways strip would conceal destinations. A permanently fixed three-row bottom bar would compete with Captain's composer. Keep this navigation in normal page flow instead. It remains expanded but may scroll offscreen as the person reads. No auto-collapse and no separate tab overflow.

Account, Sign out and appearance controls remain visible shell utilities after the grid, wrapping onto additional lines if needed. Projects can still open a selector because they are not tabs. Keep keyboard focus order the same as visual order. Do not make the navigation sticky over content at high zoom or with the keyboard open. The active page's existing composer and actions must remain reachable, with safe-area spacing and no overlap. Sheets and dialogs can temporarily cover the shell as they do today; closing them returns focus to the opener.

If “visible” means all nine destinations must remain on screen while reading every paragraph or typing, that conflicts with a useful phone reading area. The recommendation is always-expanded navigation, visible when the page opens, with ordinary vertical scrolling afterwards. This needs acceptance as a design choice before implementation; the report itself can proceed without a reply.

### Top bar, page titles and content frame

Use a quiet top bar with a 64px desktop minimum height, a shared lower divider and the same gutters as the page below. It can grow when existing titles, subtitles or actions wrap. Preserve which actions and words each page currently has; do not add Search to a screen just to make it symmetrical. Keep the existing Overview project/update treatment until AK-181 handles its separate wording issue. Style it with the same frame tokens.

Use 32px desktop side padding, 24px at medium widths and 16px on phones for the common frame. The approved Overview composition may retain its own internal inset; its outer edge should still align with its shell. Use three width roles: reading columns around 760–800px; form/record columns around 860px; data views around 1120–1200px. Work may use the available width. Keep the approved Overview width and internal hierarchy as the exception documented by its reference. A table or board may scroll inside its own region. The page itself must not scroll sideways.

Keep existing headings in their current place and keep existing screen order. Do not introduce a second visible title above Overview's headline or new subtitle copy. The objective is consistent edges and hierarchy, not identical compositions.

## Surface treatment for every tab

**Captain.** Preserve the centred conversation, plain Captain messages, person bubbles, metadata, reply mode, actions and composer. Align avatars and message starts; apply the shared reading scale and control heights. Give the composer a clear neutral boundary in both themes. Style current empty/loading/error messages with the same rhythm. Do not add cards, summaries, pinned content or new copy.

**Overview.** Preserve the approved headline, question rows, goal cards, agent rows, progress shapes, disclosures, ordering and responsive layout. Replace local palette values with paired theme roles and align the surrounding shell. Keep its existing skeleton and stale-content behaviour. Do not redesign its composition, change status calculations, add missing data, or alter what its headline says.

**Work.** Preserve all four existing inner views, filters, fields, sorting, board structure, ticket information and detail/edit actions. Standardise toolbar heights, table cell padding, badge typography, card edges and focus appearance. Make local horizontal scrolling deliberate. Apply the same surface treatment to ticket and plan details and their overlays. Keep current empty and loading wording and all interaction behaviour.

**Team.** Preserve people, agent cards, ownership, Captain assignment, model/effort controls, limits and all current descriptions. Align labels, values and control edges. Standardise avatar sizes and neutral card surfaces. Let long names wrap. Keep current empty/error states and permission rules; do not move settings out of this tab or add new activity information.

**Room.** Preserve messages, threads, recipients, filters, participant information, composer and current folds. Bring message typography, avatar spacing, panel boundaries and control states into the common system. Retain the existing column structure while allowing its current responsive wrapping. Keep current loading and unavailable text. Do not hide more messages, remove bookkeeping or change which messages agents receive.

**Decisions.** Keep the existing list, records, kinds, replacement history, forms and inner navigation. Use consistent article padding, heading roles and button states. Superseded material should remain readable rather than fading the whole card below contrast targets. Restyle the current empty panel without changing its words or adding a new detail layout.

**Results.** Preserve every metric, definition, caveat, period, table, chart and export. Align numbers and column baselines; make the existing cards and selectors use the same neutral surfaces as other tabs. Distinguish chart meaning through the existing labels and shapes as well as theme-safe colours. Preserve partial-loading and error behaviour. Do not promote selected numbers, invent a baseline, remove statistics or rewrite conclusions.

**Settings.** Keep precisely the controls and permission explanations present in this checkout, including Notifications and Invite. Apply shared field spacing, switch geometry, readable help text and consistent confirmation/error treatment. Align labels and controls without importing additional settings from the older handoff. The proposed theme control belongs to the shell utilities, not this tab's content.

**Guide.** Keep the existing sections, Markdown content, editing controls, permissions and save behaviour. Give reading text, code blocks, editor boundaries and section gaps the shared treatment. Keep current placeholders and empty-state text. Its new direct sidebar link changes discoverability, not what Guide contains; retain existing links from Decisions.

The same shared primitives should reach existing sign-in, project selection, join/connect and profile screens so entering or leaving the workspace does not feel like another app. This means surface consistency only; it is not a new onboarding flow or new content.

## Theme plan

Design and review every component in dark and light together. For each, check default, hover, pressed, selected, focus, error, disabled and loading appearances. Light must have its own readable status text, shadow strength, inset colour and boundary contrast. It is not an inversion filter. The logo is unchanged in both.

Offer **System, Light and Dark** in the shell account area. Default to System. A manual choice persists on that browser and overrides the operating system until System is selected again. System follows operating-system changes. No server preference, cross-device sync or database migration is needed for the first version. If browser storage is unavailable, honour the system and keep the control usable for the current visit.

Resolve the chosen appearance before the first visible page is painted. The page, browser-native controls and initial loading surface should agree from that first frame. Switching themes must not remount a conversation, discard a draft, reset a filter or move scroll position. Avoid a whole-page colour animation. Reserve logo and font space so loading assets does not shift the shell. Check cold loads, saved manual choices, operating-system changes, blocked storage and slow font loading. This report specifies the intended result, not a new implementation or dependency.

For each theme, inspect text on every actual surface, all status badges and progress marks, links, input placeholders, dropdowns, scrollbars, dialogs, toasts and code blocks. Check the unchanged logo against its canvas. Check long content and missing data, not just populated happy-path pages. Desktop and phone screenshots must be paired so one theme cannot quietly fall behind.

## Rollout for Captain to turn into tickets

These are proposed scopes, not tickets created by this report. S means a small focused change; M means several related components; L means cross-screen work requiring substantial review. They are relative effort, not delivery promises. Every step preserves content and data behaviour. Recheck the latest main before building because several screens have active owners.

| Order | Proposed ticket | Effort | Future files / surfaces touched | Acceptance focus |
| --- | --- | --- | --- | --- |
| 1 | Define paired foundations and map existing colour names to shared roles. | M | `tokens.css`, shared style aliases, font-loading/frame entry points if needed | Both palettes and measured contrast pairs; no public visual switch yet. |
| 2 | Build the expanded navigation and common shell in both themes. | M | `Workspace.tsx`, shell styles, appearance preference entry point | Nine direct destinations, account/project utilities, phone grid, first-paint behaviour and preserved routes. |
| 3 | Align shared controls, status treatments and feedback. | M | `ui/`, shared `bits.tsx`, shared styles | Same buttons, fields, focus, avatars and states in every existing context. |
| 4 | Apply the system to Captain and Room surfaces. | M | `CaptainHome.tsx`, `Room.tsx` | Conversation content, drafts, recipients, scrolling and actions unchanged. |
| 5 | Map Overview to the shared themes without redesigning it. | M | `Overview.tsx`, `overview-parts/` styles and presentational components | Approved geometry and status shapes retained; no projection/data changes. |
| 6 | Apply the system to Work and its detail surfaces. | L | Board, Backlog, ListView, TicketPage, PlanPage and existing evidence sheets | Filters, sorting, editing, deep links and all fields preserved. |
| 7 | Apply the system to Team and Settings. | M | `People.tsx`, `Settings.tsx`, Connect controls | Permissions, agent controls and settings behaviour unchanged. |
| 8 | Apply the system to Decisions and Guide. | M | `Decisions.tsx`, `GuidePage.tsx`, shared Markdown presentation | Records, editing, replacement history and empty messages unchanged. |
| 9 | Apply the system to Results. | M | `ResultsPage.tsx` presentation | Metrics, dates, exports, definitions and partial-data states unchanged. |
| 10 | Align entry screens and complete visual polish. | M | Existing sign-in, project/join/profile surfaces; remaining shared presentation exceptions | No orphan old-style control; original assets, consistent spacing and both themes. |
| 11 | Complete browser/accessibility review and enable the whole appearance together. | M | Existing preview/test coverage and the single appearance release boundary | Cross-tab consistency, paired screenshots, keyboard/phone checks and no first-paint flash. |

**How to avoid a half-finished app.** Review and merge these as small changes, but keep the new appearance behind one temporary app-wide development preview boundary until the full set is ready. The public app continues using its current complete appearance. Do not expose a theme toggle while some tabs lack light styling. Do not enable the new design one tab at a time. Both theme maps, all shared controls, all tab surfaces and the navigation/appearance control must activate together. This boundary needs no account rollout service or migration. If the team does not want a temporary preview boundary, the alternative is one coordinated release containing all those reviewed changes; a public mixture is not the fallback.

During that preparation, existing styles must remain effective outside the preview. Avoid changing a global token in a way that silently restyles only some public screens. Preserve older aliases until their callers are migrated. Choose the complete old or complete new presentation before first paint. Remove obsolete aliases and the temporary boundary after the combined release is verified. Do not maintain two permanent design systems.

**Regression checks per step.** Compare visible words, fields, counts, action labels and destinations with the baseline. Verify no controls or information disappeared. Keep the existing behaviour tests. Add meaningful checks for theme persistence, unchanged navigation targets, all nine visible links, focus and keyboard operation, and draft/filter/scroll retention where touched. Run the required typecheck, tests and website build for implementation tickets. Do not change business logic or data queries to make the visual work easier.

**Browser acceptance throughout, then again before release.** Inspect every tab in both themes at 1440px desktop and 390px phone, with additional 1024px, 320px and short-landscape checks. Check 200% text enlargement, 400% zoom/reflow where applicable, keyboard-only navigation, reduced motion and high-contrast mode. Use empty, loading, error, populated, long-name and many-record cases. Inspect dropdowns, dialogs, tooltips, toast positioning and the open phone keyboard. Compare before/after content and approved Overview geometry. A source-only review cannot replace these checks. Use the project's existing screenshot workflow; report browser limitations honestly if a runner cannot launch it.

## Risks and open questions for Raghavendra

There are five decisions worth making before implementation. None blocks delivery of this written recommendation.

| Question / risk | Recommendation |
| --- | --- |
| Does “always visible” require the phone navigation to stay on screen while reading and typing? | Accept the always-expanded three-row grid in normal page flow. It reveals all destinations without a menu and preserves reading space after scrolling. Reject a fixed nine-item bottom bar. |
| Does Guide stay? | Yes. Plan for nine destinations now. Removing or relocating its content would exceed this visual project. |
| Should green be used as a general brand accent? | Keep green in the original croc and genuine done/safe indicators. Use neutral controls. Record the logo exception explicitly rather than weakening the status rule across the app. |
| How much of the approved Overview may change? | Preserve its composition and behaviour. Change theme roles and shared visual details locally. Coordinate with its owner; do not use this work to resolve AK-180, AK-181, AK-184 or AK-185. |
| Is a coordinated appearance release worth waiting for? | Yes. Review small scopes, preview both themes together, and activate the complete system once. Repeatedly showing users mixed styles would reproduce the problem this work is meant to solve. |

## Delivery checks

The report covers all nine tab surfaces, both themes, the full shell and a rollout without changing tab content. It contains no wireframes, mockups, HTML or code changes. Only `docs/research/ui-polish/codex-plan.md` is added; no existing tracked file changes.

| Check run for AK-186 | Result |
| --- | --- |
| Report scope and completeness | Checked against the ticket's six done-means items. The written deliverable is complete; PR publication remains with the runner. |
| Source references | All 43 local links resolve. Eight external citations are included, using sources reached during this review. |
| Whitespace and artifact check | No trailing whitespace or fenced code blocks. No generated image, HTML, application or style changes. |
| `npm run typecheck` | Passed across workspaces. |
| `npm test` | Exit 1. Site: 436 passed. Helper: 520 passed, 28 failed, 18 skipped; one unhandled socket error. Failures include `spawnSync git EPERM`, `listen EPERM`, read-only helper state and process-output/assertion failures. Database policy tests were not reached. No unrelated fixes were attempted. |
| Website build | Not run: this ticket changes only the report. |
| Browser | Chromium launch failed with `Operation not permitted` and `SIGTRAP`. No current-app screenshots or rendered desktop/phone checks were possible. The existing light reference was inspected and is labelled as a reference above. |
| Commit / push / PR | Staging failed because the shared worktree Git directory is read-only (`index.lock`). No commit exists for this report yet. Push and PR creation were not attempted after that failure, as instructed. |

Runner handoff: commit this one file on `ak-186-plan-for-a-polished-look-across`, push that branch and open a PR against `main` titled **AK-186: Plan a polished look across the app in dark and light**. Include the check results and browser limitation above in the PR description. Confirm the PR touches only this report and that GitHub checks pass. Do not merge it. The ticket's allowed runner-handoff status is Review; it does not mean a PR or passing CI has been verified here.
