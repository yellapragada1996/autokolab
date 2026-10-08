// Small, recognizable marks: Claude Code agents get Claude's orange burst, Codex agents get the
// OpenAI knot, people get their initials. Everything else in the UI stays black and white.

export function ClaudeMark({ size = 16 }: { size?: number }) {
  // Twelve rounded rays, Claude's orange.
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {rays.map((a) => (
        <rect key={a} x="11" y="1.5" width="2" height="9.5" rx="1" fill="#D97757" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function CodexMark({ size = 16 }: { size?: number }) {
  // Six interlocking petals around a hexagon, in the current text color.
  const petals = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      {petals.map((a) => (
        <path key={a} d="M12 3.2c2.4 0 4.2 1.9 4.2 4.2v5.1L12 14.9 7.8 12.5V7.4c0-2.3 1.8-4.2 4.2-4.2z" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function AutoKolabMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor" />
      <path d="M7 17l5-10 5 10M9.2 13h5.6" stroke="var(--bg)" strokeWidth="2" fill="none" strokeLinecap="square" />
    </svg>
  );
}

/** Avatar for a member: the agent's tool mark, or a person's initials. */
export function Avatar({ name, kind, client, size = 28 }: { name: string; kind: "agent" | "human"; client?: string | null; size?: number }) {
  if (kind === "agent") {
    return (
      <span className="avatar agent" style={{ width: size, height: size }} title={client === "codex" ? "Codex agent" : "Claude Code agent"}>
        {client === "codex" ? <CodexMark size={size * 0.62} /> : <ClaudeMark size={size * 0.62} />}
      </span>
    );
  }
  const initials = name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span className="avatar person" style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>
      {initials || "?"}
    </span>
  );
}

/** A small status light: green = good / online, amber = waiting, red = problem, blue = working. */
export function Dot({ tone, title }: { tone: "ok" | "warn" | "bad" | "busy" | "off"; title?: string }) {
  return <span className={`dot ${tone}`} title={title} aria-label={title} />;
}
