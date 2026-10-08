#!/usr/bin/env bash
# Installs (or updates) AutoKolab and puts the `autokolab` command on your PATH. macOS and Linux.
#
#   ~/.autokolab/scripts/install.sh               install, then open AutoKolab
#   ~/.autokolab/scripts/install.sh akinv_…       install, then open the join page for this invite
set -euo pipefail
cd "$(dirname "$0")/.."
INVITE="${1:-}"

say() { printf '\n  %s\n' "$*"; }
fail() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    fail "AutoKolab needs Node.js. Install it with:  brew install node   then paste the same line again."
  fi
  fail "AutoKolab needs Node.js 20 or newer. Get it from https://nodejs.org (the LTS version), then paste the same line again."
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 20 ] || fail "AutoKolab needs Node.js 20 or newer (this computer has $(node -v)). Update it from https://nodejs.org, then paste the same line again."

say "Installing AutoKolab… (this takes a minute the first time)"
npm ci --no-audit --no-fund --loglevel=error >/dev/null
npm run build --silent >/dev/null

bin_dir="${AUTOKOLAB_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
ln -sf "$(pwd)/packages/autokolab/dist/cli.js" "$bin_dir/autokolab"
chmod +x packages/autokolab/dist/cli.js

# Make `autokolab` work in new terminals too.
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *)
    rc="$HOME/.$(basename "${SHELL:-bash}")rc"
    if ! grep -qs "$bin_dir" "$rc"; then
      printf '\n# AutoKolab\nexport PATH="%s:$PATH"\n' "$bin_dir" >> "$rc"
    fi
    ;;
esac

say "Installed. Opening AutoKolab in your browser…"
if [ -n "$INVITE" ]; then
  exec "$bin_dir/autokolab" open --invite "$INVITE"
fi
exec "$bin_dir/autokolab" open
