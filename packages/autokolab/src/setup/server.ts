import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfigFile, stateDir } from "../core/config.js";
import * as actions from "./actions.js";
import { githubStatus, installGh, startGitHubSignIn } from "./machine.js";
import { startNotifier } from "./notify.js";
import { runAll, type Runner } from "../runner/runner.js";
import { runnerFiles } from "../runner/config.js";
import { serviceEvents, serviceStatus } from "./service.js";
import { openBrowser } from "./open.js";
import { cyan, dim } from "./ui.js";

// `autokolab` (no arguments): the app. Serves the web view and a small local API that the setup
// page uses, on 127.0.0.1 only. Every API call must carry this run's session code (passed to the
// browser in the URL fragment, never sent anywhere else), and requests from other sites are refused.

export const WEB_DIR = fileURLToPath(new URL("../../web/", import.meta.url));
export const PORT = Number(process.env.AUTOKOLAB_PORT) || 4777;
const SESSION_FILE = () => join(stateDir(), "app-session");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

type Handler = (body: Record<string, unknown>) => Promise<unknown> | unknown;
const routes: Record<string, Handler> = {
  "GET /api/state": () => actions.getState(),
  "GET /api/env": () => {
    const e = actions.envFileKeys();
    return { url: !!e.url, publicKey: !!e.publicKey, secretKey: !!e.secretKey, dbUrl: !!e.dbUrl };
  },
  "GET /api/suggestions": () => actions.suggestions(),
  "GET /api/schema": () => ({ sql: actions.schemaSql() }),
  "GET /api/repos": () => actions.suggestRepos(),
  "GET /api/signin": () => actions.signIn(),
  "POST /api/keys": (b) => actions.saveKeys(b as never),
  "POST /api/database": (b) => actions.setUpDatabase(b as never),
  "POST /api/me": (b) => actions.createTeamMember(b as never),
  "POST /api/repos": (b) => actions.addRepo(b as never),
  "POST /api/invite": (b) => actions.invite(b as never),
  "POST /api/join": (b) => actions.redeem(b as never),
  "POST /api/rename": (b) => actions.rename(b as never),
  "POST /api/remove-agent": (b) => actions.removeAgent(b as never),
  "POST /api/finish": (b) => actions.finishMachine(b as never),
  "POST /api/invite/peek": (b) => actions.peekInvite(b as never),
  "GET /api/invites": () => actions.listInvites(),
  "POST /api/invites/cancel": (b) => actions.cancelInvite(b as never),
  "GET /api/repo-states": () => actions.repoStates(),
  "POST /api/repo/use": (b) => actions.useFolder(b as never),
  "POST /api/repo/download": (b) => actions.downloadRepo(b as never),
  "POST /api/access/request": (b) => actions.requestAccess(b as never),
  "POST /api/access/grant": (b) => actions.grantAccess(b as never),
  "GET /api/github": () => githubStatus(),
  "POST /api/github/install": () => installGh(),
  "POST /api/github/signin": () => startGitHubSignIn(),
  "GET /api/tools": () => actions.tools(),
  "POST /api/tools/install": (b) => actions.installAgentTool(b as never),
  "POST /api/tools/signin": (b) => actions.signInAgentTool(b as never),
  "POST /api/tools/code": (b) => actions.agentToolCode(b as never),
  "POST /api/agent": (b) => actions.setUpAgent(b as never),
};

function readSession(): string | null {
  try {
    return readFileSync(SESSION_FILE(), "utf8").trim() || null;
  } catch {
    return null;
  }
}

