// Offline fixture checks always run. Browser checks additionally measure actual
// layout, contrast and keyboard behaviour; use --static when Chromium cannot run.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';
import postcss from 'postcss';

const base = new URL('./overview.html', import.meta.url);
const html = await readFile(base, 'utf8');
const css = await readFile(new URL('./overview.css', base), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const states = ['busy', 'questions', 'stopped', 'calm', 'new', 'many', 'loading', 'failed'];
const themes = ['dark', 'light'];
const layouts = ['cards', 'rows'];
const sizes = [['desktop', 1440, 960], ['phone', 390, 844]];
const report = { staticViews: 0, controlCombinations: 0, browser: 'not run' };
const expectedAgents = { busy: 4, questions: 4, stopped: 5, calm: 4, new: 0, many: 13, loading: 0, failed: 0 };
const textOnly = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function render(query) {
  const params = new URLSearchParams(query);
  let markup = '';
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'state' ? params.get('state') || 'busy' : params.get('theme') || 'dark',
      listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
    });
    return elements.get(id);
  };
  const buttons = layouts.map(layout => ({
    dataset: { layout }, listeners: {}, attributes: {},
    addEventListener(event, callback) { this.listeners[event] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
  }));
  const document = {
    body: { dataset: {}, insertAdjacentHTML(position, value) { markup += value; } },
    documentElement: { dataset: {} }, getElementById: element, querySelectorAll: () => buttons,
  };
  vm.runInNewContext(script, { document, location: { search: query }, URLSearchParams });
  return { markup, document, element, buttons };
}

function balancedMarkup(markup) {
  const stack = [];
  const voids = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
  for (const match of markup.matchAll(/<(\/)?([a-z][\w-]*)(?:\s[^>]*?)?>/gi)) {
    const [, closing, tag] = match;
    if (closing) assert.equal(stack.pop(), tag, `Unbalanced ${tag}`);
    else if (!voids.has(tag)) stack.push(tag);
  }
  assert.deepEqual(stack, []);
}

for (const layout of layouts) for (const theme of themes) for (const [frame] of sizes) for (const state of states) {
  const { markup } = render(`?frame=${frame}&state=${state}&theme=${theme}&layout=${layout}`);
  balancedMarkup(markup);
  const main = markup.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const heading = textOnly(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]);
  assert.equal([...main.matchAll(/class="agent-name"/g)].length, expectedAgents[state]);
  assert.equal([...markup.matchAll(/aria-current="page"/g)].length, 2);
  assert.equal([...markup.matchAll(/class="nav-link"/g)].length, 16);
  const bars = [...main.matchAll(/role="progressbar"[^>]*aria-valuemax="(\d+)" aria-valuenow="(\d+)"[^>]*><span class="progress-fill" style="width:([\d.]+)%"><\/span><\/span><span class="progress">(\d+) of (\d+) done/g)];
  assert.equal(bars.length, ['calm', 'new', 'loading', 'failed'].includes(state) ? 0 : state === 'many' ? 4 : 2);
  for (const [, total, done, width, labelDone, labelTotal] of bars) {
    assert.equal(done, labelDone);
    assert.equal(total, labelTotal);
    assert.equal(Number(width), 100 * Number(done) / Number(total));
  }
  if (state === 'busy') assert.equal(heading, '3 agents are working on Checkout and Sign-in.');
  if (state === 'stopped') assert.equal(heading, '2 agents are working on Checkout. Tern has stopped.');
  if (state === 'many') assert.match(heading, /Kestrel has stopped\.$/);
  if (state === 'questions') {
    assert.equal([...main.matchAll(/class="request"/g)].length, 2);
    assert.match(main, /2 more in Captain/);
    assert(main.indexOf('Needs you') < main.indexOf('<h1'));
  }
  if (state === 'failed') {
    assert.match(main, /role="alert"/);
    assert(main.includes(`?frame=${frame}&state=busy&theme=${theme}&layout=${layout}`));
  }
  if (['new', 'calm'].includes(state)) assert.match(main, /class="quiet-croc"/);
  assert(!/Next from Captain|Delivered today|Updated just now|Free now|\d+%/.test(textOnly(main)));
  report.staticViews++;
}

