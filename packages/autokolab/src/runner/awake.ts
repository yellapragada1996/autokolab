import { spawn, type ChildProcess } from "node:child_process";

// Keeps the computer from idle sleep while a run is going (AK-128): a sleeping laptop stops its
// agent's work, or, for Captain, every review and merge. Only idle sleep: closing the lid still
// sleeps the machine, and nothing is held while the runner has nothing to do.
//
// macOS: `caffeinate -i -w <runner pid>`. Linux: `systemd-inhibit --what=idle` around a command
// that ends with the runner. Either way the lock goes when the runner does, even if it crashes.

/** The command that holds the lock until it's stopped or `pid` exits; null on other systems. */
export function awakeCommand(platform: NodeJS.Platform, pid: number): { cmd: string; args: string[] } | null {
  if (platform === "darwin") return { cmd: "caffeinate", args: ["-i", "-w", String(pid)] };
  if (platform === "linux") {
    return {
      cmd: "systemd-inhibit",
      args: ["--what=idle", "--who=AutoKolab", "--why=An agent is working", "--mode=block", "tail", `--pid=${pid}`, "-f", "/dev/null"],
    };
  }
  return null;
}

export interface KeepAwakeDeps {
  platform: NodeJS.Platform;
  pid: number;
  spawn: (cmd: string, args: string[]) => ChildProcess;
  stop: (child: ChildProcess) => void;
}

const defaults: KeepAwakeDeps = {
  platform: process.platform,
  pid: process.pid,
  // Its own process group, so stopping it also stops the command systemd-inhibit runs.
  spawn: (cmd, args) => spawn(cmd, args, { detached: true, stdio: ["ignore", "ignore", "pipe"] }),
  stop: (child) => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  },
};

/**
 * Counts the runs going at once (a merge can run next to a build): the lock is taken by the first
 * and given back after the last. If the command can't run (not installed, or Linux won't allow it
 * without sudo), says so once and stops trying.
 */
export class KeepAwake {
  private holds = 0;
  private child: ChildProcess | null = null;
  private broken = false;

  constructor(
    private enabled: boolean,
    private log: (msg: string) => void,
    private deps: KeepAwakeDeps = defaults,
  ) {}

  /** Whether the lock is held right now. */
  get held(): boolean {
    return this.child !== null;
  }

  /** Keep awake until the returned function is called (calling it twice is harmless). */
  hold(): () => void {
    this.holds++;
    if (this.holds === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
      if (this.holds === 0) this.end();
    };
  }

  async during<T>(fn: () => Promise<T>): Promise<T> {
    const release = this.hold();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private start(): void {
    if (!this.enabled || this.broken || this.child) return;
    const command = awakeCommand(this.deps.platform, this.deps.pid);
    if (!command) return;
    let child: ChildProcess;
    try {
      child = this.deps.spawn(command.cmd, command.args);
    } catch (e) {
      this.fail(command.cmd, (e as Error).message);
      return;
    }
    this.child = child;
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => {
      if (this.child === child) this.child = null;
      this.fail(command.cmd, e.message);
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return; // Stopped by us.
      this.child = null;
      this.fail(command.cmd, stderr.trim().split("\n")[0] || `it stopped (${signal ?? `exit ${code}`})`);
    });
    child.unref();
    (child.stderr as { unref?: () => void } | null)?.unref?.();
  }

  private end(): void {
    const child = this.child;
    this.child = null;
    if (child) this.deps.stop(child);
  }

  private fail(cmd: string, why: string): void {
    if (this.broken) return;
    this.broken = true;
    this.log(`Can't keep this computer awake during runs (${cmd}: ${why}); carrying on without it.`);
  }
}
