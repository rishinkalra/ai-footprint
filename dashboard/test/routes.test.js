const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { makeFakeHome, tmpDataDir } = require('./helpers');

test('HTTP routes: widget, summary, authenticated ingest', async t => {
  process.env.AI_FOOTPRINT_HOME = makeFakeHome();
  const { mountAiFootprint } = require('../index');
  const app = express();
  app.use(express.json());
  mountAiFootprint(app, { dataDir: tmpDataDir(), logger: { info() {}, error() {} }, env: { AI_FOOTPRINT_INGEST_KEY: 'secret', AI_FOOTPRINT_HOME: process.env.AI_FOOTPRINT_HOME } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const page = await fetch(`${base}/ai-footprint/?embed=1`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AI footprint/);
  assert.equal((await fetch(`${base}/ai-footprint/widget.js`)).status, 200);
  const redirect = await fetch(`${base}/ai-footprint`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);

  const summary = await (await fetch(`${base}/ai-footprint/api/summary?from=2026-10-01&to=2026-10-31`)).json();
  assert.ok(summary.byPlatform.length >= 3);

  const denied = await fetch(`${base}/ai-footprint/api/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompts: 3 })
  });
  assert.equal(denied.status, 401);

  const ok = await fetch(`${base}/ai-footprint/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-footprint-key': 'secret' },
    body: JSON.stringify({ events: [{ id: 'gem-1', platform: 'gemini', model: 'gemini-2.5-pro', prompts: 5, date: '2026-10-31' }] })
  });
  assert.equal(ok.status, 200);
  const after = await (await fetch(`${base}/ai-footprint/api/summary?from=2026-10-01&to=2026-10-31`)).json();
  assert.ok(after.byPlatform.some(p => p.platform === 'gemini' && p.requests === 5));

  const bad = await fetch(`${base}/ai-footprint/api/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
    body: JSON.stringify({ outputTokens: 'lots' })
  });
  assert.equal(bad.status, 400);

  const del = await fetch(`${base}/ai-footprint/api/events/gem-1`, { method: 'DELETE', headers: { 'x-footprint-key': 'secret' } });
  assert.deepEqual(await del.json(), { ok: true });
});
