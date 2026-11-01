const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeFakeHome, tmpDataDir, jsonResponse } = require('./helpers');
const { FootprintService } = require('../service');
const { normalizeEvent } = require('../collectors/ledger');
const { importExport } = require('../importers');
const est = require('../estimate');

const quiet = { info() {}, error() {} };
const range = { from: '2026-10-01', to: '2026-10-31' };

function service(opts = {}) {
  return new FootprintService({ dataDir: tmpDataDir(), homeDir: makeFakeHome(), logger: quiet, env: {}, ...opts });
}

test('reads Claude Code, OpenClaw and Codex logs once each', async () => {
  const s = await service().summary(range);
  const by = Object.fromEntries(s.byPlatform.map(p => [p.platform, p]));
  assert.deepEqual(Object.keys(by).sort(), ['claude-code', 'codex-cli', 'openclaw']);

  const cc = by['claude-code'];
  assert.equal(cc.requests, 2, 'duplicate lines and resumed copies are deduped');
  assert.equal(cc.tokens.output, 1200);
  assert.equal(cc.tokens.cacheRead, 50000);
  assert.equal(cc.spendUsd, 0, 'Claude Code defaults to subscription billing');
  assert.ok(cc.apiEquivalentUsd > 0);

  const oc = by.openclaw;
  assert.equal(oc.spendUsd, 0.0123, 'uses the cost OpenClaw logged');

  const cx = by['codex-cli'];
  assert.equal(cx.requests, 1, 'repeated token_count events are ignored');
  assert.equal(cx.tokens.input, 1000);
  assert.equal(cx.tokens.cacheRead, 200);
});

test('re-reads only changed files', async () => {
  const svc = service();
  await svc.summary(range);
  const cached = svc.logCache.claudeCode;
  const file = Object.keys(cached)[0];
  const before = cached[file];
  await svc.summary({ ...range, force: true });
  assert.equal(svc.logCache.claudeCode[file], before, 'unchanged file kept its cached parse');
});

test('provider report replaces API-billed local records for the same account', async () => {
  const fetchImpl = async url => {
    assert.match(url, /usage_report\/messages/);
    return jsonResponse({
      data: [{ starting_at: '2026-10-31T00:00:00Z', results: [
        { model: 'claude-sonnet-4-5-20250929', uncached_input_tokens: 5000, output_tokens: 800, cache_read_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 } }
      ] }],
      has_more: false
    });
  };
  const s = await service({ env: { ANTHROPIC_ADMIN_KEY: 'sk-ant-admin-test' }, fetchImpl }).summary(range);
  const platforms = s.byPlatform.map(p => p.platform).sort();
  assert.deepEqual(platforms, ['anthropic-api', 'claude-code', 'codex-cli'], 'OpenClaw API calls now come from the report');
  const api = s.byPlatform.find(p => p.platform === 'anthropic-api');
  assert.equal(api.tokens.cacheWrite, 100);
  assert.ok(api.spendUsd > 0);
  assert.equal(s.sources.find(x => x.id === 'anthropicAdmin').status, 'ok');
});

test('provider errors are reported without breaking the summary', async () => {
  const fetchImpl = async () => jsonResponse({ error: 'nope' }, 401);
  const s = await service({ env: { OPENAI_ADMIN_KEY: 'k' }, fetchImpl }).summary(range);
  const src = s.sources.find(x => x.id === 'openaiAdmin');
  assert.equal(src.status, 'error');
  assert.match(src.note, /401/);
  assert.ok(s.byPlatform.length >= 3);
});

test('OpenAI and OpenRouter reports parse', async () => {
  const fetchImpl = async url => {
    if (url.includes('openai.com')) {
      return jsonResponse({ data: [{ start_time: 1793404800, results: [
        { model: 'gpt-5', input_tokens: 3000, input_cached_tokens: 1000, output_tokens: 500, num_model_requests: 4 }
      ] }], has_more: false });
    }
    return jsonResponse({ data: [{ date: '2026-10-30 00:00:00', model: 'google/gemini-2.5-pro', usage: 0.42,
      requests: 3, prompt_tokens: 9000, completion_tokens: 700 }] });
  };
  const s = await service({ env: { OPENAI_ADMIN_KEY: 'a', OPENROUTER_PROVISIONING_KEY: 'b' }, fetchImpl }).summary(range);
  const oa = s.byPlatform.find(p => p.platform === 'openai-api');
  assert.equal(oa.tokens.input, 2000);
  assert.equal(oa.tokens.cacheRead, 1000);
  assert.equal(oa.requests, 4);
  const or = s.byPlatform.find(p => p.platform === 'openrouter');
  assert.equal(or.spendUsd, 0.42);
  assert.ok(s.byModel.some(m => m.model === 'gemini-2.5-pro' && m.provider === 'google'));
});

