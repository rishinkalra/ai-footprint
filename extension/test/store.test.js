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
  store.recordTurn(st, msg({ model: 'GPT-5 ' }), settings(), NOW);
  store.recordTurn(st, msg({ site: 'claude', model: 'claude-sonnet' }), settings(), NOW);
  const day = st.days['2026-10-31'];
  assert.equal(day.chatgpt['gpt-5'].turns, 2);
  assert.equal(day.chatgpt['gpt-5'].inputTokens, 2000);
  assert.equal(day.chatgpt['gpt-5'].outputTokens, 1000);
  assert.equal(day.claude['claude-sonnet'].turns, 1);
  assert.ok(r1.replyWh > 0);
  assert.ok(Math.abs(store.dayTotals(st, '2026-10-31').wh - (r1.replyWh * 3)) < 1e-9);
  assert.equal(st.dirty['2026-10-31'], true);
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
