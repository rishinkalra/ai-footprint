/* global importScripts, browser, FootprintCore, FootprintStore, FootprintSites, FootprintRegions, FootprintI18n, FootprintFormat, FootprintCompare */
// Background: records turns, keeps totals in chrome.storage.local, and (only if
// the user turns it on) syncs daily totals to their own dashboard.
// Chrome runs this as a service worker and loads the helpers here; Firefox runs it
// as an event page whose manifest loads them first (see tools/build.js).
if (typeof importScripts === 'function' && typeof FootprintStore === 'undefined') {
  importScripts('core.js', 'sites.js', 'regions-data.js', 'regions.js', 'store.js', 'format.js', 'i18n.js',
    'locales/en.js', 'locales/hi.js', 'locales/es.js', 'compare.js');
}

// Promise-returning API: `browser` in Firefox and Safari, `chrome` in Chrome (MV3).
var ext = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

var SYNC_ALARM = 'ai-footprint-sync';
var queue = Promise.resolve();

// Serialise storage updates so concurrent replies can't overwrite each other.
function withState(fn) {
  queue = queue.then(function () {
    return ext.storage.local.get(['state', 'settings']).then(function (data) {
      var state = data.state || FootprintStore.newState(crypto.randomUUID());
      var settings = FootprintStore.mergeSettings(data.settings);
      var result = fn(state, settings);
      return ext.storage.local.set({ state: state }).then(function () { return result; });
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
      res.ui = badgeText(res, settings, settings.region || env.region);
      if (settings.sync && settings.sync.enabled && settings.sync.url) {
        chrome.alarms.create(SYNC_ALARM, { delayInMinutes: 1 });
      }
      return res;
    }).then(sendResponse, function () { sendResponse(null); });
    return true; // async response
  }

  if (msg.type === 'hide-badge-site') {
    ext.storage.local.get('settings').then(function (data) {
      var s = data.settings || {};
      s.badgeHidden = s.badgeHidden || {};
      s.badgeHidden[msg.site] = true;
      return ext.storage.local.set({ settings: s });
    });
    return false;
  }

  if (msg.type === 'badge-min') {
    ext.storage.local.get('settings').then(function (data) {
      var s = data.settings || {};
      s.badgeMin = s.badgeMin || {};
      s.badgeMin[msg.site] = !!msg.value;
      return ext.storage.local.set({ settings: s });
    });
    return false;
  }

  if (msg.type === 'open-popup') {
    var open = ext.action && ext.action.openPopup ? ext.action.openPopup() : Promise.reject();
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

// Everything the in-page badge shows, in the user's language and with local comparisons.
var TIP_TITLE = { 'long-thread': 'tip_title_long', 'reasoning-short': 'tip_title_reasoning', image: 'tip_title_image', goal: 'tip_title_goal' };
function badgeText(res, settings, region) {
  var I = FootprintI18n, F = FootprintFormat, C = FootprintCompare;
  I.setLocale(settings.language, navigator.languages);
  var loc = I.locale();
  var t = I.t;
  var wh = function (v) { return F.join(F.energy(v, loc)); };
  var headline = C.energy(res.replyWh, region).text;
  var goal = res.goalWh > 0;
  var tip = null;
  if (res.tip) {
    var params = Object.assign({}, res.tip.params);
    if (res.tip.id === 'goal') params.wh = wh(res.tip.params.goalWh);
    tip = { id: res.tip.id, title: t(TIP_TITLE[res.tip.id] || 'tip_title_goal'), text: t(res.tip.key, params) };
  }
  return {
    lang: loc,
    headline: headline,
    replyWh: wh(res.replyWh),
    goalShare: goal ? Math.min(1, res.todayWh / res.goalWh) : null,
    goalText: goal ? t('badge_goal', { pct: F.percent(res.todayWh / res.goalWh, loc) }) : t('badge_today', { wh: wh(res.todayWh) }),
    aria: t('badge_aria', { cmp: headline, wh: wh(res.replyWh) }),
    minimise: t('badge_minimise'),
    expand: t('badge_expand'),
    dismiss: t('badge_dismiss'),
    hideSite: t('tip_hide_site'),
    ok: t('tip_ok'),
    detailTitle: t('detail_title'),
    detailRows: [
      [t('detail_energy'), wh(res.replyWh)],
      [t('detail_carbon'), F.join(F.carbon(res.replyCo2g, loc))],
      [t('detail_water'), C.water(res.replyWaterMl)]
    ],
    detailFoot: t('size_' + (res.tier || 'medium')) + (res.reasoning ? ', ' + t('detail_thinking') : '') + '. ' + t('detail_note'),
    tip: tip
  };
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === SYNC_ALARM) syncNow().catch(function () { /* retried on next reply */ });
});

function syncNow() {
  return ext.storage.local.get(['state', 'settings']).then(function (data) {
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
