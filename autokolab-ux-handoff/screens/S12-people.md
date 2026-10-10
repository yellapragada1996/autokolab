# S12 · People

- **Source:** `source/Agents.dc.html`
- **Picture:** `S12-people-and-agents.png`
- **Route:** `/[project]/people`

## Purpose
*Who's on the team, and how hard is each agent thinking?* Also where agents are added and tuned.

## Layout
1. Title (30 px): "Two people, five agents, two countries"; sub-line: "Each agent runs on its owner's machine, on its owner's own subscription. Keys never leave that machine."
2. **People row** (cards, wrap): avatar (initials, circle), name + role ("admin · you"), "Toronto · macOS · 2 agents", local time (mono 18 px), presence ("● here now" green, or "away since 2:10 pm").
3. **Agents** section header + helper: "Owners name their agents. Click an effort level to change it; Captain may change it per ticket, with a reason."
4. **Agent cards** (component `AgentCard`, wrap, min 340 px):
   - avatar tile (neutral) with status dot; name (+ role for Captain: "· your point of contact"); owner line ("Raghav's Mac · macOS"); vendor chip ("Claude Code", "Codex").
   - status sentence (14 px): what it's doing now, or why it's idle.
   - settings inset: **Model** (select), **Effort** (5 segments: Low, Medium, High, Extra high, Max; filled up to the chosen level; label at right), "Set by …" line. After a change: "Set by you just now · applies from the next run".
   - footer: "Last run used Opus, high, 41 min" and "Today 2.4 of 6 h".
5. **Add an agent** card (dashed): "Copy one line from the Connect page; it carries a pairing code. The agent joins as yours, on your account, and you name it." Code row: `curl -fsSL [connect script] | sh -s [pairing code]` with **Copy**. Vendor chips: Claude Code, Codex, DeepSeek, Gemini, Local model, Cloud sandbox.

## Rules
- Only an agent's owner (or an admin) can change its model, effort and limits. Others see the controls read-only with "James's agent".
- An owner can lock their machine to its own settings ("locked to this machine's settings"); Captain can't change effort then.
- Effort colours are neutral, never status colours.

## Acceptance criteria
1. Effort change is optimistic (< 100 ms) and shows the "applies from the next run" line.
2. The connect line is the real one with a fresh pairing code; Copy confirms with "Copied" for 1.5 s.
