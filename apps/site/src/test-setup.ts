// The logic under test imports modules written for the browser. Give them the two things they read
// when they load: a WebSocket to exist (the Supabase client; Node 22 has one, Node 20 doesn't) and
// the page's address. No test opens a connection.
if (!("WebSocket" in globalThis)) Object.assign(globalThis, { WebSocket: class {} });
if (!("location" in globalThis)) Object.assign(globalThis, { location: new URL("http://localhost:5173/") });
