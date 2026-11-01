/* global FootprintCore, FootprintStore, FootprintSites */
(function () {
  'use strict';
  var core = FootprintCore;
  var range = '7d';
  if (new URLSearchParams(location.search).get('tab')) document.body.classList.add('tab');

  var siteNames = {};
  FootprintSites.SITES.forEach(function (s) { siteNames[s.id] = s.name; });

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Two significant digits below 100 so small numbers never collapse to 0.
  function nf(n) {
    if (n === 0) return '0';
    var opts = Math.abs(n) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 2 };
    return new Intl.NumberFormat(undefined, opts).format(n);
  }
  function wh(v) { return v >= 1000 ? nf(v / 1000) + ' kWh' : nf(v) + ' Wh'; }
  function grams(v) { return v >= 1000 ? nf(v / 1000) + ' kg' : nf(v) + ' g'; }
  function ml(v) { return v >= 1000 ? nf(v / 1000) + ' L' : nf(v) + ' mL'; }
  function plural(n, one, many) { return nf(n) + ' ' + (Math.round(n * 100) / 100 === 1 ? one : many); }
  function distance(km) { return km >= 1 ? nf(km) + ' km' : nf(km * 1000) + ' m'; }
  function phone(n) { return n >= 1 ? plural(n, 'phone charge', 'phone charges') : nf(n * 100) + '% of a phone charge'; }
  function money(v, cur) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: v < 10 ? 2 : 0 }).format(v); }
    catch (e) { return nf(v, 2) + ' ' + cur; }
  }

  // Each general tip is skipped when a personalised insight already covers it.
  var STATIC_TIPS = [
    { covers: 'long-threads', text: 'Start a new chat for a new topic: every reply re-reads the whole conversation.' },
    { covers: 'reasoning', text: 'Use a smaller or faster model for quick questions; save thinking models for hard problems.' },
    { covers: null, text: 'Ask for what you need in one clear prompt instead of regenerating answers.' },
    { covers: 'images', text: 'Generate images only when you need them: one image costs about as much as a few dozen text replies.' }
  ];

  function render(state, settings) {
    var s = FootprintStore.summary(state || FootprintStore.newState('x'), settings, range, Date.now());
    var t = s.totals;

    var goal = settings.dailyGoalWh;
    var pct = goal > 0 ? Math.min(100, (s.today.wh / goal) * 100) : 0;
    $('goal').innerHTML = goal > 0
      ? '<div class="row"><span>Today <b>' + esc(wh(s.today.wh)) + '</b> of your ' + esc(wh(goal)) + ' goal</span><span class="muted">' +
        esc(s.today.turns) + ' replies</span></div><div class="bar' + (s.today.wh > goal ? ' over' : '') + '"><span style="width:' + pct + '%"></span></div>' +
        (s.today.wh > goal ? '<p class="empty" style="margin-top:6px">Over today\'s goal.</p>' : '')
      : '<div class="row"><span>Today <b>' + esc(wh(s.today.wh)) + '</b></span><span class="muted">no daily goal set</span></div>';

    var plans = Object.keys(s.planCost);
    var costMain = plans.length ? plans.map(function (c) { return money(s.planCost[c], c); }).join(' + ') : money(t.apiValueUsd, 'USD');
    var costSub = plans.length ? 'your plans, pro-rated · ' + money(t.apiValueUsd, 'USD') + ' at API prices' : 'value at API prices · add plans in Settings';
    var eq = s.equivalents;
    $('tiles').innerHTML = [
      ['Energy', wh(t.wh), 'likely ' + wh(s.energyBand.low) + ' – ' + wh(s.energyBand.high)],
      ['Carbon', grams(t.co2g) + ' CO₂e', '≈ driving a petrol car ' + distance(eq.carKm)],
      ['Water', ml(t.waterMl), eq.glassesOfWater >= 1 ? 'data-centre cooling, ≈ ' + plural(eq.glassesOfWater, 'glass', 'glasses') : 'for data-centre cooling'],
      ['Cost', costMain, costSub]
    ].map(function (x) {
      return '<div class="tile"><div class="label">' + esc(x[0]) + '</div><div class="value">' + esc(x[1]) + '</div><div class="sub">' + esc(x[2]) + '</div></div>';
    }).join('');

    var trend = '';
    if (t.turns) {
      trend = esc(plural(t.turns, 'reply', 'replies')) + ' ≈ ' + esc(phone(eq.phoneCharges)) + ', or ' + esc(plural(eq.googleSearches, 'web search', 'web searches')) + '.';
      if (range !== 'today' && s.previousWh > 0) {
        var change = (t.wh - s.previousWh) / s.previousWh;
        var word = change <= 0 ? 'down' : 'up';
        trend += ' ' + (change <= 0 ? '↓' : '↑') + ' ' + word + ' ' + Math.round(Math.abs(change) * 100) + '% on the previous ' + s.range.days + ' days.';
      }
    }
    $('trend').innerHTML = trend;

    var siteIds = Object.keys(s.bySite).sort(function (a, b) { return s.bySite[b].wh - s.bySite[a].wh; });
    var max = siteIds.length ? s.bySite[siteIds[0]].wh : 0;
    $('sites').innerHTML = siteIds.length ? siteIds.map(function (id) {
      var v = s.bySite[id].wh;
      return '<div class="site"><span>' + esc(siteNames[id] || id) + '</span><div class="bar"><span style="width:' + (max > 0 ? (v / max) * 100 : 0) +
        '%"></span></div><span class="v">' + esc(wh(v)) + '</span></div>';
    }).join('') : '<p class="empty">No AI replies recorded yet in this period. Open ChatGPT, Claude, Gemini, Copilot or Perplexity and chat as usual.</p>';

    var tips = s.insights.map(function (i) { return i.text; });
    var covered = s.insights.map(function (i) { return i.id; });
    var day = Math.floor(Date.now() / 864e5);
    for (var i = 0; tips.length < 3 && i < STATIC_TIPS.length; i++) {
      var tip = STATIC_TIPS[(day + i) % STATIC_TIPS.length];
      if (covered.indexOf(tip.covers) === -1) tips.push(tip.text);
    }
    $('insights').innerHTML = tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
  }

  function load() {
    chrome.storage.local.get(['state', 'settings'], function (data) {
      render(data.state, FootprintStore.mergeSettings(data.settings));
    });
  }

  $('rangeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    range = b.getAttribute('data-range');
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    load();
  });
  chrome.storage.onChanged.addListener(load);
  load();
})();
