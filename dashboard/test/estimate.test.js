const test = require('node:test');
const assert = require('node:assert/strict');
const est = require('../estimate');

const cfg = est.buildConfig();

test('normalizes model ids from every platform', () => {
  assert.equal(est.normalizeModelId('claude-opus-4-5-20251101'), 'claude-opus-4-5');
  assert.equal(est.normalizeModelId('anthropic/claude-sonnet-4.5'), 'claude-sonnet-4.5');
  assert.equal(est.normalizeModelId('claude-opus-4-6[1m]'), 'claude-opus-4-6');
  assert.equal(est.normalizeModelId('us.anthropic.claude-sonnet-4-5-20250929-v1:0'), 'claude-sonnet-4-5');
  assert.equal(est.normalizeModelId('claude-3-5-sonnet@20241022'), 'claude-3-5-sonnet');
  assert.equal(est.normalizeModelId('gpt-4o-2024-08-06'), 'gpt-4o');
  assert.equal(est.normalizeModelId('models/gemini-2.5-flash'), 'gemini-2.5-flash');
});

test('longest price prefix wins', () => {
  assert.equal(est.resolveModel('gpt-4o-mini', cfg).priceKey, 'gpt-4o-mini');
  assert.equal(est.resolveModel('gpt-4o', cfg).priceKey, 'gpt-4o');
  assert.equal(est.resolveModel('gpt-5-codex', cfg).priceKey, 'gpt-5');
  assert.equal(est.resolveModel('claude-opus-4-1-20250805', cfg).price.input, 15);
  assert.equal(est.resolveModel('claude-opus-4-5', cfg).price.input, 5);
  assert.equal(est.resolveModel('claude-opus-5-5', cfg).tier, 'large');
});

test('unknown models fall back to a tier by name', () => {
  const r = est.resolveModel('some-vendor-mini-2', cfg);
  assert.equal(r.tier, 'small');
  assert.equal(r.priceEstimated, true);
  assert.equal(est.resolveModel('mystery-model', cfg).tier, 'medium');
});

test('a typical mid-size chat turn lands near the published ~0.3 Wh', () => {
  const r = { model: 'gpt-4o', inputTokens: 1000, outputTokens: 500 };
  const wh = est.energyKwh(r, est.resolveModel(r.model, cfg), cfg) * 1000;
  assert.ok(wh > 0.2 && wh < 0.4, `got ${wh} Wh`);
});

test('cache reads cost 10% of a fresh input token in energy', () => {
  const resolved = est.resolveModel('claude-sonnet-4-5', cfg);
  const fresh = est.energyKwh({ inputTokens: 10000 }, resolved, cfg);
  const cached = est.energyKwh({ cacheReadTokens: 10000 }, resolved, cfg);
  assert.ok(Math.abs(cached - fresh * 0.1) < 1e-12);
});

test('list price uses input, output and cache prices', () => {
  const resolved = est.resolveModel('claude-sonnet-4-5', cfg);
  const usd = est.listPriceUsd({ inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheWriteTokens: 1e6 }, resolved);
  assert.equal(Math.round(usd * 100) / 100, 3 + 15 + 0.3 + 3.75);
});

test('subscription usage counts as value, not spend', () => {
  const a = est.assess({ model: 'claude-opus-4-5', billing: 'subscription', outputTokens: 1e6 }, cfg);
  assert.equal(a.spendUsd, 0);
  assert.equal(a.apiEquivalentUsd, 25);
  const b = est.assess({ model: 'claude-opus-4-5', billing: 'api', outputTokens: 1e6, reportedCostUsd: 20 }, cfg);
  assert.equal(b.spendUsd, 20);
});

test('carbon and water scale from energy, with a range', () => {
  const a = est.assess({ model: 'gpt-4o', billing: 'api', outputTokens: 1e6 }, cfg);
  assert.ok(Math.abs(a.co2Kg.mid - a.energyKwh.mid * 0.4) < 1e-12);
  assert.ok(Math.abs(a.waterL.mid - a.energyKwh.mid * 1.1) < 1e-12);
  assert.ok(a.energyKwh.low < a.energyKwh.mid && a.energyKwh.mid < a.energyKwh.high);
});

test('provider inference', () => {
  assert.equal(est.inferProvider('claude-3-haiku'), 'anthropic');
  assert.equal(est.inferProvider('gpt-5-codex'), 'openai');
  assert.equal(est.inferProvider('o3-mini'), 'openai');
  assert.equal(est.inferProvider('gemini-2.5-pro'), 'google');
  assert.equal(est.inferProvider('mistralai/mistral-large'), 'mistral');
});
