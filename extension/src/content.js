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

  var settings = { showBadge: true, sites: {}, models: {} };
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

  function textLen(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().length;
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

  function contextFor(el) {
    var users = outermost(queryFirst(site.user));
    var assistants = outermost(queryFirst(site.assistant));
    var contextChars = 0;
    var promptChars = 0;
    users.concat(assistants).forEach(function (m) {
      if (m !== el && precedes(m, el)) contextChars += textLen(m);
    });
    users.forEach(function (u) { if (precedes(u, el)) promptChars = textLen(u); });
    return { contextChars: contextChars, promptChars: promptChars };
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
    t.counted = t.last;
    t.seenImgs = t.seenImgs.concat(newImgs);
    t.live = false;
    var model = (site.modelOf && site.modelOf(el)) || settings.models[site.id] || site.defaultModel;
    send({
      type: 'turn',
      site: site.id,
      model: model,
      promptChars: ctx.promptChars,
      contextChars: ctx.contextChars,   // includes the prompt
      outputChars: Math.max(0, outputChars),
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

  // ---- in-page badge (shadow DOM so the site's CSS can't touch it) -----------
  var badge = (function () {
    var host, root, pill, tipBox, tipText;
    function fmtWh(wh) {
      if (wh >= 1000) return (wh / 1000).toFixed(2) + ' kWh';
      if (wh >= 10) return Math.round(wh) + ' Wh';
      if (wh >= 1) return wh.toFixed(1) + ' Wh';
      return wh.toFixed(2) + ' Wh';
    }
    function ensure() {
      if (host && host.isConnected) return;
      host = document.createElement('ai-footprint-badge');
      host.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:2147483646;';
      root = host.attachShadow({ mode: 'closed' });
      root.innerHTML =
        '<style>' +
        ':host{all:initial}' +
        '.wrap{font:13px/1.4 system-ui,sans-serif;color:#ecf2ff;display:flex;flex-direction:column;align-items:flex-end;gap:8px}' +
        '.pill{background:#10172b;border:1px solid #2c3f6c;border-radius:999px;padding:6px 12px;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer;white-space:nowrap}' +
        '.pill b{font-weight:600}' +
        '.pill .muted{color:#9fb0d0}' +
        '.tip{max-width:300px;background:#10172b;border:1px solid #2c3f6c;border-radius:12px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.35)}' +
        '.tip p{margin:0 0 8px}' +
        '.row{display:flex;gap:12px;justify-content:flex-end}' +
        'button{font:inherit;font-size:12px;background:none;border:0;color:#94b6ff;cursor:pointer;padding:0}' +
        '[hidden]{display:none}' +
        '</style>' +
        '<div class="wrap" role="status" aria-live="polite">' +
        '<div class="tip" hidden><p></p><div class="row"><button data-act="hide-site">Hide on this site</button><button data-act="close">Got it</button></div></div>' +
        '<div class="pill" title="AI footprint: estimated energy of the last reply and today. Click for details."></div>' +
        '</div>';
      pill = root.querySelector('.pill');
      tipBox = root.querySelector('.tip');
      tipText = root.querySelector('.tip p');
      pill.addEventListener('click', function () {
        try { chrome.runtime.sendMessage({ type: 'open-popup' }); } catch (e) { /* ignore */ }
      });
      root.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'close') tipBox.hidden = true;
        if (act === 'hide-site') {
          settings.showBadge = false;
          host.remove();
          try { chrome.runtime.sendMessage({ type: 'hide-badge-site', site: site.id }); } catch (err) { /* ignore */ }
        }
      });
      document.documentElement.appendChild(host);
    }
    return {
      update: function (res) {
        ensure();
        var goal = res.goalWh > 0 ? ' / ' + fmtWh(res.goalWh) : '';
        pill.innerHTML = '⚡ <b>' + fmtWh(res.replyWh) + '</b> <span class="muted">this reply · today ' +
          fmtWh(res.todayWh) + goal + '</span>';
        if (res.tip) {
          tipText.textContent = res.tip.text;
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
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  });
  chrome.storage.onChanged.addListener(function (changes) {
    if (!changes.settings) return;
    var s = changes.settings.newValue || {};
    settings.showBadge = s.showBadge !== false && !(s.badgeHidden && s.badgeHidden[site.id]);
    settings.sites = s.sites || {};
    settings.models = s.models || {};
  });
})();
