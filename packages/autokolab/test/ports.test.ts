import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PORT_COUNT, claimPorts, portIsFree } from "../src/runner/ports.js";
import { runSetup } from "../src/runner/setup.js";

describe("each run's own ports (AK-125)", () => {
  let dir: string;
  const free = async () => true;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ak-ports-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("gives two runs different blocks of 10, with the ticket in their environment", async () => {
    const a = await claimPorts("AK-1", { dir, isFree: free });
    const b = await claimPorts(null, { dir, isFree: free });
    expect(a!.port).toBe(20000);
    expect(b!.port).toBe(20000 + PORT_COUNT);
    expect(a!.env).toEqual({ AUTOKOLAB_PORT: "20000", AUTOKOLAB_PORT_COUNT: "10", AUTOKOLAB_TICKET: "AK-1" });
    expect(b!.env.AUTOKOLAB_TICKET).toBeUndefined();
  });

  it("never gives two runs claiming at once the same block", async () => {
    const blocks = await Promise.all(Array.from({ length: 8 }, (_, i) => claimPorts(`AK-${i}`, { dir, isFree: free })));
    expect(new Set(blocks.map((b) => b!.port)).size).toBe(8);
  });

  it("frees a block when its run ends, and only that run's", async () => {
    const a = await claimPorts("AK-1", { dir, isFree: free });
    const b = await claimPorts("AK-2", { dir, isFree: free });
    await a!.release();
    await a!.release();
    const c = await claimPorts("AK-3", { dir, isFree: free });
    expect(c!.port).toBe(a!.port);
    const d = await claimPorts("AK-4", { dir, isFree: free });
    expect(d!.port).not.toBe(b!.port);
    expect(Object.keys(JSON.parse(readFileSync(join(dir, "ports.json"), "utf8"))).sort()).toEqual(["20000", "20010", "20020"]);
  });

  it("takes back blocks held by a process that's gone", async () => {
    writeFileSync(join(dir, "ports.json"), JSON.stringify({ 20000: { id: "x", pid: 2 ** 22 + 7, ticket: "AK-9", at: Date.now() } }));
    expect((await claimPorts("AK-1", { dir, isFree: free }))!.port).toBe(20000);
  });

  it("skips a block where something already listens, and says when none is left", async () => {
    const a = await claimPorts("AK-1", { dir, isFree: async (p) => p !== 20003 });
    expect(a!.port).toBe(20010);
    expect(await claimPorts("AK-2", { dir, blocks: 2, isFree: free })).not.toBeNull();
    expect(await claimPorts("AK-3", { dir, blocks: 2, isFree: free })).toBeNull();
  });

  it("waits for a lock another run holds", async () => {
    mkdirSync(join(dir, "ports.lock"));
    const pending = claimPorts("AK-1", { dir, isFree: free });
    setTimeout(() => rmSync(join(dir, "ports.lock"), { recursive: true }), 100);
    expect((await pending)!.port).toBe(20000);
  });

  it("knows a port something listens on isn't free", async () => {
    const s = createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const port = (s.address() as { port: number }).port;
    expect(await portIsFree(port)).toBe(false);
    await new Promise((r) => s.close(r));
  });

  it("passes the run's variables to the setup script", async () => {
    const gitDir = join(dir, "git");
    const cwd = join(dir, "wt");
    mkdirSync(gitDir);
    mkdirSync(cwd);
    const block = await claimPorts("AK-7", { dir, isFree: free });
    const r = await runSetup('echo "$AUTOKOLAB_TICKET $AUTOKOLAB_PORT $AUTOKOLAB_PORT_COUNT" > vars\n', { gitDir, cwd, minutes: 1, onOutput: () => undefined, env: block!.env });
    expect(r).toEqual({ ran: true, ok: true });
    expect(readFileSync(join(cwd, "vars"), "utf8").trim()).toBe("AK-7 20000 10");
  });
});
