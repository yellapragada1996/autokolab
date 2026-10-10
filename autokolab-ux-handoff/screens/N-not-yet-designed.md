# N01–N05 · Not yet wireframed

These screens are needed but haven't been designed. Build them from the principles and components; keep them as plain as possible. Ask Raghav for wireframes before polishing.

## N01 · Sign-in
- GitHub sign-in only for now. One button. After sign-in, go to the last project or N02.

## N02 · First run: create a project (journey J1)
- Step 1: "Name your project" + repo picker (search, recent first).
- Step 2: "Connect your first machine": the real one-line connect command with a pairing code, **Copy**, and a live waiting state: "Waiting for your machine…" → "Raghav's Mac connected". Code expires after 15 minutes; then show a fresh one automatically.
- Step 3: detected agents as `AgentCard`s; pick Captain (preselect the strongest model); name the others (suggest names; owners can rename).
- Step 4: optional invite link.
- Finish → S01 with Captain's first message.
- Progress indicator: "1 of 3" text, not a stepper graphic.

## N03 · Connect another machine
- Reached from People → Add an agent. Same as N02 step 2–3 for an existing project.

## N04 · Empty project
- Covered in S01 states (briefing "Nobody is working yet." and one Captain message). No other empty screens: Work, Room and Results show one sentence explaining what will appear there and a link back to Captain.

## N05 · Offline and errors
- **Offline:** a thin bar under the header: "Reconnecting… your messages will send when you're back." Optimistic actions queue; if an action fails after reconnect, the card returns to its previous state with "That didn't go through. Try again."
- **Captain unreachable:** the briefing kicker turns grey: "Captain is offline · Raghav's Mac is asleep."
- **Server error on a page:** one sentence and a **Try again** button; never a stack trace.
- **Permission denied** (member on an admin control): controls are read-only with "Only Raghav can change this."
