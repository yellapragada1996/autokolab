// Optional rendered check. No server or application environment is required.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = new URL('./', import.meta.url);
const report = { browser: false, inspected: [], screenshots: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ executablePath: '/usr/sbin/chromium', headless: true });
} catch (error) {
  report.errors.push(String(error.message).split('\n')[0]);
  const reason = String(error.message).split('\n').find(line => line.includes('[err]'));
  if (reason) report.errors.push(reason);
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
