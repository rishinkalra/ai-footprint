const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/store');
const sites = require('../src/sites');
const core = require('../src/core');

const settings = () => store.mergeSettings({});
const NOW = new Date(2026, 9, 31, 12, 0, 0).getTime();
const msg = (over = {}) => ({ site: 'chatgpt', model: 'gpt-5', promptChars: 200, contextChars: 4000, outputChars: 2000, images: 0, threadKey: 'chatgpt:/c/1', ...over });

test('records turns per day, site and model', () => {
  const st = store.newState('id1');
  const r1 = store.recordTurn(st, msg(), settings(), NOW);
  store.recordTurn(st, msg({ model: 'GPT-5 ', threadKey: 'chatgpt:/c/2' }), settings(), NOW);
  store.recordTurn(st, msg({ site: 'claude', model: 'claude-sonnet', threadKey: 'claude:/c/3' }), settings(), NOW);
  const day = st.days['2026-10-31'];
  assert.equal(day.chatgpt['gpt-5'].turns, 2);
  assert.equal(day.chatgpt['gpt-5'].inputTokens, 2000);
  assert.equal(day.chatgpt['gpt-5'].cachedTokens, 0, 'separate chats are not cached');
  assert.equal(day.chatgpt['gpt-5'].outputTokens, 1000);
  assert.equal(day.claude['claude-sonnet'].turns, 1);
  assert.ok(r1.replyWh > 0);
  assert.ok(Math.abs(store.dayTotals(st, '2026-10-31').wh - (r1.replyWh * 3)) < 1e-9);
  assert.equal(st.dirty['2026-10-31'], true);
});

test('prompt cache: a follow-up within 5 minutes re-reads the conversation from cache', () => {
  const st = store.newState('id');
  const s = settings();
  // Turn 1: 1,000 context tokens, 500-token reply.
  store.recordTurn(st, { site: 'chatgpt', model: 'gpt-5', contextTokens: 1000, outputTokens: 500, threadKey: 't' }, s, NOW);
  // Turn 2, 2 minutes later: context is now 1,000 + 500 + 100 (new prompt) = 1,600.
  // The first 1,500 tokens are cached; 100 are fresh.
  const r2 = store.recordTurn(st, { site: 'chatgpt', model: 'gpt-5', contextTokens: 1600, outputTokens: 500, threadKey: 't' }, s, NOW + 120e3);
  // (100 + 1500 × 0.1)/1000 × 0.05 + 500/1000 × 0.5 = 0.0125 + 0.25 = 0.2625 Wh
  assert.ok(Math.abs(r2.replyWh - 0.2625) < 1e-12, String(r2.replyWh));
  // Turn 3, 10 minutes later: cache expired, everything is fresh.
  const r3 = store.recordTurn(st, { site: 'chatgpt', model: 'gpt-5', contextTokens: 2200, outputTokens: 500, threadKey: 't' }, s, NOW + 720e3);
  // 2200/1000 × 0.05 + 0.25 = 0.11 + 0.25 = 0.36 Wh
  assert.ok(Math.abs(r3.replyWh - 0.36) < 1e-12, String(r3.replyWh));
  const t = st.days['2026-10-31'].chatgpt['gpt-5'];
  assert.equal(t.cachedTokens, 1500);
});

test('script-aware token counts from the page are used when present', () => {
  const st = store.newState('id');
  store.recordTurn(st, { site: 'chatgpt', model: 'gpt-5', contextTokens: 300, outputTokens: 120, promptTokens: 40, contextChars: 999999, threadKey: 'x' }, settings(), NOW);
  const t = st.days['2026-10-31'].chatgpt['gpt-5'];
  assert.equal(t.inputTokens, 300);
  assert.equal(t.outputTokens, 120);
});

test('carbon follows the chosen basis and country, including past days', () => {
  const st = store.newState('id');
  store.recordTurn(st, msg(), settings(), NOW, { region: 'IN' });
  const wh = store.dayTotals(st, '2026-10-31').wh;
  const dc = store.summary(st, store.mergeSettings({}), 'today', NOW, { region: 'IN' });
  assert.ok(Math.abs(dc.totals.co2g - wh * 0.384) < 1e-9, 'default: US data-centre grid');
  assert.equal(dc.carbon.basis, 'datacentre');
  const local = store.summary(st, store.mergeSettings({ carbonBasis: 'local' }), 'today', NOW, { region: 'IN' });
  assert.ok(Math.abs(local.totals.co2g - wh * 0.670) < 1e-9, "India's grid");
  const custom = store.summary(st, store.mergeSettings({ carbonBasis: 'custom', carbonKgPerKwh: 0.05 }), 'today', NOW);
  assert.ok(Math.abs(custom.totals.co2g - wh * 0.05) < 1e-9);
  // An explicit country beats the detected one.
  const fr = store.summary(st, store.mergeSettings({ region: 'FR', carbonBasis: 'local' }), 'today', NOW, { region: 'IN' });
  assert.equal(fr.region.code, 'FR');
  assert.ok(Math.abs(fr.totals.co2g - wh * 0.041) < 1e-9);
});

