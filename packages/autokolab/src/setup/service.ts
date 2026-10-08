import { execFileSync, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { CLI_PATH, which } from "./agents.js";

// The runner as a background service: one per machine, running all of this machine's agents.
// systemd user service on Linux, launchd agent on macOS.

const LABEL = "com.autokolab.runner";
const UNIT = "autokolab-runner.service";

interface ServiceDef {
  path: string;
  content: string;
  start: string[][];
  stop: string[][];
  logs: string;
}

export function serviceDef(): ServiceDef | null {
  const node = process.execPath;
  const path = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  if (platform() === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
    const logs = join(homedir(), "Library", "Logs", "autokolab-runner.log");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return {
      path: plist,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(CLI_PATH)}</string><string>run</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(path)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(logs)}</string>
  <key>StandardErrorPath</key><string>${esc(logs)}</string>
</dict></plist>
`,
      start: [["launchctl", "unload", plist], ["launchctl", "load", "-w", plist]],
      stop: [["launchctl", "unload", "-w", plist]],
      logs: `tail -f ${logs}`,
    };
  }
  if (!which("systemctl")) return null;
  const unit = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user", UNIT);
  return {
    path: unit,
    content: `[Unit]
Description=AutoKolab runner (carries out instructions for this machine's agents)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart="${node}" "${CLI_PATH}" run
Environment=PATH=${path}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`,
    start: [["systemctl", "--user", "daemon-reload"], ["systemctl", "--user", "enable", "--now", UNIT], ["systemctl", "--user", "restart", UNIT]],
    stop: [["systemctl", "--user", "disable", "--now", UNIT]],
    logs: `journalctl --user -u ${UNIT} -f`,
  };
}

/** Emits "installed" when the background service takes over running this machine's agents. */
export const serviceEvents = new EventEmitter();

export function installService(): { ok: boolean; message: string; logs?: string } {
  serviceEvents.emit("installing");
  const def = serviceDef();
  if (!def) return { ok: false, message: "No systemd here. Run `autokolab run` in a terminal (or tmux) to keep your agents working." };
  mkdirSync(dirname(def.path), { recursive: true });
  writeFileSync(def.path, def.content);
  for (const [cmd, ...args] of def.start) {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    if (r.status !== 0 && !args.includes("unload")) return { ok: false, message: `${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim()}` };
  }
  let message = "Runner is running in the background and starts automatically.";
  if (platform() === "linux") {
    const linger = spawnSync("loginctl", ["show-user", process.env.USER ?? "", "-p", "Linger"], { encoding: "utf8" });
    if (!linger.stdout.includes("Linger=yes")) {
      message += ` To keep it running while you're logged out: sudo loginctl enable-linger ${process.env.USER ?? "$USER"}`;
    }
  }
  return { ok: true, message, logs: def.logs };
}

export function uninstallService(): string {
  const def = serviceDef();
  if (!def || !existsSync(def.path)) return "No runner service installed.";
  for (const [cmd, ...args] of def.stop) spawnSync(cmd, args);
  rmSync(def.path, { force: true });
  return "Runner service stopped and removed.";
}

export function serviceStatus(): "running" | "stopped" | "not-installed" {
  const def = serviceDef();
  if (!def || !existsSync(def.path)) return "not-installed";
  try {
    if (platform() === "darwin") {
      const out = execFileSync("launchctl", ["list"], { encoding: "utf8" });
      return out.includes(LABEL) ? "running" : "stopped";
    }
    const r = spawnSync("systemctl", ["--user", "is-active", UNIT], { encoding: "utf8" });
    return r.stdout.trim() === "active" ? "running" : "stopped";
  } catch {
    return "stopped";
  }
}

export function restartServiceIfInstalled(): void {
  if (serviceStatus() === "not-installed") return;
  installService();
}
