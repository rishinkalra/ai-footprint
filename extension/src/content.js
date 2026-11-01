// Runs on supported AI chat sites. Watches replies being written, measures their
// length (never their content), and asks the background worker to record them.
//
// Only replies we see *being generated* count: chat history that loads already
// complete never grows, so opening old chats adds nothing.

(function () {
  'use strict';
  if (window.__aiFootprintLoaded) return;
  window.__aiFootprintLoaded = true;

  var site = self.FootprintSites && self.FootprintSites.siteForHost(location.hostname);
  if (!site) return;

  var IDLE_MS = 2500;        // a reply is done when it stops changing for this long
  var SETTLE_MS = 2000;      // ignore changes right after load / navigation
  var MIN_IMAGE_PX = 256;

  var settings = { showBadge: true, badgeMin: false, sites: {}, models: {} };
  var tracked = new WeakMap();
  var settleUntil = Date.now() + SETTLE_MS;
  var lastUrl = location.href;
  var scanQueued = false;

  // ---- DOM helpers --------------------------------------------------------
  function queryFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var list;
      try { list = document.querySelectorAll(selectors[i]); } catch (e) { continue; }
      if (list.length) return Array.prototype.slice.call(list);
    }
    return [];
  }

  // Drop elements nested inside another match so nothing is measured twice.
  function outermost(list) {
    return list.filter(function (el) {
      return !list.some(function (other) { return other !== el && other.contains(el); });
    });
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function textLen(el) {
    return textOf(el).length;
  }
  // Script-aware token estimate (Hindi, Arabic or Chinese use more tokens per
  // character than English). The text itself is never stored or sent.
  function tokensOf(el) {
    return self.FootprintTokens ? self.FootprintTokens.estimate(textOf(el)) : Math.round(textLen(el) / 4);
  }

  function largeImages(el) {
    var out = [];
    var imgs = el.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var w = img.naturalWidth || Number(img.getAttribute('width')) || 0;
      if (w >= MIN_IMAGE_PX && img.src) out.push(img.src);
    }
    return out;
  }

  function precedes(a, b) {
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  // Everything the model read before writing this reply: earlier messages and the prompt.
  function contextFor(el) {
    var users = outermost(queryFirst(site.user));
    var assistants = outermost(queryFirst(site.assistant));
    var contextTokens = 0;
    var promptTokens = 0;
    users.concat(assistants).forEach(function (m) {
      if (m !== el && precedes(m, el)) contextTokens += tokensOf(m);
    });
    users.forEach(function (u) { if (precedes(u, el)) promptTokens = tokensOf(u); });
    return { contextTokens: contextTokens, promptTokens: promptTokens };
  }

  function threadKey() {
    return site.id + ':' + location.pathname;
  }

  // ---- tracking -------------------------------------------------------------
  function scan() {
    scanQueued = false;
    if (settings.sites[site.id] === false) return;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      settleUntil = Date.now() + SETTLE_MS;
    }
    var settling = Date.now() < settleUntil;
    var replies = outermost(queryFirst(site.assistant));
    replies.forEach(function (el, i) {
      var len = textLen(el);
      var imgs = largeImages(el);
      var t = tracked.get(el);
      if (!t) {
        t = { start: len, last: len, imgs: imgs, seenImgs: imgs.slice(), counted: settling ? len : 0, live: false, timer: null };
        tracked.set(el, t);
        // A complete reply that appears at the end of the chat after the page has
        // settled is a new answer (sites that don't stream). Older messages loaded
        // by scrolling up appear before existing ones and are ignored.
        if (!settling && i === replies.length - 1 && replies.length > 0) {
          t.start = 0;
          t.counted = 0;
          t.seenImgs = [];
          t.live = true;
          t.timer = setTimeout(function () { finalize(el, t); }, IDLE_MS);
        }
        return;
      }
      if (len === t.last && imgs.length === t.imgs.length) return;
      // While settling, re-renders of existing messages are absorbed. A reply that
      // was already being written keeps counting (ChatGPT changes the URL mid-reply).
      if (settling && !t.live) { t.last = len; t.imgs = imgs; t.seenImgs = imgs.slice(); t.counted = len; return; }
      // Regenerated in place: text shrank a lot, start over.
      if (len < t.last * 0.5) { t.start = len; t.counted = 0; }
      if (len > t.last || imgs.length > t.imgs.length) t.live = true;
      t.last = len;
      t.imgs = imgs;
      clearTimeout(t.timer);
      t.timer = setTimeout(function () { finalize(el, t); }, IDLE_MS);
    });
  }

  function finalize(el, t) {
    if (!t.live || !el.isConnected) return;
    var grownBy = t.last - t.start;
    var newImgs = t.imgs.filter(function (src) { return t.seenImgs.indexOf(src) === -1; });
    // Real generation grows from (almost) nothing; re-renders of history don't.
    var streamed = grownBy >= Math.max(20, t.last * 0.5) || t.counted > 0;
    var outputChars = t.last - t.counted;
    if ((!streamed || outputChars <= 0) && !newImgs.length) return;
    var ctx = contextFor(el);
    var fullText = textOf(el);
    var newText = fullText.slice(Math.min(t.counted, fullText.length));
    var outputTokens = self.FootprintTokens ? self.FootprintTokens.estimate(newText) : Math.round(newText.length / 4);
    t.counted = t.last;
    t.seenImgs = t.seenImgs.concat(newImgs);
    t.live = false;
    var model = (site.modelOf && site.modelOf(el)) || settings.models[site.id] || site.defaultModel;
    send({
      type: 'turn',
      site: site.id,
      model: model,
      promptTokens: ctx.promptTokens,
      contextTokens: ctx.contextTokens,   // includes the prompt
      outputTokens: outputTokens,
      images: newImgs.length,
      threadKey: threadKey()
    });
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError || !res) return;
        if (settings.showBadge !== false) badge.update(res);
      });
    } catch (e) {
      // Extension was reloaded or removed: stop quietly.
      observer.disconnect();
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(scan, 400);
  }

  var observer = new MutationObserver(queueScan);

  // ---- in-page badge (closed shadow DOM so the site's CSS can't touch it) ------
  // Matches the host page: light on light sites, dark on dark ones.
  var badge = (function () {
    var host, root, wrap, pill, mainBtn, dot, tipBox, detail, lastRes = null;
    function mark(size) { return MARK.replace(/\{s\}/g, size); }
    var MARK = '<svg aria-hidden="true" viewBox="0 0 64 64" width="{s}" height="{s}"><path d="M54 8C54 38 40 56 14 56c-3 0-6-3-6-6C8 24 26 8 54 8Z" fill="currentColor"/><path d="M37 17 22 38h10l-4 13 16-22H33l6-12Z" fill="var(--bg)"/></svg>';
    var ICON = {
      'long-thread': '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8 11h8M8 14h5"/>',
      'reasoning-short': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
      goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
    };
    var TITLE = { 'long-thread': 'Long chat', 'reasoning-short': 'Thinking model', image: 'Image generation', goal: 'Daily goal reached' };
    var TIER = { small: 'Small model', medium: 'Medium model', large: 'Large model', xlarge: 'Extra-large model' };

    function icon(body, size) {
      return '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
    }
    function fmt(n) {
      if (!isFinite(n) || n === 0) return '0';
      return new Intl.NumberFormat(undefined, Math.abs(n) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 2 }).format(n);
    }
    function wh(v) { return v >= 1000 ? fmt(v / 1000) + ' kWh' : fmt(v) + ' Wh'; }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // Is the page behind the badge dark? Walk up for the first opaque background.
    function pageIsDark() {
      var el = document.elementFromPoint(Math.max(0, innerWidth - 60), Math.max(0, innerHeight - 140));
      if (el && host && host.contains(el)) el = null;
      for (var node = el || document.body; node && node.nodeType === 1; node = node.parentElement) {
        var c = getComputedStyle(node).backgroundColor;
        var m = c && c.match(/rgba?\(([^)]+)\)/);
        if (!m) continue;
        var p = m[1].split(',').map(function (x) { return parseFloat(x); });
        if (p.length === 4 && p[3] < 0.5) continue;
        var lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
        return lum < 0.5;
      }
      return matchMedia('(prefers-color-scheme: dark)').matches;
    }

    var CSS =
      ':host{all:initial}' +
      '.wrap{--bg:#ffffff;--ink:#14211a;--ink2:#3c4a42;--muted:#5d6b63;--line:#dde3da;--moss:#2d7a4f;--mossSoft:#e3eee5;--track:#e7ece5;--sun:#9a5a00;--sunSoft:#fbefd6;--onMoss:#fff;' +
        '--shadow:0 1px 2px rgba(20,33,26,.08),0 10px 28px rgba(20,33,26,.14);' +
        'font:500 13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;color:var(--ink);' +
        'display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}' +
      '.wrap[data-theme=dark]{--bg:#141c17;--ink:#e8efe9;--ink2:#c0cbc3;--muted:#93a198;--line:#2b3a31;--moss:#6cc996;--mossSoft:#1b2d22;--track:#24312a;--sun:#f0b54a;--sunSoft:#33270f;--onMoss:#0d1310;' +
        '--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 30px rgba(0,0,0,.4)}' +
      'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}' +
      'button:focus-visible{outline:2px solid var(--moss);outline-offset:2px;border-radius:999px}' +
      '[hidden]{display:none!important}' +
      '.pill{display:flex;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow);overflow:hidden}' +
      '.main{display:flex;align-items:center;gap:8px;padding:7px 6px 7px 11px;white-space:nowrap}' +
      '.mark{color:var(--moss);display:inline-flex}' +
      '.reply b{font-weight:700;color:var(--ink)}.reply span{color:var(--muted)}' +
      '.sep{width:1px;height:16px;background:var(--line)}' +
      '.meter{width:38px;height:6px;border-radius:999px;background:var(--track);overflow:hidden;display:inline-block}' +
      '.meter i{display:block;height:100%;background:var(--moss);border-radius:999px}' +
      '.over .meter i{background:var(--sun)}' +
      '.today{color:var(--muted)}.over .today{color:var(--sun);font-weight:600}' +
      '.min{width:28px;height:28px;margin-right:3px;border-radius:999px;display:grid;place-items:center;color:var(--muted)}' +
      '.min:hover{background:var(--track);color:var(--ink)}' +
      '.dot{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:var(--bg);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--moss)}' +
      '.card{width:300px;background:var(--bg);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:14px;animation:rise .18s ease-out}' +
      '.tip-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
      '.tip-ic{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--sunSoft);color:var(--sun);flex:none}' +
      '.tip-title{font-weight:700;font-size:14px;flex:1}' +
      '.x{width:26px;height:26px;border-radius:999px;display:grid;place-items:center;color:var(--muted)}.x:hover{background:var(--track)}' +
      '.tip-text{margin:0 0 12px;color:var(--ink2);font-weight:450;line-height:1.45}' +
      '.tip-actions{display:flex;justify-content:flex-end;gap:6px}' +
      '.tip-actions button{padding:7px 12px;border-radius:999px;font-weight:600;font-size:12.5px}' +
      '.ghost{color:var(--muted)}.ghost:hover{background:var(--track);color:var(--ink)}' +
      '.primary{background:var(--moss);color:var(--onMoss)}' +
      '.detail{width:236px;padding:12px 14px}' +
      '.detail h3{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
      '.row{display:flex;justify-content:space-between;gap:10px;padding:3px 0}.row span{color:var(--muted)}.row b{font-weight:650}' +
      '.foot{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}' +
      '@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
      '@media (prefers-reduced-motion:reduce){.card{animation:none}}';

    function ensure() {
      if (host && host.isConnected) return;
      host = document.createElement('ai-footprint-badge');
      host.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:2147483646;';
      root = host.attachShadow({ mode: 'closed' });
      FootprintDOM.set(root, '<style>' + CSS + '</style>' +
        '<div class="wrap">' +
          '<div class="card tip" role="status" aria-live="polite" hidden>' +
            '<div class="tip-head"><span class="tip-ic"></span><span class="tip-title"></span><button class="x" data-act="close" aria-label="Dismiss tip">' + icon('<path d="M6 6l12 12M18 6 6 18"/>', 15) + '</button></div>' +
            '<p class="tip-text"></p>' +
            '<div class="tip-actions"><button class="ghost" data-act="hide-site">Hide on this site</button><button class="primary" data-act="close">Got it</button></div>' +
          '</div>' +
          '<div class="card detail" hidden></div>' +
          '<div class="pill">' +
            '<button class="main" data-act="open" aria-label="AI footprint details"></button>' +
            '<button class="min" data-act="min" aria-label="Minimise">' + icon('<path d="M6 12h12"/>', 15) + '</button>' +
          '</div>' +
          '<button class="dot" data-act="expand" aria-label="Show AI footprint" hidden>' + mark(18) + '</button>' +
        '</div>');
      wrap = root.querySelector('.wrap');
      pill = root.querySelector('.pill');
      mainBtn = root.querySelector('.main');
      dot = root.querySelector('.dot');
      tipBox = root.querySelector('.tip');
      detail = root.querySelector('.detail');

      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-act]');
        if (!b) return;
        var act = b.getAttribute('data-act');
        if (act === 'close') tipBox.hidden = true;
        if (act === 'open') { try { chrome.runtime.sendMessage({ type: 'open-popup' }); } catch (err) { /* ignore */ } }
        if (act === 'min') setMinimised(true);
        if (act === 'expand') setMinimised(false);
        if (act === 'hide-site') {
          settings.showBadge = false;
          host.remove();
          try { chrome.runtime.sendMessage({ type: 'hide-badge-site', site: site.id }); } catch (err) { /* ignore */ }
        }
      });
      // The breakdown temporarily replaces an open tip so the stack never gets tall.
      var tipWasOpen = false;
      var showDetail = function () {
        if (!lastRes) return;
        tipWasOpen = !tipBox.hidden;
        tipBox.hidden = true;
        detail.hidden = false;
      };
      var hideDetail = function () {
        detail.hidden = true;
        if (tipWasOpen) tipBox.hidden = false;
        tipWasOpen = false;
      };
      mainBtn.addEventListener('mouseenter', showDetail);
      mainBtn.addEventListener('focus', showDetail);
      mainBtn.addEventListener('mouseleave', hideDetail);
      mainBtn.addEventListener('blur', hideDetail);
      document.documentElement.appendChild(host);
    }

    function setMinimised(min) {
      settings.badgeMin = min;
      pill.hidden = min;
      dot.hidden = !min;
      detail.hidden = true;
      if (min) tipBox.hidden = true;
      try { chrome.runtime.sendMessage({ type: 'badge-min', site: site.id, value: min }); } catch (err) { /* ignore */ }
    }

    return {
      update: function (res) {
        ensure();
        lastRes = res;
        wrap.setAttribute('data-theme', pageIsDark() ? 'dark' : 'light');
        var goal = res.goalWh > 0;
        var over = goal && res.todayWh > res.goalWh;
        pill.classList.toggle('over', over);
        FootprintDOM.set(mainBtn, '<span class="mark">' + mark(16) + '</span>' +
          '<span class="reply"><b>' + esc(wh(res.replyWh)) + '</b> <span>this reply</span></span>' +
          '<span class="sep" aria-hidden="true"></span>' +
          (goal ? '<span class="meter" aria-hidden="true"><i style="width:' + Math.min(100, (res.todayWh / res.goalWh) * 100) + '%"></i></span>' : '') +
          '<span class="today">' + esc(goal ? fmt(res.todayWh) + ' / ' + wh(res.goalWh) + ' today' : wh(res.todayWh) + ' today') + '</span>');
        mainBtn.setAttribute('aria-label', 'This reply ' + wh(res.replyWh) + '. Today ' + wh(res.todayWh) + (goal ? ' of ' + wh(res.goalWh) : '') + '. Open AI footprint.');
        FootprintDOM.set(detail, '<h3>This reply</h3>' +
          '<div class="row"><span>Energy</span><b>' + esc(wh(res.replyWh)) + '</b></div>' +
          '<div class="row"><span>Carbon</span><b>' + esc(fmt(res.replyCo2g)) + ' g CO₂e</b></div>' +
          '<div class="row"><span>Water</span><b>' + esc(fmt(res.replyWaterMl || 0)) + ' mL</b></div>' +
          '<div class="foot">' + esc((TIER[res.tier] || 'Model') + (res.reasoning ? ', thinking counted ×4' : '')) + '. Estimate; click for your totals.</div>');
        pill.hidden = !!settings.badgeMin;
        dot.hidden = !settings.badgeMin;
        if (res.tip && !settings.badgeMin) {
          FootprintDOM.set(root.querySelector('.tip-ic'), icon(ICON[res.tip.id] || ICON.goal, 16));
          root.querySelector('.tip-title').textContent = TITLE[res.tip.id] || 'Tip';
          root.querySelector('.tip-text').textContent = res.tip.text;
          tipBox.hidden = false;
        }
      }
    };
  })();

  // ---- start ------------------------------------------------------------------
  chrome.storage.local.get('settings', function (data) {
    var s = (data && data.settings) || {};
    settings.showBadge = s.showBadge !== false && !(s.badgeHidden && s.badgeHidden[site.id]);
    settings.sites = s.sites || {};
    settings.models = s.models || {};
    settings.badgeMin = !!(s.badgeMin && s.badgeMin[site.id]);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  });
  chrome.storage.onChanged.addListener(function (changes) {
    if (!changes.settings) return;
    var s = changes.settings.newValue || {};
    settings.showBadge = s.showBadge !== false && !(s.badgeHidden && s.badgeHidden[site.id]);
    settings.sites = s.sites || {};
    settings.models = s.models || {};
    settings.badgeMin = !!(s.badgeMin && s.badgeMin[site.id]);
  });
})();
