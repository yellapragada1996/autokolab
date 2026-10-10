import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { formatToken } from "../src/core/token.js";
import { nodeVersionNote } from "../src/setup/status.js";

// Node 20 has no global WebSocket, and supabase-js throws when a client is made without one.
// These tests hide the global to act like Node 20.

const URL_ = "https://example.supabase.co";
const KEY = "anon-key";

function hideWebSocket(): () => void {
  const had = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
  return () => {
    if (had) Object.defineProperty(globalThis, "WebSocket", had);
  };
}

describe("Node 20 WebSocket transport", () => {
  let restore = () => undefined as void;
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses ws only when the runtime has no WebSocket", async () => {
    const { webSocketFor } = await import("../src/core/node.js");
    expect(webSocketFor({})).toBe(WebSocket);
    expect(webSocketFor({ WebSocket: class {} })).toBeUndefined();
  });

  it("without a transport, supabase-js throws on a Node-20-style runtime", () => {
    restore = hideWebSocket();
    expect(() => createClient(URL_, KEY)).toThrow(/WebSocket/);
  });

  it("nodeSupabase builds a client on a Node-20-style runtime", async () => {
    restore = hideWebSocket();
    vi.resetModules();
    const node = await import("../src/core/node.js");
    expect(node.nodeWebSocket).toBe(WebSocket);
    expect(() => node.nodeSupabase(URL_, KEY)).not.toThrow();
  });

  it("nodeConnect (used by status) gets past making the client on a Node-20-style runtime", async () => {
    restore = hideWebSocket();
    vi.resetModules();
    // Every request fails sign-in, so reaching that error means the client was made fine.
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "nope" }), { status: 400, headers: { "content-type": "application/json" } }));
    const node = await import("../src/core/node.js");
    const token = formatToken("3f1c2a9e-1b2c-4d5e-8f90-123456789abc", "s".repeat(43));
    await expect(node.nodeConnect({ url: URL_, anonKey: KEY, token })).rejects.toThrow(/Sign-in failed/);
  });
});

describe("status Node version note", () => {
  it("warns on Node older than 22", () => {
    expect(nodeVersionNote("20.20.2")).toMatch(/Node 22 or newer is recommended; Node 20 support is ending in Supabase\./);
    expect(nodeVersionNote("18.0.0")).not.toBeNull();
  });
  it("says nothing on Node 22 and newer", () => {
    expect(nodeVersionNote("22.0.0")).toBeNull();
    expect(nodeVersionNote("26.10.0")).toBeNull();
  });
});
