// AI Footprint website. The calculator uses the extension's own modules
// (copied in by site/build.sh), so its comparisons match the extension exactly.
(function () {
  'use strict';

  var I = window.FootprintI18n;
  var F = window.FootprintFormat;
  var R = window.FootprintRegions;
  var C = window.FootprintCompare;
  var REPO = 'rishinkalra/ai-footprint';

  // Energy per item, from METHODOLOGY.md: a typical medium-model reply (section 3),
  // a generated image (Luccioni et al. 2023) and a coding-agent turn (worked example C).
  var WH = { chat: 0.3, image: 2.9, agent: 4 };
  var WATER_ML_PER_WH = 1.1;          // 1.1 L/kWh, METHODOLOGY.md section 5
  var RANGE = { low: 0.4, high: 3 };  // likely range shown everywhere
  var REFERENCE = ['US', 'GB', 'IN', 'NG'];

  // Header hairline once the page scrolls.
  var top = document.querySelector('.top');
  function onScroll() { top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Point download buttons straight at the latest release files.
  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.assets) return;
      var chrome = rel.assets.find(function (a) { return /chrome/i.test(a.name); });
      var firefox = rel.assets.find(function (a) { return /firefox/i.test(a.name); });
      if (chrome) ['dl-chrome', 'dl-chrome-2'].forEach(function (id) { var el = document.getElementById(id); if (el) el.href = chrome.browser_download_url; });
      if (firefox) ['dl-firefox', 'dl-firefox-2'].forEach(function (id) { var el = document.getElementById(id); if (el) el.href = firefox.browser_download_url; });
      var note = document.getElementById('dl-note');
      if (note && rel.tag_name) note.insertAdjacentText('afterbegin', 'Version ' + rel.tag_name.replace(/^v/, '') + '. ');
    })
    .catch(function () { /* the buttons already link to the Releases page */ });

  // ---- Calculator ----
  if (!I || !F || !R || !C) return;
  I.setLocale('en');

  var el = function (id) { return document.getElementById(id); };
  var select = el('country');
  var sliders = { chat: el('chats'), image: el('images'), agent: el('agent') };
  var outputs = { chat: el('chats-out'), image: el('images-out'), agent: el('agent-out') };

  var world = document.createElement('option');
  world.value = 'WORLD';
  world.textContent = 'World average';
  select.appendChild(world);
  R.list().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.code;
    o.textContent = c.name;
    select.appendChild(o);
  });
  var tz;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = ''; }
  select.value = R.detect(navigator.languages || [navigator.language], tz);

  function shortName(info) { return info.code === 'WORLD' ? 'World' : info.name; }

  function render() {
    var code = select.value;
    var me = R.info(code);

    var counts = {};
    var wh = 0;
    Object.keys(sliders).forEach(function (k) {
      var s = sliders[k];
      counts[k] = Number(s.value);
      outputs[k].textContent = F.num(counts[k], 'en');
      s.style.setProperty('--fill', (counts[k] - s.min) / (s.max - s.min) * 100 + '%');
      wh += counts[k] * WH[k];
    });

    // Each day
    el('out-cmp').textContent = C.energy(wh, code).text;
    var e = F.energy(wh, 'en');
    el('out-wh').textContent = e[0];
    el('out-wh-unit').textContent = e[1];
    el('out-range').textContent = wh > 0
      ? '(likely ' + F.join(F.energy(wh * RANGE.low, 'en')) + ' to ' + F.join(F.energy(wh * RANGE.high, 'en')) + ')'
      : '';

    // Share of one person's daily electricity, here and in a few contrasting places.
    el('out-share').textContent = F.percent(wh / me.perPersonWhDay, 'en');
    el('out-country').textContent = C.country(me);
    var rows = [me].concat(REFERENCE.filter(function (c) { return c !== me.code; }).map(R.info))
      .map(function (info) { return { info: info, share: wh / info.perPersonWhDay }; })
      .sort(function (a, b) { return b.share - a.share; });
    var max = Math.max.apply(null, rows.map(function (r) { return r.share; })) || 1;
    var bars = el('out-bars');
    bars.textContent = '';
    rows.forEach(function (r) {
      var isMe = r.info.code === me.code;
      var row = document.createElement('div');
      row.className = 'bar';
      row.innerHTML = '<span class="bar-name"></span><span class="bar-track"><span class="bar-fill"></span></span><span class="bar-val"></span>';
      var name = row.querySelector('.bar-name');
      name.textContent = shortName(r.info);
      name.title = r.info.name;
      if (isMe) { name.classList.add('me'); row.querySelector('.bar-fill').classList.add('me'); }
      row.querySelector('.bar-fill').style.width = (r.share / max * 100) + '%';
      row.querySelector('.bar-val').textContent = F.percent(r.share, 'en');
      bars.appendChild(row);
    });

    // Over a year. Carbon uses the default basis (US grid, where most chat AI runs).
    var yearWh = wh * 365;
    el('yr-wh').textContent = F.join(F.energy(yearWh, 'en'));
    var g = yearWh * R.carbonFactor({}, code).kgPerKwh;   // kg/kWh == g/Wh
    var km = g / me.carGPerKm;
    var co2 = el('yr-co2');
    co2.textContent = yearWh > 0 ? F.join(F.carbon(g, 'en')) : 'none';
    if (yearWh > 0) {
      var drive = document.createElement('span');
      drive.className = 'sub';
      drive.textContent = C.carbon(km, me.miles);
      co2.appendChild(drive);
    }
    el('yr-water').textContent = C.water(yearWh * WATER_ML_PER_WH);
  }

  select.addEventListener('change', render);
  Object.keys(sliders).forEach(function (k) { sliders[k].addEventListener('input', render); });
  render();
})();
