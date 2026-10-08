import { existsSync, renameSync } from "node:fs";
import { userInfo } from "node:os";
import type { AutoKolab } from "../core/client.js";
import { updateConfigFile } from "../core/config.js";
import { runnerConfigPath, runnerFileFor } from "../runner/config.js";
import { gitUserName } from "./agents.js";
import { ask, NAME_RULE, slug } from "./ui.js";

// People name themselves and their agents. Names are unique across the team and can be changed
// any time (`autokolab rename`); everything else refers to members by id, so nothing breaks.

export function suggestedPersonName(hint?: string): string {
  return slug(hint || gitUserName().split(" ")[0] || userInfo().username) || "me";
}

export function localTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Keep this machine's records in step with a member's new name. */
export function renameLocally(id: string, name: string): void {
  updateConfigFile((c) => {
    const p = c.profiles?.[id];
    if (p) p.name = name;
  });
  const file = runnerFileFor(id);
  if (file && file !== name && !existsSync(runnerConfigPath(name))) renameSync(runnerConfigPath(file), runnerConfigPath(name));
}

/**
 * Ask for a name until the team accepts it (valid and not taken), then apply it.
 * Uses `fixed` without asking when given (non-interactive runs).
 */
export async function chooseName(ak: AutoKolab, memberId: string, question: string, suggestion: string, fixed?: string): Promise<string> {
  for (;;) {
    const name = fixed ?? (await ask(question, suggestion, { required: true, validate: NAME_RULE }));
    try {
      const current = ak.member(memberId)?.name;
      if (current !== name) await ak.updateMember(memberId, { name });
      renameLocally(memberId, name);
      return name;
    } catch (e) {
      if (fixed) throw e;
      console.log(`  ${(e as Error).message}`);
      suggestion = `${name}-2`;
    }
  }
}
