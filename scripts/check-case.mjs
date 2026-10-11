import { execFileSync } from "node:child_process";
// Fails when two tracked files or folders differ only by capital letters. macOS and Windows
// don't tell them apart, so an import can resolve to the wrong file there (AK-67). Names are
// also compared without their extension, because imports leave it out: on a Mac,
// `./ShowWork` found showWork.ts before ShowWork.tsx.
//   npm run check:case

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

// Every file and every folder above it, plus each file without its extension.
const paths = new Set();
for (const file of files) {
  const parts = file.split("/");
  for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join("/"));
  const stem = file.replace(/(?<=[^/])\.[^./]+$/, "");
  if (stem !== file) paths.add(stem);
}

const byLower = new Map();
for (const path of paths) {
  const key = path.toLowerCase();
  byLower.set(key, [...(byLower.get(key) ?? []), path]);
}

const clashes = [...byLower.values()].filter(group => group.length > 1);
if (clashes.length) {
  console.error("These paths differ only by capital letters, so they clash on macOS and Windows:");
  for (const group of clashes) console.error(`  ${group.sort().join("  ")}`);
  process.exit(1);
}
console.log(`No case clashes in ${files.length} tracked files.`);
