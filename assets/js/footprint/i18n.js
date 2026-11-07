// Translations. Each language registers a catalog (src/locales/*.js); t() picks the
// user's language, falls back to English, fills {placeholders} and chooses plural
// forms with Intl.PluralRules, so "1 reply" / "2 replies" is right in every language.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootprintI18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var catalogs = {};
  var names = {};
  var current = 'en';
  var RTL = ['ar', 'he', 'fa', 'ur'];

  function register(code, name, catalog) { catalogs[code] = catalog; names[code] = name; }

  function resolve(lang) {
    var l = String(lang || 'en').toLowerCase();
    if (catalogs[l]) return l;
    var base = l.split(/[-_]/)[0];
    return catalogs[base] ? base : 'en';
  }

  // lang: a setting ('' = automatic) or a browser language list.
  function setLocale(lang, browserLangs) {
    if (lang) { current = resolve(lang); return current; }
    var list = browserLangs || [];
    for (var i = 0; i < list.length; i++) {
      var r = resolve(list[i]);
      if (r !== 'en' || /^en\b/i.test(list[i])) { current = r; return current; }
    }
    current = 'en';
    return current;
  }

  function raw(key) {
    var c = catalogs[current];
    if (c && c[key] != null) return c[key];
    return catalogs.en && catalogs.en[key] != null ? catalogs.en[key] : key;
  }

  function t(key, params) {
    var m = raw(key);
    var p = params || {};
    if (m && typeof m === 'object') {
      var n = Number(p.count != null ? p.count : p.n);
      var rule = isFinite(n) ? new Intl.PluralRules(current).select(n) : 'other';
      m = m[rule] != null ? m[rule] : m.other;
    }
    return String(m).replace(/\{(\w+)\}/g, function (all, k) { return p[k] != null ? p[k] : all; });
  }

  // Fill static page text: <span data-i18n="key">English fallback</span>.
  function apply(doc) {
    var d = doc || document;
    d.documentElement.lang = current;
    d.documentElement.dir = RTL.indexOf(current) !== -1 ? 'rtl' : 'ltr';
    d.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    d.querySelectorAll('[data-i18n-label]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    d.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  return {
    register: register, setLocale: setLocale, t: t, apply: apply,
    locale: function () { return current; },
    languages: function () { return Object.keys(names).map(function (c) { return { code: c, name: names[c] }; }); },
    catalog: function (code) { return catalogs[code]; }
  };
});
