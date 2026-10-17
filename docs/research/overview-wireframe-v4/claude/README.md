# Overview wireframe v4 (Claude)

AK-175 · yvssaratchandra-claude · 17 October 2026

raghavendra chose v3 (`../../overview-wireframe-v3/claude/`). They asked three questions and asked for a prettier page. v4 answers the questions and fixes what they exposed: the progress lines now explain themselves, and there's a way to review what's behind them. The heading reads as one statement, and the page is more polished. It has the same elements as v3. The only additions explain the progress lines.

## What's in the folder

| File | What it is |
|---|---|
| `overview.html` | The wireframe. Double-click to open; no server or build needed. |
| `autokolab-logo.svg`, `autokolab-croc.svg` | Unchanged copies from `apps/site/public/brand/`. |
| `busy-dark-1440.png`, `busy-dark-1280.png`, `busy-dark-390.png` | Busy, Cards, dark, at 1440, 1280 and 390. |
| `busy-light-1440.png`, `busy-light-1280.png`, `busy-light-390.png` | The same in light. |
| `review-path-dark-1440.png`, `review-path-dark-390.png` | The review path opened and numbered, whole page, desktop and phone. |
| `stopped-long-names-light-1280.png` | A stopped agent and a long project and goal name, at 1280. |
| `questions-dark-1440.png` | Questions waiting: amber "waiting on you" segments. |

In `overview.html`, the controls from v3 are all still there: 8 situations, Cards or Rows, dark or light, reduce motion, fit to window. Three are new:
- **Names: Short / Long** swaps in long project and goal names.
- **Desktop: 1440 / 1280** sets the laptop width.
- **Review path** opens the path and numbers it.

You can also point at any segment, or click a line, to try it yourself. `?state=busy&theme=light&w=1280&names=long&review=1&shot=desktop` (or `shot=phone`, plus `full=1` for the whole page) shows one frame at 1:1. That's how the screenshots were made.

## Answers to the three questions

These are the ticket comment's answers, updated with what v4 ended up doing. One change since the comment: the heading now counts goals ("on 5 goals") instead of saying "and N more goals".

### 1. What do the green and violet lines mean?

