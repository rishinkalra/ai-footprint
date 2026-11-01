/* global FootprintStore, FootprintSites, FootprintFormat, FootprintIcons, FootprintRegions, FootprintI18n, FootprintCompare, FootprintDOM */
(function () {
  'use strict';
  var F = FootprintFormat;
  var Ic = FootprintIcons;
  var L = FootprintI18n;
  var C = FootprintCompare;
  var t = L.t;
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
  function loc() { return L.locale(); }
  function wh(v) { return F.join(F.energy(v, loc())); }
  function figure(pair) {
    return '<span class="num">' + esc(pair[0]) + '<span class="unit">' + esc(pair[1]) + '</span></span>';
  }
  function days(n) { return t('period_days', { count: n, n: F.num(n, loc()) }); }

  // Personal insights first; general tips fill the rest unless an insight covers them.
  var GENERAL = [
    { covers: 'long-threads', icon: 'chat', key: 'gtip_new_chat' },
    { covers: 'reasoning', icon: 'spark', key: 'gtip_small_model' },
    { covers: null, icon: 'target', key: 'gtip_one_prompt' },
    { covers: 'images', icon: 'image', key: 'gtip_images' }
  ];
  var INSIGHT_ICON = { 'long-threads': 'chat', reasoning: 'spark', images: 'image' };

  function ring(todayWh, goalWh) {
    var R = 38, Cc = 2 * Math.PI * R;
    var track = '<circle class="track" cx="46" cy="46" r="' + R + '" fill="none" stroke-width="8"/>';
    if (!(goalWh > 0)) {
      return '<div><div class="ring"><svg width="92" height="92" viewBox="0 0 92 92">' + track + '</svg>' +
        '<div class="in"><span class="num">' + esc(wh(todayWh)) + '</span><span class="label">' + esc(t('ring_today')) + '</span></div></div>' +
        '<div class="ring-cap">' + esc(t('ring_no_goal')) + '</div></div>';
    }
    var pct = todayWh / goalWh;
    var over = pct > 1;
    return '<div><div class="ring' + (over ? ' over' : '') + '" role="img" aria-label="' + esc(t('ring_aria', { a: wh(todayWh), b: wh(goalWh) })) + '">' +
      '<svg width="92" height="92" viewBox="0 0 92 92">' + track +
      '<circle class="arc" cx="46" cy="46" r="' + R + '" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + Cc + '" stroke-dashoffset="' + (Cc * (1 - Math.min(1, pct))) + '"/></svg>' +
      '<div class="in"><span class="num">' + esc(F.num(Math.round(pct * 100), loc())) + '%</span><span class="label">' + esc(t('ring_label')) + '</span></div></div>' +
      '<div class="ring-cap' + (over ? ' over' : '') + '">' + esc(over ? t('ring_over', { wh: wh(todayWh - goalWh) }) : t('ring_of', { a: wh(todayWh), b: wh(goalWh) })) + '</div></div>';
  }

  function trendChip(s) {
    if (range === 'today' || !(s.previousWh > 0) || !s.totals.wh) return '';
    var change = (s.totals.wh - s.previousWh) / s.previousWh;
    var down = change <= 0;
    var pct = F.num(Math.round(Math.abs(change) * 100), loc()) + '%';
    return '<span class="chip' + (down ? '' : ' sun') + ' trend">' + Ic.get(down ? 'down' : 'up', 13) +
      esc(t(down ? 'trend_down' : 'trend_up', { pct: pct, days: days(s.range.days) })) + '</span>';
  }

  function renderEmpty(s) {
    $('hero').className = 'card empty';
    FootprintDOM.set($('hero'), '<h2>' + esc(t('empty_title')) + '</h2>' +
      '<p>' + esc(t('empty_body')) + '</p>' +
      '<div class="sites">' + FootprintSites.SITES.map(function (x) { return '<span class="chip">' + esc(x.name) + '</span>'; }).join('') + '</div>' +
      (s.goalWh > 0 ? '<p class="muted">' + esc(t('empty_goal', { wh: wh(s.goalWh), n: F.num(Math.round(s.goalWh / 0.3), loc()) })) + '</p>' : ''));
    ['stats', 'chart', 'apps'].forEach(function (id) { $(id).hidden = true; });
  }

  function render(state, settings) {
    L.setLocale(settings.language, navigator.languages);
    L.apply(document);
    var s = FootprintStore.summary(state || FootprintStore.newState('x'), settings, range, Date.now(), ENV);
    var tt = s.totals;
    var anyEver = state && Object.keys(state.days || {}).length > 0;
    ['stats', 'chart', 'apps'].forEach(function (id) { $(id).hidden = false; });
    if (!anyEver) { renderEmpty(s); renderTips(s); return; }

    // hero: the everyday comparison first, the number underneath
    $('hero').className = 'card hero';
    var local = tt.wh > 0 ? '<div class="local">' + Ic.get('globe', 13) + '<span>' +
      esc(t('hero_local', { pct: F.percent(s.perspective.share, loc()), country: C.country(s.region), days: days(s.range.days) })) + '</span></div>' : '';
    FootprintDOM.set($('hero'), '<div>' +
      '<div class="label">' + esc(t('period_' + range)) + '</div>' +
      '<div class="headline">' + esc(tt.wh > 0 ? C.energy(tt.wh, s.region.code).text : t('hero_none')) + '</div>' +
      '<div class="meta">' + esc(t('hero_meta', { wh: wh(tt.wh), replies: t('replies', { count: tt.turns, n: F.num(tt.turns, loc()) }) })) + '</div>' +
      '<div class="range">' + esc(t('hero_range', { low: wh(s.energyBand.low), high: wh(s.energyBand.high) })) + '</div>' +
      local + trendChip(s) +
      '</div>' + ring(s.today.wh, s.goalWh));

    // carbon, water, cost: each with an everyday meaning
    var plans = Object.keys(s.planCost);
    var costMain = plans.length ? plans.map(function (c) { return F.money(s.planCost[c], c, loc()); }).join(' + ') : F.money(tt.apiValueUsd, 'USD', loc());
    var costSub = plans.length ? (range === 'today' ? t('cost_plans_day') : t('cost_plans_days', { n: s.range.days })) : t('cost_api');
    var eq = s.equivalents;
    FootprintDOM.set($('stats'),
      '<div class="stat" title="' + esc(t('carbon_basis', { basis: s.carbon.label, g: Math.round(s.carbon.kgPerKwh * 1000) })) + '"><span class="label">' + esc(t('stat_carbon')) + '</span><span class="v">' + figure(F.carbon(tt.co2g, loc())) + '</span><span class="s">' + (tt.co2g > 0 ? esc(C.carbon(eq.carKm, s.region.miles)) : '—') + '</span></div>' +
      '<div class="stat"><span class="label">' + esc(t('stat_water')) + '</span><span class="v">' + figure(F.water(tt.waterMl, loc())) + '</span><span class="s">' + esc(t('water_cooling', { amount: C.water(tt.waterMl) })) + '</span></div>' +
      '<div class="stat"><span class="label">' + esc(t('stat_cost')) + '</span><span class="v"><span class="num">' + esc(costMain) + '</span></span><span class="s">' + esc(costSub) + '</span></div>');

    renderChart(s);
    renderApps(s);
    renderTips(s);
  }

  function renderChart(s) {
    if (range === 'today') { $('chart').hidden = true; return; }
    var list = s.daily;
    var max = Math.max.apply(null, list.map(function (d) { return d.totals.wh; }));
    var top = niceMax(max);
    var html = '<div class="chart-head"><h2 class="label">' + esc(t('chart_title')) + '</h2><span class="readout" id="readout"></span></div>' +
      '<div class="cols" id="cols">' +
      '<div class="grid" style="bottom:100%"><span>' + esc(wh(top)) + '</span></div>' +
      '<div class="grid" style="bottom:50%"></div>' +
      list.map(function (d, i) {
        var v = d.totals.wh;
        var h = top > 0 ? (v / top) * 100 : 0;
        var label = F.shortDate(d.date, loc()) + ' · ' + wh(v) + ' · ' + t('replies', { count: d.totals.turns, n: F.num(d.totals.turns, loc()) });
        return '<button type="button" class="col' + (i === list.length - 1 ? ' today' : '') + (v === 0 ? ' zero' : '') + '" data-label="' + esc(label) + '" aria-label="' + esc(label) + '">' +
          '<i style="height:' + h + '%"></i></button>';
      }).join('') + '</div>' +
      '<div class="ticks"><span>' + esc(F.shortDate(list[0].date, loc())) + '</span><span>' + esc(t('chart_today')) + '</span></div>';
    FootprintDOM.set($('chart'), html);
    var readout = $('readout');
    var rest = t('chart_readout_today', { wh: wh(list[list.length - 1].totals.wh) });
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
    FootprintDOM.set($('apps'), '<div class="sec-title"><h2>' + esc(t('apps_title')) + '</h2><span class="label">' + esc(t('apps_count', { count: ids.length, n: ids.length })) + '</span></div>' +
      ids.map(function (id) {
        var v = s.bySite[id].wh;
        var share = total > 0 ? v / total : 0;
        var shareText = share > 0 && share < 0.01 ? '<1%' : F.num(Math.round(share * 100), loc()) + '%';
        return '<div class="app"><span class="mono" aria-hidden="true">' + esc(MONO[id] || id.slice(0, 2)) + '</span>' +
          '<span class="name">' + esc(SITE[id] ? SITE[id].name : id) + '</span>' +
          '<span class="val">' + esc(wh(v)) + '<small>' + esc(shareText) + '</small></span>' +
          '<div class="bar"><span style="width:' + (max > 0 ? Math.max(2, (v / max) * 100) : 0) + '%"></span></div></div>';
      }).join(''));
  }

  function renderTips(s) {
    var items = s.insights.map(function (i) {
      var p = Object.assign({}, i.params, { pct: F.num(i.params.pct, loc()) + '%' });
      return { icon: INSIGHT_ICON[i.id] || 'leaf', text: t(i.key, p), personal: true };
    });
    var covered = s.insights.map(function (i) { return i.id; });
    var day = Math.floor(Date.now() / 864e5);
    for (var k = 0; items.length < 2 && k < GENERAL.length; k++) {
      var g = GENERAL[(day + k) % GENERAL.length];
      if (covered.indexOf(g.covers) === -1) items.push({ icon: g.icon, text: t(g.key) });
    }
    FootprintDOM.set($('tips'), '<div class="sec-title"><h2>' + esc(t('tips_title')) + '</h2></div>' + items.map(function (x) {
      return '<div class="tip' + (x.personal ? ' personal' : '') + '"><span class="ic">' + Ic.get(x.icon, 16) + '</span><div>' +
        (x.personal ? '<span class="chip sun">' + esc(t('tips_personal')) + '</span>' : '') + '<p>' + esc(x.text) + '</p></div></div>';
    }).join(''));
  }

  function chrome_() {
    FootprintDOM.set($('mark'), Ic.get('mark', 22));
    FootprintDOM.set($('private'), Ic.get('lock', 13) + esc(t('foot_private')));
    FootprintDOM.set($('shareLink'), Ic.get('share', 15) + esc(t('foot_share')));
    FootprintDOM.set($('settingsLink'), Ic.get('gear', 15) + esc(t('foot_settings')));
  }

  function load() {
    chrome.storage.local.get(['state', 'settings'], function (data) {
      lastState = data.state;
      lastSettings = FootprintStore.mergeSettings(data.settings);
      L.setLocale(lastSettings.language, navigator.languages);
      chrome_();
      render(lastState, lastSettings);
    });
  }

  $('rangeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    range = b.getAttribute('data-range');
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (lastSettings) render(lastState, lastSettings);
  });
  function checkAccess() {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    chrome.permissions.contains({ origins: FootprintSites.origins() }, function (ok) { $('access').hidden = !!ok; });
  }
  $('allow').addEventListener('click', function () {
    chrome.permissions.request({ origins: FootprintSites.origins() }, function () { checkAccess(); });
  });
  checkAccess();

  chrome.storage.onChanged.addListener(load);
  load();
})();
