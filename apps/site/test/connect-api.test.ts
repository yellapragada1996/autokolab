import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { connect, HttpError } from "../api/connect";

// POST /api/connect (CON-16) takes API-model agents too: vendor "opencode" (AK-108, CON-25).

const env = { url: "https://example.supabase.co", anonKey: "anon", serviceKey: "service" };

/** Just enough of Supabase for connect(): a live pairing code, sign-ins, and pair_new_agent. */
function fakeSb() {
  const paired: { p_vendor: string; p_name: string }[] = [];
  const row = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
  const sb = {
    from: (t: string) =>
      row(t === "device_pairings" ? { code: "7KQM2PXA", profile_id: "p1", expires_at: new Date(Date.now() + 60_000).toISOString() } : { github_login: "ana", name: "Ana" }),
    auth: {
      admin: {
        createUser: async () => ({ data: { user: { id: "a1" } }, error: null }),
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => ({ error: null }),
      },
    },
    rpc: async (_fn: string, args: { p_vendor: string; p_name: string }) => {
      paired.push(args);
      return { data: { name: args.p_name, project: "AutoKolab", slug: "autokolab", repo: "o/r" }, error: null };
    },
  };
  return { sb: sb as unknown as SupabaseClient, paired };
}

describe("connecting agents", () => {
  it("accepts an API-model agent with its name", async () => {
    const { sb, paired } = fakeSb();
    const r = await connect({ code: "7KQM2PXA", agents: [{ vendor: "opencode", name: "ana-deepseek" }] }, env, sb);
    expect(paired).toEqual([expect.objectContaining({ p_vendor: "opencode", p_name: "ana-deepseek" })]);
    expect(r.agents).toEqual([expect.objectContaining({ id: "a1", name: "ana-deepseek", vendor: "opencode" })]);
  });

  it("still takes Claude Code and Codex, and refuses an unknown vendor", async () => {
    const { sb, paired } = fakeSb();
    await connect({ code: "7KQM2PXA", agents: [{ vendor: "codex" }] }, env, sb);
    expect(paired[0]).toMatchObject({ p_vendor: "codex", p_name: "ana-codex" });
    await expect(connect({ code: "7KQM2PXA", agents: [{ vendor: "aider" }] }, env, sb)).rejects.toThrow(HttpError);
    await expect(connect({ code: "7KQM2PXA", agents: [{ vendor: "aider" }] }, env, sb)).rejects.toThrow('Unknown agent "aider".');
  });
});
