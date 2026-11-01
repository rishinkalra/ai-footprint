// Renders every extension screen with demo data, then composes the store images.
//   node store/render.js            -> store/screens/*.png and store/listing/*.png
//   node store/render.js popup      -> only shots whose name contains "popup"
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { demoState } = require('./seed');
const { mockChat } = require('./mock-chat');

const EXT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'screens');
const only = (process.argv[2] || '').startsWith('--') ? '' : (process.argv[2] || '');
// --locale=en-IN renders as a browser in that locale; output names get a suffix.
const localeArg = (process.argv.find(a => a.startsWith('--locale=')) || '').split('=')[1];
const LOCALE = localeArg || 'en-US';
const SUFFIX = localeArg ? '-' + localeArg.split('-').pop() : '';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'fp-render-')), {
    channel: 'chromium',
    locale: LOCALE,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${LOCALE}`]
  });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const url = p => `chrome-extension://${id}/src/${p}`;
  const setData = (state, settings) => worker.evaluate(([s, t]) => chrome.storage.local.set({ state: s, settings: t }), [state, settings]);
  const clearData = () => worker.evaluate(() => chrome.storage.local.clear());

  const now = Date.now();
  const demo = demoState(now, { days: 60 });
  const settings = { dailyGoalWh: 25, plans: [{ name: 'ChatGPT Plus', monthly: 20, currency: 'USD' }] };

  async function shot(name, page, opts = {}) {
    if (only && !name.includes(only)) return;
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name + SUFFIX + '.png'), fullPage: true, ...opts });
    console.log('wrote', name + SUFFIX);
  }
  async function open(p, { width = 380, height = 600, scheme = 'light' } = {}) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url(p));
    return page;
  }

  // in-page badge on light and dark chat pages
  const longHistory = [];
  for (let i = 0; i < 14; i++) longHistory.push(['user', 'Question ' + i + ' ' + 'x'.repeat(1200)], ['assistant', 'Answer ' + i + ' ' + 'y'.repeat(6000)]);
  const reply = 'Here is a short plan for the week. Monday: outline the report and gather the sales figures. Tuesday: draft sections one and two. Wednesday: review with the team and collect comments. Thursday: revise and add the charts. Friday: final read-through and send it to the board before noon.';
  const pages = {
    'https://chatgpt.com/c/demo-light': mockChat({ dark: false, roleAttr: 'chatgpt', history: [['user', 'Hi'], ['assistant', 'Hello! How can I help?']], prompt: 'Plan my week', reply, model: 'gpt-5-thinking' }),
    'https://claude.ai/chat/demo-dark': mockChat({ dark: true, roleAttr: 'claude', history: longHistory, prompt: 'Can you tighten the last section?', reply, model: '' })
  };
  await ctx.route(/https:\/\/(chatgpt\.com|claude\.ai)\/.*/, route => {
    const body = pages[route.request().url()];
    return body ? route.fulfill({ contentType: 'text/html', body }) : route.fulfill({ status: 404, body: '' });
  });
  async function chatShot(name, pageUrl, { hover = false, minimise = false } = {}) {
    if (only && !name.includes(only)) return;
    await setData(demo, settings);
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 680, height: 620 });
    await p.goto(pageUrl);
    await p.waitForSelector('ai-footprint-badge', { timeout: 20000 });
    await p.waitForTimeout(400);
    const box = await p.locator('ai-footprint-badge').boundingBox();
    if (hover) { await p.mouse.move(box.x + 60, box.y + box.height - 18); await p.waitForTimeout(250); }
    if (minimise) { await p.mouse.click(box.x + box.width - 18, box.y + box.height - 18); await p.waitForTimeout(250); }
    await shot(name, p, { fullPage: false });
    await p.close();
  }
  await chatShot('badge-light-tip', 'https://chatgpt.com/c/demo-light');
  await chatShot('badge-dark-tip', 'https://claude.ai/chat/demo-dark');
  await chatShot('badge-light-detail', 'https://chatgpt.com/c/demo-light', { hover: true });

  // popup
  await setData(demo, settings);
  for (const scheme of ['light', 'dark']) {
    for (const r of ['7d', '30d', 'today']) {
      const p = await open('popup.html', { scheme, height: 560 });
      await p.waitForSelector('.hero .headline');
      if (r !== '7d') await p.click(`#rangeSeg [data-range="${r}"]`);
      await shot(`popup-${r}-${scheme}`, p);
      await p.close();
    }
  }
  await clearData();
  await setData(undefined, { dailyGoalWh: 25 });
  {
    const p = await open('popup.html', { height: 500 });
    await p.waitForSelector('.empty');
    await shot('popup-empty-light', p);
    await p.close();
  }

  // settings
  await setData(demo, { ...settings, plans: [{ name: 'ChatGPT Plus', monthly: 20, currency: 'USD' }, { name: 'Gemini', monthly: 1950, currency: 'INR' }] });
  for (const scheme of ['light', 'dark']) {
    const p = await open('options.html', { scheme, width: 1280, height: 900 });
    await p.waitForSelector('#sites .app');
    await shot('settings-' + scheme, p);
    await p.close();
  }

  // share card
  await setData(demo, settings);
  for (const shape of ['wide', 'square']) {
    if (only && !('share-' + shape).includes(only)) continue;
    const p = await open('share.html', { width: 1280, height: 1000 });
    await p.waitForTimeout(500);
    if (shape === 'square') { await p.click('#shape [data-v="square"]'); await p.waitForTimeout(200); }
    const dataUrl = await p.evaluate(() => document.getElementById('card').toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, 'share-card-' + shape + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote share-card-' + shape);
    await shot('share-page', p);
    await p.close();
  }

  // welcome page
  await setData(undefined, {});
  for (const scheme of ['light', 'dark']) {
    const p = await open('welcome.html', { scheme, width: 1280, height: 800 });
    await p.waitForSelector('#goalEq:not(:empty)');
    await shot('welcome-' + scheme, p);
    await p.close();
  }

  // store listing images, composed from the screens above
  if (!only || 'listing'.includes(only) || only === 'listing') {
    const { slides, promo } = require('./listing');
    const LIST = path.join(__dirname, 'listing');
    fs.mkdirSync(LIST, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-listing-'));
    const page = await ctx.newPage();
    for (const [name, html] of slides) {
      const f = path.join(tmp, name + '.html');
      fs.writeFileSync(f, html);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('file://' + f);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(LIST, 'screenshot-' + name + '.png') });
      console.log('wrote listing', name);
    }
    const f = path.join(tmp, 'promo.html');
    fs.writeFileSync(f, promo);
    await page.setViewportSize({ width: 440, height: 280 });
    await page.goto('file://' + f);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(LIST, 'promo-tile-440x280.png') });
    console.log('wrote listing promo');
    await page.close();
  }

  await ctx.close();
}

main().catch(e => { console.error(e); process.exit(1); });
