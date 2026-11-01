/* global FootprintStore, FootprintFormat, FootprintIcons, FootprintRegions, FootprintI18n, FootprintCompare, FootprintDOM */
(function () {
  'use strict';
  var F = FootprintFormat;
  var L = FootprintI18n;
  var Cmp = FootprintCompare;
  var tr = L.t;
  var I = FootprintIcons;
  function $(id) { return document.getElementById(id); }
  var opts = { period: '30d', shape: 'wide' };
  var ENV = { region: FootprintRegions.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone) };
  var data = null;

  // The card always uses the light palette so shared images look the same everywhere.
  var C = { paper: '#f3f5f0', surface: '#ffffff', ink: '#14211a', ink2: '#3c4a42', muted: '#5d6b63', line: '#dde3da', moss: '#2d7a4f', mossSoft: '#e3eee5', sun: '#9a5a00' };
  var DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
  var BODY = '"Figtree", system-ui, sans-serif';

  function leaf(ctx, x, y, s, fill, bolt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 64, s / 64);
    ctx.fillStyle = fill;
    ctx.fill(new Path2D('M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z'));
    if (bolt) { ctx.fillStyle = bolt; ctx.fill(new Path2D('M37 17 22 38h10l-4 13 16-22H33l6-12Z')); }
    ctx.restore();
  }

  // Break text into at most maxLines lines, shrinking the font until it fits.
  function wrap(ctx, text, font, max, size, maxLines) {
    for (var sz = size; sz >= 24; sz -= 4) {
      ctx.font = font.replace('{s}', sz);
      var words = text.split(' '), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > max && line) { lines.push(line); line = words[i]; } else { line = test; }
      }
      lines.push(line);
      if (lines.length <= maxLines && lines.every(function (l) { return ctx.measureText(l).width <= max; })) return { lines: lines, size: sz };
    }
    return { lines: [text], size: 24 };
  }

  function fitText(ctx, text, font, max, size) {
    var s = size;
    ctx.font = font.replace('{s}', s);
    while (ctx.measureText(text).width > max && s > 10) { s -= 2; ctx.font = font.replace('{s}', s); }
    return s;
  }

  function draw() {
    var cv = $('card');
    var wide = opts.shape === 'wide';
    var W = wide ? 1200 : 1080, H = wide ? 630 : 1080;
    cv.width = W; cv.height = H;
    cv.className = wide ? '' : 'square';
    var ctx = cv.getContext('2d');
    var s = FootprintStore.summary(data.state || FootprintStore.newState('x'), data.settings, opts.period, Date.now(), ENV);
    var t = s.totals;
    var pad = wide ? 64 : 80;

    // background with one large, quiet leaf
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    leaf(ctx, wide ? W - 430 : W - 520, wide ? -40 : 360, wide ? 520 : 640, C.mossSoft);

    // brand
    leaf(ctx, pad, pad - 4, 40, C.moss, C.paper);
    ctx.fillStyle = C.ink; ctx.font = '700 26px ' + DISPLAY; ctx.textBaseline = 'middle';
    ctx.fillText('AI Footprint', pad + 52, pad + 16);

    // headline: the everyday comparison, with the number underneath
    var loc = L.locale();
    var whText = F.join(F.energy(t.wh, loc));
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted; ctx.font = '600 26px ' + BODY;
    var y = wide ? 178 : 240;
    ctx.fillText(tr(opts.period === '7d' ? 'c_heading_7d' : 'c_heading_30d'), pad, y);

    var headline = t.wh > 0 ? Cmp.energy(t.wh, s.region.code).text : tr('cmp_none');
    var hSize = wide ? 64 : 76;
    var lines = wrap(ctx, headline, '700 {s}px ' + DISPLAY, wide ? W - pad * 2 - 120 : W - pad * 2, hSize, 2);
    ctx.fillStyle = C.ink;
    lines.lines.forEach(function (line, i) { ctx.fillText(line, pad - 2, y + (wide ? 76 : 96) + i * lines.size * 1.08); });
    y += (wide ? 76 : 96) + (lines.lines.length - 1) * lines.size * 1.08;

    ctx.fillStyle = C.ink2; ctx.font = '600 26px ' + BODY;
    y += wide ? 50 : 66;
    ctx.fillText(tr('c_energy_line', { wh: whText, replies: tr('replies', { count: t.turns, n: F.num(t.turns, loc) }) }), pad, y);
    ctx.fillStyle = C.muted; ctx.font = '500 22px ' + BODY;
    y += 36;
    var localText = tr('c_local', { pct: F.percent(s.perspective.share, loc), country: Cmp.country(s.region), days: tr('period_days', { count: s.range.days, n: s.range.days }) });
    fitText(ctx, localText, '500 {s}px ' + BODY, W - pad * 2, 22);
    ctx.fillText(localText, pad, y);

    // three figures, each with an everyday meaning
    var eq = s.equivalents;
    var change = s.previousWh > 0 ? (s.totals.wh - s.previousWh) / s.previousWh : 0;
    var stats = [
      [tr('c_carbon'), F.join(F.carbon(t.co2g, loc)), Cmp.carbon(eq.carKm, s.region.miles)],
      [tr('c_water'), F.join(F.water(t.waterMl, loc)), Cmp.water(t.waterMl) + ' · ' + tr('c_cooling')],
      s.previousWh > 0
        ? [tr('c_trend'), tr(change <= 0 ? 'c_less' : 'c_more', { pct: F.num(Math.round(Math.abs(change) * 100), loc) + '%' }), tr('c_vs', { days: tr('period_days', { count: s.range.days, n: s.range.days }) }), change > 0]
        : [tr('c_replies'), F.num(t.turns, loc), tr('c_apps', { count: Object.keys(s.bySite).length, n: Object.keys(s.bySite).length })]
    ];
    var boxY = wide ? H - 190 : H - 390;
    var gap = 20;
    var cols = wide ? 3 : 1;
    var boxW = wide ? (W - pad * 2 - gap * 2) / 3 : W - pad * 2;
    var boxH = wide ? 120 : 84;
    stats.forEach(function (st, i) {
      var bx = wide ? pad + i * (boxW + gap) : pad;
      var by = wide ? boxY : boxY + i * (boxH + 14);
      ctx.fillStyle = C.surface;
      roundRect(ctx, bx, by, boxW, boxH, 18); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = '600 20px ' + BODY;
      if (wide) {
        ctx.fillText(st[0], bx + 22, by + 36);
        ctx.fillStyle = st[3] ? C.sun : C.ink;
        fitText(ctx, st[1], '700 {s}px ' + DISPLAY, boxW - 44, 38);
        ctx.fillText(st[1], bx + 22, by + 78);
        ctx.fillStyle = C.muted;
        fitText(ctx, st[2], '500 {s}px ' + BODY, boxW - 44, 18);
        ctx.fillText(st[2], bx + 22, by + 104);
      } else {
        ctx.fillText(st[0], bx + 26, by + 50);
        ctx.fillStyle = C.ink; ctx.font = '700 34px ' + DISPLAY;
        ctx.fillText(st[1], bx + 170, by + 54);
        ctx.fillStyle = C.muted; ctx.font = '500 20px ' + BODY;
        fitText(ctx, st[2], '500 {s}px ' + BODY, boxW - 420, 20);
        ctx.textAlign = 'right'; ctx.fillText(st[2], bx + boxW - 26, by + 52); ctx.textAlign = 'left';
      }
    });
    void cols;

    // footer
    ctx.fillStyle = C.muted; ctx.font = '500 19px ' + BODY;
    fitText(ctx, tr('c_footer'), '500 {s}px ' + BODY, W - pad * 2, 19);
    ctx.fillText(tr('c_footer'), pad, H - (wide ? 30 : 44));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function bindSeg(id, key) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      opts[key] = b.getAttribute('data-v');
      this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      draw();
    });
  }

  FootprintDOM.set($('mark'), I.get('mark', 24));
  function labels() {
    L.apply(document);
    FootprintDOM.set($('download'), I.get('download', 16) + tr('s_download'));
    FootprintDOM.set($('copy'), I.get('copy', 16) + tr('s_copy'));
  }
  bindSeg('period', 'period');
  bindSeg('shape', 'shape');

  $('download').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = $('card').toDataURL('image/png');
    a.download = 'my-ai-footprint-' + opts.period + '.png';
    a.click();
  });
  $('copy').addEventListener('click', function () {
    $('card').toBlob(function (blob) {
      if (!navigator.clipboard || !window.ClipboardItem) { $('done').textContent = tr('s_copy_unsupported'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
        $('done').textContent = tr('s_copied');
      }, function () { $('done').textContent = tr('s_copy_failed'); });
    });
  });

  chrome.storage.local.get(['state', 'settings'], function (d) {
    data = { state: d.state, settings: FootprintStore.mergeSettings(d.settings) };
    L.setLocale(data.settings.language, navigator.languages);
    labels();
    Promise.all([
      document.fonts.load('700 40px "Bricolage Grotesque"'),
      document.fonts.load('500 20px "Figtree"'),
      document.fonts.load('600 20px "Figtree"')
    ]).then(draw, draw);
  });
})();
