# Phase 0 plan: hosted skeleton (for approval)

Goal (spec §13): sign in with GitHub on autokolab.com and see your name, avatar and city in an empty
room shell styled per the spec's tokens, on desktop and phone widths.

## What gets built

| Piece | Files | Notes |
|---|---|---|
| Website app | `apps/site/` (Vite + React + TypeScript) | New app. The current local app (`apps/web`) keeps running for the team until Phase 2. |
| Design tokens | `apps/site/src/styles/tokens.css` | §11 colors as CSS variables, IBM Plex Sans/Mono (Google Fonts), radii, focus rings. Dark only, as specced. |
| Base components | `apps/site/src/ui/` Button, Card, Avatar (circle), AgentMark (rounded square "Cl"/"Cx"), StatusText, StepBar, Chip, CommandPalette (⌘K shell) | Built from the wireframes' inline styles. |
| Sign-in | `apps/site/src/auth/` | Supabase Auth, GitHub provider, "Continue with GitHub", session persistence, sign out. |
| Profile | first-sign-in screen "What should your team call you?" | Name prefilled from GitHub; time zone from the browser; city derived from the time zone (editable). |
| Room shell | `apps/site/src/room/RoomShell.tsx` | Three columns from `Room.dc.html` with real sidebar (you, with avatar/city/time) and empty states; stacks on phone width. |
| Server functions | `apps/site/api/health.ts` | Vercel function scaffold; reads the service key from Vercel env only. Pairing, invites and push come in later phases. |
| Hosting config | `apps/site/vercel.json` | SPA routing (`/j/*`, `/device`, …) and `/api/*`. |
| Database | `supabase/v2/migrations/001_profiles.sql` + tests | `profiles` table, filled automatically on first GitHub sign-in; RLS so you can edit only your own profile; tested on local Postgres like today. |
| Env | `apps/site/.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public); `SUPABASE_SERVICE_ROLE_KEY` (Vercel only). |

## Data changes
- **Same Supabase project as today** (your choice). Phase 0 adds only `profiles` as migration
  `003_profiles.sql`, applied like the earlier ones. A profile row is created automatically on a
  person's first GitHub sign-in (the existing AutoKolab member logins are ignored).
- Table names that v2 needs later (`messages`, `invites`, `read_cursors`) are used by today's
  version. When v2's room goes live (Phase 2), the old tables are renamed `v1_*` and today's room is
  archived, so nothing breaks in between.

## What you need to do (about 15 minutes; I'll walk you through each)
1. **Supabase:** nothing new to create; we use the current project.
2. **GitHub OAuth app** (github.com → Settings → Developer settings → OAuth Apps → New):
   homepage `https://autokolab.com`, callback `https://<your-project>.supabase.co/auth/v1/callback`.
   Paste its Client ID and Secret into Supabase → Authentication → Sign In / Providers → GitHub.
3. **Vercel:** sign in with GitHub, import `yellapragada1996/autokolab`, root directory `apps/site`,
   add the env vars. (Or let me deploy with the Vercel CLI after you log it in.)
4. **Domain:** at your registrar for autokolab.com, add the DNS records Vercel shows (usually an A
   record for `autokolab.com` and a CNAME for `www`). Until it propagates we use the `*.vercel.app` URL.

I can't create accounts or enter credentials for you, so those sign-ups and pasting secrets are yours.

## Risks
- **DNS propagation** can take minutes to hours; the vercel.app URL works meanwhile.
- **OAuth callback mismatch** is the usual GitHub sign-in failure; I'll verify the exact URLs.
- **Shared project:** v1 and v2 live side by side until Phase 2; v2 tables avoid v1 names until then.
- **Supabase free tier pauses inactive projects** after about a week. Fine while building; for real
  use consider the Pro plan later.
- **Vercel Hobby is for non-commercial use.** Fine now; revisit before charging anyone.
- The repo is public: no keys in code. Env vars live in Vercel and `.env.local` only.

## Acceptance (I verify before calling it done)
- Sign in with GitHub on the deployed site → name/avatar/city shown in the room shell.
- Refresh keeps you signed in; sign out works.
- Profile RLS tests pass (you can't read or edit someone else's private fields).
- Layout checked at 1440 px and 375 px; keyboard focus visible; ⌘K opens the palette shell.

## Assumptions
- Vite SPA (not Next.js): fast, simple, matches the current code; server functions via Vercel `/api`.
- Dark theme only, per §11 (this replaces the earlier black-and-white look).
- Fonts from Google Fonts.
