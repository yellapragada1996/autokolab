import type { PrFacts, Ticket } from "../lib/data";
import type { ShowPart } from "../lib/router";
import type { Workspace } from "./useWorkspace";

// "How do you know?" (DEC-22, autokolab-ux-handoff/screens/S02-evidence.md Part A): the evidence
// behind a decision card, built from what Captain recorded when it approved the commit
// (00-AMENDMENTS.md: "Evidence comes from Captain's review"). Nothing here asks a model.
// Tests and change counts come from the snapshot Captain's runner takes of the PR (AK-57), and only
// when it's of the approved commit: results for any other commit would be worse than none.

export type EvidenceKind = "tests" | "review" | "change" | "decisions" | "trail" | "less_sure";

export interface EvidenceRow {
  kind: EvidenceKind;
  text: string;
  sub?: string;
  /** The row's status colour, for tests: passed, failed or still running. */
  tone?: "green" | "coral" | "blue";
  /** Decision keys in the main line, each a link to Decisions. */
  decisions?: string[];
  /** Opens the Show-the-work sheet on this part. */
  action?: { label: string; part: ShowPart };
}

/** "DEC-12", "DEC-12 and DEC-24", "DEC-1, DEC-2 and DEC-3". */
export function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The PR snapshot, only when it's of the commit that was approved. */
export function approvedFacts(t: Ticket): PrFacts | null {
  const f = t.pr_facts;
  const sha = t.approved_sha?.trim().toLowerCase();
  return f && sha && f.sha?.toLowerCase() === sha && f.checks && f.files ? f : null;
}

/** "3 files, +62 −4". */
export function changeCounts(f: PrFacts): string {
  return `${f.files.total} ${f.files.total === 1 ? "file" : "files"}, +${f.additions} −${f.deletions}`;
}

/** "Needs a person's OK: a.sql, b.yml and 2 more", or nothing when no file is risky. */
export function riskyLine(f: PrFacts, max = 3): string | undefined {
  const risky = f.files.risky ?? [];
  if (!risky.length) return undefined;
  const shown = risky.slice(0, max);
  return `Needs a person's OK: ${andList(risky.length > max ? [...shown, `${risky.length - max} more`] : shown)}`;
}

/** The Tests row: green when all passed, coral when any failed, blue while some still run. Nothing when no checks ran. */
function testsRow(f: PrFacts): EvidenceRow | null {
  const { passed, total, state } = f.checks;
  if (!total) return null;
  if (state === "pending") return { kind: "tests", tone: "blue", text: `Tests still running: ${passed} of ${total} so far` };
  return { kind: "tests", tone: state === "success" ? "green" : "coral", text: `Tests: ${passed} of ${total} passed on GitHub` };
}

/** The rows in their fixed order, leaving out any with nothing to show. "Where I'm less sure" is always last. */
export function evidence(ws: Workspace, t: Ticket): EvidenceRow[] {
  const captain = ws.project.lead_agent_id;
  const r = t.review ?? null;
  const facts = approvedFacts(t);
  const rows: EvidenceRow[] = [];

  const tests = facts && testsRow(facts);
  if (tests) rows.push(tests);

  const sha = t.approved_sha?.trim();
  if (sha) {
    const by = t.approved_by === captain ? "me" : t.approved_by ? ws.nameOf(t.approved_by) : null;
    const builder = t.assignee_id ? (t.assignee_id === captain ? "I" : ws.nameOf(t.assignee_id)) : null;
    rows.push({
      kind: "review",
      text: by ? `Reviewed by ${by} at commit ${sha.slice(0, 7)}` : `Reviewed at commit ${sha.slice(0, 7)}`,
      sub: `Checked against the ticket's “done means”.${builder ? ` ${builder} built it, so ${builder} couldn't approve it.` : ""}`,
    });
  }

  // The review's summary sentence; with only a line, what the line does, or where it is.
  const file = r?.line?.file?.trim();
  const where = file ? `The line that matters is in ${file}` : undefined;
  const changeText = r?.summary?.trim() || r?.line?.plain?.trim() || where;
  // With the snapshot, the counts lead the sub line; without a review sentence they are the main line.
  const counts = facts ? [changeCounts(facts), riskyLine(facts)].filter(Boolean).join(". ") : undefined;
  const changeSub = [counts, changeText === where ? undefined : where].filter(Boolean).join(" · ") || undefined;
  if (changeText) rows.push({ kind: "change", text: changeText, sub: changeSub, action: { label: "See the change", part: "change" } });
  else if (facts) rows.push({ kind: "change", text: `What changes: ${changeCounts(facts)}`, sub: riskyLine(facts), action: { label: "See the change", part: "change" } });

  const keys = [...new Set((r?.decisions ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean))];
  if (keys.length) {
    const titles = keys.map((k) => ws.decisions.find((d) => d.key === k)?.title.trim()).filter((s): s is string => !!s);
    rows.push({ kind: "decisions", text: `Follows ${andList(keys)}`, decisions: keys, sub: titles.length ? titles.join(" · ") : undefined });
  }

  rows.push({ kind: "trail", text: `Every step of ${t.key} is in the record`, action: { label: "See the history", part: "history" } });

  // Approvals from before schema 16 have a commit but no review notes: say so rather than "nobody reviewed it".
  const unsure = r ? r.less_sure?.trim() || "Nothing I'm unsure about here." : sha ? "The review didn't record where it was less sure." : "Nobody has reviewed this yet.";
  rows.push({ kind: "less_sure", text: "Where I'm less sure", sub: unsure });
  return rows;
}
