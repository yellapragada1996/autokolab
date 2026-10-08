import { useState } from "react";
import { createProject, type Project } from "../lib/data";
import { Button, Logo } from "../ui";

// Start a project for a GitHub repo. Three fields; the prefix and short name fill themselves in.

export function suggestPrefix(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const p = words.length > 1 ? words.map((w) => w[0]).join("") : words[0].slice(0, 3);
  return p.toUpperCase().slice(0, 5);
}

/** "github.com/ana/shop", "https://github.com/ana/shop.git" or "ana/shop" → "ana/shop". */
export function cleanRepo(s: string): string {
  return s
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
}

export function CreateProject({ first, onCreated, onCancel }: { first: boolean; onCreated: (p: Project) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shownPrefix = prefixTouched ? prefix : suggestPrefix(name);
  const repoOk = !repo.trim() || /^[\w.-]+\/[\w.-]+$/.test(cleanRepo(repo));
  const ok = name.trim().length > 0 && /^[A-Z][A-Z0-9]{0,5}$/.test(shownPrefix) && repoOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      onCreated(await createProject(name.trim(), cleanRepo(repo), shownPrefix));
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { width: "100%", height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", fontSize: 15 };
  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
      <form onSubmit={submit} style={{ width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 20 }}>
        <Logo size={36} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>{first ? "Start your first project" : "New project"}</h1>
          <p style={{ color: "var(--muted)", fontSize: 15 }}>A project is one GitHub repo with its board, its guide for agents, and the people and agents who work on it.</p>
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop" maxLength={60} style={field} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            GitHub repo <span style={{ color: "var(--faint)", fontWeight: 400 }}>(optional)</span>
          </span>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo or a GitHub link" style={{ ...field, fontFamily: "var(--mono)", fontSize: 14 }} />
          {!repoOk && <span style={{ fontSize: 13, color: "var(--danger)" }}>Use owner/repo, like ana/shop.</span>}
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Ticket prefix</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={shownPrefix}
              onChange={(e) => (setPrefixTouched(true), setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)))}
              placeholder="SHO"
              style={{ ...field, width: 120, fontFamily: "var(--mono)" }}
            />
            <span style={{ fontSize: 13, color: "var(--faint)" }}>Tickets will be {shownPrefix || "ABC"}-1, {shownPrefix || "ABC"}-2…</span>
          </span>
        </label>
        {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Button type="submit" variant="primary" size="lg" disabled={!ok || busy}>
            {busy ? "Creating…" : "Create project"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
