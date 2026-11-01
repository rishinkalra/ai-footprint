/* global FootprintStore, FootprintSites */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MODEL_CHOICES = {
    claude: [['claude-sonnet', 'Sonnet (default)'], ['claude-haiku', 'Haiku'], ['claude-opus', 'Opus']],
    gemini: [['gemini-flash', 'Flash (default)'], ['gemini-pro', 'Pro'], ['gemini-deep-research', 'Deep Research']],
    perplexity: [['sonar', 'Default'], ['sonar-reasoning', 'Reasoning'], ['sonar-deep-research', 'Deep Research']],
    copilot: [['gpt-4o', 'Default'], ['o3-think-deeper', 'Think Deeper']],
    deepseek: [['deepseek-chat', 'DeepSeek-V3 (default)'], ['deepseek-r1', 'DeepThink (R1)']],
    mistral: [['mistral-medium', 'Default'], ['magistral-reasoning', 'Think mode']],
    grok: [['grok', 'Default'], ['grok-thinking', 'Think mode']]
  };

  var current = null;

  function renderSites(settings) {
    $('sites').innerHTML = FootprintSites.SITES.map(function (s) {
      var choices = MODEL_CHOICES[s.id];
      var select = choices
        ? '<select data-model="' + s.id + '">' + choices.map(function (c) {
            return '<option value="' + esc(c[0]) + '"' + ((settings.models[s.id] || s.defaultModel) === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>';
          }).join('') + '</select>'
        : '<span class="muted" style="font-size:12px">model detected</span>';
      return '<label><input type="checkbox" data-site="' + s.id + '"' + (settings.sites[s.id] === false ? '' : ' checked') + ' /> <span class="name">' + esc(s.name) + '</span> ' + select + '</label>';
    }).join('');
  }

  function planRow(p) {
    var div = document.createElement('div');
    div.className = 'plan';
    div.innerHTML = '<input placeholder="Plan name" data-f="name" value="' + esc(p.name || '') + '" />' +
      '<input type="number" min="0" step="0.01" placeholder="Monthly price" data-f="monthly" value="' + esc(p.monthly || '') + '" />' +
      '<input placeholder="USD" maxlength="3" data-f="currency" value="' + esc(p.currency || '') + '" />' +
      '<button class="danger" type="button">Remove</button>';
    div.querySelector('button').addEventListener('click', function () { div.remove(); });
    $('plans').appendChild(div);
  }

  function load() {
    chrome.storage.local.get('settings', function (data) {
      current = data.settings || {};
      var s = FootprintStore.mergeSettings(current);
      $('dailyGoalWh').value = s.dailyGoalWh;
      $('showBadge').checked = s.showBadge !== false;
      $('carbonKgPerKwh').value = s.carbonKgPerKwh == null ? '' : s.carbonKgPerKwh;
      $('syncUrl').value = s.sync.url || '';
      $('syncKey').value = s.sync.key || '';
      $('syncEnabled').checked = !!s.sync.enabled;
      renderSites(s);
      $('plans').innerHTML = '';
      (s.plans || []).forEach(planRow);
    });
  }

  function collect() {
    var s = Object.assign({}, current);
    s.dailyGoalWh = Math.max(0, Number($('dailyGoalWh').value) || 0);
    s.showBadge = $('showBadge').checked;
    if (s.showBadge) s.badgeHidden = {};
    var c = $('carbonKgPerKwh').value;
    s.carbonKgPerKwh = c === '' ? null : Math.max(0, Number(c));
    s.sites = {};
    document.querySelectorAll('[data-site]').forEach(function (el) { if (!el.checked) s.sites[el.getAttribute('data-site')] = false; });
    s.models = {};
    document.querySelectorAll('[data-model]').forEach(function (el) { s.models[el.getAttribute('data-model')] = el.value; });
    s.plans = [];
    document.querySelectorAll('.plan').forEach(function (row) {
      var p = {};
      row.querySelectorAll('[data-f]').forEach(function (el) { p[el.getAttribute('data-f')] = el.value.trim(); });
      p.monthly = Number(p.monthly) || 0;
      p.currency = (p.currency || 'USD').toUpperCase();
      if (p.monthly > 0) s.plans.push(p);
    });
    s.sync = { url: $('syncUrl').value.trim(), key: $('syncKey').value, enabled: $('syncEnabled').checked };
    return s;
  }

  function originPattern(url) {
    var u = new URL(url);
    return u.protocol + '//' + u.host + '/*';
  }

  $('save').addEventListener('click', function () {
    var s = collect();
    var done = function (msg) {
      chrome.storage.local.set({ settings: s }, function () {
        current = s;
        $('status').textContent = msg || 'Saved.';
        setTimeout(function () { $('status').textContent = ''; }, 3000);
      });
    };
    if (s.sync.enabled && s.sync.url) {
      var pattern;
      try { pattern = originPattern(s.sync.url); } catch (e) { $('status').textContent = 'The dashboard address is not a valid URL.'; return; }
      // Ask for access to the dashboard only, and only when sync is switched on.
      chrome.permissions.request({ origins: [pattern] }, function (granted) {
        if (!granted) { s.sync.enabled = false; $('syncEnabled').checked = false; done('Saved. Sync stays off: permission was not granted.'); return; }
        done('Saved. Sync is on.');
      });
    } else {
      done();
    }
  });

  $('addPlan').addEventListener('click', function () { planRow({}); });

  $('syncNow').addEventListener('click', function () {
    $('syncStatus').textContent = 'Syncing…';
    chrome.runtime.sendMessage({ type: 'sync-now' }, function (res) {
      $('syncStatus').textContent = res && res.ok ? 'Sent ' + res.sent + ' rows.' : 'Not synced: ' + ((res && res.error) || 'unknown error');
    });
  });

  $('export').addEventListener('click', function () {
    chrome.storage.local.get(null, function (data) {
      var copy = JSON.parse(JSON.stringify(data));
      if (copy.settings && copy.settings.sync) copy.settings.sync.key = copy.settings.sync.key ? '(hidden)' : '';
      var blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ai-footprint-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  });

  $('wipe').addEventListener('click', function () {
    if (!confirm('Delete all recorded AI footprint data from this browser? Settings are kept.')) return;
    chrome.storage.local.remove('state', function () { $('status').textContent = 'All data deleted.'; });
  });

  load();
})();
