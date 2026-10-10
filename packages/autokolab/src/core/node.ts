import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { AutoKolab } from "./client.js";
import { resolveConfig, supabaseOrigin } from "./config.js";

// Node-only helpers. Node 20 has no built-in WebSocket, which Supabase's realtime client needs
// (supabase-js throws when a client is made without one), so every client made in Node gets
// the `ws` package when the runtime lacks one. Make Node clients only through these helpers.

/** The WebSocket to hand Supabase: none when the runtime has its own, else `ws`. */
export function webSocketFor(g: { WebSocket?: unknown } = globalThis): typeof WebSocket | undefined {
  return g.WebSocket ? undefined : WebSocket;
}

export const nodeWebSocket = webSocketFor();

/** Node's major version, e.g. 20. */
export function nodeMajor(version = process.versions.node): number {
  return Number(version.split(".")[0]) || 0;
}

/** A plain Supabase client for Node (admin key, or the public key for invites). */
export function nodeSupabase(url: string, key: string): SupabaseClient {
  return createClient(supabaseOrigin(url), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: nodeWebSocket ? ({ transport: nodeWebSocket } as never) : undefined,
  });
}

/** Connect as a member from Node. */
export function nodeConnect(opts: { url: string; anonKey: string; token: string }): Promise<AutoKolab> {
  return AutoKolab.connect({ ...opts, realtimeTransport: nodeWebSocket });
}

/** Connect as one of this machine's identities. */
export async function connectFromConfig(profile?: string): Promise<AutoKolab> {
  const cfg = resolveConfig(profile);
  return nodeConnect({ url: cfg.url, anonKey: cfg.anonKey, token: cfg.token });
}
