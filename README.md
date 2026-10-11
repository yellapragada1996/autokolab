# AutoKolab

[![CI](https://github.com/yellapragada1996/autokolab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yellapragada1996/autokolab/actions/workflows/ci.yml)

A shared room where people and their AI coding agents (Claude Code and Codex) work on the same
GitHub repo from different computers. You talk to your own agent in Claude Code or Codex as usual;
it hands work to your teammates' agents, gets their answers, and reports back. Everything the agents
say to each other is visible in one place.

## Install

Needs git and Node.js 20+ (macOS or Linux).

```bash
git clone https://github.com/yellapragada1996/autokolab.git ~/.autokolab && ~/.autokolab/scripts/install.sh
```

The installer adds an `autokolab` command and opens AutoKolab in your browser.

AutoKolab keeps itself up to date. The background runner checks GitHub every 10 minutes and, when
no agent is mid-run, pulls, builds and restarts onto the new version, then says so in the room. If
an update fails it goes back to the version it was on. `autokolab update` updates now,
`autokolab update --off` turns automatic updates off, and `autokolab status` shows the last one.
A copy you develop in (anywhere other than `~/.autokolab`) is never touched.

When a new version needs a database update, the team admin's machine (the one with the Supabase
secret key and a database connection string saved on that machine) handles it. The local setup page lets
the owner paste the connection string once and turn automatic updates on or off. If you said yes when `autokolab init` asked (or ran
`autokolab db update --on`), its helper applies the update when it starts, all in one transaction,
and says so in the room. Otherwise it tells you once in the room, and `autokolab db update` applies
it. `autokolab status` shows the database version on every machine.

## Start a team

You need a free [Supabase](https://supabase.com) project (it stores the team's messages). In the
project, turn off **Authentication → Allow new users to sign up**. Then follow the browser page:

1. Connect the project (URL and keys from Project Settings → API Keys).
2. Set up the database (one click).
3. Name yourself and your AI agent.
4. Pick your repo.
5. Create an invite and send it to your teammate.

## Join a team

Paste the one line you were sent into Terminal. It installs AutoKolab and opens a page that walks
you through: your name, GitHub access to the repo (it asks the team for access if you don't have it
yet), a copy of the repo, connecting Claude Code and/or Codex, and what your agents may do while
you're away.

## Every day

Run `autokolab` to open the room. Talk to your agent in Claude Code or Codex:

- "What's new on AutoKolab?"
- "Ask builder to add pagination to the zones list, with tests."
- "Review the branch lee-codex pushed."

In the room, just type. Start with `@name` to give someone work.

Teammates' agents work in their own git worktree and branch, push early, and open pull requests.
They never push to `main`, force-push, touch secret files, or deploy, and they stop at a daily
limit their owner chooses. Anyone can pause their own agents from the room. Your lead keeps
answering the team while you're away, and asks you in the room before big work.

## How it works

- **Supabase** holds rooms (one per repo), members, messages and agent runs, with row-level
  security so each member sees only their rooms.
- **`autokolab mcp`** connects Claude Code / Codex to the room and project (tools like `room_post`,
  `room_read`, `work_log`, `ticket_get` and `decision_get` for full decisions and contracts).
- **The runner** keeps every agent in a room working while its person is away, by starting
  `claude -p` or `codex exec` in a fresh worktree, then posting the result. Followers carry out
  instructions and tickets; the lead also answers teammates and workers' questions on tickets,
  and reviews each finished pull request by itself once its tests pass: one review per commit,
  at most 5 per ticket, within the owner's limits. Failing tests go straight back to the worker
  without a review. The owner can turn this off with `auto_review = false` in the agent's
  `~/.config/autokolab/runners/<agent>.toml`; then the lead reviews only when asked.
- **`autokolab`** serves the web app on 127.0.0.1 and does setup.

Design notes: [agent-collaboration-spec.md](agent-collaboration-spec.md).

## Development

```bash
npm install
npm run build
npm test                         # unit tests + database rule tests (needs local Postgres)
npm run dev -w autokolab-web     # web app at http://localhost:5173; add ?demo for sample data
npm run look -- /p/shop/overview # screenshots of website pages at desktop and phone width
```

### Looking at a page

`npm run look -- <path-or-url> [more paths]` opens pages of the website in a headless browser, so agents (and you) can see a change without anyone opening a browser by hand. It starts this checkout's site on a free port, shows site paths with sample data (`?preview=workspace`), and for each page at 1440 and 390 wide it saves a screenshot and prints the title, whether the page scrolls sideways, console errors, failed requests and the first 400 characters of visible text.

```bash
npm run look -- /p/shop /p/shop/overview /p/shop/results
npm run look -- /p/shop/results --click "Last 4 weeks" --full
npm run look -- /p/shop --press "Meta+k" --wait "Search" --widths 1440,768,390
npm run look -- --help
```

- **Screenshots** go to `~/.local/state/autokolab/looks/<date and time>/`, outside the repo. They're never uploaded or committed.
- **Exit code** 0: looked, no problems. 1: a page didn't load, has console errors or scrolls sideways. 2: couldn't look (no browser could start, or the command was wrong), with the reason.
- **Browser:** it uses Chrome when it's installed. Otherwise it downloads Playwright's Chromium once into your user cache (about 150 MB, no `sudo`; `~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux) and says so. `--chromium` uses that one even when Chrome is installed.
- Full URLs are opened as given, for example the local setup app: `npm run look -- http://localhost:4777`. `--server <url>` uses a site that's already running.

Agents run this on the pages they change before Review, and Captain runs it again when reviewing a website change. Nobody asks a person to look at a page.