test("local perspective: share of one person's electricity use in their country", () => {
  const st = store.newState('id');
  store.recordTurn(st, { site: 'chatgpt', model: 'gpt-5', contextTokens: 1000, outputTokens: 500, threadKey: 'p' }, settings(), NOW);
  const wh = store.dayTotals(st, '2026-10-31').wh; // 0.3 Wh
  const ng = store.summary(st, settings(), 'today', NOW, { region: 'NG' });
  // Nigeria: 165 kWh per person per year → 452 Wh a day
  assert.ok(Math.abs(ng.perspective.personWh - 165000 / 365) < 1e-9);
  assert.ok(Math.abs(ng.perspective.share - wh / (165000 / 365)) < 1e-12);
  const ca = store.summary(st, settings(), '7d', NOW, { region: 'CA' });
  assert.ok(Math.abs(ca.perspective.personWh - 16090000 / 365 * 7) < 1e-6);
  assert.ok(ng.perspective.share > ca.perspective.share * 7 * 50, 'the same use weighs far more where people use less electricity');
});

test('miles and local car emissions where they apply', () => {
  const st = store.newState('id');
  store.recordTurn(st, msg(), settings(), NOW);
  const us = store.summary(st, settings(), 'today', NOW, { region: 'US' });
  assert.equal(us.region.miles, true);
  assert.ok(Math.abs(us.equivalents.carKm - us.totals.co2g / 249) < 1e-12);
  const de = store.summary(st, settings(), 'today', NOW, { region: 'DE' });
  assert.equal(de.region.miles, false);
  assert.ok(Math.abs(de.equivalents.carKm - de.totals.co2g / 170) < 1e-12);
});

test('bad input is clamped, not trusted', () => {
  const st = store.newState('id');
  const r = store.recordTurn(st, msg({ outputChars: -50, contextChars: 'lots', images: 9999, model: 42 }), store.mergeSettings({ models: { chatgpt: 'gpt-5' } }), NOW);
  assert.equal(r.tier, 'medium');
  const t = st.days['2026-10-31'].chatgpt['gpt-5'];
  assert.equal(t.outputTokens, 0);
  assert.equal(t.images, 20);
});

test('each nudge shows once per chat; goal reminder once per day', () => {
  const st = store.newState('id');
  const s = store.mergeSettings({ dailyGoalWh: 1 });
  const long = msg({ contextChars: 200000 });
  assert.equal(store.recordTurn(st, long, s, NOW).tip.id, 'long-thread');
  const second = store.recordTurn(st, long, s, NOW).tip;
  assert.equal(second && second.id, 'goal', 'goal shows once the long-thread tip is used up');
  assert.equal(store.recordTurn(st, long, s, NOW).tip, null);
  assert.equal(store.recordTurn(st, { ...long, threadKey: 'chatgpt:/c/2' }, s, NOW).tip.id, 'long-thread');
});

test('summary compares with the previous period and adds plan cost', () => {
  const st = store.newState('id');
  const s = store.mergeSettings({ plans: [{ name: 'Plus', monthly: 20, currency: 'usd' }, { name: 'Gemini', monthly: 1950, currency: 'INR' }] });
  store.recordTurn(st, msg(), s, NOW);
  store.recordTurn(st, msg(), s, NOW - 8 * 864e5);
  const sum = store.summary(st, s, '7d', NOW);
  assert.equal(sum.range.days, 7);
  assert.equal(sum.daily.length, 7);
  assert.equal(sum.totals.turns, 1);
  assert.ok(sum.previousWh > 0);
  assert.ok(Math.abs(sum.planCost.USD - 20 * 12 / 365 * 7) < 1e-9);
  assert.ok(Math.abs(sum.planCost.INR - 1950 * 12 / 365 * 7) < 1e-9);
  assert.ok(sum.equivalents.phoneCharges > 0);
  assert.equal(store.summary(st, s, 'today', NOW).range.days, 1);
});

test('sync events are cumulative with stable ids', () => {
  const st = store.newState('abc');
  store.recordTurn(st, msg(), settings(), NOW);
  const byId = {};
  sites.SITES.forEach(s => { byId[s.id] = s; });
  const first = store.syncEvents(st, byId);
  store.recordTurn(st, msg(), settings(), NOW);
  const second = store.syncEvents(st, byId);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal(second[0].requests, 2);
  assert.equal(second[0].provider, 'openai');
  assert.equal(second[0].billing, 'subscription');
});

test('sync events are accepted by the dashboard ingest validator', () => {
  const { normalizeEvent } = require('../../dashboard/collectors/ledger');
  const { buildConfig } = require('../../dashboard/estimate');
  const st = store.newState('abc');
  store.recordTurn(st, msg({ images: 1 }), settings(), NOW);
  const byId = {};
  sites.SITES.forEach(s => { byId[s.id] = s; });
  const ev = normalizeEvent(store.syncEvents(st, byId)[0], buildConfig());
  assert.equal(ev.platform, 'chatgpt');
  assert.equal(ev.estimatedTokens, false);
  assert.equal(ev.cacheReadTokens, 0);
});

test('old data is pruned', () => {
  const st = store.newState('id');
  st.days['2020-01-01'] = { chatgpt: { 'gpt-5': core.emptyTotals() } };
  store.recordTurn(st, msg(), settings(), NOW);
  assert.ok(!st.days['2020-01-01']);
});

test('settings merge keeps defaults for missing keys', () => {
  const s = store.mergeSettings({ dailyGoalWh: 10, sync: { url: 'https://x' } });
  assert.equal(s.dailyGoalWh, 10);
  assert.equal(s.sync.url, 'https://x');
  assert.equal(s.sync.enabled, false);
  assert.equal(s.showBadge, true);
});
