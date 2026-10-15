import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KeepAwake, awakeCommand, type KeepAwakeDeps } from "../src/runner/awake.js";
import { parseRunnerConfig } from "../src/runner/config.js";
import { Runner } from "../src/runner/runner.js";

const AID = "00000000-0000-4000-8000-000000000001";

/** Fake caffeinate / systemd-inhibit: records what was started and stopped. */
function fakes(platform: NodeJS.Platform = "darwin") {
  const started: { cmd: string; args: string[]; child: ChildProcess }[] = [];
  const stopped: ChildProcess[] = [];
  const deps: KeepAwakeDeps = {
    platform,
    pid: 4242,
    spawn: (cmd, args) => {
      const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), unref: () => undefined }) as unknown as ChildProcess;
      started.push({ cmd, args, child });
      return child;
    },
    stop: (child) => stopped.push(child),
  };
  return { deps, started, stopped };
}

describe("keeping the computer awake during runs (AK-128)", () => {
  it("uses caffeinate on macOS and systemd-inhibit for idle on Linux, both tied to the runner", () => {
    expect(awakeCommand("darwin", 7)).toEqual({ cmd: "caffeinate", args: ["-i", "-w", "7"] });
    const linux = awakeCommand("linux", 7)!;
    expect(linux.cmd).toBe("systemd-inhibit");
    expect(linux.args).toContain("--what=idle");
    expect(linux.args.slice(-4)).toEqual(["tail", "--pid=7", "-f", "/dev/null"]);
    expect(awakeCommand("win32", 7)).toBeNull();
  });

  it("starts with the first run and stops after the last", () => {
    const { deps, started, stopped } = fakes();
    const awake = new KeepAwake(true, () => undefined, deps);
    expect(awake.held).toBe(false);
    const build = awake.hold();
    const merge = awake.hold();
    expect(started).toHaveLength(1);
    expect(started[0].args).toEqual(["-i", "-w", "4242"]);
    build();
    build(); // twice is harmless
    expect(stopped).toHaveLength(0);
    expect(awake.held).toBe(true);
    merge();
    expect(stopped).toEqual([started[0].child]);
    expect(awake.held).toBe(false);
    awake.hold()();
    expect(started).toHaveLength(2);
  });

  it("releases after a run that throws", async () => {
    const { deps, started, stopped } = fakes();
    const awake = new KeepAwake(true, () => undefined, deps);
    await expect(awake.during(async () => { throw new Error("gh stalled"); })).rejects.toThrow("gh stalled");
    expect(started).toHaveLength(1);
    expect(stopped).toHaveLength(1);
  });

  it("does nothing with keep_awake = false", () => {
    const { deps, started } = fakes();
    const awake = new KeepAwake(false, () => undefined, deps);
    awake.hold()();
    expect(started).toHaveLength(0);
    expect(parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"`, "p").keep_awake).toBe(true);
    expect(parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"\nkeep_awake = false`, "p").keep_awake).toBe(false);
  });

  it("on Linux without permission, says so in one line and stops trying", () => {
    const { deps, started } = fakes("linux");
    const logs: string[] = [];
    const awake = new KeepAwake(true, (m) => logs.push(m), deps);
    const release = awake.hold();
    const child = started[0].child as unknown as EventEmitter & { stderr: EventEmitter };
    child.stderr.emit("data", Buffer.from("Failed to inhibit: Access denied\n"));
    child.emit("exit", 1, null);
    release();
    awake.hold()();
    awake.hold()();
    expect(started).toHaveLength(1);
    expect(logs).toEqual(["Can't keep this computer awake during runs (systemd-inhibit: Failed to inhibit: Access denied); carrying on without it."]);
  });

  it("says so once when the command isn't installed", () => {
    const { deps, started } = fakes("linux");
    const logs: string[] = [];
    const awake = new KeepAwake(true, (m) => logs.push(m), deps);
    awake.hold();
    (started[0].child as unknown as EventEmitter).emit("error", new Error("spawn systemd-inhibit ENOENT"));
    expect(awake.held).toBe(false);
    expect(logs).toHaveLength(1);
  });

  it("is held by the runner exactly while a run is in progress", () => {
    process.env.XDG_STATE_HOME = mkdtempSync(join(tmpdir(), "ak-awake-"));
    const runner = new Runner({} as ConstructorParameters<typeof Runner>[0], parseRunnerConfig(`agent_id = "${AID}"\nengine = "claude"`, "p"));
    const { deps, started, stopped } = fakes();
    const r = runner as unknown as { awake: KeepAwake; current: unknown };
    r.awake = new KeepAwake(true, () => undefined, deps);
    expect(started).toHaveLength(0);
    r.current = { what: "AK-1", abort: new AbortController() };
    r.current = { what: "AK-1 again", abort: new AbortController() };
    expect(started).toHaveLength(1);
    r.current = null;
    expect(stopped).toHaveLength(1);
    expect(r.awake.held).toBe(false);
  });
});
