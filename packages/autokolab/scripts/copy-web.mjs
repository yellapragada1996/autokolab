// Copies the built web view into this package so `autokolab open` can serve it.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../../apps/web/dist/", import.meta.url));
const to = fileURLToPath(new URL("../web/", import.meta.url));
if (!existsSync(from)) {
  console.warn("autokolab: web view not built (npm run build -w autokolab-web); `autokolab open` won't work until it is.");
  process.exit(0);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
