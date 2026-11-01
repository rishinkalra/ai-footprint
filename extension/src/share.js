/* global FootprintStore, FootprintFormat, FootprintIcons, FootprintRegions */
(function () {
  'use strict';
  var F = FootprintFormat;
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

    // headline
    var period = opts.period === '7d' ? 'last 7 days' : 'last 30 days';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted; ctx.font = '600 26px ' + BODY;
    var y = wide ? 190 : 250;
    ctx.fillText('My AI use, ' + period, pad, y);

    var e = F.energy(t.wh);
    var big = wide ? 150 : 190;
    ctx.fillStyle = C.ink; ctx.font = '700 ' + big + 'px ' + DISPLAY;
    y += wide ? 150 : 200;
    ctx.fillText(e[0], pad - 6, y);
    var w = ctx.measureText(e[0]).width;
    ctx.fillStyle = C.muted; ctx.font = '600 ' + Math.round(big * 0.3) + 'px ' + BODY;
    ctx.fillText(e[1] + ' of electricity', pad + w + 14, y);

    ctx.fillStyle = C.ink2; ctx.font = '500 26px ' + BODY;
    y += wide ? 52 : 70;
    var compare = 'That is ' + F.energyComparison(t.wh) + ', or ' + F.percent(s.perspective.share) + ' of what one person in ' + s.region.inName + ' uses in ' + s.range.days + ' days.';
    fitText(ctx, compare, '500 {s}px ' + BODY, W - pad * 2, 26);
    ctx.fillText(compare, pad, y);

    // three figures
    var eq = s.equivalents;
    var stats = [
      ['Carbon', F.join(F.carbon(t.co2g)), 'like driving ' + F.distance(eq.carKm, undefined, s.region.miles)],
      ['Water', F.join(F.water(t.waterMl)), 'for data-centre cooling'],
      s.previousWh > 0
        ? ['Trend', trendText(s), 'vs the previous ' + s.range.days + ' days']
        : ['Replies', F.num(t.turns), 'across ' + F.plural(Object.keys(s.bySite).length, 'app', 'apps')]
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
        ctx.fillStyle = st[0] === 'Trend' && s.totals.wh > s.previousWh && s.previousWh > 0 ? C.sun : C.ink;
        fitText(ctx, st[1], '700 {s}px ' + DISPLAY, boxW - 44, 38);
        ctx.fillText(st[1], bx + 22, by + 78);
        ctx.fillStyle = C.muted; ctx.font = '500 18px ' + BODY;
        ctx.fillText(st[2], bx + 22, by + 104);
      } else {
        ctx.fillText(st[0], bx + 26, by + 50);
        ctx.fillStyle = C.ink; ctx.font = '700 34px ' + DISPLAY;
        ctx.fillText(st[1], bx + 170, by + 54);
        ctx.fillStyle = C.muted; ctx.font = '500 20px ' + BODY;
        ctx.textAlign = 'right'; ctx.fillText(st[2], bx + boxW - 26, by + 52); ctx.textAlign = 'left';
      }
    });
    void cols;

    // footer
    ctx.fillStyle = C.muted; ctx.font = '500 19px ' + BODY;
    ctx.fillText('Estimated privately on my device with AI Footprint, an open-source browser extension.', pad, H - (wide ? 30 : 44));
  }

  function trendText(s) {
    var c = (s.totals.wh - s.previousWh) / s.previousWh;
    return (c <= 0 ? '↓ ' : '↑ ') + Math.round(Math.abs(c) * 100) + '% ' + (c <= 0 ? 'less' : 'more');
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

  $('mark').innerHTML = I.get('mark', 24);
  $('download').innerHTML = I.get('download', 16) + 'Download image';
  $('copy').innerHTML = I.get('copy', 16) + 'Copy image';
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
      if (!navigator.clipboard || !window.ClipboardItem) { $('done').textContent = 'Copying images isn\'t supported here. Use Download.'; return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
        $('done').textContent = 'Copied. Paste it into your post.';
      }, function () { $('done').textContent = 'Couldn\'t copy. Use Download instead.'; });
    });
  });

  chrome.storage.local.get(['state', 'settings'], function (d) {
    data = { state: d.state, settings: FootprintStore.mergeSettings(d.settings) };
    Promise.all([
      document.fonts.load('700 40px "Bricolage Grotesque"'),
      document.fonts.load('500 20px "Figtree"'),
      document.fonts.load('600 20px "Figtree"')
    ]).then(draw, draw);
  });
})();
