// Composes Chrome Web Store images from the rendered screens.
const path = require('path');
const fs = require('fs');

const FONTS = path.join(__dirname, '..', 'fonts');
const SCREENS = path.join(__dirname, 'screens');
const u = f => 'file://' + path.join(SCREENS, f);

const base = `
@font-face{font-family:D;src:url(file://${FONTS}/bricolage-latin.woff2);font-weight:200 800}
@font-face{font-family:B;src:url(file://${FONTS}/figtree-latin.woff2);font-weight:300 900}
*{box-sizing:border-box}html,body{margin:0}
body{width:1280px;height:800px;overflow:hidden;background:#f3f5f0;color:#14211a;font-family:B,system-ui,sans-serif;position:relative}
.leaf{position:absolute;right:-160px;bottom:-200px;width:760px;height:760px;opacity:1}
.wrap{position:relative;height:100%;display:grid;grid-template-columns:420px 1fr;gap:48px;align-items:center;padding:0 64px}
.brand{position:absolute;top:44px;left:64px;display:flex;align-items:center;gap:10px;font:700 22px D}
h1{font:700 52px/1.02 D;letter-spacing:-.03em;margin:0 0 18px}
p{font-size:21px;line-height:1.5;color:#3c4a42;margin:0}
.shot{justify-self:center;border-radius:22px;overflow:hidden;box-shadow:0 2px 6px rgba(20,33,26,.08),0 30px 60px rgba(20,33,26,.16);border:1px solid #dde3da;background:#fff}
.shot img{display:block}
`;
const MARK = s => `<svg viewBox="0 0 64 64" width="${s}" height="${s}"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="#2d7a4f"/><path d="M37 17 22 38h10l-4 13 16-22H33l6-12Z" fill="#f3f5f0"/></svg>`;
const BG = `<svg class="leaf" viewBox="0 0 64 64"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="#e3eee5"/></svg>`;

function slide(title, body, shotHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${BG}
  <div class="brand">${MARK(30)}AI Footprint</div>
  <div class="wrap"><div><h1>${title}</h1><p>${body}</p></div>${shotHtml}</div></body></html>`;
}
// crop: show part of an image inside a fixed window
function crop(file, { w, h, x, y, scale = 1 }) {
  return `<div class="shot" style="width:${w}px;height:${h}px"><img src="${u(file)}" style="transform-origin:0 0;transform:translate(${-x * scale}px,${-y * scale}px) scale(${scale})"></div>`;
}

const ICON = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d7a4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const PROMISES = `<div style="display:grid;gap:16px;width:600px">` + [
  ['<path d="M20 4C20 14 14 20 6 20c-1 0-2-1-2-2C4 10 10 4 20 4z"/><path d="M4 20 13 11"/>', 'Counts, never content', 'Only the length of each message is measured. What you type and what the AI says is never stored.'],
  ['<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 'Stays on this device', 'Totals live in your browser. Nothing is sent anywhere unless you turn on sync.'],
  ['<path d="m5 12 5 5 9-10"/>', 'Open and checkable', 'The code and every number behind the estimates are public on GitHub.']
].map(([d, t, b]) => `<div style="display:grid;grid-template-columns:48px 1fr;gap:16px;align-items:start;background:#fff;border:1px solid #dde3da;border-radius:20px;padding:22px 24px;box-shadow:0 2px 6px rgba(20,33,26,.06),0 20px 40px rgba(20,33,26,.08)">
  <span style="width:48px;height:48px;border-radius:14px;background:#e3eee5;display:grid;place-items:center">${ICON(d)}</span>
  <div><div style="font:700 24px D;margin:2px 0 6px">${t}</div><div style="font-size:18px;line-height:1.45;color:#3c4a42">${b}</div></div></div>`).join('') + `</div>`;

const slides = [
  ['1-badge', slide('See the footprint of every AI reply', 'A small badge shows each reply’s energy and your progress toward a daily goal, right in the chat.',
    crop('badge-light-detail.png', { w: 680, h: 620, x: 0, y: 0 }))],
  ['2-popup', slide('Your totals, in plain language', 'Energy, carbon, water and cost for today, the week or the month, with a trend and a breakdown by app.',
    crop('popup-7d-light.png', { w: 380, h: 640, x: 0, y: 0 }))],
  ['3-tips', slide('Tips at the moment they help', 'Long chats, thinking models and image generation get one friendly nudge each, with the real saving.',
    crop('badge-dark-tip.png', { w: 680, h: 620, x: 0, y: 0 }))],
  ['4-private', slide('Private by design', 'It measures how long messages are, never what they say. Everything stays in your browser. Open source.',
    PROMISES)],
  ['5-share', slide('Share your progress', 'Make a card with your monthly footprint and trend. It never includes your chats.',
    `<div class="shot" style="width:720px"><img src="${u('share-card-wide.png')}" style="width:720px"></div>`)]
];

const promo = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:D;src:url(file://${FONTS}/bricolage-latin.woff2);font-weight:200 800}
@font-face{font-family:B;src:url(file://${FONTS}/figtree-latin.woff2);font-weight:300 900}
html,body{margin:0}body{width:440px;height:280px;overflow:hidden;background:#2d7a4f;color:#fff;font-family:B,sans-serif;position:relative}
.leaf{position:absolute;right:-70px;top:-40px;width:300px;height:300px}
.c{position:absolute;left:32px;bottom:30px;right:32px}
h1{font:700 40px/1 D;letter-spacing:-.02em;margin:14px 0 10px}p{margin:0;font-size:17px;line-height:1.4;color:#e3eee5;max-width:300px}
</style></head><body>
<svg class="leaf" viewBox="0 0 64 64"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="#3a8a5c"/><path d="M37 17 22 38h10l-4 13 16-22H33l6-12Z" fill="#2d7a4f"/></svg>
<div class="c"><svg viewBox="0 0 64 64" width="40" height="40"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="#f3f5f0"/><path d="M37 17 22 38h10l-4 13 16-22H33l6-12Z" fill="#2d7a4f"/></svg>
<h1>AI Footprint</h1><p>The energy, carbon and cost of every AI reply. Private and open source.</p></div></body></html>`;

module.exports = { slides, promo };
