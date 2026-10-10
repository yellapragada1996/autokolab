# 01 · Principles

These rules decide every design question. When a spec is silent, apply them. They are listed in priority order: when two conflict, the higher one wins.

## P1. Ease of use for humans comes first

AutoKolab is built for people, and it should feel extremely polished and butter-smooth. Concretely:

- **One place to talk.** People deal with Captain, and only Captain, unless they choose otherwise. They never have to know which agent to ask.
- **Decisions in place.** Anything a person must decide arrives as a card they can answer right where they read it: no navigation, no forms, no hunting.
- **Instant response.** Every click responds within 100 ms. Captain acknowledges a message within 400 ms. See `07-interaction-motion-a11y.md` for the budgets.
- **Everything undoable** that can be. Undo is offered right next to the action, for as long as it is possible.
- **Keyboard-first on desktop, thumb-first on phone.** ⌘K and ⌘L everywhere; 44 px minimum touch targets.

## P2. Transparency comes second: readable at a glance, complete on request

- **Three depths, always in the same places.**
  1. *Glance* – what Captain says, and the pinned briefing.
  2. *How do you know?* – the evidence under any statement or decision: tests, the exact commit reviewed, who built and who reviewed, which decisions it follows, and what Captain is unsure of.
  3. *Show the work* – the full record (summary, the actual change, history), opened in a side sheet so the reader never loses their place.
- **Evidence, not persuasion.** Research shows explanations make people accept AI answers even when wrong (Bansal et al., 2021). So the evidence layer shows facts and uncertainty, never a sales pitch. Captain always states what it is *less* sure about.
- **Failures are never hidden.** Bookkeeping is folded away; problems are always visible, in plain words, with what was done about them.
- **Every record line is written by the database, not by agents.** History and audit trails cannot be edited by an agent.

## P3. Everything on screen must have a purpose

The biggest enemy of readability is overcrowding with unnecessary things; it leads to confusion. Before adding any element, panel, column, badge or line of text, answer: *what question does this answer that nothing else on the screen already answers?* If there is no clear answer, leave it out.

- **No repetition.** One fact appears in one place on a screen. (Example: Captain home used to have a right-hand "desk" that repeated the decision card, the plan and the briefing. It was removed; the briefing now opens on demand to show goals and who is doing what.)
- **One fact per row by default.** A row is a human sentence plus at most one short status ("4 of 7"). Ticket IDs, machines, owners and models go to hover, the Detailed view or the ticket page.
- **Empty things are hidden.** Empty board columns, empty sections and zero counts are not shown (a quiet "Hidden while empty" note is fine).
- **Single column for reading screens.** Conversation-style screens (Captain, side thread, conflict) are one centred column. A second panel only appears when the person asks for detail (Show the work) and closes again.

## P4. People are interrupted only for decisions

- **Amber means "needs you", and nothing else.** Chores never turn amber.
- **Pull, not push.** Captain holds everything until the person looks, unless someone is blocked waiting on them. Getting back to a task after an interruption takes 11–16 minutes (Iqbal & Horvitz, 2007), so every notification must be worth that.
- **Three tiers** (see `screens/P-phone.md`, P04):
  - *Blocking* – someone is stuck until you answer. This is the only tier that notifies, and it waits for a pause (never mid-typing). It says what waiting costs: "Fjord is idle until you answer."
  - *Can wait* – collected into the briefing for next time.
  - *Just so you know* – only appears in the conversation's quiet updates. Never notifies.
- **Batch and ask once.** Captain collects questions and asks once with everything needed. If a worker has a question that needs a person, Captain waits until there's something concrete to show (a draft) so the person is asked once, not twice.
- **Every decision card names the action and shows the evidence**: tests passed, the exact commit approved, who built it, whether it can be undone, how long it has waited.

## P5. Friction only where risk is real

- Routine changes merge themselves (under the default setting) once tests pass and Captain approves the exact commit.
- Risky changes (database, sign-in/security, new dependencies, tests/CI) wait for a person. The approval is **one specific question about the change** ("Everyone who signed up before today will be marked as an email sign-in. Is that right?"), not a generic OK button. This light "make you think" step reduces blind approval (Buçinca et al., 2021) but people dislike it, so it is used only for risky changes.
- Nobody approves their own work, including Captain. This is enforced by the database.

## P6. Captain is the single point of contact

- One Captain per project. Everyone talks to it. Each person has their own conversation with it; the briefing and decisions are shared.
- People *can* talk to a worker directly, but only in a **side thread Captain can see**, so the plan stays in sync.
- When two people ask for conflicting things, Captain never guesses: both get one card with both requests and a suggestion; if they disagree, the admin decides. Work not in dispute keeps going.
- Captain's personality: a calm, competent chief of staff. Warm, brief and plain; never cute; never sounds certain to please. See `08-captain-voice-and-copy.md`.

## P7. Calm, dark "night shift" visual language

- Near-black background, neutral surfaces, one type family (Geist) plus a mono (Geist Mono) for IDs, commits, times and shortcuts.
- **Colour only ever means status:** amber = needs you, green = shipped/done/safe, blue = live/moving, coral = failure/heads up. Agents never get their own colour; avatars are neutral grey tiles with a letter.
- Motion is calm and purposeful: a slow pulse on live things, a shimmer on in-progress bars, fade-up when something changes. All of it is disabled under `prefers-reduced-motion`.
- Minimum text size 12 px everywhere.

## The three-second test

Before a screen is done, check:

1. If someone glances for three seconds, can they say what's happening and whether they're needed?
2. If they get curious, can they reach the proof in two clicks or taps?
3. Is there anything on the screen that, if removed, nobody would miss? Remove it.
