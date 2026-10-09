import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { myProjects, type Project } from "./lib/data";
import { go, parse, useRoute } from "./lib/router";
import { myProfile, saveProfile, signOut, supabase, type Profile } from "./lib/session";
import { SignIn } from "./screens/SignIn";
import { Welcome } from "./screens/Welcome";
import { Button } from "./ui";
import { CreateProject } from "./workspace/CreateProject";
import { JoinPage } from "./workspace/Join";
import { Workspace } from "./workspace/Workspace";

const DemoWorkspace = import.meta.env.DEV ? lazy(() => import("./workspace/demo")) : null;

type View = { kind: "demo" } | { kind: "loading" } | { kind: "signed-out"; error?: string } | { kind: "welcome"; profile: Profile } | { kind: "app"; profile: Profile };

export function App() {
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    if (import.meta.env.DEV) {
      const preview = new URLSearchParams(location.search).get("preview");
      if (preview) return setView(previewView(preview));
    }
    let session;
    try {
      // A sign-in that comes back with a code this browser can't use (started in another tab or
      // on another address) can leave the auth library waiting forever. Don't wait forever.
      session = (await withTimeout(supabase.auth.getSession(), 8000)).data.session;
    } catch {
      return restartSignIn("Sign-in didn't finish. Please try again.");
    }
    if (!session) return setView({ kind: "signed-out", error: oauthError() ?? takeSignInNotice() });
    try {
      const profile = await withTimeout(myProfile(), 15000);
      setView(profile.onboarded ? { kind: "app", profile } : { kind: "welcome", profile });
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

  const doSignOut = useCallback(async () => {
    await signOut();
    go("/", true);
    setView({ kind: "signed-out" });
  }, []);

  if (view.kind === "loading") return <Centered>Loading…</Centered>;
  if (view.kind === "demo") {
    return DemoWorkspace ? (
      <Suspense fallback={<Centered>Loading…</Centered>}>
        <DemoWorkspace />
      </Suspense>
    ) : null;
  }
  if (view.kind === "signed-out") {
    // An invite link opened before signing in: show what it's for, then sign in from there.
    const r = parse(location.pathname);
    if (r.view === "join") return <JoinPage code={r.code} profile={null} notice={view.error} />;
    return <SignIn error={view.error} />;
  }
  if (view.kind === "welcome") {
    return (
      <Welcome
        profile={view.profile}
        onSave={async (p) => {
          if (view.profile.id === "preview") return setView({ kind: "welcome", profile: { ...view.profile, ...p } });
          const profile = await saveProfile({ ...p, onboarded: true }, view.profile.id);
          setView({ kind: "app", profile });
        }}
      />
    );
  }
  return <Projects profile={view.profile} onSignOut={() => void doSignOut()} onEditProfile={() => setView({ kind: "welcome", profile: view.profile })} />;
}

/** Signed in: load your projects, then show the one in the URL (or start your first). */
function Projects({ profile, onSignOut, onEditProfile }: { profile: Profile; onSignOut: () => void; onEditProfile: () => void }) {
  const route = useRoute();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setProjects(await myProjects());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // "/" goes to the project you used last.
  useEffect(() => {
    if (!projects?.length || route.view !== "home") return;
    let last: string | null = null;
    try {
      last = localStorage.getItem("autokolab.lastProject");
    } catch {
      /* private mode */
    }
    const p = projects.find((x) => x.slug === last) ?? projects[projects.length - 1];
    go({ view: "overview", project: p.slug }, true);
  }, [projects, route]);

  if (err) {
    return (
      <Centered>
        <p style={{ color: "var(--danger)" }}>{err}</p>
        <Button onClick={() => void load()}>Try again</Button>
      </Centered>
    );
  }
  if (!projects) return <Centered>Loading your projects…</Centered>;
  if (route.view === "join") return <JoinPage code={route.code} profile={profile} onJoined={load} />;

  const created = async (p: Project) => {
    await load();
    go({ view: "connect", project: p.slug });
  };

  if (!projects.length || route.view === "new-project") {
    return <CreateProject first={!projects.length} onCreated={(p) => void created(p)} onCancel={projects.length ? () => history.back() : undefined} />;
  }
  if (route.view === "home") return <Centered>Loading…</Centered>;

  const project = projects.find((p) => p.slug === route.project);
  if (!project) {
    return (
      <Centered>
        <p style={{ color: "var(--muted)" }}>There's no project "{route.project}", or you haven't been added to it.</p>
        <Button onClick={() => go("/")}>Go to your projects</Button>
      </Centered>
    );
  }
  return <Workspace key={project.id} project={project} projects={projects} route={route} profile={profile} onSignOut={onSignOut} onEditProfile={onEditProfile} onProjectChanged={() => void load()} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", padding: 24, color: "var(--faint)", textAlign: "center" }}>{children}</div>;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);
}

const NOTICE = "autokolab.signInNotice";

/** Throw away a half-finished sign-in and load the page fresh, with a note to show. */
function restartSignIn(message: string): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sb-") && k.includes("code-verifier")) localStorage.removeItem(k);
    sessionStorage.setItem(NOTICE, message);
  } catch {
    /* private mode */
  }
  location.replace(location.pathname);
}

function takeSignInNotice(): string | undefined {
  try {
    const m = sessionStorage.getItem(NOTICE) ?? undefined;
    sessionStorage.removeItem(NOTICE);
    return m;
  } catch {
    return undefined;
  }
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

/** Development only: look at screens without signing in (?preview=signin|welcome|workspace). */
function previewView(which: string): View {
  if (which === "workspace") return { kind: "demo" };
  const profile: Profile = { id: "preview", github_login: "octocat", name: "Ana", avatar_url: null, timezone: "America/Toronto", city: "Toronto", onboarded: false };
  if (which === "welcome") return { kind: "welcome", profile };
  return { kind: "signed-out" };
}
