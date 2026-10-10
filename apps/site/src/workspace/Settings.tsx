import { onNav } from "../lib/router";
import { InvitePanel, Merging } from "./People";
import type { Workspace } from "./useWorkspace";

// Settings: how hands-off the project is (merging) and the invite link. Both moved here from People.

export function Settings({ ws, me, onProjectChanged }: { ws: Workspace; me: string; onProjectChanged?: () => void }) {
  const isOwner = ws.project.owner_id === me;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 780 }}>
      <Merging ws={ws} canEdit={isOwner} onProjectChanged={onProjectChanged} />
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Invite</h2>
        {isOwner ? <InvitePanel ws={ws} /> : <p style={{ fontSize: 14, color: "var(--muted)" }}>Only {ws.nameOf(ws.project.owner_id)} can invite people to this project.</p>}
      </section>
    </div>
  );
}

/** Results has nothing to measure yet (phase 9). */
export function Results({ ws }: { ws: Workspace }) {
  const captain = { view: "overview", project: ws.project.slug } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 780 }}>
      <p style={{ fontSize: 20, lineHeight: 1.45, fontWeight: 500 }}>Results will appear here once there's a week of work to measure.</p>
      <p>
        <a href={`/p/${ws.project.slug}`} onClick={onNav(captain)}>
          Back to Captain
        </a>
      </p>
    </div>
  );
}
