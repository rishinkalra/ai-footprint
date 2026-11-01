const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const dashboard = require('../../dashboard/defaults');

test('energy tiers match the dashboard so both tell the same story', () => {
  assert.deepEqual(core.TIERS, dashboard.energy.tiers);
  assert.equal(core.DEFAULTS.carbonKgPerKwh, dashboard.carbon.defaultKgPerKwh);
  assert.equal(core.DEFAULTS.waterLitresPerKwh, dashboard.water.defaultLitresPerKwh);
  assert.deepEqual(core.DEFAULTS.uncertainty, dashboard.energy.uncertainty);
  assert.equal(core.CACHE_READ_FACTOR, dashboard.energy.cacheReadFactor);
});

test('model names map to sizes', () => {
  assert.equal(core.tierFor('gpt-5'), 'medium');
  assert.equal(core.tierFor('gpt-4o-mini'), 'small');
  assert.equal(core.tierFor('gemini-flash'), 'small');
  assert.equal(core.tierFor('claude-opus'), 'large');
  assert.equal(core.tierFor('claude-haiku'), 'small');
  assert.equal(core.tierFor('gemini-deep-research'), 'xlarge');
  assert.equal(core.tierFor('gpt-5-instant'), 'medium');
});

test('thinking models are detected', () => {
  for (const m of ['gpt-5-thinking', 'o3', 'o4-mini', 'gpt-5-pro', 'deepseek-r1', 'sonar-reasoning', 'grok-thinking', 'gemini-pro']) {
    assert.ok(core.isReasoning(m), m);
  }
  for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'claude-sonnet', 'gemini-flash', 'deepseek-chat']) {
    assert.ok(!core.isReasoning(m), m);
  }
});

test('typical medium reply is ~0.3 Wh', () => {
  const a = core.assessTurn({ model: 'gpt-5', inputTokens: 1000, outputTokens: 500 });
  assert.ok(a.wh > 0.25 && a.wh < 0.35, String(a.wh));
  assert.ok(Math.abs(a.co2g - a.wh * 0.384) < 1e-12);
  assert.ok(Math.abs(a.waterMl - a.wh * 1.1) < 1e-12);
});

test('thinking output counts 4x and images add 2.9 Wh', () => {
  const plain = core.assessTurn({ model: 'gpt-5', inputTokens: 0, outputTokens: 1000 });
  const think = core.assessTurn({ model: 'gpt-5-thinking', inputTokens: 0, outputTokens: 1000 });
  assert.ok(Math.abs(think.wh - plain.wh * 4) < 1e-12);
  const img = core.assessTurn({ model: 'gpt-5', inputTokens: 0, outputTokens: 0, images: 2 });
  assert.ok(Math.abs(img.wh - 5.8) < 1e-12);
});

test('context is capped at the model window', () => {
  const a = core.assessTurn({ model: 'gpt-5', inputTokens: 10e6, outputTokens: 0 });
  assert.equal(a.inputTokens, core.DEFAULTS.maxContextTokens);
});

test('custom carbon intensity is honoured', () => {
  const a = core.assessTurn({ model: 'gpt-5', inputTokens: 0, outputTokens: 1000 }, { carbonKgPerKwh: 0.1 });
  assert.ok(Math.abs(a.co2g - a.wh * 0.1) < 1e-12);
});

test('worked example: long chat reply, cached and uncached (see METHODOLOGY.md)', () => {
  // Medium model, 40,000 tokens of conversation, 400-token reply.
  // Uncached: 40000/1000 × 0.05 + 400/1000 × 0.5 = 2.0 + 0.2 = 2.2 Wh
  const cold = core.assessTurn({ model: 'gpt-5', inputTokens: 40000, cachedTokens: 0, outputTokens: 400 });
  assert.ok(Math.abs(cold.wh - 2.2) < 1e-12, String(cold.wh));
  // 38,000 of those cached: (2000 + 38000 × 0.1)/1000 × 0.05 + 0.2 = 0.29 + 0.2 = 0.49 Wh
  const warm = core.assessTurn({ model: 'gpt-5', inputTokens: 40000, cachedTokens: 38000, outputTokens: 400 });
  assert.ok(Math.abs(warm.wh - 0.49) < 1e-12, String(warm.wh));
  // Carbon at the default 0.384 g/Wh; water at 1.1 mL/Wh
  assert.ok(Math.abs(warm.co2g - 0.49 * 0.384) < 1e-12);
  assert.ok(Math.abs(warm.waterMl - 0.49 * 1.1) < 1e-12);
  // Value at medium-tier API prices ($3 in, $0.30 cached, $15 out per MTok):
  //   2000×3 + 38000×0.3 + 400×15 = 6000 + 11400 + 6000 = 23,400 → $0.0234
  assert.ok(Math.abs(warm.apiValueUsd - 0.0234) < 1e-12, String(warm.apiValueUsd));
});

test('cached tokens can never exceed the input', () => {
  const a = core.assessTurn({ model: 'gpt-5', inputTokens: 1000, cachedTokens: 5000, outputTokens: 0 });
  assert.equal(a.cachedTokens, 1000);
  assert.ok(Math.abs(a.wh - 0.005) < 1e-12);
});

test('long chats get a fresh-chat nudge with a real saving', () => {
  const turn = { model: 'gpt-5', inputTokens: 40000, outputTokens: 400 };
  const tip = core.tipForTurn(turn, {});
  assert.equal(tip.id, 'long-thread');
  assert.equal(tip.key, 'tip_long');
  assert.equal(tip.params.k, 40);
  const saving = core.freshChatSaving(turn);
  assert.ok(saving.factor > 4, String(saving.factor));
  assert.equal(core.tipForTurn(turn, { longThreadTipShown: true }), null);
  // When the chat is warm in the cache the saving is small, so no tip.
  const warm = { model: 'gpt-5', inputTokens: 40000, cachedTokens: 39000, outputTokens: 400 };
  assert.ok(core.freshChatSaving(warm).factor < 1.5);
  assert.equal(core.tipForTurn(warm, {}), null);
});

test('short prompts on thinking models get a nudge', () => {
  const tip = core.tipForTurn({ model: 'o3', inputTokens: 30, promptTokens: 30, outputTokens: 200 }, {});
  assert.equal(tip.id, 'reasoning-short');
  assert.equal(core.tipForTurn({ model: 'gpt-5', inputTokens: 30, promptTokens: 30, outputTokens: 200 }, {}), null);
});

test('insights point at the biggest habits', () => {
  const ins = core.insights({ wh: 100, longThreadWh: 50, reasoningWh: 40, images: 2 });
  assert.deepEqual(ins.map(i => i.id), ['long-threads', 'reasoning', 'images']);
  assert.ok(!core.insights({ wh: 1000, images: 1 }).some(i => i.id === 'images'), 'tiny image share is not worth a tip');
  assert.equal(core.insights({ wh: 0 }).length, 0);
});

test('local date helpers', () => {
  assert.equal(core.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(core.addDays('2026-03-01', -1), '2026-02-28');
  assert.match(core.localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
