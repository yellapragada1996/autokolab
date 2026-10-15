#!/usr/bin/env node
// Look at pages of the website: screenshots at desktop and phone width, plus a plain report
// (title, sideways scrolling, console errors, failed requests, visible text). AK-96.
//
//   npm run look -- /p/shop/overview /p/shop/results
//   npm run look -- /p/shop --click "Overview" --press "g" --wait "Team" --full
//
// Exit codes: 0 looked and it's fine · 1 looked and a page is broken · 2 couldn't look.
// Screenshots go to the helper's state folder, never into the repo, and are never uploaded.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_WIDTHS = [1440, 390];
export const TEXT_LIMIT = 400;
const SETTLE_MS = 800;
export const EXIT_BROKEN = 1;
export const EXIT_COULD_NOT_LOOK = 2;

export const USAGE = `Usage: npm run look -- <path-or-url> [more paths] [options]

  <path-or-url>      a site path such as /p/shop/overview (shown with sample data), or a full URL
  --widths 1440,390  window widths to look at (this is the default)
  --click "<text>"   click the first thing showing this text; may repeat
  --press "<key>"    press a key, such as g or Escape or Meta+k; may repeat
  --wait "<text>"    wait until this text shows before looking
  --full             screenshot the whole page, not just the window
  --server <url>     use a site that's already running instead of starting one
  --chromium         use Playwright's Chromium even when Chrome is installed

Clicks and presses happen in the order given, after the page loads.
Exit code 0: fine. 1: a page didn't load, has console errors or scrolls sideways. 2: couldn't look.`;

/** A mistake in how the command was called, or a browser that wouldn't start: exit 2. */
export class CouldNotLook extends Error {}

