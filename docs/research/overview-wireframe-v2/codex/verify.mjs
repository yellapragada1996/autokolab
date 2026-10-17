// Browser checks for the standalone study. Uses the repo's existing Playwright.
// Run from any directory: node docs/research/overview-wireframe-v2/codex/verify.mjs
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = new URL('./overview.html', import.meta.url);
const output = new URL('./', import.meta.url);
const states = ['busy', 'questions', 'stopped', 'calm', 'new', 'many', 'loading', 'failed'];
const themes = ['dark', 'light'];
const sizes = [['desktop', 1440, 960], ['phone', 390, 844]];
const failures = [];
const results = [];
const browser = await chromium.launch();

function watch(page) {
  page.on('pageerror', error => failures.push(error.message));
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => {
    if (!request.url().startsWith('file:')) failures.push(`Unexpected network request: ${request.url()}`);
  });
}

try {
  for (const theme of themes) for (const [frame, width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    watch(page);
    for (const state of states) {
      await page.goto(`${base}?frame=${frame}&state=${state}&theme=${theme}`);
      await page.evaluate(() => document.fonts.ready);
      const audit = await page.evaluate(() => {
        const visible = element => element.getClientRects().length > 0;
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = values => values.map(value => {
          const n = value / 255;
          return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        const ratio = (foreground, background) => {
          const a = luminance(rgb(foreground)), b = luminance(rgb(background));
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        const background = element => {
          for (let current = element; current; current = current.parentElement) {
            const color = getComputedStyle(current).backgroundColor;
            if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        const selectors = '.headline,.section-title,.agent-name,.activity,.status,.goal-name,.progress,.request-text,.action,.project,.nav-link,.page-label,.empty,.inline-link,.overflow-link,.avatar';
        const text = [...document.querySelectorAll(selectors)].filter(element => visible(element) && element.textContent.trim());
        const minTextContrast = Math.min(...text.map(element => ratio(getComputedStyle(element).color, background(element))));
        const dots = [...document.querySelectorAll('.dot')].filter(visible);
        const minDotContrast = dots.length ? Math.min(...dots.map(element => ratio(getComputedStyle(element).backgroundColor, background(element.parentElement)))) : null;
        const style = getComputedStyle(document.body);
        // Resolve the CSS variable before calculating a focus contrast ratio.
        const probe = document.createElement('span');
        probe.style.color = 'var(--focus-ring)';
        document.body.append(probe);
        const resolvedFocusContrast = ratio(getComputedStyle(probe).color, style.backgroundColor);
        probe.remove();
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          minTextSize: Math.min(...text.map(element => parseFloat(getComputedStyle(element).fontSize))),
          minTextContrast: +minTextContrast.toFixed(2),
          minDotContrast: minDotContrast === null ? null : +minDotContrast.toFixed(2),
          focusContrast: +resolvedFocusContrast.toFixed(2),
          minTargetHeight: Math.min(...[...document.querySelectorAll('main a,.bottom-nav a')].filter(visible).map(element => element.getBoundingClientRect().height)),
          agents: [...document.querySelectorAll('.agent-name')].map(element => element.textContent),
          goals: document.querySelectorAll('.goal').length,
          requests: document.querySelectorAll('.request').length,
          fontLoaded: [...document.fonts].some(font => font.family === 'Geist' && font.status === 'loaded'),
          forbiddenMotion: [...document.querySelectorAll('*')].some(element => getComputedStyle(element).animationName !== 'none')
        };
      });
      assert.equal(audit.scrollWidth, width, `${frame}/${state}/${theme}: horizontal overflow`);
      assert(audit.minTextSize >= 12, 'Text below 12px');
      assert(audit.minTextContrast >= 4.5, `Low text contrast: ${audit.minTextContrast}`);
      assert(audit.minDotContrast === null || audit.minDotContrast >= 3, 'Low status-dot contrast');
      assert(audit.focusContrast >= 3, 'Low focus-ring contrast');
      assert(audit.fontLoaded, 'Local Geist font did not load');
      assert(!audit.forbiddenMotion, 'Unexpected animation');
      if (frame === 'phone') assert(audit.minTargetHeight >= 44, 'Phone target below 44px');
      if (audit.agents.length) {
        assert.equal(audit.agents[0], 'Captain');
        assert.deepEqual(audit.agents.slice(1), [...audit.agents.slice(1)].sort((a, b) => a.localeCompare(b)));
      }
      if (state === 'questions') {
        assert.equal(audit.requests, 2);
        assert.match(await page.locator('.overflow-link').textContent(), /2 more in Captain/);
        assert.equal(await page.locator('.status').filter({ hasText: 'Waiting on you' }).count(), 1);
      }
      if (state === 'stopped') {
        assert.match(await page.locator('h1').textContent(), /Tern has stopped/);
        assert.match(await page.locator('.agent').filter({ hasText: 'Tern' }).textContent(), /Daily limit reached/);
      }
      if (state === 'calm' || state === 'new') {
        assert.equal(audit.goals, 0);
        assert.equal(audit.requests, 0);
        if (state === 'new') assert.equal(audit.agents.length, 0);
      }
      if (state === 'many') {
        assert(audit.agents.length >= 10);
        const names = page.locator('.agent-name');
        await names.last().scrollIntoViewIfNeeded();
        assert(await names.last().isVisible());
        if (frame === 'phone') {
          const lastAgent = await page.locator('.agent').last().boundingBox();
          const nav = await page.locator('.bottom-nav').boundingBox();
          assert(lastAgent.y + lastAgent.height <= nav.y, 'Last agent obscured by bottom navigation');
        }
      }
      if (state === 'loading' || state === 'failed') {
        assert.equal(audit.agents.length, 0);
        assert.equal(audit.goals, 0);
        assert(!/No agents are working/.test(await page.locator('main').textContent()));
      }
      if (state === 'failed') assert.equal(await page.locator('[role="alert"]').count(), 1);
      if (state === 'busy') {
        assert.equal(audit.agents.length, 4);
        if (frame === 'phone') {
          const lastGoal = await page.locator('.goal').last().boundingBox();
          const nav = await page.locator('.bottom-nav').boundingBox();
          assert(lastGoal.y + lastGoal.height <= nav.y, 'Busy goals obscured by bottom navigation');
        }
        await page.screenshot({ path: fileURLToPath(new URL(`busy-${width}-${theme}.png`, output)) });
      }
      if (state === 'questions' && theme === 'dark') {
        await page.screenshot({ path: fileURLToPath(new URL(`questions-${width}-dark.png`, output)) });
      }
      const bodyText = await page.locator('main').textContent();
      assert(!/Next from Captain|Delivered today|Updated just now|Free now|\d+%/.test(bodyText), 'Removed content returned');
      results.push({ frame, state, theme, ...audit });
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  watch(page);
  await page.goto(String(base));
  for (const theme of themes) for (const state of states) {
    await page.selectOption('#theme', theme);
    await page.selectOption('#state', state);
    for (const [frame, width] of sizes) {
      const preview = page.frameLocator(`#${frame}-frame`);
      await preview.locator('body').waitFor();
      await preview.locator(`html[data-theme="${theme}"] body[data-frame="${frame}"][data-state="${state}"]`).waitFor();
      await page.waitForFunction(({ frame, state, theme }) => {
        const source = document.querySelector(`#${frame}-frame`).src;
        return source.includes(`state=${state}&theme=${theme}`);
      }, { frame, state, theme });
      const headings = { loading: 'Loading your project…', failed: 'Couldn’t load your project.', new: 'Nothing has started yet.' };
      if (headings[state]) await preview.getByRole('heading', { name: headings[state], exact: true }).waitFor();
      assert.equal((await page.locator(`#${frame}-frame`).boundingBox()).width, width);
    }
  }
  // Actual keyboard entry, skip link, hover, press and visible focus.
  await page.goto(`${base}?frame=phone&state=busy&theme=dark`);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').textContent(), 'Skip to Overview');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('class'), 'agent ');
  assert.notEqual(await page.locator(':focus').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
  await page.locator('.agent').first().hover();
  await page.waitForTimeout(200);
  const hover = await page.locator('.agent').first().evaluate(element => getComputedStyle(element).backgroundColor);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const pressed = await page.locator('.agent').first().evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(hover, pressed);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.close();
  assert.deepEqual(failures, [], 'Browser errors or external requests');
  await writeFile(new URL('validation.json', output), JSON.stringify({
    views: results.length,
    synchronizedSelections: 16,
    keyboard: 'Skip link, main, first agent and visible focus passed',
    interactions: 'Hover and pressed surfaces differ',
    network: 'Local files only; no failed requests or page errors',
    results
  }, null, 2) + '\n');
  console.log(`Passed ${results.length} views, 16 synchronized selections, keyboard, hover and pressed states. Saved six screenshots and validation.json.`);
} finally {
  await browser.close();
}
