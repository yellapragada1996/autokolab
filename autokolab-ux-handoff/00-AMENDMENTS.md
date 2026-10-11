# 00 · Amendments: read this first

This package was written without knowing what AutoKolab has already built. Treat it as strong advice. **Where this file and the rest of the package disagree, this file wins.** Decided by Raghav with the lead agent, 10 Oct 2026.

## What the package gets right (keep all of it)

- **Captain is the single point of contact**, like a conductor. People talk to Captain and never have to work out which agent to ask. The agents' back-and-forth stays visible in the **Room** for anyone who wants to look.
- ~~**Home is the Captain conversation** with one pinned sentence on top. Overview, Catch up and Goals as separate pages are dropped.~~ Replaced by DEC-24: see "Captain is a chat; Overview is its own tab" under Changed. Catch up and Goals as separate pages stay dropped.
- **Three depths in fixed places:** the glance → "How do you know?" → "Show the work".
- **The purpose rule (P3):** one fact in one place, one fact per row, empty things hidden.
- **Amber only means "needs you".** Colour only means status. Agent avatars are neutral.
- **Decisions are answered in place,** with evidence chips and a specific question for risky changes.
- **The design tokens** (`tokens.css`, Geist), the component list, the copy guide and the acceptance checks.

## Removed

| Part | Why it's out |
| --- | --- |
| **Side threads with a worker** (S05, J8, `/threads/[agent]`) | It works against the point of Captain. If you want to say something to one agent, say it to Captain, or write in the Room, where Captain and everyone else can see it. |
| **The two-person conflict card with voting and tie-break** (S06, J9) | Too much machinery for a rare case. Rule instead: when two people ask for conflicting things, Captain doesn't guess. It asks the project owner one normal decision card that quotes both requests. Work not in dispute keeps going. |
| **The live "intent hint" that changes as you type** (`classifyIntent`, the 150 ms budget) | A keyword guess presented as a promise ("Small change — I'll just do it") will sometimes be wrong. The composer shows one fixed line: "Big work gets a plan first. Small things I just do." Captain decides after reading the message and says which it is in its reply. |
| **Voice notes** (composer and phone) | Nothing behind it; fails the purpose rule. |
| **"Can be undone" on database changes, and Undo that rolls a database update back** (S01, J5, S04) | We have no safe way to roll back a database update. Promising it would be dishonest. See "Changed: Undo". |
| **Automatic revert of a wrong-branch merge** (the S16 example) | We prevent it instead: the runner refuses to merge a PR that doesn't target the default branch (AK-36). |
| **The solo baseline and "twice what you shipped running agents yourself"** (S15, J12) | We can't measure a person's past solo output honestly. Results shows real numbers only. |
| **Next.js App Router routes** (02) | The site is a Vite single-page app (DEC-8). Keep the route *structure*; implement it in the existing router. |
| **Cloud sandbox tile in "Add an agent"** | Not real yet. |
| **"Waits for a pause, never mid-typing on any device"** for notifications | Not buildable reliably. See "Changed: Notifications". |
| **Plan page editing: reorder and remove tickets** (S08) | To change a plan you tell Captain in words ("Change something"). One way to do it. |

## Changed

