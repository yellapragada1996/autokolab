import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// A pre-push hook that refuses pushes to protected branches and force-pushes, but only for
// pushes made by agents the runner started (AUTOKOLAB_RUNNER=1), so the owner's own pushes are
// unaffected. GitHub branch protection on main is still the real backstop.

const MARKER = "# autokolab-pre-push";

export function hookScript(protectedBranches: string[]): string {
  const list = protectedBranches.map((b) => b.replace(/[^A-Za-z0-9._/-]/g, "")).join(" ");
  return `#!/bin/sh
${MARKER} (installed by the AutoKolab runner; safe to delete)
[ "$AUTOKOLAB_RUNNER" = "1" ] || exit 0
protected="${list}"
zero=0000000000000000000000000000000000000000
while read -r local_ref local_sha remote_ref remote_sha; do
  branch="\${remote_ref#refs/heads/}"
  for p in $protected; do
    if [ "$branch" = "$p" ]; then
      echo "AutoKolab: pushing to protected branch '$p' is not allowed for agents. Push a feature branch and open a pull request." >&2
      exit 1
    fi
  done
  case "$local_sha" in *[!0]*) ;; *) continue ;; esac
  case "$remote_sha" in *[!0]*) ;; *) continue ;; esac
  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    echo "AutoKolab: force-push to '$branch' is not allowed for agents." >&2
    exit 1
  fi
done
exit 0
`;
}

export type HookResult = "installed" | "updated" | "skipped-foreign-hook" | "not-a-git-repo";

export function installHook(workspace: string, protectedBranches: string[]): HookResult {
  let hooksDir: string;
  try {
    hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: workspace, encoding: "utf8" }).trim();
  } catch {
    return "not-a-git-repo";
  }
  if (!isAbsolute(hooksDir)) hooksDir = join(workspace, hooksDir);
  mkdirSync(hooksDir, { recursive: true });
  const path = join(hooksDir, "pre-push");
  const script = hookScript(protectedBranches);
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (!current.includes(MARKER)) return "skipped-foreign-hook";
    if (current === script) return "updated";
    writeFileSync(path, script);
    chmodSync(path, 0o755);
    return "updated";
  }
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return "installed";
}
