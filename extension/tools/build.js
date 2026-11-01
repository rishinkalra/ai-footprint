#!/usr/bin/env node
// Builds the extension for each browser from the same source.
//   node tools/build.js          -> dist/chrome/, dist/firefox/ and a zip for each store
//
// Chrome, Edge, Brave, Opera, Arc: manifest.json as is (Manifest V3, service worker).
// Safari (macOS): the same files with background scripts (a non-persistent page), wrapped
//   into a Mac app by Apple's converter (see tools/install-safari.sh).
// Firefox (desktop and Android): the same files, with a manifest that
//   - lists the background scripts instead of a service worker (Firefox runs an event page),
//   - adds the add-on ID and minimum versions Firefox needs,
//   - declares that the extension collects no data (Firefox's built-in consent).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FILES = ['manifest.json', 'src', 'icons', 'fonts', '_locales', 'PRIVACY.md'];
const FIREFOX_ID = 'ai-footprint@rishinkalra.github.io';

// Scripts the background loads, in order. background.js imports the same list in Chrome.
const BACKGROUND = ['core.js', 'sites.js', 'regions-data.js', 'regions.js', 'store.js', 'background.js'];

function chromeManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
}

function firefoxManifest() {
  const m = chromeManifest();
  m.background = { scripts: BACKGROUND.map(f => 'src/' + f) };
  m.browser_specific_settings = {
    gecko: {
      id: FIREFOX_ID,
      // 140 is the first version with built-in data-consent declarations (and an ESR release).
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] }
    },
    gecko_android: { strict_min_version: '142.0' }
  };
  return m;
}

function safariManifest() {
  const m = chromeManifest();
  // Safari runs Manifest V3 background scripts as a non-persistent page (it rejects
  // the `persistent` key, and its service-worker support varies by version).
  m.background = { scripts: BACKGROUND.map(f => 'src/' + f) };
  return m;
}

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dest, f));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function build(target, manifest) {
  const out = path.join(DIST, target);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) copy(path.join(ROOT, f), path.join(out, f));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const zip = path.join(DIST, `ai-footprint-${target}-${manifest.version}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
  return { out, zip };
}

if (require.main === module) {
  for (const [target, manifest] of [['chrome', chromeManifest()], ['firefox', firefoxManifest()], ['safari', safariManifest()]]) {
    const { out, zip } = build(target, manifest);
    console.log(`${target}: ${path.relative(ROOT, out)}/  ${path.relative(ROOT, zip)}`);
  }
}

module.exports = { chromeManifest, firefoxManifest, safariManifest, BACKGROUND, FIREFOX_ID };
