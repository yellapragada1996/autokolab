import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codeHash, decryptPayload, encryptPayload, formatInvite, newCode, parseInvite, type InvitePayload } from "../src/core/invite.js";
import { normalizeRepo, roomNameFor } from "../src/core/repo.js";
import { looksLikeSecret } from "../src/core/secrets.js";
import { upsertCodexBlock, upsertInstructions } from "../src/setup/agents.js";
import { parseEngines } from "../src/setup/invite.js";
import { NAME_RULE, slug } from "../src/setup/ui.js";
import { applySchema, schemaFiles } from "../src/setup/team.js";

const payload: InvitePayload = {
  invitedBy: "ana",
  tokens: { "id-person": "ak1.x", "id-agent": "ak1.y" },
  members: [
    { id: "id-person", kind: "human", client: "web" },
    { id: "id-agent", kind: "agent", client: "claude-code" },
  ],
};

describe("invites", () => {
  it("one line carries the project and a one-time code", () => {
    const code = newCode();
    const line = formatInvite({ url: "https://abc.supabase.co", anonKey: "sb_publishable_xyz", code });
    expect(line.startsWith("akinv_")).toBe(true);
    expect(parseInvite(line)).toEqual({ url: "https://abc.supabase.co", anonKey: "sb_publishable_xyz", code });
    expect(parseInvite(`autokolab join ${line}`).code).toBe(code); // pasted with the command
    expect(looksLikeSecret(line)).toBe(true); // never postable in the room
  });
  it("tokens are encrypted with the code; the database only sees ciphertext and a hash", () => {
    const code = newCode();
    const blob = encryptPayload(payload, code);
    expect(blob).not.toContain("ak1.");
    expect(decryptPayload(blob, code)).toEqual(payload);
    expect(() => decryptPayload(blob, newCode())).toThrow();
    expect(codeHash(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(codeHash(code)).not.toContain(code);
  });
  it("rejects tampering and junk", () => {
    const code = newCode();
    const parts = encryptPayload(payload, code).split(".");
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("A") ? "BB" : "AA");
    expect(() => decryptPayload(parts.join("."), code)).toThrow();
    expect(() => parseInvite("hello")).toThrow(/akinv_/);
    expect(() => parseInvite("akinv_!!!")).toThrow(/damaged/);
  });
  it("understands agent lists", () => {
    expect(parseEngines("claude, codex")).toEqual(["claude", "codex"]);
    expect(parseEngines("Claude Code")).toEqual(["claude"]);
    expect(parseEngines("claude code and codex")).toEqual(["claude", "codex"]);
    expect(() => parseEngines("gpt")).toThrow(/claude and\/or codex/);
  });
});

describe("names", () => {
  it("suggests clean names from what people type", () => {
    expect(slug("Ana María")).toBe("ana-maria");
    expect(slug("  Lee O'Brien ")).toBe("lee-o-brien");
    expect(NAME_RULE(slug("Zoë"))).toBeNull();
  });
  it("explains invalid names", () => {
    expect(NAME_RULE("Ana")).toMatch(/lowercase/);
    expect(NAME_RULE("a")).toMatch(/2 characters/);
    expect(NAME_RULE("builder")).toBeNull();
  });
});

describe("repos and rooms", () => {
  it.each([
    ["git@github.com:Ana/Shop-App.git", "ana/shop-app"],
    ["https://github.com/ana/shop-app", "ana/shop-app"],
    ["https://x-access-token:abc@github.com/ana/shop-app.git", "ana/shop-app"],
    ["ssh://git@github.com/ana/shop-app.git", "ana/shop-app"],
    ["ana/shop-app", "ana/shop-app"],
    ["https://gitlab.com/ana/shop-app", null],
  ])("%s → %s", (url, repo) => expect(normalizeRepo(url)).toBe(repo));
  it("names rooms after repos", () => {
    expect(roomNameFor("ana/Shop_App")).toBe("shop-app");
    expect(roomNameFor("ana/x")).toBe("repo-x");
  });
});

describe("connecting agents", () => {
  it("adds the Codex MCP section without touching the rest, and is idempotent", () => {
    const original = `model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n`;
    const once = upsertCodexBlock(original, "lee-codex");
    expect(once).toContain(`model = "gpt-5"`);
    expect(once).toContain("[mcp_servers.other]");
    expect(once).toContain("[mcp_servers.autokolab]");
    expect(once).toContain(`"--profile", "lee-codex"`);
    expect(upsertCodexBlock(once, "lee-codex")).toBe(once);
    const switched = upsertCodexBlock(once, "other-codex");
    expect(switched.match(/\[mcp_servers\.autokolab\]/g)).toHaveLength(1);
    expect(switched).toContain(`"other-codex"`);
    expect(switched).toContain("[mcp_servers.other]");
  });
  it("keeps one instructions block in CLAUDE.md / AGENTS.md", () => {
    const once = upsertInstructions("# Project\n\nOur notes.\n");
    expect(once).toContain("Our notes.");
    expect(once).toContain("## Working with AutoKolab");
    expect(upsertInstructions(once)).toBe(once);
  });
});

// Sets up the schema exactly as `autokolab init` does, on a throwaway local Postgres database
// with Supabase's roles and auth stand-ins. Skipped when Postgres isn't available.
const hasPg = spawnSync("pg_isready", { stdio: "ignore" }).status === 0;
describe.skipIf(!hasPg)("database setup from init", () => {
  it("applies the schema once and is idempotent", async () => {
    const db = `autokolab_init_${process.pid}`;
    execFileSync("createdb", [db]);
    try {
      const stubs = readFileSync(new URL("../../../supabase/tests/stubs.sql", import.meta.url), "utf8");
      execFileSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", "-d", db], { input: stubs, stdio: ["pipe", "ignore", "ignore"] });
      const url = `postgresql://localhost/${db}`;
      const latest = Math.max(...schemaFiles().map((f) => f.version));
      expect(await applySchema(url, 0)).toBe(latest);
      expect(await applySchema(url, latest)).toBe(latest);
      const v = execFileSync("psql", ["-tA", "-d", db, "-c", "select value from autokolab_meta where key = 'schema_version'"], { encoding: "utf8" });
      expect(Number(v.trim())).toBe(latest);
    } finally {
      execFileSync("dropdb", ["--if-exists", db]);
    }
  });
});
