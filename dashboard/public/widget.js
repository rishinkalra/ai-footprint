(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var embed = params.get('embed') === '1';
  if (embed) document.body.classList.add('embed');

  var state = {
    range: params.get('range') || (embed ? '30d' : '7d'),
    dailyMetric: 'energy',
    platformMetric: 'energy',
    data: null
  };

  var PLATFORM_NAMES = {
    'claude-code': 'Claude Code',
    'openclaw': 'OpenClaw',
    'codex-cli': 'Codex CLI',
    'anthropic-api': 'Anthropic API',
    'openai-api': 'OpenAI API',
    'openrouter': 'OpenRouter',
    'chatgpt': 'ChatGPT',
    'claude.ai': 'Claude.ai',
    'gemini': 'Gemini',
    'cursor': 'Cursor',
    'perplexity': 'Perplexity',
    'subscriptions': 'Subscriptions',
    'manual': 'Manual log'
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function platformName(p) { return PLATFORM_NAMES[p] || p; }

  // ---- formatting ---------------------------------------------------------
  function sig(n) {
    if (n === 0) return '0';
    var a = Math.abs(n);
    if (a >= 100) return Math.round(n).toLocaleString();
    if (a >= 10) return n.toFixed(1);
    if (a >= 1) return n.toFixed(2);
    return n.toPrecision(2);
  }
  function energy(kwh) {
    if (kwh >= 1000) return sig(kwh / 1000) + ' MWh';
    if (kwh >= 1) return sig(kwh) + ' kWh';
    return sig(kwh * 1000) + ' Wh';
  }
  function mass(kg) {
    if (kg >= 1000) return sig(kg / 1000) + ' t';
    if (kg >= 1) return sig(kg) + ' kg';
    return sig(kg * 1000) + ' g';
  }
  function water(l) {
    if (l >= 1000) return sig(l / 1000) + ' m³';
    if (l >= 1) return sig(l) + ' L';
    return sig(l * 1000) + ' mL';
  }
  function usd(v) {
    if (v >= 1000) return '$' + Math.round(v).toLocaleString();
    if (v > 0 && v < 0.01) return '<$0.01';
    return '$' + v.toFixed(2);
  }
  function secondary(v) {
    var c = state.data && state.data.currency && state.data.currency.secondary;
    if (!c || !c.perUsd) return '';
    var x = v * c.perUsd;
    return (c.symbol || c.code + ' ') + (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(2));
  }
  function tokens(n) {
    if (n >= 1e9) return sig(n / 1e9) + 'B';
    if (n >= 1e6) return sig(n / 1e6) + 'M';
    if (n >= 1e3) return sig(n / 1e3) + 'k';
    return String(Math.round(n));
  }
  function count(n) { return n >= 10 ? Math.round(n).toLocaleString() : sig(n); }
  function range(b, fmt) { return fmt(b.low) + ' – ' + fmt(b.high); }
  function shortDate(d) {
    var dt = new Date(d + 'T00:00:00Z');
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // ---- rendering ----------------------------------------------------------
  function tile(label, value, extra, subs) {
    return '<div class="tile"><div class="label">' + esc(label) + '</div>'
      + '<div class="value">' + esc(value) + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</div>'
      + subs.filter(Boolean).map(function (s) { return '<div class="sub">' + s + '</div>'; }).join('')
      + '</div>';
  }

  function renderTiles(d) {
    var t = d.totals, eq = d.equivalents;
    var spendParts = [];
    if (t.apiSpendUsd) spendParts.push('API ' + esc(usd(t.apiSpendUsd)));
    if (t.subscriptionUsd) spendParts.push('plans ' + esc(usd(t.subscriptionUsd)));
    $('tiles').innerHTML = [
      tile('Spend', usd(t.spendUsd), secondary(t.spendUsd), [
        spendParts.join(' · ') || 'No API spend or plans configured',
        'Tokens worth ' + esc(usd(t.apiEquivalentUsd)) + ' at list price' + (t.estimatedPrices ? '*' : '')
      ]),
      tile('Energy', energy(t.energyKwh.mid), '', [
        'Likely ' + esc(range(t.energyKwh, energy)),
        '≈ ' + esc(count(eq.phoneCharges)) + ' phone charges'
      ]),
      tile('Carbon', mass(t.co2Kg.mid), 'CO₂e', [
        'Likely ' + esc(range(t.co2Kg, mass)),
        '≈ ' + esc(count(eq.carKm)) + ' km in a petrol car'
      ]),
      tile('Water', water(t.waterL.mid), '', [
        'Likely ' + esc(range(t.waterL, water)) + ' (cooling)',
        '≈ ' + esc(count(eq.glassesOfWater)) + ' glasses'
      ])
    ].join('');
    var tok = t.tokens;
    $('subtitle').textContent = tokens(tok.total) + ' tokens (' + tokens(tok.output) + ' generated) across '
      + d.byPlatform.length + ' platform' + (d.byPlatform.length === 1 ? '' : 's')
      + ' · ' + shortDate(d.range.from) + (d.range.days > 1 ? ' – ' + shortDate(d.range.to) : '');
  }

  var METRICS = {
    energy: { get: function (r) { return r.energyKwh.mid; }, fmt: energy, title: 'Energy per day' },
    spend: { get: function (r) { return r.spendUsd; }, fmt: usd, title: 'Spend per day' },
    co2: { get: function (r) { return r.co2Kg.mid; }, fmt: mass, title: 'CO₂e per day' },
    value: { get: function (r) { return r.apiEquivalentUsd; }, fmt: usd },
    tokens: { get: function (r) { return r.tokens.total; }, fmt: tokens }
  };

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  function renderDaily(d) {
    var metric = METRICS[state.dailyMetric];
    $('dailyTitle').textContent = metric.title;
    var panel = $('dailyPanel');
    if (d.daily.length < 2) { panel.hidden = true; return; }
    panel.hidden = false;
    var vals = d.daily.map(metric.get);
    var max = niceMax(Math.max.apply(null, vals));
    var labelEvery = Math.ceil(d.daily.length / 8);
    var html = [1, 0.5].map(function (f) {
      return '<div class="axis" style="bottom:calc(22px + ' + (f * 148) + 'px)"><span>' + esc(metric.fmt(max * f)) + '</span></div>';
    }).join('') + '<div class="baseline"></div>';
    html += d.daily.map(function (day, i) {
      var h = vals[i] > 0 ? Math.max(2, (vals[i] / max) * 148) : 0;
      var tick = ((d.daily.length - 1 - i) % labelEvery === 0) ? '<span class="tick">' + esc(shortDate(day.date)) + '</span>' : '';
      return '<div class="col" tabindex="0" data-i="' + i + '" aria-label="' + esc(shortDate(day.date) + ': ' + metric.fmt(vals[i])) + '">'
        + '<div class="bar" style="height:' + h + 'px"></div>' + tick + '</div>';
    }).join('');
    $('daily').innerHTML = html;

    $('dailyTable').innerHTML = '<table><thead><tr><th>Date</th><th class="num">Spend</th><th class="num">Energy</th><th class="num">CO₂e</th><th class="num">Tokens</th></tr></thead><tbody>'
      + d.daily.map(function (r) {
        return '<tr><td>' + esc(r.date) + '</td><td class="num">' + esc(usd(r.spendUsd)) + '</td><td class="num">' + esc(energy(r.energyKwh.mid))
          + '</td><td class="num">' + esc(mass(r.co2Kg.mid)) + '</td><td class="num">' + esc(tokens(r.tokens.total)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderPlatforms(d) {
    var metric = METRICS[state.platformMetric];
    var rows = d.byPlatform.slice().sort(function (a, b) { return metric.get(b) - metric.get(a); });
    var max = rows.length ? metric.get(rows[0]) : 0;
    if (!rows.length || max <= 0) {
      $('platforms').innerHTML = '<p class="empty">Nothing recorded for this range yet.</p>';
      return;
    }
    var total = rows.reduce(function (s, r) { return s + metric.get(r); }, 0);
    $('platforms').innerHTML = rows.map(function (r) {
      var v = metric.get(r);
      var pct = total > 0 ? (v / total) * 100 : 0;
      var pctText = pct > 0 && pct < 1 ? '<1%' : Math.round(pct) + '%';
      return '<div class="hbar" data-platform="' + esc(r.platform) + '">'
        + '<div class="name" title="' + esc(platformName(r.platform)) + '">' + esc(platformName(r.platform)) + '</div>'
        + '<div class="track"><div class="fill" style="width:' + (max > 0 ? (v / max) * 100 : 0) + '%"></div></div>'
        + '<div class="val"><b>' + esc(metric.fmt(v)) + '</b> · ' + pctText + '</div></div>';
    }).join('');
  }

  function renderModels(d) {
    var rows = d.byModel.slice(0, 12);
    if (!rows.length) { $('models').innerHTML = '<p class="empty">No model usage in this range.</p>'; return; }
    $('models').innerHTML = '<div class="scroll"><table><thead><tr><th>Model</th><th>Size</th><th class="num">Calls</th><th class="num">Tokens in / out</th>'
      + '<th class="num">Energy</th><th class="num">CO₂e</th><th class="num">List-price value</th><th class="num">Spend</th></tr></thead><tbody>'
      + rows.map(function (r) {
        var input = r.tokens.input + r.tokens.cacheRead + r.tokens.cacheWrite;
        return '<tr><td>' + esc(r.model) + '</td><td><span class="tier">' + esc(r.tier) + '</span></td>'
          + '<td class="num">' + esc(r.requests ? r.requests.toLocaleString() : '—') + '</td>'
          + '<td class="num">' + esc(tokens(input)) + ' / ' + esc(tokens(r.tokens.output)) + '</td>'
          + '<td class="num">' + esc(energy(r.energyKwh.mid)) + '</td>'
          + '<td class="num">' + esc(mass(r.co2Kg.mid)) + '</td>'
          + '<td class="num">' + esc(usd(r.apiEquivalentUsd)) + (r.estimatedPrices ? '*' : '') + '</td>'
          + '<td class="num">' + esc(usd(r.spendUsd)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderSources(d) {
    var icon = { ok: ['✓', 'st-ok'], error: ['!', 'st-error'] };
    $('sources').innerHTML = d.sources.map(function (s) {
      var ic = icon[s.status] || ['–', 'st-off'];
      return '<li><span class="' + ic[1] + '" aria-hidden="true">' + ic[0] + '</span>'
        + '<span>' + esc(s.label) + ' <span class="muted">(' + esc(s.status) + ')</span></span>'
        + '<span class="note">' + esc(s.note || '') + '</span></li>';
    }).join('');
    var a = d.assumptions;
    $('assumptions').innerHTML = 'Estimates, not meter readings. Energy uses per-token figures by model size, '
      + 'calibrated to the ~0.24–0.34 Wh per chat prompt that Google and OpenAI have published; cache reads count at '
      + esc(a.cacheReadFactor * 100) + '%. The likely range is ×' + esc(a.uncertainty.low) + ' to ×' + esc(a.uncertainty.high)
      + '. Carbon at ' + esc(a.carbonKgPerKwh) + ' kg CO₂e/kWh, water at ' + esc(a.waterLitresPerKwh) + ' L/kWh. '
      + 'Spend counts API-billed usage plus flat plans pro-rated by day; "list-price value" is what all the tokens would cost on the API. '
      + '* list price guessed from model size. Updated ' + esc(new Date(d.collectedAt).toLocaleTimeString()) + '.';
  }

  function render() {
    var d = state.data;
    if (!d) return;
    renderTiles(d);
    renderPlatforms(d);
    if (!embed) { renderDaily(d); renderModels(d); renderSources(d); }
  }

  // ---- tooltip on daily columns ------------------------------------------
  var tip = $('tooltip');
  function showTip(col, x, y) {
    var r = state.data.daily[Number(col.getAttribute('data-i'))];
    if (!r) return;
    tip.innerHTML = '<b>' + esc(shortDate(r.date)) + '</b><br>'
      + 'Energy ' + esc(energy(r.energyKwh.mid)) + '<br>'
      + 'CO₂e ' + esc(mass(r.co2Kg.mid)) + '<br>'
      + 'Spend ' + esc(usd(r.spendUsd)) + '<br>'
      + 'Tokens ' + esc(tokens(r.tokens.total));
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 12) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  $('daily').addEventListener('mousemove', function (e) {
    var col = e.target.closest('.col');
    if (col) showTip(col, e.clientX, e.clientY); else tip.hidden = true;
  });
  $('daily').addEventListener('mouseleave', function () { tip.hidden = true; });
  $('daily').addEventListener('focusin', function (e) {
    var col = e.target.closest('.col');
    if (!col) return;
    var rect = col.getBoundingClientRect();
    showTip(col, rect.left + rect.width / 2, rect.top + 20);
  });
  $('daily').addEventListener('focusout', function () { tip.hidden = true; });

  // ---- controls -----------------------------------------------------------
  function bindSeg(id, attr, onPick) {
    var seg = $(id);
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      onPick(btn.getAttribute(attr));
    });
  }
  function pressInitial(id, attr, value) {
    $(id).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)); });
  }

  async function load(force) {
    try {
      var res = await fetch('api/summary?range=' + encodeURIComponent(state.range) + (force ? '&refresh=1' : ''), { credentials: 'same-origin' });
      var body = await res.json();
      if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
      state.data = body;
      render();
    } catch (err) {
      $('tiles').innerHTML = '<div class="error-box">Could not load the AI footprint: ' + esc(err.message) + '</div>';
    }
  }

  pressInitial('rangeSeg', 'data-range', state.range);
  bindSeg('rangeSeg', 'data-range', function (v) { state.range = v; load(false); });
  bindSeg('dailySeg', 'data-metric', function (v) { state.dailyMetric = v; render(); });
  bindSeg('platformSeg', 'data-metric', function (v) { state.platformMetric = v; render(); });
  $('refreshBtn').addEventListener('click', function () { load(true); });

  load(false);
  setInterval(function () { load(false); }, 5 * 60 * 1000);
})();
