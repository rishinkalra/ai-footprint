// Plain-language comparisons: energy, carbon and water in everyday terms, chosen
// for where the person lives. Appliance figures and sources are in METHODOLOGY.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n'), require('./format'));
  else root.FootprintCompare = factory(root.FootprintI18n, root.FootprintFormat);
})(typeof self !== 'undefined' ? self : this, function (I, F) {
  'use strict';

  // Everyday uses of electricity. watts = typical power draw; wh = energy per use.
  var THINGS = {
    phone:     { wh: 15 },     // one full smartphone charge, charger losses included
    led:       { watts: 10 },  // an LED bulb (60 W-equivalent)
    fan:       { watts: 75 },  // a standard ceiling fan at full speed
    tv:        { watts: 100 }, // a mid-size LED TV
    laptop:    { watts: 50 },  // a laptop in use
    microwave: { watts: 1100 },// a microwave oven heating
    tea:       { wh: 25 }      // boiling water for one cup of tea (250 mL)
  };

  // By country: the everyday thing people there know best comes first, then the
  // phone (understood everywhere), then backups. The first that reads well wins.
  var SETS = {
    fan:       ['fan', 'phone', 'led', 'tv'],
    microwave: ['microwave', 'phone', 'led', 'laptop'],
    tea:       ['tea', 'phone', 'led', 'tv'],
    light:     ['led', 'phone', 'fan', 'tv'],
    world:     ['phone', 'led', 'laptop', 'tv']
  };
  var MIN_SECONDS = 30;   // "a fan for 2 seconds" says little; prefer the next option
  var REGION_SET = {
    IN: 'fan', PK: 'fan', BD: 'fan', LK: 'fan', NP: 'fan', ID: 'fan', PH: 'fan', VN: 'fan', TH: 'fan', MY: 'fan', EG: 'fan', BR: 'fan',
    US: 'microwave', CA: 'microwave', MX: 'microwave',
    GB: 'tea', IE: 'tea', AU: 'tea', NZ: 'tea', TR: 'tea', CN: 'tea', JP: 'tea', DE: 'tea', NL: 'tea', FR: 'tea',
    NG: 'light', KE: 'light', GH: 'light', ET: 'light', TZ: 'light', UG: 'light', ZA: 'light', RW: 'light', ZM: 'light'
  };

  function setFor(region) { return SETS[REGION_SET[region] || 'world']; }

  // A duration in the unit that reads best.
  function duration(hours) {
    var loc = I.locale();
    var s = hours * 3600;
    if (s < 90) return I.t('dur_seconds', { count: Math.max(1, Math.round(s)), n: F.num(Math.max(1, Math.round(s)), loc) });
    if (s < 59.5 * 60) { var m = Math.round(s / 60); return I.t('dur_minutes', { count: m, n: F.num(m, loc) }); }
    if (hours < 48) { var h = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours); return I.t('dur_hours', { count: h, n: F.num(h, loc) }); }
    var d = hours / 24 < 10 ? Math.round(hours / 2.4) / 10 : Math.round(hours / 24);
    return I.t('dur_days', { count: d, n: F.num(d, loc) });
  }

  // One comparison: { id, text } or null when the number would read badly.
  // strict: durations must be at least MIN_SECONDS.
  function phrase(id, wh, strict) {
    var loc = I.locale();
    var thing = THINGS[id];
    if (thing.wh) {
      var times = wh / thing.wh;
      if (id === 'phone') {
        if (times < 0.01) return null;                       // under 1% reads as nothing
        if (times < 1) return { id: id, text: I.t('cmp_phone_pct', { n: F.num(times * 100, loc) }) };
        if (times > 999) return null;
        return { id: id, text: I.t('cmp_phone', { count: times, n: F.num(times, loc) }) };
      }
      if (times < 0.5 || times > 999) return null;
      return { id: id, text: I.t('cmp_' + id, { count: times, n: F.num(times, loc) }) };
    }
    var hours = wh / thing.watts;
    if (hours * 3600 < (strict ? MIN_SECONDS : 1) || hours > 24 * 99) return null;
    return { id: id, text: I.t('cmp_' + id, { time: duration(hours) }) };
  }

  // The best everyday comparison for an amount of energy, for this country.
  function energy(wh, region) {
    if (!(wh > 0)) return { id: 'none', text: I.t('cmp_none') };
    var order = setFor(region);
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < order.length; i++) {
        var p = phrase(order[i], wh, pass === 0);
        if (p) return p;
      }
    }
    return phrase('led', wh, false) || { id: 'wh', text: F.join(F.energy(wh, I.locale())) };
  }

  // Water in drops, teaspoons, glasses or litres.
  function water(ml) {
    var loc = I.locale();
    if (!(ml > 0)) return I.t('water_none');
    if (ml < 2.5) { var d = Math.max(1, Math.round(ml / 0.05)); return I.t('water_drops', { count: d, n: F.num(d, loc) }); }
    if (ml < 60) { var tsp = Math.max(1, Math.round(ml / 5)); return I.t('water_tsp', { count: tsp, n: F.num(tsp, loc) }); }
    if (ml < 190) return I.t('water_lt_glass');                     // 60–190 mL
    if (ml < 2500) {
      var g = ml / 250;
      if (g < 1.25) return I.t('water_glasses', { count: 1, n: 1 }); // about a glass
      g = Math.round(g * 2) / 2;                                       // to the nearest half glass
      return I.t('water_glasses', { count: g, n: F.num(g, loc) });
    }
    var l = ml / 1000;
    return I.t('water_litres', { count: l, n: F.num(l, loc) });
  }

  // Carbon as a drive in a typical local car.
  function carbon(km, miles) {
    return I.t('co2_drive', { d: F.distance(km, I.locale(), miles) });
  }

  // The country's name in the user's language ("India", "भारत", "la India"...).
  function country(region) {
    if (!region || region.code === 'WORLD') return I.t('world_name');
    if (I.locale() === 'en') return region.inName;
    try { return new Intl.DisplayNames([I.locale()], { type: 'region' }).of(region.code) || region.name; } catch (e) { return region.name; }
  }

  return { energy: energy, water: water, carbon: carbon, duration: duration, country: country, THINGS: THINGS, SETS: SETS, setFor: setFor };
});
