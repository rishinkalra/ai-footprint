/* global importScripts, FootprintCore, FootprintStore, FootprintSites, FootprintRegions */
// Service worker: records turns, keeps totals in chrome.storage.local, and
// (only if the user turns it on) syncs daily totals to their own dashboard.
importScripts('core.js', 'sites.js', 'regions-data.js', 'regions.js', 'store.js');

var SYNC_ALARM = 'ai-footprint-sync';
var queue = Promise.resolve();

// Serialise storage updates so concurrent replies can't overwrite each other.
function withState(fn) {
  queue = queue.then(function () {
    return chrome.storage.local.get(['state', 'settings']).then(function (data) {
      var state = data.state || FootprintStore.newState(crypto.randomUUID());
      var settings = FootprintStore.mergeSettings(data.settings);
      var result = fn(state, settings);
      return chrome.storage.local.set({ state: state }).then(function () { return result; });
    });
  });
  return queue;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'turn') {
    var from = sender.url || (sender.tab && sender.tab.url);
    var site = from ? FootprintSites.siteForHost(new URL(from).hostname) : null;
    if (!site || site.id !== msg.site) { sendResponse(null); return false; }
    withState(function (state, settings) {
      var env = { region: FootprintRegions.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone) };
      var res = FootprintStore.recordTurn(state, msg, settings, Date.now(), env);
      if (settings.sync && settings.sync.enabled && settings.sync.url) {
        chrome.alarms.create(SYNC_ALARM, { delayInMinutes: 1 });
      }
      return res;
    }).then(sendResponse, function () { sendResponse(null); });
    return true; // async response
  }

  if (msg.type === 'hide-badge-site') {
    chrome.storage.local.get('settings').then(function (data) {
      var s = data.settings || {};
      s.badgeHidden = s.badgeHidden || {};
      s.badgeHidden[msg.site] = true;
      return chrome.storage.local.set({ settings: s });
    });
    return false;
  }

  if (msg.type === 'badge-min') {
    chrome.storage.local.get('settings').then(function (data) {
      var s = data.settings || {};
      s.badgeMin = s.badgeMin || {};
      s.badgeMin[msg.site] = !!msg.value;
      return chrome.storage.local.set({ settings: s });
    });
    return false;
  }

  if (msg.type === 'open-popup') {
    var open = chrome.action.openPopup ? chrome.action.openPopup() : Promise.reject();
    Promise.resolve(open).catch(function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/popup.html?tab=1') });
    });
    return false;
  }

  if (msg.type === 'sync-now') {
    syncNow().then(sendResponse, function (e) { sendResponse({ ok: false, error: e.message }); });
    return true;
  }
  return false;
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === SYNC_ALARM) syncNow().catch(function () { /* retried on next reply */ });
});

function syncNow() {
  return chrome.storage.local.get(['state', 'settings']).then(function (data) {
    var settings = FootprintStore.mergeSettings(data.settings);
    var state = data.state;
    if (!state || !settings.sync.enabled || !settings.sync.url) return { ok: false, error: 'Sync is off' };
    var sites = {};
    FootprintSites.SITES.forEach(function (s) { sites[s.id] = s; });
    var events = FootprintStore.syncEvents(state, sites);
    if (!events.length) return { ok: true, sent: 0 };
    var url = settings.sync.url.replace(/\/+$/, '') + '/ai-footprint/api/events';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-footprint-key': settings.sync.key || '' },
      body: JSON.stringify({ events: events })
    }).then(function (res) {
      if (!res.ok) throw new Error('Dashboard answered HTTP ' + res.status);
      var synced = Object.keys(state.dirty);
      return withState(function (s) {
        synced.forEach(function (d) { if (d !== FootprintCore.localDate()) delete s.dirty[d]; });
        s.lastSync = Date.now();
        return { ok: true, sent: events.length };
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') });
});
