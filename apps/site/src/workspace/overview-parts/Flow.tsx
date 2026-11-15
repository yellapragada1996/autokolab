import { useState, type CSSProperties } from "react";
import { go } from "../../lib/router";
import { offerCaptainDraft } from "../captainDraft";
import type { OverviewAgent } from "../glance";

const btn: CSSProperties = { minHeight: 44, padding: "0 18px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", font: "inherit", fontWeight: 500, cursor: "pointer" };

/** An agent that stopped responding while it had a ticket under way: one calm line and two ways on. */
export function NotResponding({ agent, slug, projectId }: { agent: OverviewAgent | undefined; slug: string; projectId: string }) {
  const [waited, setWaited] = useState<string | null>(null);
  if (!agent || waited === agent.id) return null;
  const what = agent.key ? ` while building ${agent.key}` : "";
  return <section aria-label="Agent not responding" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 20px", padding: "16px 20px", background: "var(--coral-bg)", border: "1px solid var(--coral-border)", borderRadius: 12 }}>
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: "var(--coral-text)" }}>{agent.name} stopped responding {agent.word.replace(/^Offline · /, "")} ago</span>
      <span style={{ color: "var(--text-secondary)" }}>{what}. It picks up where it stopped when its computer is back.</span>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" style={btn} onClick={() => setWaited(agent.id)}>Wait</button>
      <button type="button" style={{ ...btn, background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)", fontWeight: 600 }} onClick={() => {
        offerCaptainDraft(projectId, `Give ${agent.key ?? `${agent.name}'s tickets`} to another agent: ${agent.name} isn't responding.`);
        go({ view: "captain", project: slug });
      }}>Give {agent.key ?? "its tickets"} to another agent</button>
    </div>
  </section>;
}
