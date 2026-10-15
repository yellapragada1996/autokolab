/**
 * The areas a ticket touches (AK-126, schema 26): repo paths or globs such as
 * "packages/autokolab/src/runner/**". Two tickets overlap when some file could be in both.
 * A plain path that ends in a file name ("GUIDE.md") is that file; any other plain path is a folder
 * and everything under it.
 * An empty list means no check. A copy of packages/autokolab/src/core/areas.ts, which the runner uses
 * to decide; keep the two the same (a helper test checks they are).
 */

const WILD = /[*?[]/;

/** "./apps/site/" -> ["apps", "site", "**"]: segments, with a plain folder covering what's under it. */
export function areaSegments(area: string): string[] {
  const parts = area.trim().replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "").split("/").filter((s) => s && s !== ".");
  if (!parts.length) return [];
  const last = parts[parts.length - 1];
  if (!WILD.test(last) && !/.\.[A-Za-z0-9]+$/.test(last)) parts.push("**");
  return parts;
}

function segmentRegex(s: string): RegExp {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "[") {
      const end = s.indexOf("]", i + 1);
      if (end > i + 1) {
        out += `[${s.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
        i = end;
      } else out += "\\[";
    } else out += c.replace(/[.+^${}()|\\\]]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** Could one file name match both segments? Two wildcards are compared by their fixed start and end. */
function segmentsOverlap(a: string, b: string): boolean {
  const wa = WILD.test(a);
  const wb = WILD.test(b);
  if (!wa && !wb) return a === b;
  if (wa && !wb) return segmentRegex(a).test(b);
  if (!wa && wb) return segmentRegex(b).test(a);
  const head = (s: string) => s.slice(0, s.search(WILD));
  const tail = (s: string) => s.slice(Math.max(s.lastIndexOf("*"), s.lastIndexOf("?"), s.lastIndexOf("]")) + 1);
  const [ha, hb, ta, tb] = [head(a), head(b), tail(a), tail(b)];
  return (ha.startsWith(hb) || hb.startsWith(ha)) && (ta.endsWith(tb) || tb.endsWith(ta));
}

function pathsOverlap(a: string[], b: string[], i = 0, j = 0, seen = new Set<string>()): boolean {
  const k = `${i},${j}`;
  if (seen.has(k)) return false;
  seen.add(k);
  if (i === a.length && j === b.length) return true;
  if (a[i] === "**") return pathsOverlap(a, b, i + 1, j, seen) || (j < b.length && pathsOverlap(a, b, i, j + 1, seen));
  if (b[j] === "**") return pathsOverlap(a, b, i, j + 1, seen) || (i < a.length && pathsOverlap(a, b, i + 1, j, seen));
  if (i === a.length || j === b.length) return false;
  return segmentsOverlap(a[i], b[j]) && pathsOverlap(a, b, i + 1, j + 1, seen);
}

/** Do two single areas overlap? */
export function areaOverlaps(a: string, b: string): boolean {
  const sa = areaSegments(a);
  const sb = areaSegments(b);
  return !!sa.length && !!sb.length && pathsOverlap(sa, sb);
}

/** Do two tickets' areas overlap? An empty list never does. */
export function areasOverlap(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  return (a ?? []).some((x) => (b ?? []).some((y) => areaOverlaps(x, y)));
}

interface AreaTicket {
  id: string;
  key: string;
  status: string;
  type?: string;
  areas?: string[] | null;
}

/**
 * The tickets a Ready ticket waits for because they touch the same files: other tickets In progress
 * or in Review (a ticket in Review hasn't merged; once merged it's Done). Empty when it can start.
 */
export function areaWaits<T extends AreaTicket>(t: AreaTicket, all: readonly T[]): T[] {
  if (!t.areas?.length || t.type === "epic") return [];
  return all.filter((o) => o.id !== t.id && o.type !== "epic" && ["in_progress", "review"].includes(o.status) && areasOverlap(t.areas, o.areas));
}

/** "waiting for AK-12 (same files)", or null when the ticket waits for nothing. */
export function areaWaitText(waits: readonly { key: string }[]): string | null {
  return waits.length ? `waiting for ${waits.map((w) => w.key).join(", ")} (same files)` : null;
}

/** Areas as the tools take them: one per entry, trimmed, no blanks or repeats. */
export function cleanAreas(areas: readonly string[]): string[] {
  return [...new Set(areas.map((a) => a.trim()).filter(Boolean))];
}
