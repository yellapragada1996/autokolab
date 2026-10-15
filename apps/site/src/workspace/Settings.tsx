import { InvitePanel, Merging } from "./People";
import { Switch } from "../ui";
import type { DecisionNotificationSetting } from "./useDecisionNotifications";
import type { Workspace } from "./useWorkspace";

// Settings: how hands-off the project is (merging) and the invite link. Both moved here from People.

export function Settings({ ws, me, notifications, onProjectChanged }: { ws: Workspace; me: string; notifications: DecisionNotificationSetting; onProjectChanged?: () => void }) {
  const isOwner = ws.project.owner_id === me;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 780 }}>
      <Merging ws={ws} canEdit={isOwner} onProjectChanged={onProjectChanged} />
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Notifications</h2>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 230px" }}>
            <p style={{ fontSize: 14, color: "var(--text)" }}>Tell me when a decision is waiting</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Only while an AutoKolab project tab is open in this browser.</p>
          </div>
          <Switch checked={notifications.enabled} onChange={(on) => void notifications.setEnabled(on)} label="Tell me when a decision is waiting" disabled={!notifications.available} />
        </div>
        {notifications.notice && <p role="status" style={{ fontSize: 13, color: "var(--text-muted)" }}>{notifications.notice}</p>}
        {!notifications.available && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>This browser does not support notifications.</p>}
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Invite</h2>
        {isOwner ? <InvitePanel ws={ws} /> : <p style={{ fontSize: 14, color: "var(--muted)" }}>Only {ws.nameOf(ws.project.owner_id)} can invite people to this project.</p>}
      </section>
    </div>
  );
}

// The Results tab (AK-71). Exported from here because the workspace shell imports it from here.
export { Results } from "./ResultsPage";
