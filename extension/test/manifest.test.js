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
