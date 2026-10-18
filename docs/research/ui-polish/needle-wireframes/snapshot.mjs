// Build-time only. Render the existing demo to static markup without loading environment files.
// No React or application code runs when the finished HTML is opened.
import { rolldown } from 'rolldown';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const bundle = await rolldown({
  input: root + 'apps/site/src/workspace/demo.tsx',
  platform: 'node', external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  transform: { jsx: { runtime: 'automatic' }, define: { 'import.meta.env': '{}' } },
  plugins: [{ name: 'static-demo', transform(code, id) {
    if (id.endsWith('/demo.tsx')) return 'import { NewTicket } from "./NewTicket";\n' + code.replace(
      'return <Workspace project={project}',
      'if (location.searchParams.has("dialog")) return <NewTicket ws={ws} onClose={() => undefined} onCreated={() => undefined} />;\n  return <Workspace project={project}');
    if (id.endsWith('.css')) return { code: '', moduleType: 'js' };
    // These hooks normally receive these exact demo values after their first effect.
    // Seed the post-load state in memory; never edit application files.
    if (id.endsWith('/useCaptainRoom.ts')) return code
      .replace('useState<RoomData | null | undefined>(undefined)', 'useState<RoomData | null | undefined>(demo?.room)')
      .replace('useState<RoomMessage[]>([])', 'useState<RoomMessage[]>(demo?.messages ?? [])');
    if (id.endsWith('/TicketPage.tsx')) return code.replace(
      'useState<{ steps: Step[]; comments: Comment[]; events: TicketEvent[] } | null>(null)',
      'useState<{ steps: Step[]; comments: Comment[]; events: TicketEvent[] } | null>(listed ? ws.demoDetails?.get(listed.id) ?? null : null)');
  } }],
});
const { output } = await bundle.generate({ format: 'esm' });
const temp = here + '.snapshot-render.mjs';
writeFileSync(temp, output.find(x => x.type === 'chunk').code);
// Freeze the demo's relative times, and do not permit data requests during generation.
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-18T12:00:00Z'])); } static now() { return +new RealDate('2026-10-18T12:00:00Z'); } };
globalThis.fetch = () => { throw new Error('Static generation must not use the network'); };
globalThis.location = new URL('https://example.invalid/p/shop?preview=workspace');
globalThis.window = { addEventListener() {}, removeEventListener() {}, location, Notification: { permission: 'default' } };
globalThis.Notification = window.Notification;
globalThis.localStorage = { getItem: () => null };
try {
  const { default: Demo } = await import(temp);
  const paths = { captain: '', work: '/work', ticket: '/work/SH-2', team: '/people', room: '/room', decisions: '/decisions', guide: '/decisions?tab=guide', results: '/results', settings: '/settings' };
  const snapshots = {};
  for (const [key, path] of Object.entries(paths)) {
    globalThis.location = new URL('https://example.invalid/p/shop' + path);
    location.searchParams.set('preview', 'workspace');
    window.location = location;
    snapshots[key] = renderToStaticMarkup(React.createElement(Demo));
  }
  writeFileSync(here + 'snapshots.json', JSON.stringify(snapshots, null, 2) + '\n');
  const shared = {};
  for (const [key, path] of Object.entries({dialog: '?dialog=1', overview: '/overview'})) {
    globalThis.location = new URL('https://example.invalid/p/shop' + path);
    location.searchParams.set('preview', 'workspace');
    window.location = location;
    shared[key] = renderToStaticMarkup(React.createElement(Demo));
  }
  writeFileSync(here + 'shared-snapshots.json', JSON.stringify(shared, null, 2) + '\n');
  console.log('Rendered nine current demo views, the Overview top bar and the real New ticket dialog.');
} finally { unlinkSync(temp); }
