The app has 9 tabs.

| Tab | Purpose | Theme fit |
| --- | --- | --- |
| **Captain** | Talk to Captain. Tell it what you want, and answer when it asks you something. | People give direction by talking to Captain, who asks them for decisions in simple language. |
| **Overview** | One look tells you what is happening and whether anything needs you. | People understand, very simply, what is happening. |
| **Work** | Every piece of work, by goal: what is done, what is being built and by whom, what comes next, and the proof it works. | What agents are doing, and Captain managing the work. |
| **Team** | The people and agents on this project: where they are, whether each agent can work now, and how to add someone. | A team of agents working together, wherever they are. |
| **Room** | Read what the agents say to each other while they work. | Very transparent: nothing the agents agree happens out of sight. |
| **Decisions** | What was decided, by whom, and why. | Captain taking decisions and explaining them. |
| **Guide** | What the project is, how it is built, and the rules every agent follows. | Transparent: you can read exactly what every agent is told. |
| **Results** | How much got done, how fast, how often you were asked, and what it cost. | People understand, simply, whether the team is delivering. |
| **Settings** | How much Captain may do on its own, and when you get notified. | People stay in control of how much Captain decides alone. |

**Not tabs (not pages):** your **account button** (change your name, sign out) and the **project switcher** (switch project, start a new one). Keyboard shortcuts (⌘K, "G then a letter") only jump to a tab or a piece of work; they hold nothing.

Captain is first and the page a project opens on. Desktop shows all 9 in the side bar; phone shows the same 9, in the same order, in a bottom bar that scrolls sideways. Nothing opens over a tab: a plan, a piece of work or a form opens inside its own tab, and that tab stays lit.

## Who owns what

One owner per thing. Overview may repeat a thing in brief, with a link to its owner. No other tab repeats anything.

| What the app shows or does | Owner | Brief on Overview |
| --- | --- | --- |
| The project's state in one sentence | Overview | (owner) |
| What changed since you last looked | Overview | (owner) |
| Talking to Captain, giving direction | Captain | |
| A question waiting for me, and my answer | Captain | yes |
| OK a plan, OK a risky merge, approve a change | Captain | yes |
| Who is doing what right now | Work | yes |
| Goals and how far along they are | Work | yes |
| All work: done, now, later | Work | |
| One piece of work: its steps, comments and proof | Work | |
| Work that went wrong (failed checks, sent back) | Work | yes |
| Delivered work (each finished piece) | Work | yes, today's |
| Asking for new work by hand | Work | |
| Team members, people and agents | Team | |
| Whether an agent is online, paused or at its limit | Team | yes, if one can't work |
| Add an agent, choose which agent is Captain | Team | |
| An agent's model and daily limit | Team | |
| Invitations | Team | |
| Pause everyone (not built yet) | Team | |
| Agent conversation | Room | |
| Decisions made, and why | Decisions | yes, new ones |
| Rules agents follow, what the project is | Guide | |
| How much got done, how fast, how often you were asked | Results | |
| Cost and usage | Results | |
| Download the numbers | Results | |
| How much Captain may merge on its own | Settings | |
| Notifications | Settings | |
| Your name, sign out | account button | |
| Switch or start a project | project switcher | |

## Where today's pages go

| Today | Goes to |
| --- | --- |
| Captain | **Captain**. Its "while you were away" and problem messages move to Overview, so Captain only replies, proposes and asks. |
| Plan page | Merged into **Captain**: the plan opens inside its message. |
| Let me look first (risky merge) | Merged into **Captain**: opens inside its message. |
| Overview | **Overview**. |
| Work: By agent, By feature, Later, All tickets | **Work**, as one list by goal. The four views become filters (who, state), not pages. |
| A ticket's page | Merged into **Work**: opens inside Work. Its approve buttons are removed; approving happens in Captain. |
| New ticket form | Merged into **Work**. The Create button leaves other tabs. |
| How do you know?, Show the work | Merged into **Work**, inside the piece of work they explain. |
| Room | **Room**. Its list of members is removed; Team has it. |
| Team (People) | **Team**. Each agent's current task is removed (Work has it); its spending moves to Results. |
| Add an agent | Merged into **Team**. |
| Decisions | **Decisions**. Its Guide sub-tab becomes the Guide tab. |
| Guide | **Guide**. |
| Results | **Results**. |
| Settings: merging | **Settings**. |
| Settings: invite people | Moved to **Team**, joined with "add by GitHub name". |
| Settings: notifications | **Settings**. There is no notifications page; a notification opens Captain's question. |
| Invitation link (Join) | Not a tab: it happens before you are in the project, then lands on Captain. |
| Search (⌘K) | Removed as a place. Finding work moves to a search box on **Work**; ⌘K stays only as a shortcut to tabs and work. |
| Today's "Project" menu | Removed. Each item becomes its own tab. |
| Sign in, Welcome, change your name, sign out | Account button (sign in and Welcome happen before any tab). |
| AutoKolab on GitHub link | Removed. It is not part of a project. |
| New project | Project switcher. |
| Old addresses (`/board`, `/list`, `/t/…`, `?tab=guide`) | Redirect to their tab. |

## If 9 is too many

I would merge **Guide into Decisions** first. Both answer "what has been settled here": a decision is one choice and its reason, the guide is the standing rules those choices add up to, and a person rarely cares which one holds the answer.

I agree with the rule.
