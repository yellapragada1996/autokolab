#!/bin/sh
# Run by the AutoKolab runner in each new ticket worktree, before the agent starts (AK-123).
# It runs again only when this file changes on main. Its output goes to the runner's log.
set -e
npm ci --no-audit --no-fund
