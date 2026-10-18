// Preserve the approved v5 component output and geometry; only its palette is remapped.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const original = readFileSync(new URL('../../overview-wireframe-v5/codex/overview.html', import.meta.url), 'utf8');
const fixtures = JSON.parse(original.match(/<script id="story" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const source = original.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ document: { getElementById: () => ({ textContent: JSON.stringify(fixtures) }) } });
vm.runInContext(source.split('// Browser wiring.')[0], context);
const frames = {};
for (const [name, scene] of Object.entries({ overview: 'a1', loading: 'd24a', error: 'd24b', calm: 'c16' })) {
  frames[name] = vm.runInContext(`Overview(situations.find(s => s.id === '${scene}'), {layout:'cards',review:false}, '${name}')`, context);
}
writeFileSync(new URL('./overview-snapshots.json', import.meta.url), JSON.stringify(frames, null, 2) + '\n');
const start = original.indexOf('/* Overview pieces:');
const end = original.indexOf('body.reduce-motion', start);
let css = original.slice(start, end);
css = css.replace(/box-shadow:0 8px 24px rgba\(0,0,0,.25\)/g, 'box-shadow:var(--shadow-menu)');
// Preserve the informative striped status pattern without gradients.
css = css.replace(/background:repeating-linear-gradient\(-45deg,var\(--blue-a\) 0 3px,var\(--blue-b\) 3px 6px\)/g, 'background:var(--live-fill); background-image:var(--live-pattern)');
css = css.replace(/background:repeating-linear-gradient\(-45deg,var\(--amber-a\) 0 3px,var\(--amber-b\) 3px 6px\)/g, 'background:var(--needs-fill); background-image:var(--needs-pattern)');
css = css.replace(/mask:linear-gradient\([^;]+\)/g, 'clip-path:polygon(0 0,calc(50% - 1.5px) 0,calc(50% - 1.5px) 100%,calc(50% + 1.5px) 100%,calc(50% + 1.5px) 0,100% 0,100% 100%,0 100%)');
writeFileSync(new URL('./overview.css', import.meta.url), css);
console.log('Preserved Overview v5 A1, loading, error and calm specimens.');
