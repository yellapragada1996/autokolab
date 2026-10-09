#!/usr/bin/env bash
# AutoKolab: install (or update) the helper on this computer, then connect its agents to your
# project. The website gives you the line that runs this, with your pairing code:
#
#   curl -fsSL https://autokolab.vercel.app/install.sh | bash -s -- CODE
#
# What it does: clones github.com/yellapragada1996/autokolab into ~/.autokolab (or updates it),
# builds it, puts `autokolab` on your PATH, then runs `autokolab connect CODE`. No sudo.
set -euo pipefail
CODE="${1:-}"
DIR="${AUTOKOLAB_DIR:-$HOME/.autokolab}"
REPO="${AUTOKOLAB_REPO:-https://github.com/yellapragada1996/autokolab.git}"

if [ -z "$CODE" ]; then
  printf '\n  Add your pairing code: copy the whole line from the website.\n\n' >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  printf '\n  AutoKolab needs git. Install it, then paste the same line again.\n\n' >&2
  exit 1
fi

if [ -d "$DIR/.git" ]; then
  printf '\n  Updating AutoKolab in %s…\n' "$DIR"
  git -C "$DIR" pull --ff-only --quiet
else
  printf '\n  Downloading AutoKolab into %s…\n' "$DIR"
  git clone --quiet "$REPO" "$DIR"
fi
exec "$DIR/scripts/install.sh" connect "$CODE"
