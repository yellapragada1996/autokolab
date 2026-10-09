# Choosing each agent's model and effort from AutoKolab

Findings and proposal for AK-5. **Investigation only: no feature code.**
Written 9 Oct 2026 by yvssaratchandra-claude.

People want to decide how hard each of their agents thinks and what it costs them: a Claude
agent on Opus, Sonnet or Haiku; a Codex agent on a cheaper model; effort low, medium or high.
Today that means hand-editing `~/.config/autokolab/runners/<agent>.toml` on the agent's own
computer and restarting the runner, and effort can't be set at all.

---

## 1. What the tools accept

### 1.1 What could not be checked on this machine

The ticket asks for `claude --help`, `codex --help` and one tiny real run of each. **Neither was
possible here.** This worktree's agent may not execute the `claude` or `codex` binaries (both are
on the PATH at `/usr/sbin/`, but running them is refused by this machine's permission rules), and
it may not read outside the worktree, so the installed versions could not be read either.

So this section is from the current official documentation, not from the installed versions, and
**no real run was made**. Everything marked "verify" below needs one short run on a machine where
the agent CLIs can be started before anyone builds on it. AK-5a (below) covers exactly that.

### 1.2 Claude Code

Source: [CLI reference](https://code.claude.com/docs/en/cli-reference),
[Model configuration](https://code.claude.com/docs/en/model-config). Version on this machine: **not
read** (see 1.1).

**`--model`** — "Sets the model for the current session with a model alias such as `sonnet`,
`opus`, `haiku`, or `fable`, or a model's full name. Overrides the `model` setting and
`ANTHROPIC_MODEL`."

| Alias | Resolves to (Anthropic API) |
|---|---|
| `opus` | Opus 5.5 |
| `sonnet` | Sonnet 5.5 |
| `haiku` | Haiku 5.5 |
| `fable` | Fable 5.1 |
| `best` | Fable 5.1 if available, else Opus 5.5 |
| `opusplan` | Opus 5.5 to plan, Sonnet 5.5 to execute |

Full IDs also work (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1`). `sonnet[1m]` /
`opus[1m]` ask for the 1M context window on the models that need the suffix.

**`--effort`** — "Set the effort level for the current session. Options: `low`, `medium`, `high`,
`xhigh`, `max`, or `ultracode`. **Available levels depend on the model.** Overrides the
`modelSettings` and `effortLevel` settings for this session and does not persist."

| Model | Levels |
|---|---|
| Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 5, Sonnet 5, Opus 4.7, Fable 5.1, Fable 5 | `low` `medium` `high` `xhigh` `max` |
| Opus 4.6, Sonnet 4.6 | `low` `medium` `high` `max` |
| Older models | no effort levels |

Defaults: `medium` on Opus 5.5 / Sonnet 5.5 / Haiku 5.5, `xhigh` on Opus 4.7, `high` elsewhere.

**Asking for a level a model doesn't have is safe.** Claude Code falls back to the highest
supported level at or below what was asked. That matters for us: we can pass the owner's choice
straight through without knowing which levels the chosen model has.

`ultracode` is not a model effort level — it asks for `xhigh` plus Claude Code's dynamic
workflows. Out of scope here.

**Headless.** Neither flag is marked print-mode-only in the reference (unlike `--max-turns` and
`--max-budget-usd`, which are). Both should work with `claude -p --output-format stream-json`.
*Verify.*

**Resuming.** On `--resume` / `--continue`, "the session restores the model it was using when the
transcript was saved", but "a `--model` flag or `ANTHROPIC_MODEL` environment variable still takes
precedence over the restored model". **So yes — a resumed session can switch model, as long as we
keep passing `--model` on the resume launch.** `claudeInvocation` already does: it appends
`--model` before `--resume` (`engines.ts:78-79`), so resumes already carry it.

For **effort on a resume the documentation is silent**. The safe reading is that `--effort`, being
a launch flag that "does not persist", applies to the launch it is on, resume included; a resumed
session with no `--effort` falls back to the saved `modelSettings` for that model. *Verify.*
Either way the right thing for us is the same: **always pass both flags on every launch, resume
included**, so the owner's current choice is what runs.

**Other ways in** (for context — not proposed):

- settings file: `model`, `modelSettings` (`{"claude-opus-5-5": {"effortLevel": "high"}}`),
  legacy top-level `effortLevel`. Reachable per-run with `--settings <json>`.
- environment: `ANTHROPIC_MODEL`, `CLAUDE_CODE_EFFORT_LEVEL`, `ANTHROPIC_DEFAULT_*_MODEL` (what
  each alias resolves to), `CLAUDE_CODE_SUBAGENT_MODEL` (subagents and teammates).
- precedence, highest first: `--model` / `--effort` → env → project/managed settings → user
  settings → account defaults.

Flags are the simplest fit for us: one place, no files to write, nothing left behind.

### 1.3 Codex

Source: [Developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[Config reference](https://learn.chatgpt.com/docs/config-file/config-reference). Version on this
machine: **not read** (see 1.1).

**`model`** — "Model to use (e.g. `gpt-6.1-sol`)." Also `-m, --model` on the command line:
"Override the model set in configuration."

**`model_reasoning_effort`** — "Reasoning effort advertised by the selected model, such as `low`,
`medium`, `high`, `xhigh`, `max`, or `ultra`. **Available levels depend on the model and client.**"
Default is `medium`. (A community write-up also lists `minimal`; it is not in the official
reference, so treat it as unconfirmed.)

Related, not proposed: `model_reasoning_summary` (`auto|concise|detailed|none`), `model_verbosity`
(`low|medium|high`).

**How to pass them.** `-c, --config`: "Override configuration values. Values parse as TOML if
possible; otherwise the literal string is used." Repeatable. `-c key=value` takes precedence over
`~/.codex/config.toml`. This is already how `codexInvocation` passes everything
(`engines.ts:92-99`), so adding `-c model_reasoning_effort="high"` is one more entry in the same
list.

**Resuming.** `-c` is a process-level config override, so it applies to `codex exec resume` the
same as `codex exec`; the code comment at `engines.ts:90-91` says the same. **One thing to check
before building:** a community guide claims flags must sit *between* `exec` and `resume`
(`codex exec -c k=v resume --last`), while our `codexInvocation` puts them *after* `resume`
(`["exec", "resume", ...config, sessionId, "-"]`). If that claim is right, **`cfg.codex.model` is
silently ignored on every resumed Codex run today** — a bug in what already ships, not just in
what we want to add. *Verify first; it is cheap, and AK-5a covers it.*

**Account limits.** The config reference does not say business or enterprise plans restrict model
choice, but it does say administrators manage **"Workspace model availability"** through managed
configuration. So a workspace admin can make a model unavailable, and a chosen model may be
refused for reasons AutoKolab can't see. **This could not be checked on this machine** — no run was
possible, and the account in use here is not ours to probe. Anthropic has the equivalent in
`availableModels` and organization defaults.

Practical consequence for the design: **a model choice can fail at run time**, so the runner has to
report that back rather than assume it took.

### 1.4 The two sets line up

`low` · `medium` · `high` · `xhigh` · `max` are accepted names in **both** tools. Codex adds
`ultra`, Claude Code adds `ultracode`; neither of those is a plain effort level. And both tools
clamp a level the model doesn't support rather than failing.

That gives us one vendor-neutral list of five to store and pass straight through.

---

## 2. Where AutoKolab would plug in

Today:

| Piece | File | What it does now |
|---|---|---|
| Schema | `runner/config.ts:35-57` | `claude.model?`, `codex.model?`. **No effort for either.** |
| Template | `runner/config.ts:108-135` | ships `# model = "claude-sonnet-5-5"` commented out, and says "Changes apply when the runner restarts". |
| Claude launch | `runner/engines.ts:78` | `if (cfg.claude.model) args.push("--model", cfg.claude.model)` |
| Codex launch | `runner/engines.ts:98` | `...(cfg.codex.model ? ["-c", \`model=${tomlStr(cfg.codex.model)}\`] : [])` |
| When the toml is read | `runner/runner.ts:77` | `loadRunnerConfig(file)` runs **once**, in `Runner.start()`. The `RunnerConfig` is then held on the Runner for its whole life — hence "restart to apply". |
| Where runs start | `runner/runner.ts:174, 327, 481` | three call sites, all `cfg.engine === "claude" ? claudeInvocation(cfg, …) : codexInvocation(cfg, …)` |
| Agent row | `sql/004_workspace.sql:25-37` | `agents`: `id`, `owner_profile_id`, `owner_label`, `vendor`, `display_name`, `status`, `status_note`, `current_ticket_id`, `last_seen_at` |
| People page | `apps/site/src/workspace/People.tsx:88-115` | agent card: mark, name, `"Claude Code · jamesblack's"`, status lozenge, current ticket |

Two existing patterns are worth copying rather than inventing around:

- **`set_paused` (`sql/001_init.sql:321-335`)** is the owner-only write we want: a
  `security definer` function that checks `owner_id = caller.owner_id` and raises
  `AUTOKOLAB_FORBIDDEN: you can only pause your own agents` otherwise. `agents` is `grant select`
  only for `authenticated` (`004_workspace.sql:457`), writes go through definer functions like
  `agent_status` (`:256`), so a new setting *must* arrive the same way.
- **`onMembersChange` (`core/client.ts:258-272`)** is how the runner already learns about a change
  made on the website without restarting: a Realtime subscription that updates `this.me` in place.
  Pause reaches a running agent this way (`runner.ts:105, 248-255`).

---

## 3. Proposal

### 3.1 Where the setting lives

Two new nullable columns on `public.agents`, in a new migration (schema 9):

```sql
alter table public.agents
  add column model  text check (model is null or char_length(model) between 1 and 60),
  add column effort text check (effort is null or effort in ('low','medium','high','xhigh','max'));
```

- **`model` is free text, not an enum.** Aliases and full IDs differ per vendor and change often
  (`opus`, `sonnet`, `haiku`, `fable`, `claude-opus-5-5`, `gpt-6.1-sol`). An enum would need a
  migration every time a model ships. The website offers each vendor's sensible choices in a
  picker and also accepts a typed-in name; the tool is the one that validates.
- **`effort` is the five names both tools share** (§1.4). Pass it through and let each tool clamp.
- `null` means "not set from AutoKolab" — fall through to the toml, then to the tool's own default.
- Both go through the existing `looks_like_secret()` guard, like all other shared text.

Written by one owner-only `security definer` function, modelled on `set_paused`:

```sql
create function public.set_agent_model(p_agent uuid, p_model text, p_effort text)
returns public.agents …
-- raises AUTOKOLAB_FORBIDDEN: you can only change your own agents'
-- settings  when agents.owner_profile_id <> auth.uid()
```

**Who may change it: the owner only.** It is their subscription and their bill. Project owners,
the lead and other members see the value but cannot set it. Access-rule tests go in
`supabase/tests/policies.sql`: owner can set; another member cannot; a direct `update` on `agents`
is refused for everyone.

### 3.2 How the runner picks it up, without a restart

**Read the agent's row immediately before building each invocation**, in all three call sites in
`runner.ts`, and pass model and effort into `claudeInvocation` / `codexInvocation` as a small
`{ model?, effort? }` argument alongside `cfg`.

That is the whole mechanism. The toml is loaded once at startup and stays that way; the database
value is read fresh per run, so a change on the website applies to the **next** run with no
`autokolab restart`. A Realtime subscription on `agents` (the generic `client.ts:274` `channel()`
helper already does filtered subscriptions) is a nice-to-have for showing the current value in
`autokolab status`, not the mechanism — a per-run read can't go stale and can't miss an event.

**A change does not disturb a run already going.** Unlike pause, which stops the current task on
purpose (`runner.ts:248-255`), switching model mid-run would mean re-briefing a live session for
no good reason. The run in flight finishes on the model it started with.

### 3.3 What wins when the toml also sets one

**Database first, toml as the fallback, then the tool's own default.**

```
agents.model / agents.effort   (set on the website by the owner)
  ↓ if null
claude.model / codex.model in <agent>.toml  (+ new claude.effort / codex.effort)
  ↓ if unset
whatever Claude Code or Codex would do by itself
```

The website has to win where it is set, or an owner would change it, see nothing happen, and have
no way to find out why.

This does not weaken DEC-12. **Safety limits stay toml-only and machine-enforced** — minutes per
task, hours per day, protected branches, deny paths, pause. Model and effort are a cost-and-quality
preference, not a safety limit, and in both places the only person who can set them is the same
person: the agent's owner. Nobody gains any power they didn't have.

DEC-6 holds too: the website writes a row, the runner reads it outbound. No localhost, ever.

For an owner who wants their machine to have the last word anyway (a metered connection, a shared
box), add one optional toml key:

```toml
[claude]            # or [codex]
model_locked = true # ignore the model and effort set on the website; this file decides
```

Default `false`. *Assumption — nobody has asked for it. Say so and it comes out.*

Also add `claude.effort` and `codex.effort` to the toml schema and template in the same work, so
the file can express everything the website can.

### 3.4 What the People page shows

On each agent card (`People.tsx:88-115`), a third line under `"Claude Code · jamesblack's"`:

```
Sonnet · medium effort
```

- **Everyone in the project sees it**, plain text. Knowing a teammate's agent is on Haiku at low
  effort explains a lot about its output, and is exactly the kind of thing that should be findable
  without interrupting anyone (the one design rule).
- **The owner sees the same line as a control**: two small selects, or a popover with Model and
  Effort, writing through `set_agent_model`. Design tokens and `apps/site/src/ui` components, real
  `<button>`/`<label>`, keyboard reachable, works at phone width.
- **When nothing is set from AutoKolab**, show `Set on this machine` in `var(--muted)` rather than
  a made-up model name — the value is then in a toml file we cannot see from the browser.
- **Worth adding, and it answers §1.3's "a model choice can fail at run time":** have the runner
  report what it actually launched with, in the heartbeat it already sends, into a read-only
  `effective_model` column. Then the card can show `Sonnet · medium effort · running Haiku` when
  the toml is locked, the model was refused, or the tool clamped the effort. Without it, a refused
  model looks like a run that simply failed. Nice-to-have; listed separately in AK-5c.

### 3.5 What AutoKolab cannot control

Worth saying plainly in the UI, because the gap will surprise people:

- **Interactive sessions.** When jamesblack opens Claude Code or Codex themselves, that session is
  on whatever model they picked there. AutoKolab only sets the model for runs **its runner starts**
  — the headless `claude -p` / `codex exec` runs for tickets and room tasks.
- **Account and workspace limits.** A ChatGPT workspace admin manages "Workspace model
  availability"; Anthropic has `availableModels` and organization defaults. A model the owner picks
  here can still be refused, and AutoKolab can't see that in advance. Hence `effective_model`.
- **Subagents.** Claude Code's subagents and agent-team teammates follow
  `CLAUDE_CODE_SUBAGENT_MODEL`, not `--model`. Out of scope.
- **Runs already going.** The new value applies to the next run (§3.2).
- **Cost.** We are not proposing a spend cap. Claude Code has `--max-budget-usd` and the runner
  already reads `total_cost_usd` (`engines.ts:144`); a real budget limit is its own ticket, not
  this one.

---

## 4. Follow-up work

Split so the database, runner and website parts can be done separately. Created in Backlog,
unassigned.

- **AK-5a · Check `--model` and `--effort` on the installed Claude Code and Codex** — the
  verification §1.1 could not do here, on a machine that may run the CLIs. Record both versions;
  one tiny run each with a small model and low effort; confirm the flags work under
  `claude -p --output-format stream-json` and `codex exec --json`; confirm they work on a resume;
  **and settle whether `-c` before or after `resume` is what Codex honours** (§1.3) — if it is
  "before", `cfg.codex.model` is being dropped on resumed runs today and that is a bug to fix.
  Do this one first: AK-5b and AK-5d depend on what it finds.
- **AK-5b · Schema 9: `agents.model` and `agents.effort`, owner-only** — the migration, the
  `set_agent_model` function, bump `SCHEMA_VERSION`, access-rule tests in
  `supabase/tests/policies.sql`. Needs a person to apply it to the live database.
- **AK-5c · Report the model a run actually used** — read-only `effective_model` on `agents`,
  written by the runner's heartbeat; shown on the People card. Nice-to-have, after AK-5b.
- **AK-5d · Runner: model and effort per run, from the database, no restart** — read the agent row
  before each invocation; thread `{model, effort}` through `claudeInvocation` / `codexInvocation`;
  add `claude.effort` / `codex.effort` (and `model_locked`) to the toml schema and template;
  precedence database → toml → default; unit tests in `packages/autokolab/test/`.
- **AK-5e · People page: show and set each agent's model and effort** — the third line on the
  agent card, read-only for everyone, a control for the owner, `Set on this machine` when unset.
  After AK-5b.

AK-5a first; then AK-5b; then AK-5d and AK-5e in parallel; AK-5c last.

---

## 5. Assumptions

Listed because the spec doesn't cover them:

1. Effort is stored as the five names both tools share (`low` `medium` `high` `xhigh` `max`) and
   passed straight through, relying on each tool to clamp what its model can't do. Claude Code's
   `ultracode` and Codex's `ultra` are not offered.
2. The model is free text with a per-vendor picker, not a database enum, so a new model doesn't
   need a migration.
3. The database value wins over the toml, with an optional `model_locked` opt-out (§3.3).
4. Everyone in a project can see an agent's model and effort; only its owner can change it.
5. A change applies to the next run, not the one in flight.