Each piece of a goal's line is one ticket in that goal.
- **Green** = done. It's the croc green from the logo (#5DC46A), not the tokens' `--green` (#5CCB9A). Same meaning, slightly different shade.
- **"Violet"** = being worked on right now: either an agent is building it or Captain is reviewing it. It isn't a new colour. It's the tokens' own `--blue` (#7EA6FF, "live, moving"). That blue is very light (75% lightness), so on a near-black card next to green it looks lavender. In light theme it's #2F6BD8 and looks blue.
- **Dark grey (the track)** = not started.
- **Coral** = its agent stopped. You only see it in the "Agent stopped" and "10+ agents" situations.
- **Waiting on you had no segment.** In "Questions waiting", Fjord's ticket waits on you but was still drawn blue. That was a bug.

Was it the right choice? No. The only words beside the line were "4 of 7 done". Nothing named blue or grey, so the colours carried the meaning on their own. Every segment was the same shape, and the line never told you which ticket a segment was. If you couldn't read it, that's a design flaw, not you. v4 fixes it:
- **Words under every line:** "4 done · 2 in progress · 1 to go", each with a small sample of its segment, so the line carries its own key.
- **A second cue besides colour:** done is solid, in progress is striped, to go is an empty outline, and stopped is drawn broken. The order is always done, then in progress, then to go.
- **A clearer blue:** in-progress stripes use two token blues, `--blue` and `--blue-switch`, which reads as plainly blue in dark.
- **Waiting on you** gets its own amber segment.

### 2. How are people supposed to review it?

In v3 you could only check the page at a glance: the heading, the count and the rings. Clicking a card's header opened the goal in Work, and clicking an agent opened its ticket. Nothing told you which ticket a segment was, hover did nothing, and on a phone you couldn't drill into a line at all. v4 adds a path, numbered as in the wireframe:

1. **Point at a segment** (desktop). A small label names the ticket, its state and who has it, e.g. "AK-46 Guest checkout / In progress · Captain is reviewing it".
2. **Click or tap the line**, or press Enter on it. The line, its words and "7 tickets ⌄" are one button and one Tab stop. The goal's tickets open below it, in the same order as the line.
3. **Each ticket is a link** to that ticket in **Work**. Pointing at or focusing a ticket lights up its segment.
4. **The goal's name** opens **Work**, grouped by that goal. An arrow shows on hover, and is always visible on a phone.
5. **An agent with work** opens its ticket in **Work**. Pointing at or focusing the agent lights up its ticket's segment, so agent and segment connect both ways.
6. **An agent with no work** opens it in **Team**.

**On a phone** there's no hover, so step 1 isn't there. The line and its words make one tap target 64 px tall. Tapping it opens the same list, with rows 52 px tall: name on the first line, state and who on the second. Steps 3–6 are the same.

### 3. Why did the desktop heading look like it was on two lines?

Because it was, and the break looked like an accident. The heading was capped at 20em (880 px at 44 px) and set to `text-wrap: balance`. "3 agents are working on Checkout and Sign-in." is 901 px wide, 21 px too long for one line. Balance then split it into two halves of about 450 px (469 / 432). So the heading used less than half of the 1008 px column at 1440 (936 px at 1280), with a large empty gap to its right. The break also fell after "on", which separated "working on" from what was being worked on.

With a stopped agent it got worse: "2 agents are working on / Checkout. Tern has stopped." The break cut the first sentence in half and glued its end to the second. On a phone the stopped and new-project headings ran to 3–4 ragged lines.

**What v4 does:**
- **No cap.** The heading can use the full column, and 44 px stays.
- **One line per sentence.** "Tern has stopped." always starts its own line, in coral. In a new project, "Nothing has started yet." is one line and "Tell Captain what you want to make." the next.
- **"on" stays with the goal.** A goal name that fits on one desktop line is never split, so a long sentence breaks before "on", not inside the name.
- **Short goal names only.** The heading names one goal, or two whose names fit in 32 characters together. Otherwise it counts them ("8 agents are working on 5 goals."), and the cards right below name them.
- **Balanced on desktop, filled on phone.** On desktop a sentence that's too long wraps balanced. On a phone it fills the first line, so it doesn't read "2 agents are / working on…".

Measured line widths (px), per sentence:

| Situation | 1440 and 1280 | 390 |
|---|---|---|
| Busy | 909 (one line) | 283 / 338 |
| Busy, long names | 629 ("on 2 goals") | 283 / 145 |
| Stopped | 678 \| 345 | 283 / 178 \| 238 |
| Stopped, long goal name | 411 / 718 \| 345 | 283 / 319 / 170 \| 238 |
| 10+ agents | 630 \| 367 | 283 / 145 \| 253 |
| Calm | 638 | 188 / 246 |

1440 and 1280 give the same lines because the longest one-line sentence (909 px) fits both columns (1008 and 936 px).

## What changed from v3, and why

| v3 | v4 | Why |
|---|---|---|
| Light blue (#7EA6FF) segments that looked violet | Blue stripes of the two token blues | Reads as blue, and the stripes are a second cue besides colour. |
| Every segment the same shape | Done solid, in progress striped, waiting striped amber, stopped broken, to go an empty outline | Colour is never the only signal. |
| "4 of 7 done" beside the line | "■ 4 done ▨ 2 in progress □ 1 to go" under the line, each word with a sample of its segment | The line carries its own legend. You don't need a key elsewhere. |
| Waiting tickets drawn blue | Amber "waiting on you" segment | It was a bug. The question, the agent's ring and the segment now connect. |
| No way to see which ticket a segment is | Hover label, a ticket list on click or tap, and a link per ticket into Work | The review path the ticket asked for. |
| Card header was one link with the line inside | Goal name is a link; the line is a button | A link and a button can't nest. Each has one job. |
| Heading capped at 880 px, balanced into two half-lines | Full width, one line per sentence, goal names whole or counted | Reads as one statement at 1440, 1280 and 390. |
| Fixed 1440 desktop | 1440 or 1280, and short or long names | To check the heading and cards on a laptop and with real names. |
| Rings 2 px, breathing 1.4× every 2.8 s | Rings 1.5 px with a 2 px gap, breathing 1.32× every 3.2 s | Calmer presence. |
| Dark cards had no edge; light had a hairline only | Hairline edge in both; a faint top light in dark, a soft paper shadow in light | Cards sit on the page instead of floating or looking flat. |
| Croc centred beside the heading | Croc sits on the heading's last line, tilted from its feet when calm | Looks placed, not pasted. |
| Loading: solid grey blocks | Loading shows the card's real shapes: name, line, words, an agent | Nothing jumps when it arrives. |
| Card name 21 px | 20 px, with an arrow on hover | Clearer step down from the 44 px heading. |

Kept from v3: the logo, the eight-tab shell, desktop and phone frames, all eight situations, Cards or Rows, both themes, status always with a word, 44 px phone targets, the contrast table, the focus ring and reduced motion. Nothing new was added except what explains the progress line: the words under it, the hover label and the ticket list.

## Checks

- **Squint test:** one dark mass (the heading) and one colour band (the lines).
- **Five seconds on busy:** "three agents; Checkout over half done, two in progress; Sign-in just started; Oriole and Wren free".
- **Not a template?** The croc green, the croc-back segments, the one big sentence and the step bars aren't dashboard defaults. There are no count tiles, no gradients and no icons.
- **New check, first-time reader:** every coloured segment has its word right under it ("2 in progress"), and pointing at one names the ticket. So a first-time reader can say what each colour means without help.

## Where this goes against the handoff

Same as v3, say so in review:
- **Done colour:** the logo's #5DC46A, not `--green` #5CCB9A.
- **Light theme** is a proposal; `tokens.css` has none.
- **Focus ring** uses `--text-muted`, because `--border-focus` is under 3:1.
- **Progress lines** go against the old "no bar" spec, as AK-174 asked.

Two new things to note:
- **Two blues for in progress:** `--blue` and `--blue-switch`, both tokens, striped together. Alone, `--blue` reads as violet beside the croc green. Rings and step bars still use `--blue` alone.
- **Light stripes** (#7FA3E6, #DDB574) are lighter mixes of the light theme's blue and amber, so the stripes show. They mean the same as their solid colour.

## How I checked it

- **All combinations in headless Chromium (Playwright):** 8 situations × Cards/Rows × dark/light × short/long names × 1440/1280, plus the review path. That's 192 runs. In every one:
  - neither frame scrolls sideways;
  - no text is under 12 px;
  - every phone link and button is at least 44 px tall;
  - there are no console errors.
- **Heading line widths** were measured per sentence in every situation (table above).
- **By eye:** I looked at busy, questions, stopped (and stopped with long names), calm, brand-new, 10+ agents, loading and the review path, in both themes, at 1440, 1280 and 390.
- **Contrast** is worked out by the page. Text is at least 5.3:1 in both themes. In-progress stripes are 7.6:1 in dark and 4.6:1 in light, and rings 3.4:1 or more. "To go" outlines are faint on purpose; the word under the line carries them.
- **Not checked:** a real screen reader, Safari or Firefox, or a real touch device.
