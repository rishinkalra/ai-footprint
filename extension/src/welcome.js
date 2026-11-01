/* global FootprintSites, FootprintIcons, FootprintFormat, FootprintRegions */
(function () {
  'use strict';
  var I = FootprintIcons;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  $('mark').innerHTML = I.get('mark', 26);
  $('pvMark').innerHTML = I.get('mark', 15);
  $('pvIcon').innerHTML = I.get('chat', 14);
  $('ic1').innerHTML = I.get('leaf', 18);
  $('ic2').innerHTML = I.get('lock', 18);
  $('ic3').innerHTML = I.get('check', 18);
  $('sites').innerHTML = FootprintSites.SITES.map(function (s) { return '<span class="chip">' + esc(s.name) + '</span>'; }).join('');
  $('links').innerHTML = FootprintSites.SITES.slice(0, 4).map(function (s) {
    return '<a class="btn" href="https://' + esc(s.hosts[0]) + '/" target="_blank" rel="noreferrer">Open ' + esc(s.name) + '</a>';
  }).join('');

  var region = FootprintRegions.info(FootprintRegions.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone));
  var slider = $('goal');
  function show(v) {
    $('goalNum').textContent = v;
    $('goalEq').textContent = 'About ' + Math.round(v / 0.3) + ' typical replies a day. That is ' + FootprintFormat.percent(v / region.perPersonWhDay) +
      ' of the electricity one person in ' + region.inName + ' uses in a day.';
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
        $('saved').innerHTML = I.get('check', 16) + 'Saved';
        $('next').hidden = false;
        $('next').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      });
    });
  });
})();
