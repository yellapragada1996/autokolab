// Optional rendered check. No server or application environment is required.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = new URL('./', import.meta.url);
const report = { browser: false, attempts: [], inspected: [], screenshots: [], errors: [] };
let browser;
const browserEnv = { ...process.env };
delete browserEnv.CHROME_CRASHPAD_PIPE_NAME;
const launches = [
  { name: 'System Chromium, crashpad pipe unset', options: { executablePath: '/usr/sbin/chromium' } },
  { name: 'System Chromium, no sandbox, crash reporting disabled, new headless', options: {
    executablePath: '/usr/sbin/chromium',
    args: ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter', '--headless=new'],
  } },
  { name: 'Playwright bundled headless Chromium', options: {} },
  { name: 'Playwright bundled full Chromium, new headless', options: { channel: 'chromium' } },
];
for (const launch of launches) {
  try {
    browser = await chromium.launch({ headless: true, timeout: 10000, env: browserEnv, ...launch.options });
    report.attempts.push({ name: launch.name, started: true });
    break;
  } catch (error) {
    const lines = String(error.message).split('\n');
    const reasons = [...new Set(lines.filter(line => line.includes('[err]') || line.includes('signal=')).map(line => line.replace(/\u001b\[[0-9;]*m/g, '').trim()))];
    report.attempts.push({ name: launch.name, started: false, errors: [lines[0], ...reasons] });
    console.log(`${launch.name}: could not start.`);
  }
}
if (!browser) {
  report.errors.push('All four browser launch attempts failed. Layout, wrapping, targets, focus, themes and side-by-side rendering remain unverified.');
  await writeFile(new URL('browser-check.json', here), JSON.stringify(report, null, 2) + '\n');
  console.log('Browser could not start. See browser-check.json; no screenshots or rendered checks were produced.');
  process.exitCode = 2;
}
if (browser) {
  report.browser = true;
  const shots = new Set(['shell', 'overview', 'work', 'captain']);
  const keys = ['shell','captain','overview','work','ticket','team','room','decisions','guide','results','settings'];
  await mkdir(new URL('screenshots/', here), { recursive: true });
  try {
    for (const theme of ['dark', 'light']) for (const key of keys) for (const width of (key === 'shell' ? [1440, 1024, 390, 320] : [1440, 390])) {
      const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 960 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL('index.html', here);
      url.search = new URLSearchParams({ shot: key, width: String(width), theme }).toString();
      await page.goto(url.href);
      await page.evaluate(() => document.fonts.ready);
      const frame = page.locator(`#${key} .frame-wrap:not(.compare-width)[data-size="${width}"] > .device`);
      const checks = await frame.evaluate(el => {
        const nav = [...el.querySelectorAll('.shell-pages a')];
        const screen = el.querySelector('.screen');
        const tooSmall = [...el.querySelectorAll('button,input:not([type=hidden]),textarea,select,.shell-pages a')].filter(e => {
          const style = getComputedStyle(e), r = e.getBoundingClientRect();
          if (!r.width || !r.height || style.visibility === 'hidden' || style.opacity === '0') return false;
          return r.height < 43.5;
        }).map(e => e.getAttribute('aria-label') || e.textContent.trim());
        return { nav: nav.map(a => a.childNodes[0].textContent), width: el.getBoundingClientRect().width, overflow: !!screen && screen.scrollWidth > screen.clientWidth + 1, tooSmall };
      });
      if (checks.nav.join('|') !== 'Captain|Overview|Work|Team|Room|Decisions|Results|Settings|Guide') errors.push('Navigation mismatch');
      if (Math.abs(checks.width - width) > 1) errors.push('Frame width mismatch');
      if (checks.overflow) errors.push('App screen overflows horizontally');
      if (width < 500 && checks.tooSmall.length) errors.push('Phone targets below 44px: ' + checks.tooSmall.join(', '));
      report.inspected.push({ key, width, theme, errors });
      report.errors.push(...errors.map(e => `${key}/${theme}/${width}: ${e}`));
      if (shots.has(key) && [1440, 390].includes(width)) {
        const path = new URL(`screenshots/${key}-${theme}-${width}.png`, here);
        await frame.screenshot({ path: fileURLToPath(path) });
        report.screenshots.push(path.pathname.split('/').at(-1));
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await writeFile(new URL('browser-check.json', here), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.inspected.length} rendered frames; ${report.screenshots.length} screenshots; ${report.errors.length} failures.`);
  process.exitCode = report.errors.length ? 1 : 0;
}