for (const theme of themes) for (const state of states) {
  const view = render(`?state=${state}&theme=${theme}`);
  balancedMarkup(view.markup);
  for (const button of view.buttons) {
    button.listeners.click();
    for (const [frame] of sizes) {
      assert.equal(view.element(`${frame}-frame`).src, `./overview.html?frame=${frame}&state=${state}&theme=${theme}&layout=${button.dataset.layout}`);
      assert.equal(view.element(`${frame}-open`).href, view.element(`${frame}-frame`).src);
    }
    assert.equal(button.attributes['aria-pressed'], 'true');
    report.controlCombinations++;
  }
}
for (const source of [css, html.match(/<style>([\s\S]*?)<\/style>/)[1]]) {
  postcss.parse(source).walkDecls(declaration => {
    if (!declaration.prop.startsWith('--')) assert(!/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i.test(declaration.value), `Hard-coded component colour: ${declaration}`);
  });
}
for (const asset of ['autokolab-logo.svg', 'autokolab-croc.svg', 'geist-latin.ttf', 'OFL.txt']) {
  assert((await readFile(new URL(asset, base))).length > 0);
}
assert.match(css, /prefers-reduced-motion: reduce/);
// Palette checks can run without claiming anything about rendered geometry.
const palettes = { dark: {}, light: {} };
for (const source of [html.match(/<style>([\s\S]*?)<\/style>/)[1], css]) {
  postcss.parse(source).walkRules(rule => {
    if (![':root', '[data-theme="light"]'].includes(rule.selector)) return;
    rule.walkDecls(declaration => {
      if (!declaration.prop.startsWith('--')) return;
      if (rule.selector === ':root') palettes.dark[declaration.prop] = declaration.value;
      else palettes.light[declaration.prop] = declaration.value;
    });
  });
}
const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(value => {
  const n = parseInt(value, 16) / 255;
  return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
}).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
report.palette = {};
for (const theme of themes) {
  const palette = { ...palettes.dark, ...(theme === 'light' ? palettes.light : {}) };
  const resolve = name => palette[name].startsWith('var(') ? resolve(palette[name].slice(4, -1)) : palette[name];
  const ratio = (a, b) => {
    a = luminance(resolve(a)); b = luminance(resolve(b));
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  const minText = Math.min(...['--text', '--text-secondary', '--text-muted', '--text-dim'].flatMap(foreground => ['--bg', '--surface', '--surface-hover'].map(background => ratio(foreground, background))), ratio('--avatar-fg', '--avatar-bg'));
  const minStatus = Math.min(...['--blue', '--amber', '--coral'].flatMap(foreground => ['--bg', '--surface-hover'].map(background => ratio(foreground, background))));
  const progress = ratio('--green', '--track');
  const focus = ratio('--focus-ring', '--bg');
  assert(minText >= 4.5 && minStatus >= 3 && progress >= 3 && focus >= 3, `Palette contrast: ${theme}`);
  report.palette[theme] = { minText: +minText.toFixed(2), minStatus: +minStatus.toFixed(2), progress: +progress.toFixed(2), focus: +focus.toFixed(2) };
}
console.log(`Static checks passed: ${report.staticViews} fixture views; ${report.controlCombinations} control combinations. These do not measure rendered layout.`);

let browser;
if (!process.argv.includes('--static')) {
  try { browser = await chromium.launch(); }
  catch (error) {
    report.browser = 'blocked: Chromium cannot start in this environment';
    report.browserReason = error.message.split('\n').filter(line => /FATAL|Operation not permitted/.test(line))[0] || error.message.split('\n')[0];
    console.log(report.browser, report.browserReason);
    process.exitCode = 2;
  }
}
if (browser) {
  const errors = [];
  const views = [];
  try {
    for (const layout of layouts) for (const theme of themes) for (const [frame, width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => errors.push(request.url()));
      page.on('request', request => { if (!request.url().startsWith('file:')) errors.push(`External: ${request.url()}`); });
      for (const state of states) {
        await page.goto(`${base}?frame=${frame}&state=${state}&theme=${theme}&layout=${layout}`);
        await page.evaluate(() => document.fonts.ready);
        const audit = await page.evaluate(() => {
          const visible = element => element.getClientRects().length > 0;
          const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
          const luminance = value => rgb(value).map(n => {
            n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
          }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
          const contrast = (a, b) => { a = luminance(a); b = luminance(b); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
          const background = element => {
            for (let current = element; current; current = current.parentElement) {
              const value = getComputedStyle(current).backgroundColor;
              if (!['rgba(0, 0, 0, 0)', 'transparent'].includes(value)) return value;
            }
            return getComputedStyle(document.body).backgroundColor;
          };
          const text = [...document.querySelectorAll('.headline,.headline-context,.stop-clause,.section-title,.agent-name,.activity,.status,.goal-name,.progress,.request-text,.action,.nav-link,.empty,.inline-link,.overflow-link,.avatar')].filter(visible);
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            minTextSize: Math.min(...text.map(element => parseFloat(getComputedStyle(element).fontSize))),
            minContrast: Math.min(...text.map(element => contrast(getComputedStyle(element).color, background(element)))),
            minTarget: Math.min(...[...document.querySelectorAll('main a,.bottom-nav a')].filter(visible).map(element => element.getBoundingClientRect().height)),
            motion: [...document.querySelectorAll('*')].some(element => ['','::after'].some(pseudo => getComputedStyle(element, pseudo || null).animationName !== 'none')),
            bars: [...document.querySelectorAll('.progress-track')].map(track => ({ actual: track.firstElementChild.getBoundingClientRect().width / track.getBoundingClientRect().width, expected: Number(track.getAttribute('aria-valuenow')) / Number(track.getAttribute('aria-valuemax')) })),
          };
        });
        assert(!audit.overflow, `${frame}/${layout}/${state}/${theme}: horizontal overflow`);
        assert(audit.minTextSize >= 12);
        assert(audit.minContrast >= 4.5, `Text contrast ${audit.minContrast}`);
        if (frame === 'phone') assert(audit.minTarget >= 44);
        assert(!audit.motion, 'Motion under reduced-motion preference');
        audit.bars.forEach(bar => assert(Math.abs(bar.actual - bar.expected) < .01));
        if (state === 'busy' || ['questions', 'calm', 'many', 'new', 'stopped'].includes(state) && theme === 'dark' && layout === 'cards') {
          const prefix = layout === 'cards' ? state : `${state}-rows`;
          await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-${width}-${theme}.png`, base)) });
        }
        if (frame === 'phone' && expectedAgents[state]) {
          const lastRow = page.locator('.goal,.agent').last();
          await lastRow.scrollIntoViewIfNeeded();
          const row = await lastRow.boundingBox(), nav = await page.locator('.bottom-nav').boundingBox();
          assert(row.y + row.height <= nav.y, 'Final row obscured by fixed nav');
        }
        views.push({ state, frame, theme, layout, ...audit });
      }
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(String(base));
    for (const layout of layouts) for (const theme of themes) for (const state of states) {
      await page.getByRole('button', { name: layout === 'cards' ? 'Cards' : 'Rows', exact: true }).click();
      await page.selectOption('#theme', theme);
      await page.selectOption('#state', state);
      for (const [frame] of sizes) await page.frameLocator(`#${frame}-frame`).locator(`html[data-theme="${theme}"] body[data-state="${state}"][data-layout="${layout}"]`).waitFor();
    }
    await page.goto(`${base}?frame=phone`);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Skip to Overview');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
    await page.keyboard.press('Tab');
    assert.match(await page.locator(':focus').getAttribute('class'), /^agent/);
    assert.notEqual(await page.locator(':focus').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    assert.equal(await page.locator('.dot.live').first().evaluate(element => getComputedStyle(element, '::after').animationName), 'presence');
    await page.close();
    assert.deepEqual(errors, []);
    report.browser = 'passed';
    report.views = views;
    console.log(`Browser checks passed: ${views.length} views, 32 synchronized choices and keyboard navigation.`);
  } finally { await browser.close(); }
}
await writeFile(new URL('./validation.json', base), JSON.stringify(report, null, 2) + '\n');
