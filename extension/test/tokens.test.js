const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/tokens');
const R = require('../src/regions');

test('the dashboard uses the same estimator', () => {
  const fs = require('fs');
  const path = require('path');
  const a = fs.readFileSync(path.join(__dirname, '../src/tokens.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../../dashboard/tokens.js'), 'utf8');
  assert.equal(a, b);
});

test('English: about 4 characters per token', () => {
  assert.equal(T.estimate('a'.repeat(400)), 100);
});

test('other scripts use more tokens per character', () => {
  assert.equal(T.estimate('न'.repeat(250)), 100);    // Devanagari: 2.5 chars/token
  assert.equal(T.estimate('д'.repeat(300)), 100);    // Cyrillic: 3 chars/token
  assert.equal(T.estimate('中'.repeat(130)), 100);   // CJK: 1.3 chars/token
  assert.equal(T.estimate('한'.repeat(130)), 100);   // Hangul counts with CJK
  assert.equal(T.estimate('ع'.repeat(250)), 100);    // Arabic
});

test('mixed text and astral characters', () => {
  const n = T.count('hi 😀 中');
  assert.deepEqual(n, { latin: 4, cyrillic: 0, other: 1, cjk: 1 });
});

test('country detection from browser language, then time zone', () => {
  assert.equal(R.detect(['en-IN', 'en']), 'IN');
  assert.equal(R.detect(['pt-BR']), 'BR');
  assert.equal(R.detect(['zh-Hans-CN']), 'CN');
  assert.equal(R.detect(['en'], 'Asia/Kolkata'), 'IN');
  assert.equal(R.detect(['en'], 'America/Chicago'), 'US');
  assert.equal(R.detect(['fr']), 'WORLD');
});

test('country data comes from Ember and is complete', () => {
  const list = R.list();
  assert.ok(list.length > 150);
  for (const { code } of list) {
    const i = R.info(code);
    assert.ok(i.gridGPerKwh >= 0 && i.gridGPerKwh < 1500, code);  // Turkmenistan is ~1,300 (gas + methane leaks)
    assert.ok(i.perPersonKwhYear > 0 && i.perPersonKwhYear < 60000, code);
    assert.ok(i.gridYear >= 2015 && i.demandYear >= 2015, code + ' data is recent');
  }
  assert.equal(R.info('US').gridGPerKwh, 384);
  assert.equal(R.info('GB').inName, 'the UK');
  assert.equal(R.info('XX').code, 'WORLD');
});
