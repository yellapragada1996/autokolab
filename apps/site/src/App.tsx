import { useCallback, useEffect, useState } from "react";
import { myProfile, saveProfile, signOut, supabase, type Profile } from "./lib/session";
import { RoomShell } from "./room/RoomShell";
import { SignIn } from "./screens/SignIn";
import { Welcome } from "./screens/Welcome";
import { CommandPalette, useCommandPalette } from "./ui/CommandPalette";

type View = { kind: "loading" } | { kind: "signed-out"; error?: string } | { kind: "welcome"; profile: Profile } | { kind: "room"; profile: Profile };

export function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [paletteOpen, setPaletteOpen] = useCommandPalette();

  const load = useCallback(async () => {
    if (import.meta.env.DEV) {
      const preview = new URLSearchParams(location.search).get("preview");
      if (preview) return setView(previewView(preview));
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setView({ kind: "signed-out", error: oauthError() });
    try {
      const profile = await myProfile();
      setView(profile.onboarded ? { kind: "room", profile } : { kind: "welcome", profile });
    } catch (e) {
      setView({ kind: "signed-out", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const doSignOut = async () => {
    await signOut();
    setView({ kind: "signed-out" });
  };

  if (view.kind === "loading") return <div style={{ minHeight: "100%", display: "grid", placeItems: "center", color: "var(--faint)" }}>Loading…</div>;
  if (view.kind === "signed-out") return <SignIn error={view.error} />;
  if (view.kind === "welcome") {
    return (
      <Welcome
        profile={view.profile}
        onSave={async (p) => {
          if (view.profile.id === "preview") return setView({ kind: "room", profile: { ...view.profile, ...p, onboarded: true } });
          const profile = await saveProfile({ ...p, onboarded: true }, view.profile.id);
          setView({ kind: "room", profile });
        }}
      />
    );
  }
  return (
    <>
      <RoomShell profile={view.profile} onSignOut={() => void doSignOut()} onOpenPalette={() => setPaletteOpen(true)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={[
          { id: "room", label: "Go to Room", hint: "g r", run: () => undefined },
          { id: "name", label: "Change your name", run: () => setView({ kind: "welcome", profile: view.profile }) },
          { id: "github", label: "AutoKolab on GitHub", run: () => window.open("https://github.com/yellapragada1996/autokolab", "_blank", "noopener") },
          { id: "signout", label: "Sign out", run: () => void doSignOut() },
        ]}
      />
    </>
  );
}

/** GitHub sends errors back in the URL (e.g. the person pressed Cancel). */
function oauthError(): string | undefined {
  const p = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const d = p.get("error_description") ?? h.get("error_description");
  if (!d) return undefined;
  history.replaceState(null, "", location.pathname);
  return /denied|cancel/i.test(d) ? "GitHub sign-in was cancelled." : `GitHub sign-in failed: ${d}`;
}

/** Development only: look at screens without signing in (?preview=signin|welcome|room). */
function previewView(which: string): View {
  const profile: Profile = { id: "preview", github_login: "octocat", name: "Raghav", avatar_url: null, timezone: "America/Toronto", city: "Toronto", onboarded: true };
  if (which === "welcome") return { kind: "welcome", profile: { ...profile, onboarded: false } };
  if (which === "room") return { kind: "room", profile };
  return { kind: "signed-out" };
}
