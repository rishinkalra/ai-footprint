const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
let n = 0;
async function load(page, html) { const f = path.join(require('os').tmpdir(), 'brand-' + (n++) + '.html'); fs.writeFileSync(f, html); await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150); }
// Renders brand/logo-light.png, logo-dark.png and social-preview.png.
//   node brand/render.js
const R = path.join(__dirname, '..');
const F = 'file://' + R + '/extension/fonts';
const font = `@font-face{font-family:D;src:url(${F}/bricolage-latin.woff2);font-weight:200 800}@font-face{font-family:B;src:url(${F}/figtree-latin.woff2);font-weight:300 900}`;
const mark = (leaf, bolt, s) => `<svg viewBox="0 0 64 64" width="${s}" height="${s}"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="${leaf}"/><path d="M37 17 22 38h10l-4 13 16-22H33l6-12Z" fill="${bolt}"/></svg>`;
const wordmark = (ink, leaf, bolt) => `<html><head><style>${font}html,body{margin:0;background:transparent}
.w{display:inline-flex;align-items:center;gap:18px;padding:8px 6px;font:700 64px/1 D,system-ui,sans-serif;letter-spacing:-.02em;color:${ink}}</style></head>
<body><div class="w">${mark(leaf, bolt, 72)}AI Footprint</div></body></html>`;
const social = `<html><head><style>${font}html,body{margin:0}body{width:1280px;height:640px;background:#f3f5f0;font-family:B,system-ui,sans-serif;color:#14211a;position:relative;overflow:hidden}
.bg{position:absolute;right:-120px;top:-120px}
.c{position:absolute;left:88px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:26px;width:760px}
.brand{display:flex;align-items:center;gap:16px;font:700 40px D;letter-spacing:-.02em}
h1{font:700 76px/1.02 D;letter-spacing:-.03em;margin:0}
p{font-size:28px;line-height:1.45;color:#3c4a42;margin:0}
.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{background:#e3eee5;color:#2d7a4f;font-weight:700;font-size:20px;padding:8px 16px;border-radius:999px}
.pill{position:absolute;right:80px;top:86px;display:flex;align-items:center;gap:14px;background:#fff;border:2px solid #dde3da;border-radius:999px;padding:16px 26px;font-size:26px;box-shadow:0 20px 50px rgba(20,33,26,.14)}
.pill b{font-weight:700}.pill span{color:#5d6b63}.meter{width:70px;height:10px;border-radius:9px;background:#e7ece5;overflow:hidden}.meter i{display:block;width:40%;height:100%;background:#2d7a4f}</style></head>
<body><div class="bg">${mark('#e3eee5', '#f3f5f0', 760)}</div>
<div class="c"><div class="brand">${mark('#2d7a4f', '#f3f5f0', 54)}AI Footprint</div>
<h1>The energy behind every AI reply</h1>
<p>Energy, carbon, water and cost of your AI use, put in local perspective. Private and open source.</p>
<div class="chips"><span class="chip">Browser extension</span><span class="chip">Dashboard</span><span class="chip">Apache-2.0</span></div></div>
<div class="pill">${mark('#2d7a4f', '#fff', 28)}<b>0.31 Wh</b><span>this reply</span><span class="meter"><i></i></span><span>9.6 / 25 Wh today</span></div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  for (const [name, html] of [['logo-light', wordmark('#14211a', '#2d7a4f', '#f3f5f0')], ['logo-dark', wordmark('#e8efe9', '#6cc996', '#0d1310')]]) {
    await load(p, html);
    await p.locator('.w').screenshot({ path: path.join(R, 'brand', name + '.png'), omitBackground: true });
  }
  const s = await b.newPage({ viewport: { width: 1280, height: 640 } });
  await load(s, social);
  await s.screenshot({ path: path.join(R, 'brand', 'social-preview.png') });
  await b.close();
})();
