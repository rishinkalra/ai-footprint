// Local perspective: which country the user is in, and what that means for
// units, comparisons and (optionally) carbon. Data: src/regions-data.js (Ember via OWID).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regions-data'));
  else root.FootprintRegions = factory(root.FootprintRegionData);
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';

  // Where most chat AI runs today: large US data centres. Ember 2025 US lifecycle
  // grid intensity. Used unless the user picks their own grid or a custom figure.
  var DATACENTRE_REGION = 'US';

  var MILES = ['US', 'GB', 'LR', 'MM'];
  var THE = ['US', 'GB', 'NL', 'PH', 'AE', 'BS', 'GM', 'CF', 'CD', 'CG', 'DO', 'KM', 'MV', 'MH', 'SB', 'SC', 'KY', 'TC', 'VA', 'CZ'];

  // Tailpipe CO2 of a typical petrol car. US: EPA "typical passenger vehicle",
  // about 400 g per mile. Elsewhere: about 170 g/km, a typical real-world figure
  // for a mid-size petrol car.
  var CAR_G_PER_KM = { US: 249, CA: 249 };
  var DEFAULT_CAR_G_PER_KM = 170;

  // A few time zones for browsers whose language has no region (e.g. "en").
  var TZ = {
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Shanghai': 'CN',
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
    'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Stockholm': 'SE',
    'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE',
    'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX',
    'America/Bogota': 'CO', 'America/Argentina/Buenos_Aires': 'AR', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Pacific/Auckland': 'NZ'
  };

  function detect(languages, timeZone) {
    var langs = languages || [];
    for (var i = 0; i < langs.length; i++) {
      var m = String(langs[i]).match(/[-_]([A-Za-z]{2})(\b|$)/);
      if (m && DATA[m[1].toUpperCase()]) return m[1].toUpperCase();
    }
    if (timeZone && TZ[timeZone] && DATA[TZ[timeZone]]) return TZ[timeZone];
    if (timeZone && /^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana)/.test(timeZone)) return 'US';
    return 'WORLD';
  }

  function info(code) {
    var c = DATA[code] ? code : 'WORLD';
    var d = DATA[c];
    var name = d[0];
    return {
      code: c,
      name: name,
      inName: c === 'WORLD' ? 'the world' : (THE.indexOf(c) !== -1 ? 'the ' + name : name),
      gridGPerKwh: d[1],
      gridYear: d[2],
      perPersonKwhYear: d[3],
      perPersonWhDay: d[3] * 1000 / 365,
      demandYear: d[4],
      miles: MILES.indexOf(c) !== -1,
      carGPerKm: CAR_G_PER_KM[c] || DEFAULT_CAR_G_PER_KM
    };
  }

  // Carbon factor in kg/kWh (== g/Wh) for the chosen basis.
  //   datacentre (default): US grid, where most chat AI runs
  //   local: the user's country grid (for apps served from local data centres)
  //   world: the world average
  //   custom: settings.carbonKgPerKwh
  function carbonFactor(settings, regionCode) {
    var s = settings || {};
    var basis = s.carbonBasis || (s.carbonKgPerKwh != null ? 'custom' : 'datacentre');
    if (basis === 'custom' && s.carbonKgPerKwh != null) return { kgPerKwh: s.carbonKgPerKwh, basis: 'custom', label: 'your custom figure' };
    if (basis === 'local') { var l = info(regionCode); return { kgPerKwh: l.gridGPerKwh / 1000, basis: 'local', label: l.inName + "'s grid (" + l.gridYear + ')' }; }
    if (basis === 'world') { var w = info('WORLD'); return { kgPerKwh: w.gridGPerKwh / 1000, basis: 'world', label: 'world average grid (' + w.gridYear + ')' }; }
    var dc = info(DATACENTRE_REGION);
    return { kgPerKwh: dc.gridGPerKwh / 1000, basis: 'datacentre', label: 'US grid, where most AI runs (' + dc.gridYear + ')' };
  }

  function list() {
    return Object.keys(DATA).filter(function (k) { return k !== 'WORLD'; })
      .map(function (k) { return { code: k, name: DATA[k][0] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  return { detect: detect, info: info, carbonFactor: carbonFactor, list: list, DATACENTRE_REGION: DATACENTRE_REGION };
});
