// Server function scaffold (Vercel). Later phases add pairing, invites and push here; they use the
// Supabase service key, which exists only in Vercel's environment, never in the browser or repo.

export default function handler(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(200).json({
    ok: true,
    service: "autokolab",
    backend: !!process.env.VITE_SUPABASE_URL,
    serverKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
