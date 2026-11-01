/* global FootprintStore, FootprintSites, FootprintFormat, FootprintIcons, FootprintRegions, FootprintI18n, FootprintCompare, FootprintDOM */
(function () {
  'use strict';
  var I = FootprintIcons;
  var F = FootprintFormat;
  var L = FootprintI18n;
  var Cmp = FootprintCompare;
  var tr = L.t;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var MONO = { chatgpt: 'Ch', claude: 'Cl', gemini: 'Ge', perplexity: 'Px', copilot: 'Co', deepseek: 'DS', mistral: 'LC', grok: 'Gk' };
  var MODEL_CHOICES = {
    claude: [['claude-sonnet', 'Sonnet'], ['claude-haiku', 'Haiku'], ['claude-opus', 'Opus']],
    gemini: [['gemini-flash', 'Flash'], ['gemini-pro', 'Pro'], ['gemini-deep-research', 'Deep Research']],
    perplexity: [['sonar', 'Standard'], ['sonar-reasoning', 'Reasoning'], ['sonar-deep-research', 'Deep Research']],
    copilot: [['gpt-4o', 'Standard'], ['o3-think-deeper', 'Think Deeper']],
    deepseek: [['deepseek-chat', 'DeepSeek-V3'], ['deepseek-r1', 'DeepThink (R1)']],
    mistral: [['mistral-medium', 'Standard'], ['magistral-reasoning', 'Think mode']],
    grok: [['grok', 'Standard'], ['grok-thinking', 'Think mode']]
  };

  var raw = {};       // the stored settings object, kept whole so unknown keys survive
  var statusTimer = null;

  function status(text, ok) {
    FootprintDOM.set($('status'), (ok === false ? '' : I.get('check', 15)) + esc(text));
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { $('status').textContent = ''; }, 2500);
  }

  function save(patch, message) {
    Object.assign(raw, patch);
    chrome.storage.local.set({ settings: raw }, function () { status(message || tr('st_saved')); });
  }

  var R = FootprintRegions;
  var detected = R.detect(navigator.languages, Intl.DateTimeFormat().resolvedOptions().timeZone);
  function currentRegion() { return raw.region || detected; }

  // ---- country and carbon ---------------------------------------------------
  function renderRegion() {
    var sel = $('region');
    var det = R.info(detected);
    FootprintDOM.set(sel, '<option value="">' + esc(tr('o_auto', { x: det.code === 'WORLD' ? tr('o_not_detected') : Cmp.country(det) })) + '</option>' +
      R.list().map(function (c) { return '<option value="' + c.code + '"' + (raw.region === c.code ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''));
    var i = R.info(currentRegion());
    $('regionNote').textContent = tr('o_region_note', { country: Cmp.country(i), kwh: F.num(i.perPersonWhDay / 1000, L.locale()), year: i.demandYear, units: tr(i.miles ? 'o_mi' : 'o_km') });
  }
  function renderBasis() {
    var region = R.info(currentRegion());
    var basis = raw.carbonBasis || (raw.carbonKgPerKwh != null ? 'custom' : 'datacentre');
    var us = R.info('US'), world = R.info('WORLD');
    var rows = [
      ['datacentre', tr('o_basis_dc'), tr('o_basis_dc_s', { year: us.gridYear }), us.gridGPerKwh],
      ['local', tr('o_basis_local'), region.code === 'WORLD' ? tr('o_country_not_set') : Cmp.country(region) + ' · ' + region.gridYear, region.gridGPerKwh],
      ['world', tr('o_basis_world'), tr('o_basis_world_s', { year: world.gridYear }), world.gridGPerKwh],
      ['custom', tr('o_basis_custom'), tr('o_basis_custom_s'), raw.carbonKgPerKwh != null ? Math.round(raw.carbonKgPerKwh * 1000) : null]
    ];
    FootprintDOM.set($('basisList'), rows.map(function (r) {
      return '<label class="opt"><input type="radio" name="basis" value="' + r[0] + '"' + (basis === r[0] ? ' checked' : '') + ' />' +
        '<span><b>' + esc(r[1]) + '</b><span class="sub">' + esc(r[2]) + '</span></span>' +
        '<span class="g">' + (r[3] != null ? esc(F.num(r[3])) + '<small>g/kWh</small>' : '') + '</span></label>';
    }).join(''));
    $('customRow').hidden = basis !== 'custom';
  }
  $('region').addEventListener('change', function () {
    save({ region: this.value || null }, tr(this.value ? 'st_country' : 'st_country_auto'));
    renderRegion(); renderBasis();
  });
  $('basisList').addEventListener('change', function (e) {
    if (e.target.name !== 'basis') return;
    var patch = { carbonBasis: e.target.value };
    if (e.target.value === 'custom' && raw.carbonKgPerKwh == null) patch.carbonKgPerKwh = 0.384;
    save(patch, tr('st_basis'));
    renderBasis();
    if (e.target.value === 'custom') $('carbonKgPerKwh').focus();
  });

  // ---- goal ---------------------------------------------------------------
  function showGoal(v) {
    $('goalNum').textContent = v > 0 ? v : tr('o_goal_off');
    $('goalNum').nextElementSibling.hidden = !(v > 0);
    $('goalEq').textContent = v > 0
      ? tr('o_goal_eq', { n: F.num(Math.round(v / 0.3), L.locale()), cmp: Cmp.energy(v, currentRegion()).text })
      : tr('o_goal_none');
  }
  $('dailyGoalWh').addEventListener('input', function () { showGoal(Number(this.value)); });
  $('dailyGoalWh').addEventListener('change', function () { save({ dailyGoalWh: Number(this.value) }); });
  $('showBadge').addEventListener('change', function () {
    save({ showBadge: this.checked, badgeHidden: this.checked ? {} : raw.badgeHidden }, tr(this.checked ? 'st_badge_on' : 'st_badge_off'));
  });

  // ---- apps -----------------------------------------------------------------
  function renderSites(s) {
    FootprintDOM.set($('sites'), FootprintSites.SITES.map(function (site) {
      var on = s.sites[site.id] !== false;
      var choices = MODEL_CHOICES[site.id];
      var current = s.models[site.id] || site.defaultModel;
      var ctl = choices
        ? '<label class="sr" for="model-' + site.id + '">' + esc(tr('o_usual_model', { site: site.name })) + '</label><select id="model-' + site.id + '" data-model="' + site.id + '">' +
          choices.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (current === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>'
        : '<span class="auto">' + esc(tr('o_model_auto')) + '</span>';
      return '<div class="app' + (on ? '' : ' off') + '"><span class="mono" aria-hidden="true">' + esc(MONO[site.id]) + '</span>' +
        '<span class="name">' + esc(site.name) + '</span>' + ctl +
        '<label class="switch"><input type="checkbox" data-site="' + site.id + '"' + (on ? ' checked' : '') + ' /><span aria-hidden="true"></span><span class="sr">' + esc(tr('o_measure', { site: site.name })) + '</span></label></div>';
    }).join(''));
  }
  $('sites').addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-site')) {
      var sites = Object.assign({}, raw.sites);
      var id = t.getAttribute('data-site');
      if (t.checked) delete sites[id]; else sites[id] = false;
      t.closest('.app').classList.toggle('off', !t.checked);
      save({ sites: sites }, tr(t.checked ? 'st_measuring' : 'st_stopped', { site: FootprintSites.SITES.filter(function (x) { return x.id === id; })[0].name }));
    }
    if (t.hasAttribute('data-model')) {
      var models = Object.assign({}, raw.models);
      models[t.getAttribute('data-model')] = t.value;
      save({ models: models });
    }
  });

  // ---- plans ----------------------------------------------------------------
  function planRow(p, i) {
    return '<div class="plan" data-i="' + i + '">' +
      '<label class="sr" for="pn' + i + '">' + esc(tr('o_plan_name')) + '</label><input type="text" id="pn' + i + '" data-f="name" placeholder="' + esc(tr('o_plan_name_ph')) + '" value="' + esc(p.name || '') + '" />' +
      '<label class="sr" for="pm' + i + '">' + esc(tr('o_plan_price')) + '</label><input type="number" id="pm' + i + '" data-f="monthly" min="0" step="0.01" placeholder="' + esc(tr('o_plan_price')) + '" value="' + esc(p.monthly || '') + '" />' +
      '<label class="sr" for="pc' + i + '">Currency</label><input type="text" id="pc' + i + '" data-f="currency" maxlength="3" placeholder="USD" value="' + esc(p.currency || '') + '" />' +
      '<button type="button" class="btn rm" data-rm="' + i + '" aria-label="' + esc(tr('o_plan_remove')) + '">' + I.get('close', 15) + '</button></div>';
  }
  function renderPlans() {
    var plans = raw.plans || [];
    FootprintDOM.set($('planList'), plans.length ? plans.map(planRow).join('') : '<p class="empty-note">' + esc(tr('o_plans_none')) + '</p>');
  }
  function readPlans() {
    var out = [];
    document.querySelectorAll('.plan').forEach(function (row) {
      var p = {};
      row.querySelectorAll('[data-f]').forEach(function (el) { p[el.getAttribute('data-f')] = el.value.trim(); });
      p.monthly = Number(p.monthly) || 0;
      p.currency = (p.currency || 'USD').toUpperCase();
      out.push(p);
    });
    return out;
  }
  $('planList').addEventListener('change', function () { save({ plans: readPlans() }); });
  $('planList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]');
    if (!b) return;
    var plans = readPlans();
    plans.splice(Number(b.getAttribute('data-rm')), 1);
    raw.plans = plans;
    renderPlans();
    save({ plans: plans }, tr('st_plan_removed'));
  });
  $('addPlan').addEventListener('click', function () {
    var plans = readPlans();
    plans.push({ name: '', monthly: 0, currency: '' });
    raw.plans = plans;
    renderPlans();
    var rows = document.querySelectorAll('.plan input[data-f="name"]');
    if (rows.length) rows[rows.length - 1].focus();
  });

  // ---- advanced -------------------------------------------------------------
  $('carbonKgPerKwh').addEventListener('change', function () {
    var v = this.value === '' ? null : Math.max(0, Number(this.value));
    save({ carbonKgPerKwh: v, carbonBasis: v == null ? 'datacentre' : 'custom' }, tr(v == null ? 'st_carbon_default' : 'st_saved'));
    renderBasis();
  });
  function syncPatch() {
    return { sync: { url: $('syncUrl').value.trim(), key: $('syncKey').value, enabled: $('syncEnabled').checked } };
  }
  $('syncUrl').addEventListener('change', function () { save(syncPatch()); });
  $('syncKey').addEventListener('change', function () { save(syncPatch()); });
  $('syncEnabled').addEventListener('change', function () {
    var box = this;
    if (!box.checked) { save(syncPatch(), tr('st_sync_off')); return; }
    var url = $('syncUrl').value.trim();
    var origin;
    try { var u = new URL(url); origin = u.protocol + '//' + u.host + '/*'; } catch (e) {
      box.checked = false;
      status(tr('st_sync_url'), false);
      return;
    }
    // Access to the dashboard is requested only now, only for that one address.
    chrome.permissions.request({ origins: [origin] }, function (granted) {
      if (!granted) { box.checked = false; status(tr('st_sync_denied'), false); return; }
      save(syncPatch(), tr('st_sync_on'));
    });
  });
  $('syncNow').addEventListener('click', function () {
    $('syncStatus').textContent = tr('o_syncing');
    chrome.runtime.sendMessage({ type: 'sync-now' }, function (res) {
      $('syncStatus').textContent = res && res.ok ? tr('o_sync_sent', { n: res.sent }) : tr('o_sync_fail', { e: (res && res.error) || '?' });
    });
  });

  // ---- data -----------------------------------------------------------------
  $('export').addEventListener('click', function () {
    chrome.storage.local.get(null, function (data) {
      var copy = JSON.parse(JSON.stringify(data));
      if (copy.settings && copy.settings.sync && copy.settings.sync.key) copy.settings.sync.key = '(hidden)';
      var blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ai-footprint-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  });
  $('wipe').addEventListener('click', function () {
    if (!confirm(tr('o_wipe_confirm'))) return;
    chrome.storage.local.remove('state', function () { status(tr('st_wiped')); });
  });

  // ---- load -------------------------------------------------------------------
  FootprintDOM.set($('mark'), I.get('mark', 24));
  function labels() {
    L.apply(document);
    FootprintDOM.set($('addPlan'), I.get('plus', 15) + esc(tr('o_add_plan')));
    FootprintDOM.set($('export'), I.get('download', 15) + esc(tr('o_export')));
  }

  function renderLanguage() {
    var auto = L.setLocale('', navigator.languages);
    var name = (L.languages().filter(function (l) { return l.code === auto; })[0] || {}).name || 'English';
    FootprintDOM.set($('language'), '<option value="">' + esc(tr('o_auto', { x: name })) + '</option>' +
      L.languages().map(function (l) { return '<option value="' + l.code + '"' + (raw.language === l.code ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join(''));
    L.setLocale(raw.language, navigator.languages);
  }
  $('language').addEventListener('change', function () {
    raw.language = this.value || null;
    L.setLocale(raw.language, navigator.languages);
    save({ language: raw.language }, tr('st_language'));
    renderAll();
  });

  function renderAll() {
    var s = FootprintStore.mergeSettings(raw);
    renderLanguage();
    labels();
    showGoal(Number($('dailyGoalWh').value));
    renderSites(s);
    renderPlans();
    renderRegion();
    renderBasis();
  }

  chrome.storage.local.get('settings', function (data) {
    raw = data.settings || {};
    L.setLocale(raw.language, navigator.languages);
    var s = FootprintStore.mergeSettings(raw);
    $('dailyGoalWh').value = s.dailyGoalWh;
    showGoal(s.dailyGoalWh);
    $('showBadge').checked = s.showBadge !== false;
    $('carbonKgPerKwh').value = s.carbonKgPerKwh == null ? '' : s.carbonKgPerKwh;
    $('syncUrl').value = s.sync.url || '';
    $('syncKey').value = s.sync.key || '';
    $('syncEnabled').checked = !!s.sync.enabled;
    renderAll();
  });
})();
