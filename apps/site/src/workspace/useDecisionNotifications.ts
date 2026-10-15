import { useEffect, useMemo, useState } from "react";
import { href } from "../lib/router";
import type { Need } from "./captain";
import { DecisionNotifier, decisionsToNotify, notificationPreferenceKey, notificationSeenKey } from "./decisionNotifications";
import { firstSentence } from "./glance";

export interface DecisionNotificationSetting {
  enabled: boolean;
  available: boolean;
  notice: string;
  setEnabled: (enabled: boolean) => Promise<void>;
}

function storedPreference(profileId: string): boolean {
  try {
    return localStorage.getItem(notificationPreferenceKey(profileId)) === "on";
  } catch {
    return false;
  }
}

/** Browser notifications need an open project tab. The title count works without permission. */
export function useDecisionNotifications(profileId: string, projectId: string, projectSlug: string, needs: Need[], ready: boolean): DecisionNotificationSetting {
  const available = typeof window !== "undefined" && "Notification" in window;
  const [enabled, setOn] = useState(() => storedPreference(profileId));
  const [notice, setNotice] = useState("");
  const notifier = useMemo(() => new DecisionNotifier(typeof localStorage === "undefined" ? null : localStorage, notificationSeenKey(profileId, projectId)), [profileId, projectId]);

  useEffect(() => {
    const title = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = decisionsToNotify(needs).length ? `(${decisionsToNotify(needs).length}) ${title}` : title;
    return () => { document.title = title; };
  }, [needs]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const sync = () => {
      if (!active) return;
      notifier.sync(needs, enabled && available && Notification.permission === "granted", (need, id) => {
        const url = `${href({ view: "captain", project: projectSlug })}#need-${need.key}`;
        try {
          const notification = new Notification(need.action, {
            body: firstSentence(need.question),
            tag: `autokolab:${profileId}:${projectId}:${id}`,
          });
          notification.onclick = () => {
            window.focus();
            window.location.assign(url);
            notification.close();
          };
        } catch {
          // The browser can refuse a notification after granting permission.
        }
      });
    };
    // Serialize snapshots from multiple open tabs when the browser offers Web Locks. The shared
    // seen record is read inside the lock, before deciding whether to show anything.
    if (navigator.locks) void navigator.locks.request(`autokolab-decisions:${profileId}:${projectId}`, sync).catch(sync);
    else sync();
    return () => { active = false; };
  }, [ready, needs, enabled, available, notifier, profileId, projectId, projectSlug]);

  const setEnabled = async (on: boolean) => {
    setNotice("");
    if (on) {
      if (!available) {
        setNotice("This browser does not support notifications.");
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setNotice("Notifications are blocked. Allow them in your browser settings to turn this on.");
        return;
      }
    }
    setOn(on);
    try {
      localStorage.setItem(notificationPreferenceKey(profileId), on ? "on" : "off");
    } catch {
      // The setting lasts for this tab when storage is unavailable.
    }
  };

  return { enabled: enabled && available && Notification.permission === "granted", available, notice, setEnabled };
}
