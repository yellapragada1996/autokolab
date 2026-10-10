# S06 · Two people disagree

- **Source:** `source/Conflict.dc.html`
- **Pictures:** `S06-two-people-disagree.png`, `S06-two-people-disagree--answered.png`
- **Route:** none; this is a message in the Captain conversation of **both** people.

## Purpose
Resolve conflicting instructions without Captain guessing and without the two people needing to coordinate elsewhere.

## The card (component: `DecisionCard`, variant conflict)
Captain's message above: "You and James asked for different things, so I've paused before changing the order. Work that isn't in dispute keeps going." Meta line: "Captain · 11:21 am · sent to you and James".

Inside the amber card:
1. Kicker: "Needs you and James · a priority call".
2. Two quote tiles side by side (wrap on narrow): person avatar, "You · 9:15 am" / "James · 11:18 am your time", and the request in quotes.
3. **Captain's suggestion** inset: "Do both: Birch fixes the presence bug first (one small ticket), while Fjord, Kestrel and Tern keep going on sign-in. Nobody waits."
4. Options (radio buttons, 48 px tall): *Go with Captain's suggestion* (tag "suggested", amber outline) · *Sign-in first* (tag "yours") · *Pause sign-in, fix the bug first* (tag "James's") · *Let's talk it over in the room*.

## States
- **You answered, other person hasn't:** green panel "You chose: … If James picks the same, it's settled and I start right away. If not, you decide, because you're the admin." with **Change**.
- **Both agree:** Captain posts to both: "Agreed. Birch is fixing the presence bug first." Card shows "Settled · 11:24".
- **They differ:** the admin gets a final card with just the two choices; the other person sees "Raghav will decide."
- **Talk it over:** opens a Room thread with both people and Captain; the card waits.

## Acceptance criteria
1. Both people see the identical card; answers show live on both sides.
2. Only the disputed ordering is paused.
3. The final choice is recorded as a decision with both requests quoted.
