import { beforeEach, describe, expect, it, vi } from "vitest";

// What reading the usage table answers (AK-93): a missing table is "no runs yet"; any other error,
// a permission error naming the table too, is an error the Results page shows.

let answer: { data: unknown; error: { message: string; code?: string } | null };
vi.mock("./session", () => {
  const query = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, name) => (name === "then" ? (ok: (v: unknown) => unknown) => Promise.resolve(answer).then(ok) : () => query()),
      },
    );
  return { supabase: { from: () => query() } };
});

const { usageBetween } = await import("./data");
const read = () => usageBetween("p1", new Date("2026-10-01T00:00:00Z"), new Date("2026-10-11T00:00:00Z"));

describe("usageBetween", () => {
  beforeEach(() => {
    answer = { data: [], error: null };
  });

  it("reads a missing table as no runs", async () => {
    answer = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.run_usage' in the schema cache" } };
    expect(await read()).toEqual([]);
    answer = { data: null, error: { code: "42P01", message: 'relation "public.run_usage" does not exist' } };
    expect(await read()).toEqual([]);
  });

  it("shows a permission error, even one that names the table", async () => {
    answer = { data: null, error: { code: "42501", message: "permission denied for table run_usage" } };
    // Preserve the original diagnostic until the UI can log and format it.
    await expect(read()).rejects.toMatchObject(answer.error!);
  });

  it("shows an error that comes without a code", async () => {
    answer = { data: null, error: { code: "", message: "TypeError: fetch failed" } };
    await expect(read()).rejects.toMatchObject(answer.error!);
  });
});
