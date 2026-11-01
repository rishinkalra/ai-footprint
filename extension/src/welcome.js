/* global FootprintSites, FootprintIcons, FootprintFormat, FootprintRegions, FootprintI18n, FootprintCompare, FootprintDOM */
(function () {
  'use strict';
  var I = FootprintIcons;
  var L = FootprintI18n;
  var Cmp = FootprintCompare;
  var F = FootprintFormat;
  var tr = L.t;
  L.setLocale('', navigator.languages);
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  FootprintDOM.set($('mark'), I.get('mark', 26));
  FootprintDOM.set($('pvMark'), I.get('mark', 15));
  FootprintDOM.set($('pvIcon'), I.get('chat', 14));
  FootprintDOM.set($('ic1'), I.get('leaf', 18));
  FootprintDOM.set($('ic2'), I.get('lock', 18));
  FootprintDOM.set($('ic3'), I.get('check', 18));
  FootprintDOM.set($('sites'), FootprintSites.SITES.map(function (s) { return '<span class="chip">' + esc(s.name) + '</span>'; }).join(''));
  FootprintDOM.set($('links'), FootprintSites.SITES.slice(0, 4).map(function (s) {
    return '<a class="btn" href="https://' + esc(s.hosts[0]) + '/" target="_blank" rel="noreferrer">' + esc(tr('w_open', { site: s.name })) + '</a>';
  }).join(''));

  // Firefox can leave site access off until the user allows it.
  function checkAccess() {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    chrome.permissions.contains({ origins: FootprintSites.origins() }, function (ok) { $('access').hidden = !!ok; });
  }
  $('allow').addEventListener('click', function () {
    chrome.permissions.request({ origins: FootprintSites.origins() }, function () { checkAccess(); });
  });
  checkAccess();

  var region = FootprintRegions.info(FootprintRegions.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone));
  // Example badge in the preview, in the user's language and local comparison.
  L.apply(document);
  $('pvTip').textContent = tr('tip_long', { k: 25, x: 10 });
  $('pvHead').textContent = Cmp.energy(0.31, region.code).text;
  $('pvWh').textContent = F.join(F.energy(0.31, L.locale()));
  $('pvGoal').textContent = tr('badge_goal', { pct: '38%' });

  var slider = $('goal');
  function show(v) {
    $('goalNum').textContent = v;
    $('goalEq').textContent = tr('w_goal_eq', { n: F.num(Math.round(v / 0.3), L.locale()), cmp: Cmp.energy(v, region.code).text }) + ' ' +
      tr('w_goal_local', { pct: F.percent(v / region.perPersonWhDay, L.locale()), country: Cmp.country(region) });
    document.querySelectorAll('[data-goal]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-goal')) === v)); });
  }
  slider.addEventListener('input', function () { show(Number(slider.value)); });
  document.querySelectorAll('[data-goal]').forEach(function (b) {
    b.addEventListener('click', function () { slider.value = b.getAttribute('data-goal'); show(Number(slider.value)); });
  });

  chrome.storage.local.get('settings', function (data) {
    var g = data.settings && data.settings.dailyGoalWh;
    if (g > 0) slider.value = Math.min(100, g);
    show(Number(slider.value));
  });

  $('start').addEventListener('click', function () {
    chrome.storage.local.get('settings', function (data) {
      var s = data.settings || {};
      s.dailyGoalWh = Number(slider.value);
      chrome.storage.local.set({ settings: s }, function () {
        FootprintDOM.set($('saved'), I.get('check', 16) + esc(tr('w_saved')));
        $('next').hidden = false;
        $('next').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      });
    });
  });
})();