async function alreadyServing(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/__autokolab`, { signal: AbortSignal.timeout(800) });
    return r.ok && (await r.text()) === "autokolab";
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data ?? null));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) reject(new Error("too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("bad json"));
      }
    });
    req.on("error", reject);
  });
}

/** The invite rides along in the URL fragment, so the join page opens with it filled in. */
function inviteFragment(invite?: string): string {
  const code = invite?.trim().replace(/^autokolab join\s+/, "");
  return code && /^akinv_[A-Za-z0-9_-]+$/.test(code) ? `&i=${code}` : "";
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function runApp(opts: { noBrowser?: boolean; invite?: string } = {}): Promise<void> {
  if (!existsSync(join(WEB_DIR, "index.html"))) {
    throw new Error("The web app isn't built in this install. Run `npm run build` in the AutoKolab folder.");
  }
  if (await alreadyServing()) {
    const s = readSession();
    const url = `http://127.0.0.1:${PORT}/${s ? `#s=${s}${inviteFragment(opts.invite)}` : ""}`;
    if (!opts.noBrowser) openBrowser(url);
    console.log(`AutoKolab is already running: ${cyan(`http://127.0.0.1:${PORT}`)}`);
    return;
  }

  const session = randomBytes(24).toString("base64url");
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  writeFileSync(SESSION_FILE(), session, { mode: 0o600 });
  const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    // Refuse anything not addressed to this machine by name (DNS rebinding) or sent by other sites.
    if (!allowedHosts.has(req.headers.host ?? "")) return send(res, 403, { error: "Forbidden" });
    if (path === "/__autokolab") return void res.end("autokolab");

    if (path.startsWith("/api/")) {
      const origin = req.headers.origin;
      if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ""))) return send(res, 403, { error: "Forbidden" });
      const given = String(req.headers["x-autokolab-session"] ?? "");
      if (!given || !sameSecret(given, session)) {
        return send(res, 401, { error: "This page is out of date. Close it and run `autokolab` again." });
      }
      const handler = routes[`${req.method} ${path}`];
      if (!handler) return send(res, 404, { error: "Not found" });
      try {
        const body = req.method === "POST" ? await readBody(req) : {};
        return send(res, 200, await handler(body));
      } catch (e) {
        const msg = e instanceof actions.UserError ? e.message : `Something went wrong: ${(e as Error).message}`;
        if (!(e instanceof actions.UserError)) console.error(e);
        return send(res, 400, { error: msg });
      }
    }

    let file = normalize(join(WEB_DIR, path));
    if (!file.startsWith(WEB_DIR) || !existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIR, "index.html");
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    // The page learns the current session from its own HTML. Only same-origin script can read
    // this (browsers block other sites from reading it, and the Host check above stops rebinding),
    // so an open tab keeps working after AutoKolab restarts: it just reloads.
    if (file.endsWith("index.html")) {
      res.end(readFileSync(file, "utf8").replace("</head>", `<meta name="autokolab-session" content="${session}"></head>`));
    } else {
      res.end(readFileSync(file));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "EADDRINUSE" ? new Error(`Port ${PORT} is busy (another program is using it).`) : e),
    );
    server.listen(PORT, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${PORT}/#s=${session}${inviteFragment(opts.invite)}`;
  if (!opts.noBrowser) openBrowser(url);
  // While the app is open, tell the person when someone writes to them or their agents.
  let notifierStarted = false;
  const tryNotifier = () => {
    if (notifierStarted || !readConfigFile().me) return;
    notifierStarted = true;
    startNotifier().catch(() => {
      notifierStarted = false;
    });
  };
  tryNotifier();
  setInterval(tryNotifier, 60_000).unref(); // picks up once setup is finished

  // While the app is open, it runs this machine's agents itself unless the background service
  // does. When the service is turned on, the app hands the agents over to it.
  let runners: Runner[] = [];
  let starting = false;
  const tryRunners = async () => {
    if (runners.length || starting || serviceStatus() === "running" || !runnerFiles().length) return;
    starting = true;
    try {
      runners = await runAll();
    } catch {
      runners = [];
    }
    starting = false;
  };
  serviceEvents.on("installing", () => {
    const stopping = runners;
    runners = [];
    void Promise.all(stopping.map((r) => r.stop()));
  });
  void tryRunners();
  setInterval(() => void tryRunners(), 30_000).unref();
  console.log(`\n  AutoKolab is open in your browser: ${cyan(`http://127.0.0.1:${PORT}`)}`);
  console.log(dim("  Keep this window open while you use it. Press Ctrl-C to quit.\n"));
  if (opts.noBrowser) console.log(`  ${url}\n`);
}
