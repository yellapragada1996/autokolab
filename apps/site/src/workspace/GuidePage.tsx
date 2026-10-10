import { useEffect, useState } from "react";
import { saveGuide, type Guide } from "../lib/data";
import { Button } from "../ui";
import { ago, Markdown } from "./bits";
import type { Workspace } from "./useWorkspace";

// The Project Guide: what every agent reads before it touches a ticket. Three parts, each plain
// Markdown: the concept (what and for whom), the architecture (how it's built), and the rules.

type Part = "concept" | "architecture" | "rules";

const PARTS: { id: Part; title: string; sub: string; placeholder: string }[] = [
  {
    id: "concept",
    title: "Concept",
    sub: "What we're building, for whom, and what matters most",
    placeholder: "One paragraph on the product, who it's for and what a good outcome looks like.",
  },
  {
    id: "architecture",
    title: "Architecture",
    sub: "How it's built: stack, folders, conventions, how to run and test",
    placeholder: "Stack, where things live, how to run it, how to test it.",
  },
  {
    id: "rules",
    title: "Rules",
    sub: "What agents must and must not do",
    placeholder: "Branching, tests, what needs a person's sign-off.",
  },
];

export function starterRules(project: { default_branch: string }): string {
  return `## Working on tickets
- Only work on tickets assigned to you that are in **Ready** or **In progress**.
- When you start, move the ticket to **In progress** and plan the steps on it.
- One branch per ticket, named \`<ticket key>-<short-title>\` (e.g. \`AK-12-google-login\`).
- Commit and push early so others can see your work.
- Never push to \`${project.default_branch}\`. Open a pull request against \`${project.default_branch}\` (even when your branch builds on unmerged work) and move the ticket to **Review**.

## Quality
- Every item under "Done means" must be true before you move a ticket to Review.
- Run the tests and the type checker before you open a pull request.
- Follow the decisions on the Decisions page. If you need to break one, ask first.

## Asking for help
- If something is ambiguous, set "Needs you" on the ticket with a short question and wait.
- If you find more work, create a new ticket instead of growing this one.
- Never put keys, tokens or passwords in tickets, comments or code.`;
}

export function GuidePage({ ws }: { ws: Workspace }) {
  const g = ws.guide;
  const empty = !g || (!g.concept.trim() && !g.architecture.trim() && !g.rules.trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 860 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ color: "var(--muted)", fontSize: 15 }}>
          Every agent reads this guide, the decisions and its ticket before it starts work, so people and agents share one picture of the project.
        </p>
        {g?.updated_at && !empty && (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>
            Last changed {ago(g.updated_at)}
            {g.updated_by ? ` by ${ws.nameOf(g.updated_by)}` : ""}
          </p>
        )}
      </div>
      {empty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: "1px dashed var(--line)" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Nothing here yet</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Write it yourself, or create a ticket for an agent: "Read the repo and draft the Project Guide". Agents can edit the guide.
          </span>
        </div>
      )}
      {PARTS.map((p) => (
        <GuidePart key={p.id} ws={ws} part={p} guide={g} />
      ))}
    </div>
  );
}

function GuidePart({ ws, part, guide }: { ws: Workspace; part: (typeof PARTS)[number]; guide: Guide | null }) {
  const value = guide?.[part.id] ?? "";
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!editing) setV(value);
  }, [value, editing]);

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await saveGuide(ws.project.id, { [part.id]: v });
      await ws.reload();
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{part.title}</h2>
        <span style={{ fontSize: 13, color: "var(--faint)" }}>{part.sub}</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} style={{ marginLeft: "auto", border: 0, background: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={part.placeholder}
            aria-label={part.title}
            rows={Math.max(8, v.split("\n").length + 2)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line-strong)", background: "var(--bg)", font: "14px/1.6 var(--mono)", resize: "vertical" }}
          />
          {err && <p style={{ color: "var(--danger)", fontSize: 14 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setV(value), setEditing(false))}>
              Cancel
            </Button>
            {part.id === "rules" && !v.trim() && (
              <Button size="sm" variant="secondary" onClick={() => setV(starterRules(ws.project))}>
                Start from the recommended rules
              </Button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>Markdown · ⌘ Enter saves</span>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${part.title}`}
          style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)", cursor: "text" }}
        >
          <Markdown text={value} empty={part.id === "rules" ? "No rules yet. Click to start from the recommended rules." : part.placeholder} />
        </div>
      )}
    </section>
  );
}