test('subscriptions are pro-rated into spend', async () => {
  const svc = service();
  fs.writeFileSync(svc.configFile, JSON.stringify({
    subscriptions: [{ name: 'Claude Max', platform: 'claude-code', monthlyUsd: 100, since: '2026-10-15' }]
  }));
  const s = await svc.summary(range);
  const days = 17; // Oct 15-31
  assert.ok(Math.abs(s.totals.subscriptionUsd - (100 * 12 / 365) * days) < 1e-4);
  assert.ok(Math.abs(s.byPlatform.find(p => p.platform === 'claude-code').spendUsd - s.totals.subscriptionUsd) < 1e-4);
});

test('ledger events: prompt counts become estimated tokens; bad input is rejected', () => {
  const cfg = est.buildConfig();
  const e = normalizeEvent({ platform: 'chatgpt', model: 'gpt-5', prompts: 10, date: '2026-10-30' }, cfg);
  assert.equal(e.inputTokens, 10000);
  assert.equal(e.outputTokens, 5000);
  assert.equal(e.billing, 'subscription');
  assert.equal(e.provider, 'openai');
  assert.equal(e.estimatedTokens, true);
  assert.throws(() => normalizeEvent({ outputTokens: -1 }, cfg), /non-negative/);
  assert.throws(() => normalizeEvent({ date: '30/10/2026' }, cfg), /YYYY-MM-DD/);
  const withCost = normalizeEvent({ model: 'x', costUsd: 1.5, outputTokens: 10 }, cfg);
  assert.equal(withCost.billing, 'api');
});

test('ChatGPT and Claude.ai exports import idempotently', () => {
  const chatgpt = [{ mapping: {
    a: { message: { author: { role: 'user' }, create_time: 1793350000, content: { parts: ['x'.repeat(400)] } } },
    b: { message: { author: { role: 'assistant' }, create_time: 1793350010, metadata: { model_slug: 'gpt-5' }, content: { parts: ['y'.repeat(800)] } } },
    c: { message: { author: { role: 'user' }, create_time: 1793350020, content: { parts: ['z'.repeat(400)] } } },
    d: { message: { author: { role: 'assistant' }, create_time: 1793350030, metadata: { model_slug: 'gpt-5' }, content: { parts: ['w'.repeat(400)] } } }
  } }];
  const out = importExport(chatgpt, { timezone: 'UTC' });
  assert.equal(out.format, 'chatgpt');
  assert.equal(out.events.length, 1);
  const ev = out.events[0];
  assert.equal(ev.requests, 2);
  assert.equal(ev.outputTokens, 300);
  // Reply 1 reads the 100-token prompt. Reply 2, 20 s later, reads 100 + 200 + 100 = 400
  // tokens, of which the first 300 (prompt + reply 1) are still in the prompt cache.
  assert.equal(ev.inputTokens, 100 + 100, 'fresh input: first prompt, then only the new prompt');
  assert.equal(ev.cacheReadTokens, 300, 'the earlier conversation is read from cache');
  assert.equal(ev.id, `import:chatgpt:${ev.date}:gpt-5`);

  const claude = [{ chat_messages: [
    { sender: 'human', text: 'a'.repeat(40), created_at: '2026-10-29T08:00:00Z' },
    { sender: 'assistant', text: 'b'.repeat(80), created_at: '2026-10-29T08:00:05Z' }
  ] }];
  const c = importExport(claude, { timezone: 'UTC' });
  assert.equal(c.format, 'claude');
  assert.equal(c.events[0].platform, 'claude.ai');
  assert.equal(c.events[0].outputTokens, 20);
  assert.throws(() => importExport([{ foo: 1 }], { timezone: 'UTC' }), /Unrecognised/);

  const svc = service();
  svc.addEvents(out.events);
  svc.addEvents(out.events);
  assert.equal(svc.ledgerRecords().length, 1, 're-importing the same export replaces rows');
});

test('daily series covers every day in range', async () => {
  const s = await service().summary({ from: '2026-10-28', to: '2026-10-31' });
  assert.deepEqual(s.daily.map(d => d.date), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  assert.equal(s.daily[0].tokens.total, 0);
  assert.ok(s.daily[2].energyKwh.mid > 0);
});

test('missing log folders are reported, not fatal', async () => {
  const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fp-empty-'));
  const s = await new FootprintService({ dataDir: tmpDataDir(), homeDir: empty, logger: quiet, env: {} }).summary(range);
  assert.equal(s.sources.find(x => x.id === 'claudeCode').status, 'not-found');
  assert.equal(s.totals.spendUsd, 0);
});
