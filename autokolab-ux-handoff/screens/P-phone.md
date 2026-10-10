# P01–P05 · Phone

Designed at 390 × 844. No fake status bar: the top 50–56 px is left for the OS. Tab bar at the bottom: **Captain · Work · Room · You** (icons 22 px, labels 12 px, 64 × 44 px targets, 26 px bottom padding for the home indicator).

## P01 · Captain
- **Source:** `source/PhoneLead.dc.html` · **Pictures:** `P01-phone-captain.png`, `P01-phone-captain--merged.png`
- Header: Captain avatar (live dot), "Captain", person avatar.
- Briefing card: "Where we are", 21 px sentence with the amber/green needs clause.
- Conversation, single column: Captain text without bubbles; decision cards full width with a 50 px primary button ("Yes, merge it"), and a row with **How do you know?** (left) and **No, something's off** (right).
- "Earlier today · 3 shipped, 2 handled ›" row (dashed) → P05.
- Composer: pill-shaped input "Tell Captain anything" + a 44 px round **voice note** button (hold to record; release to send; slide left to cancel).

## P02 · Answer a question
- **Source:** `source/PhoneDecision.dc.html` · **Pictures:** `P02-phone-answer-a-question.png`, `…--answered.png`
- What a blocking notification opens. Back button, context "Google sign-in · AK-47 · 6:00 pm".
- "Captain asks, for Tern" + one sentence; a **preview** of what was built (a miniature of the screen); the question (24 px); two option buttons (72 px min) each with its consequence ("Ready now. Merges itself and finishes the goal tonight." / "Adds one small ticket."), the recommended one tagged ("Tern's draft"); "Or say something else" input.
- Answered: green panel "Sent: the login page", what happens next, "Recorded as DEC-27 so no agent asks again.", **Change answer**.

## P03 · Goal (Work tab)
- **Source:** `source/PhoneGoal.dc.html` · **Picture:** `P03-phone-goal.png`
- Progress ring (112 px; green done arc, amber arc for the part waiting on you) with "5/6"; goal name; "Waiting on you · 1 question".
- Amber "Answer a question" row → P02.
- Ticket list: one line each, ✓ or status ring, agent name at right.
- Three small stats: "14 h agents worked", "4 min you spent", "2 times asked".

## P04 · What reaches you (You tab)
- **Source:** `source/PhoneTiers.dc.html` · **Picture:** `P04-phone-what-reaches-you.png`
- "Captain holds everything until you look, unless someone is stuck waiting on you."
- Example notification (styled as AutoKolab's own banner, not the OS): "Captain · needs you — Birch is waiting for your OK on a database change. Fjord is idle until you answer."
- Tier cards: **Someone is stuck on you** (amber card, switch, note "Notifies you, but waits for a pause, never while you're typing."), **Can wait** ("never notifies"), **Just so you know** ("never notifies"), **Quiet hours · 10 pm – 8 am** (switch; "Even blocking questions wait. Captain works on what isn't blocked.").
- Footer stat: "Last 7 days: 9 notifications, every one a decision."

## P05 · Earlier today
- **Source:** `source/PhoneCatchUp.dc.html` · **Picture:** `P05-phone-earlier-today.png`
- The expanded catch-up: headline, any decision card, Shipped / Heads up / Decided lists (one line each), **I'm caught up**.

## Notifications (system-level)
- Only blocking decisions notify. Title "Captain · needs you"; body = what's blocked and what waiting costs; actions: the two primary answers when they fit in a notification (e.g. "Yes, merge" / "Look first"), otherwise "Answer".
- Delivered at a pause: not while the person is typing in AutoKolab on any device; held during quiet hours.
- One notification per decision; never re-notify the same decision more than once per 2 hours.

## Acceptance criteria
1. Every phone screen works one-handed: primary actions sit in the bottom 60 % of the screen.
2. Answering from a notification action updates every open device within 1 s.
