// Avatars (05-components.md). People are circles, agents are neutral square tiles: an agent never
// gets its own colour, so the vendor is only in the tooltip.

export type Presence = "online" | "away" | "offline";
const presenceColor: Record<Presence, string> = { online: "var(--green)", away: "var(--amber)", offline: "var(--text-dim)" };
const presenceLabel: Record<Presence, string> = { online: "Online", away: "Away", offline: "Offline" };

function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0][0]).toUpperCase();
}

/** A person: a circle with initials (or their picture). You are light on dark; others are grey. */
export function PersonAvatar({ name, src, size = 30, you, presence, ring = "var(--sidebar)" }: { name: string; src?: string | null; size?: number; you?: boolean; presence?: Presence; ring?: string }) {
  return (
    <span
      title={name}
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        background: you ? "var(--text)" : "var(--person-bg)",
        color: you ? "var(--bg)" : "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(12, Math.round(size * 0.4)),
        letterSpacing: "-0.02em",
      }}
    >
      {src ? <img src={src} alt="" width={size} height={size} style={{ borderRadius: "50%", display: "block" }} /> : initials(name)}
      {presence && <Dot color={presenceColor[presence]} label={presenceLabel[presence]} size={10} ring={ring} />}
    </span>
  );
}

export type Vendor = "claude" | "codex";
export type AgentState = "working" | "idle" | "waiting";
const agentStateLabel: Record<AgentState, string> = { working: "Working", idle: "Idle", waiting: "Waiting on a person" };
const vendorLabel: Record<Vendor, string> = { claude: "Claude", codex: "Codex" };

/**
 * An agent: a neutral tile with its first letter and, optionally, a status dot
 * (blue and pulsing = working, grey = idle, amber = waiting on a person).
 */
export function AgentAvatar({ name, vendor, size = 30, status, ring = "var(--bg)" }: { name: string; vendor?: Vendor; size?: number; status?: AgentState; ring?: string }) {
  const title = [name, vendor && `${vendorLabel[vendor]} agent`, status && agentStateLabel[status]].filter(Boolean).join(" · ");
  const dot = Math.min(11, Math.max(8, Math.round(size * 0.3)));
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: "var(--avatar-bg)",
        color: "var(--avatar-fg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: Math.max(12, Math.round(size * 0.45)),
      }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
      {status && (
        <Dot
          color={status === "working" ? "var(--blue)" : status === "waiting" ? "var(--amber)" : "var(--text-dim)"}
          size={dot}
          ring={ring}
          live={status === "working"}
        />
      )}
    </span>
  );
}

function Dot({ color, size, ring, label, live }: { color: string; size: number; ring: string; label?: string; live?: boolean }) {
  return (
    <span
      className={live ? "ak-live" : undefined}
      aria-label={label}
      style={{ position: "absolute", right: -2, bottom: -2, width: size, height: size, borderRadius: "50%", background: color, border: `2px solid ${ring}`, boxSizing: "content-box" }}
    />
  );
}
