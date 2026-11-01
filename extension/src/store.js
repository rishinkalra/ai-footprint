// Pure state functions for the extension. State lives in chrome.storage.local:
// {
//   version: 1,
//   installId: 'random',
//   days: { 'YYYY-MM-DD': { [siteId]: { [model]: totals } } },
//   threads: { [threadKey]: { tips: { id: true }, at: ms } },
//   goalNotified: 'YYYY-MM-DD',
//   dirty: { 'YYYY-MM-DD': true }       // days not yet synced to a dashboard
// }

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'), require('./regions'));
  else root.FootprintStore = factory(root.FootprintCore, root.FootprintRegions);
})(typeof self !== 'undefined' ? self : this, function (core, regions) {
  'use strict';

  var MAX_THREADS = 500;
  var KEEP_DAYS = 400;

  var DEFAULT_SETTINGS = {
    dailyGoalWh: 25,
    showBadge: true,
    sites: {},            // { siteId: false } turns a site off
    models: {},           // { siteId: 'claude-opus' } when the page doesn't say
    region: null,         // ISO country code; null = detect from the browser
    carbonBasis: null,    // 'datacentre' (default) | 'local' | 'world' | 'custom'
    carbonKgPerKwh: null, // used when carbonBasis is 'custom'
    plans: [],            // [{ name, monthly, currency }]
    sync: { enabled: false, url: '', key: '' }
  };

  function newState(randomId) {
    return { version: 1, installId: randomId, days: {}, threads: {}, goalNotified: null, dirty: {} };
  }

  function mergeSettings(saved) {
    var s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!saved) return s;
    for (var k in saved) {
      if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k]) && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var j in saved[k]) s[k][j] = saved[k][j];
      } else {
        s[k] = saved[k];
      }
    }
    return s;
  }

  function cleanNumber(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function cleanModel(v) {
    return typeof v === 'string' && v.trim() ? v.trim().toLowerCase().slice(0, 80) : null;
  }

  function regionOf(settings, env) {
    return settings.region || (env && env.region) || 'WORLD';
  }

  // Tokens from the content script's script-aware estimate, or from characters (older pages).
  function tokensOf(msg, key) {
    var t = msg[key + 'Tokens'];
    return t != null ? cleanNumber(t) : core.tokensFromChars(cleanNumber(msg[key + 'Chars']));
  }

  // msg from the content script:
  //   { site, model, promptTokens, contextTokens, outputTokens, images, threadKey }
  //   contextTokens is everything before the reply, the prompt included.
  // env: { region } detected from the browser when settings.region is unset.
  function recordTurn(state, msg, settings, nowMs, env) {
    var date = core.localDate(nowMs);
    var model = cleanModel(msg.model) || cleanModel(settings.models[msg.site]) || 'unknown';
    var contextTokens = tokensOf(msg, 'context');
    var outputTokens = tokensOf(msg, 'output');

    // Prompt cache: if this chat had a reply less than 5 minutes ago, the conversation
    // up to the end of that reply is still cached by the provider.
    var key = String(msg.threadKey || msg.site).slice(0, 300);
    var thread = state.threads[key] = state.threads[key] || { tips: {}, at: 0 };
    var cachedTokens = thread.at && nowMs - thread.at <= core.CACHE_TTL_MS
      ? Math.min(contextTokens, thread.lastTotalTokens || 0) : 0;

    var turn = {
      model: model,
      inputTokens: contextTokens,
      cachedTokens: cachedTokens,
      outputTokens: outputTokens,
      promptTokens: tokensOf(msg, 'prompt'),
      images: Math.min(20, Math.floor(cleanNumber(msg.images)))
    };
    var carbon = regions.carbonFactor(settings, regionOf(settings, env));
    var a = core.assessTurn(turn, { carbonKgPerKwh: carbon.kgPerKwh });

    var day = state.days[date] = state.days[date] || {};
    var site = day[msg.site] = day[msg.site] || {};
    var prev = site[model] || core.emptyTotals();
    site[model] = core.addTotals(prev, {
      turns: 1,
      inputTokens: a.inputTokens,
      cachedTokens: a.cachedTokens,
      outputTokens: a.outputTokens,
      images: turn.images,
      wh: a.wh,
      co2g: a.co2g,
      waterMl: a.waterMl,
      apiValueUsd: a.apiValueUsd,
      longThreadWh: contextTokens >= core.DEFAULTS.longThreadTokens ? a.wh : 0,
      reasoningWh: a.reasoning ? a.wh : 0
    });
    state.dirty[date] = true;

    thread.at = nowMs;
    thread.lastTotalTokens = contextTokens + outputTokens;

    // Nudges: at most one per reply, each kind once per thread.
    var tip = core.tipForTurn(turn, {
      longThreadTipShown: thread.tips['long-thread'],
      reasoningTipShown: thread.tips['reasoning-short'],
      imageTipShown: thread.tips.image
    });
    var todayWh = dayTotals(state, date).wh;
    if (!tip && settings.dailyGoalWh > 0 && todayWh >= settings.dailyGoalWh && state.goalNotified !== date) {
      tip = { id: 'goal', text: 'You have reached your daily AI energy goal of ' + settings.dailyGoalWh +
        ' Wh. Worth asking: does this next prompt need AI?' };
      state.goalNotified = date;
    }
    if (tip && tip.id !== 'goal') thread.tips[tip.id] = true;
    prune(state, nowMs);

    return {
      replyWh: a.wh,
      replyCo2g: a.co2g,
      replyWaterMl: a.waterMl,
      todayWh: todayWh,
      goalWh: settings.dailyGoalWh,
      tier: a.tier,
      reasoning: a.reasoning,
      tip: tip
    };
  }

  function prune(state, nowMs) {
    var keys = Object.keys(state.threads);
    if (keys.length > MAX_THREADS) {
      keys.sort(function (x, y) { return state.threads[x].at - state.threads[y].at; });
      keys.slice(0, keys.length - MAX_THREADS).forEach(function (k) { delete state.threads[k]; });
    }
    var cutoff = core.addDays(core.localDate(nowMs), -KEEP_DAYS);
    Object.keys(state.days).forEach(function (d) { if (d < cutoff) delete state.days[d]; });
  }

  function dayTotals(state, date) {
    var t = core.emptyTotals();
    var day = state.days[date] || {};
    for (var s in day) for (var m in day[s]) t = core.addTotals(t, day[s][m]);
    return t;
  }

  function rangeTotals(state, from, to) {
    var totals = core.emptyTotals();
    var bySite = {};
    var byModel = {};
    var daily = [];
    for (var d = from; d <= to; d = core.addDays(d, 1)) {
      var dayT = core.emptyTotals();
      var day = state.days[d] || {};
      for (var s in day) {
        for (var m in day[s]) {
          var x = day[s][m];
          dayT = core.addTotals(dayT, x);
          bySite[s] = core.addTotals(bySite[s] || core.emptyTotals(), x);
          byModel[m] = core.addTotals(byModel[m] || core.emptyTotals(), x);
        }
      }
      totals = core.addTotals(totals, dayT);
      daily.push({ date: d, totals: dayT });
    }
    return { totals: totals, bySite: bySite, byModel: byModel, daily: daily };
  }

  // Carbon and water always follow the user's current choices, so changing the
  // carbon basis or country updates past days too.
  function restate(t, kgPerKwh) {
    t.co2g = t.wh * kgPerKwh;
    t.waterMl = t.wh * core.DEFAULTS.waterLitresPerKwh;
    return t;
  }

  // range: 'today' | '7d' | '30d'
  // env: { region } detected from the browser when settings.region is unset.
  function summary(state, settings, range, nowMs, env) {
    var span = range === 'today' ? 1 : range === '30d' ? 30 : 7;
    var to = core.localDate(nowMs);
    var from = core.addDays(to, -(span - 1));
    var cur = rangeTotals(state, from, to);
    var prev = rangeTotals(state, core.addDays(from, -span), core.addDays(from, -1));
    var region = regions.info(regionOf(settings, env));
    var carbon = regions.carbonFactor(settings, region.code);
    var k = carbon.kgPerKwh;
    restate(cur.totals, k);
    restate(prev.totals, k);
    Object.keys(cur.bySite).forEach(function (x) { restate(cur.bySite[x], k); });
    Object.keys(cur.byModel).forEach(function (x) { restate(cur.byModel[x], k); });
    cur.daily.forEach(function (d) { restate(d.totals, k); });
    var today = restate(dayTotals(state, to), k);
    var personWh = region.perPersonWhDay * span;
    var planPerDay = {};
    (settings.plans || []).forEach(function (p) {
      var cur = String(p.currency || 'USD').toUpperCase();
      planPerDay[cur] = (planPerDay[cur] || 0) + cleanNumber(p.monthly) * 12 / 365;
    });
    var planCost = {};
    for (var c in planPerDay) planCost[c] = planPerDay[c] * span;
    return {
      range: { key: range, from: from, to: to, days: span },
      totals: cur.totals,
      energyBand: core.band(cur.totals.wh),
      previousWh: prev.totals.wh,
      bySite: cur.bySite,
      byModel: cur.byModel,
      daily: cur.daily,
      equivalents: core.equivalents(cur.totals, region.carGPerKm),
      insights: core.insights(cur.totals),
      today: today,
      region: region,
      carbon: carbon,
      // The period's AI energy as a share of the electricity one person in the
      // user's country uses over the same number of days (all uses, Ember data).
      perspective: { personWh: personWh, share: personWh > 0 ? cur.totals.wh / personWh : 0 },
      goalWh: settings.dailyGoalWh,
      planCost: planCost
    };
  }

  // Dashboard ingest events for dirty days: cumulative per day × site × model,
  // with stable ids so re-sending replaces rather than duplicates.
  function syncEvents(state, sites) {
    var events = [];
    Object.keys(state.dirty).forEach(function (date) {
      var day = state.days[date] || {};
      for (var s in day) {
        for (var m in day[s]) {
          var t = day[s][m];
          events.push({
            id: 'ext:' + state.installId + ':' + date + ':' + s + ':' + m,
            date: date,
            platform: s,
            provider: (sites[s] && sites[s].provider) || undefined,
            model: m === 'unknown' && sites[s] ? sites[s].defaultModel : m,
            billing: 'subscription',
            requests: t.turns,
            inputTokens: Math.max(0, t.inputTokens - (t.cachedTokens || 0)),
            cacheReadTokens: t.cachedTokens || 0,
            outputTokens: t.outputTokens,
            source: 'browser-extension',
            note: t.images ? t.images + ' generated images' : undefined
          });
        }
      }
    });
    return events;
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    newState: newState,
    mergeSettings: mergeSettings,
    recordTurn: recordTurn,
    dayTotals: dayTotals,
    summary: summary,
    syncEvents: syncEvents
  };
});