/** The command line, as what to look at and how. Throws CouldNotLook with a plain sentence. */
export function parseArgs(argv) {
  const out = { targets: [], widths: DEFAULT_WIDTHS, actions: [], wait: null, full: false, server: null, chromium: false, help: false };
  const value = (flag, i) => {
    const v = argv[i];
    if (v === undefined || v === "") throw new CouldNotLook(`${flag} needs a value.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--full") out.full = true;
    else if (a === "--chromium") out.chromium = true;
    else if (a === "--widths") {
      const raw = value(a, ++i);
      const widths = raw.split(",").map((w) => Number(w.trim()));
      if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 200 || w > 4000)) {
        throw new CouldNotLook(`--widths takes whole numbers from 200 to 4000, separated by commas (got "${raw}").`);
      }
      out.widths = widths;
    } else if (a === "--click") out.actions.push({ kind: "click", value: value(a, ++i) });
    else if (a === "--press") out.actions.push({ kind: "press", value: value(a, ++i) });
    else if (a === "--wait") out.wait = value(a, ++i);
    else if (a === "--server") out.server = value(a, ++i).replace(/\/+$/, "");
    else if (a.startsWith("--")) throw new CouldNotLook(`Unknown option ${a}.`);
    else out.targets.push(a);
  }
  if (!out.help && !out.targets.length) throw new CouldNotLook("Give at least one page to look at, such as /p/shop/overview.");
  return out;
}

export function isUrl(target) {
  return /^https?:\/\//i.test(target);
}

/** The address to open: full URLs as given; site paths on `base`, with the sample-data preview on. */
export function targetUrl(target, base) {
  if (isUrl(target)) return target;
  const u = new URL(target.startsWith("/") ? target : `/${target}`, base);
  if (!u.searchParams.has("preview")) u.searchParams.set("preview", "workspace");
  return u.href;
}

/** A file name for one page at one width: "02-p-shop-overview-390.png". */
export function shotName(target, width, index) {
  const slug =
    target
      .replace(/^https?:\/\//i, "")
      .replace(/[?&]preview=workspace\b/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "home";
  return `${String(index + 1).padStart(2, "0")}-${slug}-${width}.png`;
}

/** Where a run's screenshots go: the helper's state folder, which is outside every repo. */
export function runFolder(now = new Date(), env = process.env, home = homedir()) {
  const state = join(env.XDG_STATE_HOME || join(home, ".local", "state"), "autokolab");
  return join(state, "looks", now.toISOString().slice(0, 19).replace(/:/g, "-"));
}

/**
 * The ports an agent's run holds (AK-125), to try in order, or none outside a run. The first is
 * the dev server's, so it comes last.
 */
export function blockPorts(env = process.env) {
  const first = Number(env.AUTOKOLAB_PORT);
  const count = Number(env.AUTOKOLAB_PORT_COUNT) || 10;
  if (!Number.isInteger(first) || first < 1 || first + count > 65536) return [];
  const ports = Array.from({ length: count }, (_, i) => first + i);
  return [...ports.slice(1), first];
}

/** Phone-shaped below 600 wide, laptop-shaped above. */
export function heightFor(width) {
  return width < 600 ? 844 : 900;
}

/** A browser error without Playwright's call log. */
export function why(e) {
  return clip(String(e?.message ?? e).split(/\s*Call log:/)[0], 200);
}

export function clip(text, limit = TEXT_LIMIT) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

/** What's wrong with one look, in plain words; empty when it's fine. Decides exit code 1. */
export function problems(look) {
  const out = [];
  if (look.failed) out.push(look.failed);
  if (look.scrollWidth > look.clientWidth) out.push(`scrolls sideways (the page is ${look.scrollWidth} wide in a ${look.clientWidth} window)`);
  if (look.consoleErrors?.length) out.push(`${look.consoleErrors.length} console ${look.consoleErrors.length === 1 ? "error" : "errors"}`);
  return out;
}

/** The lines printed for one page at one width. */
export function reportLines(look) {
  const list = (label, items) => (items?.length ? items.map((x) => `  ${label}: ${clip(x, 300)}`) : [`  ${label}s: none`]);
  const lines = [`${look.target} at ${look.width} wide`];
  if (look.failed) lines.push(`  problem: ${look.failed}`);
  if (look.file) lines.push(`  screenshot: ${look.file}`);
  if (look.title !== undefined) lines.push(`  title: ${look.title || "(none)"}`);
  if (look.scrollWidth !== undefined) {
    lines.push(`  scrolls sideways: ${look.scrollWidth > look.clientWidth ? `yes (the page is ${look.scrollWidth} wide in a ${look.clientWidth} window)` : "no"}`);
  }
  lines.push(...list("console error", look.consoleErrors), ...list("failed request", look.failedRequests));
  if (look.text !== undefined) lines.push(`  text: ${clip(look.text) || "(nothing visible)"}`);
  return lines;
}

/** The last line of a run, and its exit code. */
export function verdict(looks) {
  const bad = looks.filter((l) => problems(l).length);
  if (!bad.length) return { code: 0, line: `Looked at ${looks.length} ${looks.length === 1 ? "screenshot" : "screenshots"}: no problems found. Open them to see the pages.` };
  return {
    code: EXIT_BROKEN,
    line: `Problems in ${bad.length} of ${looks.length}: ${bad.map((l) => `${l.target} at ${l.width} (${problems(l).join("; ")})`).join(" · ")}`,
  };
}

// ---- The browser part: kept thin, everything above is tested without one. ----

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = join(root, "apps", "site");

function listen(port) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** A free port: inside the run's own block when there is one, so other runs' ports stay theirs. */
async function freePort() {
  const block = blockPorts();
  for (const port of block) {
    try {
      return await listen(port);
    } catch {
      /* taken: try the next */
    }
  }
  if (block.length) throw new CouldNotLook(`Every port in this run's block (${block[block.length - 1]} and the ${block.length - 1} after it) is taken.`);
  return listen(0);
}

async function answers(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Start this checkout's site on a free port, so the pages shown are this branch's. */
async function startSite() {
  let vite;
  try {
    const req = createRequire(join(siteDir, "package.json"));
    vite = join(dirname(req.resolve("vite/package.json")), "bin", "vite.js");
  } catch {
    throw new CouldNotLook("The site's dependencies aren't installed here. Run `npm install` in the repo first.");
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = "";
  const child = spawn(process.execPath, [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: siteDir, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  let exited = false;
  child.once("exit", () => (exited = true));
  const stop = () => {
    if (!exited) child.kill("SIGTERM");
  };
  for (let i = 0; i < 120 && !exited; i++) {
    if (await answers(base)) return { base, stop };
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new CouldNotLook(`The site's dev server didn't start: ${clip(log, 300) || "it gave no output in 30 seconds."}`);
}

/** Installed Chrome first, then Playwright's own Chromium, downloaded once into the user's cache. */
async function startBrowser(skipChrome) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new CouldNotLook("Playwright isn't installed here. Run `npm install` in the repo first.");
  }
  if (!skipChrome) {
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      // No Chrome on this machine, or it wouldn't start: fall through to Chromium.
    }
  }
  try {
    return await chromium.launch();
  } catch (e) {
    if (!/Executable doesn't exist|playwright install/i.test(String(e?.message))) {
      throw new CouldNotLook(`No browser could be started: ${clip(String(e?.message ?? e), 300)}`);
    }
  }
  console.log("No browser to use yet. Downloading Chromium once into your user cache (about 150 MB, no sudo)…");
  const cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
  const dl = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (dl.status !== 0) throw new CouldNotLook(`Chromium couldn't be downloaded: ${clip(dl.stderr || String(dl.error ?? "unknown error"), 300)}`);
  try {
    return await chromium.launch();
  } catch (e) {
    throw new CouldNotLook(`No browser could be started: ${clip(String(e?.message ?? e), 300)}`);
  }
}

async function lookAt(browser, { target, url, width, file, opts }) {
  const look = { target, width, consoleErrors: [], failedRequests: [] };
  const context = await browser.newContext({ viewport: { width, height: heightFor(width) } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && look.consoleErrors.push(m.text()));
  page.on("pageerror", (e) => look.consoleErrors.push(String(e?.message ?? e)));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "failed";
    if (!/ERR_ABORTED/.test(why)) look.failedRequests.push(`${r.url()} (${why})`);
  });
  page.on("response", (r) => r.status() >= 400 && look.failedRequests.push(`${r.url()} (${r.status()})`));
  // Quiet network, then a moment for data that arrives late and for transitions to finish.
  const settle = () =>
    page
      .waitForLoadState("networkidle", { timeout: 3000 })
      .catch(() => {})
      .then(() => page.waitForTimeout(SETTLE_MS));
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 30000 });
    if (res && res.status() >= 400) look.failed = `the page didn't load (${res.status()})`;
    await settle();
    try {
      if (opts.wait) await page.getByText(opts.wait).first().waitFor({ timeout: 10000 });
    } catch {
      look.failed ??= `"${opts.wait}" never showed`;
    }
    for (const a of opts.actions) {
      if (look.failed) break;
      try {
        if (a.kind === "click") await page.getByText(a.value).first().click({ timeout: 10000 });
        else await page.keyboard.press(a.value);
        await settle();
      } catch (e) {
        look.failed = `couldn't ${a.kind} "${a.value}": ${why(e)}`;
      }
    }
    look.title = await page.title();
    Object.assign(
      look,
      await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        text: document.body?.innerText ?? "",
      })),
    );
    await page.screenshot({ path: file, fullPage: opts.full });
    look.file = file;
  } catch (e) {
    look.failed ??= `the page didn't load: ${why(e)}`;
  } finally {
    await context.close();
  }
  return look;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) return console.log(USAGE), 0;
  const browser = await startBrowser(opts.chromium);
  let site = null;
  try {
    let base = opts.server;
    if (!base && opts.targets.some((t) => !isUrl(t))) {
      site = await startSite();
      base = site.base;
    }
    const folder = runFolder();
    mkdirSync(folder, { recursive: true });
    const looks = [];
    let n = 0;
    for (const target of opts.targets) {
      for (const width of opts.widths) {
        const look = await lookAt(browser, { target, url: targetUrl(target, base), width, file: join(folder, shotName(target, width, n++)), opts });
        looks.push(look);
        console.log(`${reportLines(look).join("\n")}\n`);
      }
    }
    const v = verdict(looks);
    console.log(v.line);
    return v.code;
  } finally {
    await browser.close().catch(() => {});
    site?.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof CouldNotLook ? `Couldn't look: ${e.message}` : `Couldn't look: ${e?.stack ?? e}`);
      if (e instanceof CouldNotLook && /option|needs a value|at least one|--widths/.test(e.message)) console.error(`\n${USAGE}`);
      process.exit(EXIT_COULD_NOT_LOOK);
    },
  );
}
