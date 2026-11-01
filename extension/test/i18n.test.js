const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n');
require('../src/locales/en');
require('../src/locales/hi');
require('../src/locales/es');
const C = require('../src/compare');
const R = require('../src/regions');

const placeholders = v => {
  const texts = typeof v === 'object' ? Object.values(v) : [v];
  return [...new Set(texts.join(' ').match(/\{\w+\}/g) || [])].sort().join();
};

test('every language has every key, with the same placeholders', () => {
  const en = I.catalog('en');
  for (const { code } of I.languages()) {
    const cat = I.catalog(code);
    assert.deepEqual(Object.keys(cat).sort(), Object.keys(en).sort(), code + ' keys');
    for (const k of Object.keys(en)) {
      if (k === 'o_method_lang') continue;
      // Plural forms may drop {n} for "one" (e.g. "a cup"), so compare the union.
      assert.equal(placeholders(cat[k]), placeholders(en[k]), `${code}.${k} placeholders`);
      assert.equal(typeof cat[k], typeof en[k], `${code}.${k} plural shape`);
    }
  }
});

test('language follows the setting, then the browser, then English', () => {
  assert.equal(I.setLocale('hi'), 'hi');
  assert.equal(I.setLocale('', ['es-MX', 'en']), 'es');
  assert.equal(I.setLocale('', ['fr-FR', 'hi-IN']), 'hi');
  assert.equal(I.setLocale('', ['de-DE']), 'en');
  assert.equal(I.setLocale('pt-BR'), 'en');
});

test('plurals and placeholders', () => {
  I.setLocale('en');
  assert.equal(I.t('replies', { count: 1, n: 1 }), '1 reply');
  assert.equal(I.t('replies', { count: 3, n: 3 }), '3 replies');
  assert.equal(I.t('w_open', { site: 'Claude' }), 'Open Claude');
  I.setLocale('es');
  assert.equal(I.t('replies', { count: 1, n: 1 }), '1 respuesta');
  assert.equal(I.t('replies', { count: 2, n: 2 }), '2 respuestas');
  I.setLocale('en');
});

test('comparisons read naturally and use local everyday things', () => {
  I.setLocale('en');
  assert.equal(C.energy(119, 'US').text, 'Like running a microwave for 6 minutes');   // 119 Wh / 1100 W = 6.5 min
  assert.equal(C.energy(119, 'IN').text, 'Like a ceiling fan running for 1.6 hours'); // 119 / 75 W
  assert.equal(C.energy(119, 'GB').text, 'Like boiling water for 4.8 cups of tea');   // 119 / 25 Wh
  assert.equal(C.energy(119, 'NG').text, 'Like an LED bulb on for 12 hours');         // 119 / 10 W
  assert.equal(C.energy(119, 'WORLD').text, 'Like charging a phone 7.9 times');       // 119 / 15 Wh
  // Too small for the local item to read well: fall back to the phone.
  assert.equal(C.energy(0.31, 'IN').text, 'Like 2.1% of a phone charge');
  assert.equal(C.energy(0, 'IN').text, 'No AI use yet');
});

test('durations pick a readable unit', () => {
  I.setLocale('en');
  assert.equal(C.duration(45 / 3600), '45 seconds');
  assert.equal(C.duration(0.5), '30 minutes');
  assert.equal(C.duration(1), '1 hour');
  assert.equal(C.duration(5.25), '5.3 hours');
  assert.equal(C.duration(72), '3 days');
});

test('water in drops, teaspoons, glasses or litres', () => {
  I.setLocale('en');
  assert.equal(C.water(0.3), 'about 6 drops');
  assert.equal(C.water(12), 'about 2 teaspoons');
  assert.equal(C.water(250), 'about a glass');
  assert.equal(C.water(131), 'less than a glass');
  assert.equal(C.water(700), 'about 3 glasses');
  assert.equal(C.water(4000), 'about 4 litres');
});

test('Hindi and Spanish output', () => {
  I.setLocale('hi');
  assert.equal(C.energy(119, 'IN').text, 'छत के पंखे को 1.6 घंटे चलाने जितना');
  assert.equal(C.country(R.info('IN')), 'भारत');
  I.setLocale('es');
  assert.equal(C.energy(119, 'MX').text, 'Como usar el microondas 6 minutos');
  assert.equal(C.energy(0.31, 'MX').text, 'Como el 2,1% de una carga de móvil');
  I.setLocale('en');
  assert.equal(C.country(R.info('GB')), 'the UK');
  assert.equal(C.country(R.info('WORLD')), 'the world');
});
