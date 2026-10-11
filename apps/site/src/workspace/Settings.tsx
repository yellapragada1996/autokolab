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

// The Results tab (AK-71). Exported from here because the workspace shell imports it from here.
export { Results } from "./ResultsPage";
