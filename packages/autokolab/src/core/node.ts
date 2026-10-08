import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { AutoKolab } from "./client.js";
import { resolveConfig, supabaseOrigin } from "./config.js";

// Node-only helpers. Node 20 has no built-in WebSocket, which Supabase's realtime client needs,
// so every client made in Node gets the `ws` package when the runtime lacks one.

export const nodeWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket ? undefined : WebSocket;

/** A plain Supabase client for Node (admin key, or the public key for invites). */
export function nodeSupabase(url: string, key: string): SupabaseClient {
  return createClient(supabaseOrigin(url), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: nodeWebSocket ? ({ transport: nodeWebSocket } as never) : undefined,
  });
}

/** Connect as one of this machine's identities. */
export async function connectFromConfig(profile?: string): Promise<AutoKolab> {
  const cfg = resolveConfig(profile);
  return AutoKolab.connect({ url: cfg.url, anonKey: cfg.anonKey, token: cfg.token, realtimeTransport: nodeWebSocket });
}
