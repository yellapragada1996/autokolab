import { createClient, type Session } from "@supabase/supabase-js";

// Sign-in is GitHub only (spec §4.1). The browser holds the session; the GitHub token is never sent
// to our server.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!url && !!key;

export const supabase = createClient(url ?? "https://example.invalid", key ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

export interface Profile {
  id: string;
  github_login: string | null;
  name: string;
  avatar_url: string | null;
  timezone: string | null;
  city: string | null;
  onboarded: boolean;
}

/** Whether the backend has GitHub sign-in switched on (Supabase's public auth settings). */
export async function githubEnabled(): Promise<boolean | null> {
  if (!configured) return false;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
    const s = (await r.json()) as { external?: Record<string, boolean> };
    return !!s.external?.github;
  } catch {
    return null; // unknown (offline); let the button try
  }
}

export async function signInWithGitHub(next = "/"): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${location.origin}${next}`, scopes: "read:user" },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Your profile, created from GitHub on first sign-in. */
export async function myProfile(): Promise<Profile> {
  const { data, error } = await supabase.rpc("ensure_my_profile");
  if (error) throw new Error(friendly(error.message));
  if (!data) throw new Error("Your profile couldn't be created. Sign out and sign in with GitHub again.");
  return data as Profile;
}

export async function saveProfile(patch: Partial<Pick<Profile, "name" | "timezone" | "city" | "onboarded">>, id: string): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(friendly(error.message));
  return data as Profile;
}

function friendly(m: string): string {
  if (/ensure_my_profile|schema cache|does not exist/i.test(m)) return "AutoKolab's database isn't ready for website sign-in yet.";
  if (/JWT|expired/i.test(m)) return "Your session expired. Sign in again.";
  return m;
}
