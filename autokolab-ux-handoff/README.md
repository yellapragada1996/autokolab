# AutoKolab UX handoff

The complete user experience for AutoKolab's web app and phone app: what every screen is for, how it looks, how it behaves, and how people move through it. This package is the source of truth for the UI. If something here conflicts with older wireframes or `HANDOFF.md` from the earlier package, this package wins.

**Status:** first pass, approved direction (10 Oct 2026). Sample data throughout is illustrative.

## The product in one paragraph

AutoKolab lets many AI coding agents (Claude Code, Codex, any API model) work on one project as one team, across machines and people. People talk to one agent, **Captain**, which plans the work, assigns it to the other agents ("workers"), reviews everything, and comes back to people only for decisions. Everything is recorded and can be inspected, but the first glance is always one plain sentence.

## Read in this order

| # | File | What it gives you |
| --- | --- | --- |
| 1 | `01-principles.md` | The rules every screen follows. Read this before anything else. |
| 2 | `02-information-architecture.md` | Navigation, routes, which screen lives where, what was dropped. |
| 3 | `03-user-journeys.md` | 12 journeys, step by step, with the screen and state at each step. |
| 4 | `screens/*.md` | One spec per screen: purpose, layout, states, interactions, data, acceptance criteria. |
| 5 | `05-components.md` | Every reusable component with its anatomy, variants and states. |
| 6 | `06-design-tokens.md` + `tokens.css` | Colours, type, spacing, radius, shadows as CSS variables. |
| 7 | `07-interaction-motion-a11y.md` | Speed budgets, optimistic UI, undo, motion, keyboard, accessibility. |
| 8 | `08-captain-voice-and-copy.md` | How Captain talks, with a library of real strings. |
| 9 | `09-ui-data-contract.md` | What the UI needs from the backend: entities, fields, events. |
| 10 | `10-build-order.md` | Suggested phases, each ending in something usable, with acceptance checks. |

Supporting folders:

- `wireframes/` – rendered pictures of every screen and its key states (PNG, 2x). File names match the screen IDs below. Look at these alongside each screen spec.
- `source/` – the original `.dc.html` wireframe files. Exact values for every colour, size and spacing live here. See "Reading the source files" below.

## Screen index

| ID | Screen | Spec | Pictures |
| --- | --- | --- | --- |
| S01 | Captain home | `screens/S01-captain-home.md` | `S01-*.png` |
| S02 | Evidence ("How do you know?") and Show the work | `screens/S02-evidence.md` | `S02-*.png` |
| S03 | Captain slide-over (⌘L) | `screens/S03-captain-slide-over.md` | `S03-*.png` |
| S04 | Look first (risky approval) | `screens/S04-look-first.md` | `S04-*.png` |
| S05 | Side thread with a worker | `screens/S05-side-thread.md` | `S05-*.png` |
| S06 | Two people disagree | `screens/S06-conflict.md` | `S06-*.png` |
| S07 | Command bar (⌘K) | `screens/S07-command-bar.md` | `S07-*.png` |
| S08 | Plan | `screens/S08-plan.md` | `S08-*.png` |
| S09 | Work (board) | `screens/S09-work.md` | `S09-*.png` |
| S10 | Ticket | `screens/S10-ticket.md` | `S10-*.png` |
| S11 | Room | `screens/S11-room.md` | `S11-*.png` |
| S12 | People | `screens/S12-people.md` | `S12-*.png` |
| S13 | Decisions | `screens/S13-decisions.md` | `S13-*.png` |
| S14 | Settings | `screens/S14-settings.md` | `S14-*.png` |
| S15 | Results | `screens/S15-results.md` | `S15-*.png` |
| S16 | Heads up (recovery) | `screens/S16-heads-up.md` | `S16-*.png` |
| P01–P05 | Phone: Captain, Answer a question, Goal, What reaches you, Earlier today | `screens/P-phone.md` | `P0*-*.png` |
| N01–N05 | Not yet wireframed: first run, connect a machine, empty project, offline, sign-in | `screens/N-not-yet-designed.md` | none |

`X01` and `X02` pictures show the old Overview and Catch up screens. They are **superseded** by Captain home and are included only so you recognise them if you see them elsewhere. Do not build them.

## Reading the source files

Each `source/*.dc.html` is one screen written for a design canvas. It will not run on its own; read it as source.

- Markup is inside `<x-dc>…</x-dc>`. Layout and colour are inline `style="…"`, so every value is exact.
- `<helmet><style>` holds shared CSS: hover transitions, keyframes, responsive rules.
- `{{name}}` is a value from `renderVals()` in the `<script type="text/x-dc">` block at the bottom. That block is the screen's state and logic, written React-style (`this.state`, `setState`).
- `<sc-if value="{{x}}">` is a conditional; `<sc-for list="{{items}}" as="item">` is a loop.
- `<a href="Other.dc.html">` is navigation; the route map in `02-information-architecture.md` says where each one goes.
- File names still say `Lead…` (`LeadHome.dc.html`). The agent was renamed **Captain**; the file names were kept so links don't break. Use "Captain" everywhere in the product.

## Ground rules for building from this

1. Build the components in `05-components.md` first; every screen is assembled from them.
2. Put `tokens.css` in place before any screen. Never hard-code a colour in a component.
3. Wire to real data. Names like Fjord, Birch, Tern and Kestrel, ticket numbers and all metrics are samples.
4. When the wireframe and a spec disagree, the spec wins; tell Raghav so the wireframe can be fixed.
5. When you're unsure whether to add something, don't. Every element needs a purpose (see `01-principles.md`).
