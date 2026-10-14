import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoKolab, SIGN_IN_LOST } from "../src/core/client.js";
import { formatToken } from "../src/core/token.js";

// AK-101: agents lost their AutoKolab tools about once an hour. A fake Supabase (auth + tables)
// behind the real supabase-js client shows why and checks that the client heals itself.

const URL_ = "https://example.supabase.co";
const KEY = "anon-key";
const MEMBER = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const TOKEN = formatToken(MEMBER, "s".repeat(43));
const HOUR = 3600_000;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeSupabase() {
  const s = {
    signIns: 0,
    /** Live refresh tokens: a global sign-out clears them all, as Supabase does. */
    live: new Set<string>(),
    sessionOf: new Map<string, string>(),
    passwordWorks: true,
    inProject: true,
  };
  let n = 0;
  const session = () => {
    n++;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: MEMBER, role: "authenticated", exp, n })}.x`;
    const refresh = `refresh-${n}`;
    s.live.add(refresh);
    s.sessionOf.set(access, refresh);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: { id: MEMBER, aud: "authenticated", role: "authenticated" } };
  };
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const bearer = (headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname === "/auth/v1/token") {
      if (u.searchParams.get("grant_type") === "password") {
        if (!s.passwordWorks) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        s.signIns++;
        return json(200, session());
      }
      if (!s.live.delete(body.refresh_token)) {
        return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      }
      return json(200, session());
    }
    if (u.pathname === "/auth/v1/logout") {
      if (u.searchParams.get("scope") === "global") s.live.clear();
      else s.live.delete(s.sessionOf.get(bearer) ?? "");
      return json(204, null);
    }
    // PostgREST: the anon key has no grants on members; RLS hides every other row from it.
    const signedIn = bearer !== KEY;
    if (signedIn) {
      const exp = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).exp as number;
      if (exp * 1000 <= Date.now()) return json(401, { code: "PGRST303", message: "JWT expired" });
    }
    const table = u.pathname.replace("/rest/v1/", "");
    const me = { id: MEMBER, name: "ana-claude", kind: "agent", revoked: false, paused: false };
    if (table === "members") {
      if (!signedIn) return json(403, { code: "42501", message: "permission denied for table members" });
      return headers.get("accept")?.includes("vnd.pgrst.object") ? json(200, me) : json(200, [me]);
    }
    if (table === "projects") return json(200, signedIn && s.inProject ? [{ id: "p1" }] : []);
    if (table === "rpc/heartbeat") return signedIn ? json(200, me) : json(403, { code: "42501", message: "permission denied for function heartbeat" });
    return json(200, []);
  };
  return { s, fetchFn };
}

/** A tool call: the project for this agent, or the message the MCP server gives when there's none. */
async function projectCall(ak: AutoKolab): Promise<string> {
  const { data, error } = await ak.sb.from("projects").select("*");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("You aren't in an AutoKolab project yet. Its owner adds agents at autokolab.com (People).");
  return "in project";
}

async function membersCall(ak: AutoKolab): Promise<number> {
  const { data, error } = await ak.sb.from("members").select("*");
  if (error) throw new Error(error.message);
  return data.length;
}

describe("AK-101: the agent's sign-in survives the hour", () => {
  let fake: ReturnType<typeof fakeSupabase>;
  const connect = () => AutoKolab.connect({ url: URL_, anonKey: KEY, token: TOKEN });
  const anHourLater = () => vi.setSystemTime(Date.now() + 2 * HOUR);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fake = fakeSupabase();
    vi.stubGlobal("fetch", fake.fetchFn);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reproduces the cause: a global sign-out elsewhere leaves this client signed out once its token runs out", async () => {
    const tools = await connect();
    const other = await connect();
    await other.sb.auth.signOut(); // what close() did: supabase-js signs out globally by default
    anHourLater();
    // Without healing: the refresh is refused, the session is dropped, requests go out as anon.
    await expect(membersCall(tools)).rejects.toThrow(/permission denied for table members/);
    await expect(projectCall(tools)).rejects.toThrow(/aren't in an AutoKolab project/);
  });

  it("close() ends only its own session, so the agent's other connections keep refreshing", async () => {
    const tools = await connect();
    const cli = await connect();
    await cli.close();
    anHourLater();
    await expect(membersCall(tools)).resolves.toBe(1);
    expect(fake.s.signIns).toBe(2);
  });

  it("a call that hits an expired session signs in again once and succeeds", async () => {
    const tools = await connect();
    fake.s.live.clear();
    anHourLater();
    await expect(tools.withSession(() => membersCall(tools))).resolves.toBe(1);
    await expect(tools.withSession(() => projectCall(tools))).resolves.toBe("in project");
    expect(fake.s.signIns).toBe(2);
  });

  it("retries once when the call itself is refused for an expired token", async () => {
    const tools = await connect();
    let calls = 0;
    const call = () => (++calls === 1 ? Promise.reject(new Error("JWT expired")) : membersCall(tools));
    await expect(tools.withSession(call)).resolves.toBe(1);
    expect(calls).toBe(2);
    expect(fake.s.signIns).toBe(2);
  });

  it("several calls failing together trigger a single sign-in", async () => {
    const tools = await connect();
    fake.s.live.clear();
    anHourLater();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => tools.withSession(() => membersCall(tools))));
    expect(results).toEqual([1, 1, 1, 1, 1]);
    expect(fake.s.signIns).toBe(2);
  });

  it("a removed token gives the plain message and doesn't loop", async () => {
    const tools = await connect();
    fake.s.live.clear();
    fake.s.passwordWorks = false;
    anHourLater();
    let calls = 0;
    await expect(tools.withSession(() => (calls++, membersCall(tools)))).rejects.toThrow(SIGN_IN_LOST);
    expect(calls).toBe(0);
    expect(fake.s.signIns).toBe(1);
  });

  it("a removed token found by a refused call gives the plain message after one try", async () => {
    const tools = await connect();
    fake.s.passwordWorks = false;
    let calls = 0;
    const call = () => (calls++, Promise.reject(new Error("JWT expired")));
    await expect(tools.withSession(call)).rejects.toThrow(SIGN_IN_LOST);
    expect(calls).toBe(1);
  });

  it("an agent that really is in no project still gets that message", async () => {
    const tools = await connect();
    fake.s.inProject = false;
    await expect(tools.withSession(() => projectCall(tools))).rejects.toThrow(/aren't in an AutoKolab project/);
    expect(fake.s.signIns).toBe(1);
  });

  it("other errors pass straight through without a sign-in", async () => {
    const tools = await connect();
    let calls = 0;
    const call = () => {
      calls++;
      return Promise.reject(new Error("No ticket AK-999."));
    };
    await expect(tools.withSession(call)).rejects.toThrow("No ticket AK-999.");
    expect(calls).toBe(1);
    expect(fake.s.signIns).toBe(1);
  });
});
