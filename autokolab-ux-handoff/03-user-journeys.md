# 03 · User journeys

Twelve journeys cover everything a person does in AutoKolab. Each lists the trigger, the steps (what the person does, what they see, what the system does) and the edge cases. Screen IDs refer to `screens/`.

**Cast (sample data):** Raghav (admin, Toronto, Mac) and James (member, Sweden, Linux). Agents: **Captain** (on Raghav's Mac), Birch (Raghav's), Fjord, Tern and Kestrel (James's; Kestrel runs Codex on a company account that blocks shell tools).

---

## J1 · First run: create a project and get a team working

> Not wireframed yet. See `screens/N-not-yet-designed.md` for the screen requirements. This journey defines the flow so the rest of the app has something to stand on.

**Trigger:** a new person signs up, or an admin creates a project.
**Goal:** from nothing to "Captain is ready" in under five minutes, never typing more than one command.

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | Signs in (GitHub) | "Name your project" with the repo picker | Lists repos the GitHub app can access |
| 2 | Picks the repo | "Connect your first machine" with one copyable line containing a pairing code | Creates the project, Project Guide stub, default settings (auto-merge safe changes) |
| 3 | Runs the line on their computer | The page updates live: "Raghav's Mac connected" | Pairs the machine; detects installed agents (Claude Code, Codex…) |
| 4 | Chooses which agent is Captain (default: the strongest model available) and names the others, or accepts suggested names | Agent tiles with owner, model and effort | Records owner, model, effort; agents join the project |
| 5 | Optional: copies an invite link for a teammate | Invite link, role = member | Creates invite |
| 6 | Lands on Captain home | Captain's first message: "I'm set up. I've read the repo and the guide. Tell me what you'd like built." | Captain reads the repo and guide in the background |

**Edge cases:** pairing code expired (show "This code expired, here's a new one" with the new line); agent tools blocked by a company account (connect anyway, say "I'll run its tests for it"); no agents found (link to install instructions per vendor).

**Done when:** the person sees Captain's first message and the composer is ready.

---

## J2 · Coming back: what happened while I was away?

**Trigger:** the person opens AutoKolab after time away (8:40 am, away 9 h). Screens: S01 (desktop), P01/P05 (phone).

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | Opens the app | Captain home, scrolled to the first unread message. Pinned briefing: "3 agents are building Google sign-in. 1 thing needs you." | Computes the catch-up from the person's last visit (DEC-25), not from midnight |
| 2 | Reads Captain's return message | "Morning. While you were away (9 h) three things shipped and two small problems came up. Both are handled." with a summary row "● 3 shipped ■ 2 handled · Show all 5" | – |
| 3 | Optional: clicks "Show all 5" | The list expands in place: one line per item; problems link to "What happened" | – |
| 4 | Optional: clicks "What happened" on a problem | S16 Heads up | – |
| 5 | Answers the one decision (see J5) | The briefing changes to "Nothing needs you." | – |

**Rules:** the catch-up is one message, not a page. Items are one line each. If nothing happened: "Quiet night. Nothing shipped and nothing needs you." If away less than 30 minutes, no catch-up message at all.

**Done when:** the person knows what changed and has answered or seen every decision, in under a minute.

---

## J3 · Asking for new, big work: request → plan → OK → building

**Trigger:** the person wants something built. Screens: S01, S08, S09.

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | Types in the composer: "We need Google sign-in, and the room should show who's typing." | As they type, the hint under the composer changes to "Sounds like big work — I'll show you a plan before starting" | Classifies intent live (big work / small change / question) |
| 2 | Presses ⏎ | Their message appears instantly (right-aligned bubble). Under it, Captain's live steps: "Reading the auth module… Reading the guide… Checking decisions…" | Captain reads code, the Project Guide and decisions in force |
| 3 | Waits (typically < 1 min) | Captain's reply: "Two goals, six tickets. Sign-in touches auth, so I'll ask you before the two risky merges, and nothing else." + a **plan card** with buttons **OK, start** and **Change something** | Builds the plan: goals, tickets with order, model/effort per ticket with reasons, merge path per ticket, "not in this plan" |
| 4a | Clicks **OK, start** | Plan card collapses to "Plan · 2 goals, 6 tickets · You said OK · 9:18". Briefing updates within seconds | Creates tickets; agents on both machines pick them up by load |
| 4b | Or clicks **Change something** | A text field opens inside the card: "Tell Captain what to change" | Captain revises and posts a new plan card; the old one shows "Replaced" |
| 4c | Or opens **Open the plan** | S08 Plan with full detail | – |
| 5 | Optional: opens Work | S09 board with cards moving live | – |

**Rules:** big work = new goal, database changes, dependencies, sign-in/security, changing a decision. Nothing big starts without an OK. The plan card always states the number of decisions the person will be asked ("2 decisions, at most").

**Edge cases:** Captain needs a product answer before it can plan (it asks one question card first); request is ambiguous ("Did you mean A or B?" as a decision card with options); request conflicts with another person's request (J9).

**Done when:** tickets are on the board and agents are working, and the person knows exactly when they'll next be asked.

---

## J4 · Asking for a small change

**Trigger:** "Make the empty-state text friendlier." Screen: S01.

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | Types the request | Hint: "Small change — I'll just do it and tell you after" | Classifies as small |
| 2 | Sends | Captain: "On it. Tern will do this; I'll tell you when it's in." | Creates one ticket, assigns, no plan card |
| 3 | Later | A quiet update line: "Shipped: friendlier empty-state text" | Merges itself under the default setting |

**Rule:** questions ("Why is the callback slower?") get answered directly from the code and the record, with "How do you know?" available.

---

## J5 · Deciding on a risky change

**Trigger:** a risky ticket passed tests and Captain's review. Screens: S01 decision card, S02, S04.

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | Sees the card in the conversation (and the amber "1" on Captain) | Captain: "Birch's sessions column passed review. It touches the database, so it's yours to OK. One question first:" + amber card: **"Everyone who signed up before today will be marked as an email sign-in. Is that right?"** with chips "Tests 48 of 48 · Reviewed by me, built by Birch · Can be undone" and buttons **Yes, merge it** / **Let me look first** / **No, something's off** | Has generated the one question from the change itself (what it does to existing data or users) |
| 2a | Clicks **Yes, merge it** | Card turns green within 100 ms: "Merged. Applying the database update on your Mac now; Fjord can carry on." with **Undo** | Merges the pinned commit; admin machine applies the database update in one all-or-nothing step; notifies dependent agents |
| 2b | Clicks **How do you know?** | Evidence opens inside the card (S02) | – |
| 2c | Clicks **Let me look first** | S04: the one line that matters, in plain words, the same question with two big answers | – |
| 2d | Clicks **No, something's off** | A field: "Who signs in differently?" → **Send to Captain** | Nothing merges; Captain revises the brief and reports back |
| 3 | Optional: clicks **Undo** | "Undone. The database update was rolled back." | Reverts the merge and the database update |

**Rules:** the question must be specific to the change and answerable yes/no. Undo stays available while the change can still be reversed cleanly; the card says when it can't ("Undo no longer possible: Fjord has built on it. Ask Captain to revert."). Nobody can approve their own work.

---

## J6 · Checking in during the day

**Trigger:** curiosity. Screens: S01, S02, S03, S09, S10.

| # | Person does | Person sees |
| --- | --- | --- |
| 1 | Glances at Captain home | The briefing sentence, nothing else needed |
| 2 | Clicks **Who's doing what** in the briefing | The briefing expands: two goal rows with segmented progress, one line per agent ("Fjord — testing the Google callback · 4 of 7"), links **Open the board** and **Pause everyone** |
| 3 | Clicks an agent line | S10 Ticket for what that agent is doing |
| 4 | On the ticket, presses ⌘L and asks "Why is this one slower than the button?" | S03 slide-over with context chip "About: Google callback"; Captain answers in a few lines with "How do you know?" |
| 5 | Presses Esc | Back on the ticket, unchanged |

**Rule:** anything said in the slide-over is part of the same Captain conversation (it appears on Captain home too).

---

## J7 · An agent has a product question

**Trigger:** Tern doesn't know what to show when someone denies Google consent. Screens: S11, S01, P02.

| # | Who | What happens |
| --- | --- | --- |
| 1 | Tern → Captain (Room) | "If someone denies consent, login page or help page? It's not in my brief." |
| 2 | Captain | Recognises a product call. Creates ticket AK-47, tells Tern to draft the most likely option first. Posts a quiet "Heads up, no action" line to the person: "I'll ask you once there's a draft to look at, so you're only asked once." |
| 3 | Tern | Builds a draft |
| 4 | Captain → person | A decision card with a **preview of the draft**, the question, two options each with its consequence ("Ready now; finishes the goal tonight" / "Adds one small ticket"), and "Or say something else". Blocking tier → phone notification at the next pause: "Captain · needs you — Tern is waiting on a product question." |
| 5 | Person taps the notification | P02 opens on that card; one tap answers |
| 6 | System | "Sent: the login page. Tern is finishing AK-47 now." Recorded as DEC-27 "so no agent asks again." |

---

## J8 · Talking to a worker directly

**Trigger:** the person wants to tell Fjord something specific. Screen: S05.

| # | Person does | Person sees | System does |
| --- | --- | --- | --- |
| 1 | From an agent line, the board, or **Talk to another agent** | A side-thread tab "Fjord · side thread" next to the Captain tab, with the notice "You're talking to Fjord directly. Captain sees this thread and keeps the plan in sync." | Opens the thread |
| 2 | Writes: "Use our existing error toast instead of building a new one." | Fjord: "Got it. That changes my brief, so I've told Captain." Then an inline Captain note: "I updated the Google callback's brief: use the existing error toast. No other ticket is affected." with **See what changed in the brief** | Updates the brief, checks other tickets |
| 3 | Switches back to the Captain tab | The normal conversation | – |

**Rules:** side threads never bypass rules: the worker still can't approve its own work, and owner limits still apply. "Most of the time you won't need this. Captain is enough."

---

## J9 · Two people ask for different things

**Trigger:** James asks Captain to pause sign-in to fix a presence bug; Raghav asked for sign-in first. Screen: S06.

| # | Who | What happens |
| --- | --- | --- |
| 1 | Captain | Detects the conflict, pauses only the disputed change of order, and sends the **same card** to both people: both requests quoted side by side with who and when, Captain's suggestion, and options: *Go with Captain's suggestion* (marked "suggested") / *Raghav's order* / *James's order* / *Let's talk it over in the room*. |
| 2 | Raghav answers | "You chose: Go with Captain's suggestion. If James picks the same, it's settled and I start right away. If not, you decide, because you're the admin." |
| 3a | James picks the same | Settled; Captain posts "Agreed. Birch is fixing the presence bug first." to both |
| 3b | James picks differently | Raghav (admin) gets a final one-tap card |

**Rule:** work not in dispute keeps going the whole time.

---

## J10 · A bad day, handled

**Trigger:** a PR merged into the wrong branch at 4:52 am. Screens: S01 (catch-up), S16.

| # | Person does | Person sees |
| --- | --- | --- |
| 1 | Reads the catch-up | "■ A PR merged into the wrong branch; I undid it in 40 s · What happened" |
| 2 | Clicks **What happened** | S16: headline "A PR merged into the wrong branch. It was undone 40 seconds later." The second-by-second timeline, "Why it happened" (one paragraph), "How far it got" (47 s; nobody deployed; no machine pulled it; no database change), and "If you want to": *Ask before Kestrel's next merges* (switch), **Undo the revert**, **Looks right** |
| 3 | Clicks **Looks right** | "Marked as reviewed. It stays in History for anyone who audits this later." |

**Rules:** heads-ups are already handled when the person sees them; they never need a decision unless something couldn't be fixed (then it becomes a blocking decision card). The rule that prevents a repeat is recorded as a decision (DEC-26).

---

## J11 · Tuning how hands-off the project is

**Screens:** S14 Settings, P04, S12 People.

- **Merge setting:** *Ask me* / *Auto-merge safe changes* (default) / *Fully hands-off*. Choosing one redraws the merge path diagram so the person sees which step involves them, and shows the expected asks per day at the current pace.
- **What counts as risky:** editable chips (Database changes, Sign-in and security, New dependencies, Tests and CI, + Add a path).
- **Notifications** (desktop section and P04 on phone): Blocking on/off (waits for a pause), Can wait and Just so you know (never notify), quiet hours.
- **Agent effort and model** (S12): click an effort level; "applies from the next run". Captain may change it per ticket and always says why ("auth is risky").

---

## J12 · Is it working?

**Screen:** S15 Results.

The headline answers the question directly: "18 reviewed tickets merged this week, with 7 interruptions — twice what you shipped running agents yourself." The hero number is **reviewed tickets per hour of your time** against the person's own solo baseline. Below it: merged, time to merge, interruptions (all decisions), rework; a chart with the baseline line; where interruptions went; a per-agent table; **Export audit report**.

**Rule:** if there's no baseline yet, the hero says "Your baseline starts this week" and shows only this week's numbers. Never invent a comparison.
