import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/setup/team.js";

// Migration numbers must be unique, and SCHEMA_VERSION must be the newest one (AK-144). Two
// branches that each add a migration with the same number merge without a Git conflict, because
// the file names differ, so this test is what stops the second one.

const SQL_DIR = fileURLToPath(new URL("../sql/", import.meta.url));

/**
 * Pairs that already share a number on main and are applied on live databases, so they can't be
 * renamed. Never add to this list: take the next free number instead.
 */
const ALLOWED_CLASHES: string[][] = [
  // Merged within hours of each other before this check existed. Both run in name order.
  ["026_run_usage_path.sql", "026_ticket_areas.sql"],
];

const pad = (n: number) => String(n).padStart(3, "0");

/** What's wrong with these migration file names and this SCHEMA_VERSION, in plain words; empty when nothing is. */
export function migrationProblems(files: string[], schemaVersion: number, allowed: string[][] = ALLOWED_CLASHES): string[] {
  const byNumber = new Map<number, string[]>();
  for (const f of files.filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
    const n = parseInt(f, 10);
    byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
  }
  if (!byNumber.size) return ["There are no migrations in packages/autokolab/sql/."];
  const newest = Math.max(...byNumber.keys());
  const next = pad(newest + 1);
  const isAllowed = (names: string[]) => allowed.some((a) => a.length === names.length && a.every((x) => names.includes(x)));
  const problems: string[] = [];
  for (const [n, names] of byNumber) {
    if (names.length < 2 || isAllowed(names)) continue;
    problems.push(`Migrations ${names.join(" and ")} share number ${pad(n)}. Merge main, then rename the one your branch adds to ${next}_… (the next free number) and set SCHEMA_VERSION to ${newest + 1}. Don't rename one that's already on main.`);
  }
  if (schemaVersion !== newest) {
    problems.push(`SCHEMA_VERSION in src/setup/team.ts is ${schemaVersion}, but the newest migration is ${byNumber.get(newest)!.join(" and ")}. Set it to ${newest}.`);
  }
  return problems;
}

describe("migration numbers (AK-144)", () => {
  it("are unique and SCHEMA_VERSION is the newest", () => {
    expect(migrationProblems(readdirSync(SQL_DIR), SCHEMA_VERSION)).toEqual([]);
  });

  it("names the clashing files and the next free number", () => {
    const problems = migrationProblems(["001_init.sql", "027_status_project.sql", "027_ticket_shared.sql", "028_pr_facts.sql"], 28);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("027_status_project.sql and 027_ticket_shared.sql share number 027");
    expect(problems[0]).toContain("029_");
    expect(problems[0]).toContain("SCHEMA_VERSION to 29");
  });

  it("lets the listed 026 pair through, but not a third 026", () => {
    const files = ["025_agent_machine.sql", "026_run_usage_path.sql", "026_ticket_areas.sql", "027_status_project.sql"];
    expect(migrationProblems(files, 27)).toEqual([]);
    const problems = migrationProblems([...files, "026_more.sql"], 27);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("026_more.sql");
  });

  it("fails when SCHEMA_VERSION is behind or ahead of the newest migration", () => {
    const files = ["001_init.sql", "002_invite_preview.sql"];
    expect(migrationProblems(files, 1)).toEqual(["SCHEMA_VERSION in src/setup/team.ts is 1, but the newest migration is 002_invite_preview.sql. Set it to 2."]);
    expect(migrationProblems(files, 3)[0]).toContain("Set it to 2.");
    expect(migrationProblems(files, 2)).toEqual([]);
  });

  it("ignores files that aren't migrations", () => {
    expect(migrationProblems(["001_init.sql", "README.md", "001_notes.txt"], 1)).toEqual([]);
  });
});
