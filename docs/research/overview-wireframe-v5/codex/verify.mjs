// Run from any directory: node docs/research/overview-wireframe-v5/codex/verify.mjs
// Compare the independently written components to the reference's rendered output.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ours = readFileSync(new URL('./overview.html',import.meta.url),'utf8');
const reference = readFileSync(new URL('../claude/overview.html',import.meta.url),'utf8');
const fixtures = JSON.parse(ours.match(/<script id="story" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const source = ours.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1];
new vm.Script(source); // Include browser wiring in the syntax check.
const own = vm.createContext({document:{getElementById:() => ({textContent:JSON.stringify(fixtures)})}});
vm.runInContext(source.split('// Browser wiring.')[0],own);
const ref = vm.createContext({});
vm.runInContext(reference.slice(reference.indexOf('    const TABS'),reference.indexOf('    const params =')),ref);
const evaluate = (context,expression) => vm.runInContext(expression,context);
const decode = value => value.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const classElements = (html,className,tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`,'g'))].map(match => decode(match[1]));
const destinations = (html,attribute) => [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`,'g'))].map(match => decode(match[1]));
const ids = fixtures.situations.map(scene => scene.id);
assert.equal(ids.length,29);
assert.equal(new Set(ids).size,29);
assert.equal(new Set(fixtures.situations.map(scene => scene.n.replace(/[a-z]/g,''))).size,26);
assert.deepEqual(fixtures,JSON.parse(evaluate(ref,'JSON.stringify({situations:SITS,groups:GROUPS,longNames:LONG,project:PROJECT,owner:OWNER,keys:Object.fromEntries(KEYS)})')));
let renders=0;
for (const id of ids) {
  evaluate(own,`globalThis.scene = situations.find(item => item.id === '${id}')`);
  evaluate(ref,`globalThis.scene = SIT['${id}']; begin(scene)`);
  assert.deepEqual(JSON.parse(evaluate(own,'JSON.stringify(headingSentences(scene).map(line => line.text))')),JSON.parse(evaluate(ref,'JSON.stringify(headline(scene))')).map(decode),`${id}: heading sentences`);
  assert.equal(evaluate(own,'hiddenParts(scene)'),evaluate(ref,'hiddenList(scene)'),`${id}: hidden parts`);
  assert.equal(decode(evaluate(own,'linkDestinations(scene)')),decode(evaluate(ref,'pathSummary(scene)')),`${id}: link captions`);
  for (const layout of ['cards','rows']) for (const review of [false,true]) for (const kind of ['desktop','phone']) {
    evaluate(ref,`review=${review}`);
    const actual=evaluate(own,`Overview(scene,{layout:'${layout}',review:${review}},'${kind}')`);
    const expected=evaluate(ref,`overview(scene,'${layout}')`);
    const label=`${id}, ${layout}, review ${review}, ${kind}`;
    assert.deepEqual(destinations(actual,'data-destination'),destinations(expected,'data-go'),`${label}: destinations and order`);
    for (const [newClass,oldClass,tag] of [['agent-name','a-name','span'],['agent-state','a-state','span'],['agent-doing','a-doing','span'],['ticket-title','t-title','span'],['ticket-meta','t-meta','span'],['request-question','need-q','span'],['request-meta','need-meta','span'],['request-action','need-act','span'],['goal-empty','card-empty','p']]) {
      assert.deepEqual(classElements(actual,newClass,tag),classElements(expected,oldClass,tag),`${label}: ${newClass}`);
    }
    assert.deepEqual([...actual.matchAll(/aria-expanded="(true|false)"/g)].map(x=>x[1]),[...expected.matchAll(/aria-expanded="(true|false)"/g)].map(x=>x[1]),`${label}: review expansion`);
    assert.equal((actual.match(/class="step-tick(?: |")/g)||[]).length,(expected.match(/class="tick(?: |")/g)||[]).length,`${label}: step ticks`);
    if (!sceneMissingGoals(id)) {
      const goalCounts=evaluate(own,'scene.goals.map(goal => progressCounts(scene,goal).map(entry=>[entry.kind,entry.word,entry.count]))');
      const referenceCounts=evaluate(ref,'begin(scene); scene.goals.map(tally)');
      assert.equal(JSON.stringify(goalCounts),JSON.stringify(referenceCounts),`${label}: progress words`);
    }
    renders++;
  }
}
function sceneMissingGoals(id) { return ['d24a','d24b'].includes(id); }
const gallery=evaluate(own,"Gallery({layout:'cards',review:false,width:1440})");
assert.equal((gallery.match(/class="situation"/g)||[]).length,29);
assert.equal((gallery.match(/class="device device-/g)||[]).length,58);
const allIds=[...gallery.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(allIds.length,new Set(allIds).size,'All frame, heading and ticket-list IDs are unique');
for (const match of gallery.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(allIds.includes(match[1]),`Review button owns ${match[1]}`);
assert.equal((evaluate(own,'HeadingTable()').match(/<tr>/g)||[]).length,29);
assert.equal((evaluate(own,'Contents()').match(/href="#sit-/g)||[]).length,29);
for (const asset of ['autokolab-logo.svg','autokolab-croc.svg']) assert.equal(readFileSync(new URL('./'+asset,import.meta.url),'utf8'),readFileSync(new URL('../claude/'+asset,import.meta.url),'utf8'));
assert.ok(!/<script\b[^>]*src=|fetch\(|XMLHttpRequest/.test(ours),'No runtime script or data dependency');
console.log(`Passed: 29 situations, 58 frames, ${renders} component renders against Claude, all headings/copy/destinations/progress states, unique IDs, assets and JavaScript syntax.`);
console.log('This verifies rendered markup and sample data; it does not verify browser layout or interactions.');
