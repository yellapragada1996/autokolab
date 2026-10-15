import type { Need } from "./captain";

/** A changed question on the same ticket is a new request; an unrelated ticket edit is not. */
export const decisionId = (need: Need) => `${need.key}:${need.question.trim()}`;

export const decisionsToNotify = (needs: Need[]) => needs.filter((need) => need.kind !== "problem");

/** Keep a bounded record across reloads and tabs, scoped to the signed-in person and project. */
export class DecisionNotifier {
  private primed = false;
  private seen = new Set<string>();

  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null, private key: string) {
    try {
      const saved = storage?.getItem(key);
      if (saved) this.seen = new Set(JSON.parse(saved) as string[]);
    } catch {
      // Private browsing can block storage. The open tab still avoids duplicates.
    }
  }

  sync(needs: Need[], enabled: boolean, notify: (need: Need, id: string) => void): void {
    // The first complete snapshot is already visible in the app. Turning notifications on never
    // replays earlier requests; only requests arriving while a project tab is open can notify.
    const current = decisionsToNotify(needs);
    const seen = new Set(this.seen);
    try {
      const saved = this.storage?.getItem(this.key);
      if (saved) for (const id of JSON.parse(saved) as string[]) seen.add(id);
    } catch {
      // Keep the in-memory record.
    }
    for (const need of current) {
      const id = decisionId(need);
      if (seen.has(id)) continue;
      seen.add(id);
      if (this.primed && enabled) notify(need, id);
    }
    this.primed = true;
    this.seen = seen;
    try {
      this.storage?.setItem(this.key, JSON.stringify([...seen].slice(-500)));
    } catch {
      // Notifications still work for this tab.
    }
  }
}

export const notificationPreferenceKey = (profileId: string) => `autokolab.decisionNotifications.${profileId}`;
export const notificationSeenKey = (profileId: string, projectId: string) => `autokolab.notifiedDecisions.${profileId}.${projectId}`;
