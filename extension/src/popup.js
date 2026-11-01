/* global FootprintCore, FootprintStore, FootprintSites, FootprintFormat, FootprintIcons, FootprintRegions */
(function () {
  'use strict';
  var F = FootprintFormat;
  var I = FootprintIcons;
  var range = '7d';
  var ENV = { region: FootprintRegions.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone) };
  var lastState = null;
  var lastSettings = null;

  if (new URLSearchParams(location.search).get('tab')) document.body.classList.add('tab');

  var SITE = {};
  FootprintSites.SITES.forEach(function (s) { SITE[s.id] = s; });
  var MONO = { chatgpt: 'Ch', claude: 'Cl', gemini: 'Ge', perplexity: 'Px', copilot: 'Co', deepseek: 'DS', mistral: 'LC', grok: 'Gk' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function figure(pair, cls) {
    return '<span class="num ' + (cls || '') + '">' + esc(pair[0]) + '<span class="unit">' + esc(pair[1]) + '</span></span>';
  }

  var PERIOD = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };

  // Personal insights first; general tips fill the rest unless an insight covers them.
  var GENERAL = [
    { covers: 'long-threads', icon: 'chat', text: 'Start a new chat for a new topic. Every reply re-reads the whole conversation.' },
    { covers: 'reasoning', icon: 'spark', text: 'Quick questions rarely need a thinking model. Save them for hard problems.' },
    { covers: null, icon: 'target', text: 'One clear prompt beats several regenerations.' },
    { covers: 'images', icon: 'image', text: 'An image uses about as much energy as ten text replies. Describe it precisely to avoid re-rolls.' }
  ];
  var INSIGHT_ICON = { 'long-threads': 'chat', reasoning: 'spark', images: 'image' };

  function ring(todayWh, goalWh) {
    var R = 38, C = 2 * Math.PI * R;
    if (!(goalWh > 0)) {
      return '<div><div class="ring"><svg width="92" height="92" viewBox="0 0 92 92"><circle class="track" cx="46" cy="46" r="' + R + '" fill="none" stroke-width="8"/></svg>' +
        '<div class="in"><span class="num">' + esc(F.join(F.energy(todayWh))) + '</span><span class="label">today</span></div></div>' +
        '<div class="ring-cap">No daily goal</div></div>';
    }
    var pct = todayWh / goalWh;
    var over = pct > 1;
    var shown = Math.min(1, pct);
    return '<div><div class="ring' + (over ? ' over' : '') + '" role="img" aria-label="Today ' + esc(F.join(F.energy(todayWh))) + ' of a ' + esc(F.join(F.energy(goalWh))) + ' goal">' +
      '<svg width="92" height="92" viewBox="0 0 92 92"><circle class="track" cx="46" cy="46" r="' + R + '" fill="none" stroke-width="8"/>' +
      '<circle class="arc" cx="46" cy="46" r="' + R + '" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - shown)) + '"/></svg>' +
      '<div class="in"><span class="num">' + Math.round(pct * 100) + '%</span><span class="label">today\'s goal</span></div></div>' +
      '<div class="ring-cap' + (over ? ' over' : '') + '">' + (over ? 'Over by ' + esc(F.join(F.energy(todayWh - goalWh))) : esc(F.join(F.energy(todayWh))) + ' of ' + esc(F.join(F.energy(goalWh)))) + '</div></div>';
  }

  function trendChip(s) {
    if (range === 'today' || !(s.previousWh > 0) || !s.totals.wh) return '';
    var change = (s.totals.wh - s.previousWh) / s.previousWh;
    var down = change <= 0;
    return '<span class="chip' + (down ? '' : ' sun') + ' trend">' + I.get(down ? 'down' : 'up', 13) +
      Math.round(Math.abs(change) * 100) + '% vs previous ' + s.range.days + ' days</span>';
  }

  function renderEmpty(s) {
    $('hero').className = 'card empty';
    $('hero').innerHTML = '<h2>Your AI footprint starts here</h2>' +
      '<p>Chat as usual on any of these apps. After each reply, a small badge shows its energy, and your totals appear here.</p>' +
      '<div class="sites">' + FootprintSites.SITES.map(function (x) { return '<span class="chip">' + esc(x.name) + '</span>'; }).join('') + '</div>' +
      (s.goalWh > 0 ? '<p class="muted">Your daily goal: ' + esc(F.join(F.energy(s.goalWh))) + ', about ' + Math.round(s.goalWh / 0.3) + ' typical replies.</p>' : '');
    ['stats', 'chart', 'apps'].forEach(function (id) { $(id).hidden = true; });
  }

  function render(state, settings) {
    var s = FootprintStore.summary(state || FootprintStore.newState('x'), settings, range, Date.now(), ENV);
    var t = s.totals;
    var anyEver = state && Object.keys(state.days || {}).length > 0;
    ['stats', 'chart', 'apps'].forEach(function (id) { $(id).hidden = false; });

    if (!anyEver) { renderEmpty(s); renderTips(s); return; }

    // hero
    $('hero').className = 'card hero';
    $('hero').innerHTML = '<div>' +
      '<div class="label">Energy · ' + esc(PERIOD[range]) + '</div>' +
      '<div class="big">' + figure(F.energy(t.wh)) + '</div>' +
      '<div class="range">Likely ' + esc(F.join(F.energy(s.energyBand.low))) + ' to ' + esc(F.join(F.energy(s.energyBand.high))) + ' · ' + esc(F.plural(t.turns, 'reply', 'replies')) + '</div>' +
      (t.wh > 0 ? '<div class="compare">That is ' + esc(F.energyComparison(t.wh)) + '.</div>' : '<div class="compare">No AI replies in this period.</div>') +
      (t.wh > 0 ? '<div class="local">' + I.get('globe', 13) + '<span>' + esc(F.percent(s.perspective.share)) + ' of the electricity one person in ' + esc(s.region.inName) +
        ' uses in ' + (s.range.days === 1 ? 'a day' : s.range.days + ' days') + '</span></div>' : '') +
      trendChip(s) +
      '</div>' + ring(s.today.wh, s.goalWh);

    // secondary figures
    var plans = Object.keys(s.planCost);
    var costMain = plans.length ? plans.map(function (c) { return F.money(s.planCost[c], c); }).join(' + ') : F.money(t.apiValueUsd, 'USD');
    var costSub = plans.length ? 'plans, ' + (range === 'today' ? 'per day' : s.range.days + ' days') : 'at API prices';
    var eq = s.equivalents;
    $('stats').innerHTML =
      '<div class="stat" title="Carbon based on ' + esc(s.carbon.label) + ', ' + esc(Math.round(s.carbon.kgPerKwh * 1000)) + ' g CO₂e per kWh"><span class="label">Carbon</span><span class="v">' + figure(F.carbon(t.co2g)) + '</span><span class="s">' + (t.co2g > 0 ? 'like driving ' + esc(F.distance(eq.carKm, undefined, s.region.miles)) : '—') + '</span></div>' +
      '<div class="stat"><span class="label">Water</span><span class="v">' + figure(F.water(t.waterMl)) + '</span><span class="s">for cooling</span></div>' +
      '<div class="stat"><span class="label">Cost</span><span class="v"><span class="num">' + esc(costMain) + '</span></span><span class="s">' + esc(costSub) + '</span></div>';

    renderChart(s);
    renderApps(s);
    renderTips(s);
  }

  function renderChart(s) {
    if (range === 'today') { $('chart').hidden = true; return; }
    var days = s.daily;
    var max = Math.max.apply(null, days.map(function (d) { return d.totals.wh; }));
    var top = niceMax(max);
    var html = '<div class="chart-head"><h2 class="label">Energy per day</h2><span class="readout" id="readout"></span></div>' +
      '<div class="cols" id="cols">' +
      '<div class="grid" style="bottom:100%"><span>' + esc(F.join(F.energy(top))) + '</span></div>' +
      '<div class="grid" style="bottom:50%"></div>' +
      days.map(function (d, i) {
        var v = d.totals.wh;
        var h = top > 0 ? (v / top) * 100 : 0;
        var label = F.shortDate(d.date) + ' · ' + F.join(F.energy(v)) + ' · ' + F.plural(d.totals.turns, 'reply', 'replies');
        return '<button type="button" class="col' + (i === days.length - 1 ? ' today' : '') + (v === 0 ? ' zero' : '') + '" data-label="' + esc(label) + '" aria-label="' + esc(label) + '">' +
          '<i style="height:' + h + '%"></i></button>';
      }).join('') + '</div>' +
      '<div class="ticks"><span>' + esc(F.shortDate(days[0].date)) + '</span><span>Today</span></div>';
    $('chart').innerHTML = html;
    var readout = $('readout');
    var last = days[days.length - 1];
    var rest = 'Today · ' + F.join(F.energy(last.totals.wh));
    readout.textContent = rest;
    var cols = $('cols');
    var show = function (e) { var c = e.target.closest('.col'); readout.textContent = c ? c.getAttribute('data-label') : rest; };
    cols.addEventListener('mouseover', show);
    cols.addEventListener('focusin', show);
    cols.addEventListener('mouseleave', function () { readout.textContent = rest; });
    cols.addEventListener('focusout', function () { readout.textContent = rest; });
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  function renderApps(s) {
    var ids = Object.keys(s.bySite).filter(function (id) { return s.bySite[id].turns > 0; })
      .sort(function (a, b) { return s.bySite[b].wh - s.bySite[a].wh; });
    if (!ids.length) { $('apps').hidden = true; return; }
    var total = ids.reduce(function (sum, id) { return sum + s.bySite[id].wh; }, 0);
    var max = s.bySite[ids[0]].wh;
    $('apps').innerHTML = '<div class="sec-title"><h2>By app</h2><span class="label">' + esc(F.plural(ids.length, 'app', 'apps')) + '</span></div>' +
      ids.map(function (id) {
        var v = s.bySite[id].wh;
        var share = total > 0 ? v / total : 0;
        var shareText = share > 0 && share < 0.01 ? '<1%' : Math.round(share * 100) + '%';
        return '<div class="app"><span class="mono" aria-hidden="true">' + esc(MONO[id] || id.slice(0, 2)) + '</span>' +
          '<span class="name">' + esc(SITE[id] ? SITE[id].name : id) + '</span>' +
          '<span class="val">' + esc(F.join(F.energy(v))) + '<small>' + shareText + '</small></span>' +
          '<div class="bar"><span style="width:' + (max > 0 ? Math.max(2, (v / max) * 100) : 0) + '%"></span></div></div>';
      }).join('');
  }

  function renderTips(s) {
    var items = s.insights.map(function (i) { return { icon: INSIGHT_ICON[i.id] || 'leaf', text: i.text, personal: true }; });
    var covered = s.insights.map(function (i) { return i.id; });
    var day = Math.floor(Date.now() / 864e5);
    for (var k = 0; items.length < 2 && k < GENERAL.length; k++) {
      var g = GENERAL[(day + k) % GENERAL.length];
      if (covered.indexOf(g.covers) === -1) items.push({ icon: g.icon, text: g.text });
    }
    $('tips').innerHTML = '<div class="sec-title"><h2>Lighter habits</h2></div>' + items.map(function (x) {
      return '<div class="tip' + (x.personal ? ' personal' : '') + '"><span class="ic">' + I.get(x.icon, 16) + '</span><div>' +
        (x.personal ? '<span class="chip sun">From your use</span>' : '') + '<p>' + esc(x.text) + '</p></div></div>';
    }).join('');
  }

  function load() {
    chrome.storage.local.get(['state', 'settings'], function (data) {
      lastState = data.state;
      lastSettings = FootprintStore.mergeSettings(data.settings);
      render(lastState, lastSettings);
    });
  }

  // static chrome
  $('mark').innerHTML = I.get('mark', 22);
  $('private').innerHTML = I.get('lock', 13) + 'Private · stays on this device';
  $('shareLink').innerHTML = I.get('share', 15) + 'Share';
  $('settingsLink').innerHTML = I.get('gear', 15) + 'Settings';

  $('rangeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    range = b.getAttribute('data-range');
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (lastSettings) render(lastState, lastSettings);
  });
  chrome.storage.onChanged.addListener(load);
  load();
})();