**Captain is a chat; Overview is its own tab (DEC-24).** Decided by Raghav, 11 Oct 2026, after using the Captain page. It replaces "Home is the Captain conversation with one pinned sentence on top" above, and the pinned-briefing parts of `screens/S01-captain-home.md` (the sticky "Where we are" card, "Who's doing what" behind a click, the setup checklist above the conversation).
- **Captain** stays the first tab and the page a project opens on (`/p/<project>`). It is only the conversation and the composer: no pinned briefing, no setup checklist. Its sidebar item keeps the needs-you count.
- **Overview** is the second tab (`/p/<project>/overview`, G then O), for looking; nothing is typed there. One reading column, top to bottom, each block hidden when empty: the state sentence (with the goal's short name, the part of its title before the first ":") and "Next from me"; one compact row per thing that needs you (a small amber dot, never a filled box), which opens that card on the Captain page; who's doing what; goal progress; today (what shipped since midnight, what's in review, what was decided); the setup checklist while a step is undone.
- One fact in one place: the state sentence, who's doing what and goal progress live only on Overview.
- **No decision cards on Captain (AK-69).** Everything from Captain is one kind of message: avatar, "Captain · 9:17 am", plain 15px text, no box. Where this package says "decision card" or "plan card", read: an ordinary Captain message with a small amber dot and "needs you" in its meta line, one or two sentences built by code, and small actions under it (32px, 44px on phones). The only amber is that dot, plus **Yes, merge it** on a risky merge. Problems get a coral dot instead and are not decisions. Messages over about 280 characters or 4 lines show their beginning with "Show more". **Reply**, **No** and **Change something** put the composer into reply mode ("Replying to: …", × or Esc cancels); a ticket question's **Answer** opens a one-line field. Once answered, the actions become one quiet line ("You said yes · 9:20"). **Not needed any more** closes one of Captain's old questions by posting "No answer needed." in its thread.

**Who writes the sentences.** The package has Captain (the model) compose the briefing and catch-up. Instead:
- **Code builds from the record:** the pinned briefing, the "Who's doing what" rows, the catch-up summary ("3 shipped · 2 handled") and its item lines. They're instant, free, and can't drift from the truth.
- **Captain writes only what needs judgement:** its replies, plans, questions, review notes and "where I'm less sure".
- **"Next from me"** is also built from the record (what's waiting on the person, then what Captain reviews next). It's hidden when there's nothing to say.

**Evidence comes from Captain's review, not a separate system.** When Captain approves a commit (`ticket_approve`), it also records:
- a one-sentence plain summary;
- for risky changes, the one yes/no question about what the change does to existing users or data;
- the "line that matters" (file and a few lines);
- which decisions it checked;
- "where I'm less sure" (required; "Nothing I'm unsure about here." if none).

The UI shows these with tests and the approved commit, which we already have. If a field is missing, its row is omitted; the question falls back to "OK to merge this?".

**Undo.**
- Code-only changes can be undone: Undo opens a revert that goes through the same tests, approval and merge path.
- Database changes show "Database change · can't be undone automatically", and that is why they ask a person.
- Settings changes keep the 6-second undo toast.

**Speed.** Captain is a real agent run on its owner's machine, so a reply takes seconds, not milliseconds. The honest version:
- your message appears instantly;
- within a second or two the UI shows "Captain is reading…", from the runner's start event;
- live steps follow when available;
- never a bare spinner; all other budgets stay.

**Decision cards map onto what exists.** A "needs you" item is one of:
- a ticket question (`needs_human`);
- a risky merge waiting for OK (`allow_merge`);
- a plan waiting for OK;
- a question Captain asks directly.

No new "Ask" system until those four are in the conversation and working.

**Plans.**
- Big work: Captain posts a plan card. Its tickets exist as drafts (Backlog) until you say **OK, start**, which moves them to Ready.
- Small work: Captain just creates the ticket.
- The Plan page is read-only detail.

**Heads-up pages** are generated from problems the runner already detects (an agent hit its limit, a run failed, a merge was refused, a thread paused), with the same layout: what happened, what was done, how far it got.

**Notifications.** Only blocking questions notify (someone is stuck until you answer), with quiet hours. Everything else waits in the conversation. The phone app is the website installed as a web app (PWA) with web push; no native app.

**Pause everyone** is a project switch the owner can flip. Every runner checks it before starting a run. Owners can still pause their own agents as today.

**Words.**
- UI and prompts say **Captain** (not lead) and **goal** (not epic). The database keeps `lead` and `epic`; no rename migration.
- Roles are **owner** and **member**, as built.
- Agents keep the names their owners give them.

## Already built: restyle, don't rebuild

- **Agents and merging:** background agents with owner limits; free agent-to-agent chat with loop guards; the lead (Captain) answering workers; exact-commit approval; nobody approves their own work; automatic merge of safe changes; one-click OK for risky ones.
- **Work and records:** live steps; tickets with "done means"; decisions and contracts; the Room; model and effort per agent with "set by" and "last run".
- **Setup:** the one-line connect with a pairing code; invites; GitHub sign-in; self-updating machines; database updates from the owner's machine; tests on every pull request.

## Build order (replaces `10-build-order.md`)

Each phase ends in something usable, and the next starts only after it's merged.

1. **Foundation.** `tokens.css` and Geist in place; shared components; new navigation (Captain · Overview · Work · Room · People | Decisions · Results · Settings; Overview added by DEC-24); every existing page inside the new shell; Captain and goal wording; neutral avatars. No behaviour changes.
2. **Captain home.** Your conversation with Captain on the website; the pinned briefing and "Who's doing what"; the catch-up message; quiet-updates fold; decision cards for ticket questions and risky merges, wired to what exists.
3. **Evidence.** The extra fields on Captain's approval; "How do you know?"; the "Show the work" sheet; "Look first"; revert-based Undo.
4. **Plans.** Plan card, OK to start, the read-only Plan page.
5. **Everywhere.** ⌘K "Tell Captain" and search; the ⌘L slide-over with context.
6. **Look-closer screens** on the new system: Work, Ticket (Plain/Detailed), Room, People, Decisions, Settings.
7. **Heads-up pages and Pause everyone.**
8. **Phone:** installable web app, blocking notifications, quiet hours.
9. **Results:** real numbers and the audit export.

"Any model as an agent" (AK-26) stays on the roadmap after phase 3; it doesn't depend on the UI.
