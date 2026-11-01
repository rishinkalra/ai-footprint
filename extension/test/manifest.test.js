const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sites = require('../src/sites');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));

test('content script runs on exactly the supported sites', () => {
  const matches = manifest.content_scripts[0].matches.slice().sort();
  assert.deepEqual(matches, sites.allHosts().map(h => `https://${h}/*`).sort());
});

test('store listing limits', () => {
  assert.ok(messages.extName.message.length <= 75);
  assert.ok(messages.extDescription.message.length <= 132);
});

test('asks for no broad permissions up front', () => {
  assert.deepEqual(manifest.permissions.sort(), ['alarms', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
});

test('every referenced file exists', () => {
  const files = [
    manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
    ...Object.values(manifest.icons), ...manifest.content_scripts[0].js
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('site lookup', () => {
  assert.equal(sites.siteForHost('chatgpt.com').id, 'chatgpt');
  assert.equal(sites.siteForHost('CLAUDE.AI').id, 'claude');
  assert.equal(sites.siteForHost('example.com'), null);
});

test('Firefox build: event-page scripts, add-on ID and no data collection', () => {
  const { firefoxManifest, chromeManifest, BACKGROUND, FIREFOX_ID } = require('../tools/build');
  const ff = firefoxManifest();
  assert.equal(ff.background.service_worker, undefined);
  assert.deepEqual(ff.background.scripts, BACKGROUND.map(f => 'src/' + f));
  for (const f of ff.background.scripts) assert.ok(fs.existsSync(path.join(root, f)), f);
  assert.equal(ff.browser_specific_settings.gecko.id, FIREFOX_ID);
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  // Everything else is the same as Chrome.
  const ch = chromeManifest();
  assert.deepEqual(ff.content_scripts, ch.content_scripts);
  assert.deepEqual(ff.permissions, ch.permissions);
});

test('background.js loads the same helpers as the Firefox manifest lists', () => {
  const { BACKGROUND } = require('../tools/build');
  const src = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  const m = src.match(/importScripts\(([^)]*)\)/);
  const imported = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual(imported, BACKGROUND.slice(0, -1));
});

test('site access patterns cover every supported site', () => {
  assert.deepEqual(sites.origins().sort(), manifest.content_scripts[0].matches.slice().sort());
});

test('Safari build: non-persistent background page, otherwise identical', () => {
  const { safariManifest, chromeManifest, BACKGROUND } = require('../tools/build');
  const sf = safariManifest();
  assert.deepEqual(sf.background, { scripts: BACKGROUND.map(f => 'src/' + f) });
  const ch = chromeManifest();
  assert.deepEqual(sf.content_scripts, ch.content_scripts);
  assert.deepEqual(sf.permissions, ch.permissions);
  assert.equal(sf.browser_specific_settings, undefined);
});
