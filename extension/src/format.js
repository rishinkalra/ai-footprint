// Number formatting shared by every extension page. Follows the user's locale.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootprintFormat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Two significant digits below 100 so small values never collapse to 0.
  function num(n, locale) {
    if (!isFinite(n) || n === 0) return '0';
    var opts = Math.abs(n) >= 100 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 2 };
    return new Intl.NumberFormat(locale, opts).format(n);
  }

  // Returns [value, unit] so pages can style the unit separately.
  function energy(wh, locale) {
    if (wh >= 1e6) return [num(wh / 1e6, locale), 'MWh'];
    if (wh >= 1000) return [num(wh / 1000, locale), 'kWh'];
    return [num(wh, locale), 'Wh'];
  }
  function carbon(g, locale) {
    if (g >= 1e6) return [num(g / 1e6, locale), 't CO₂e'];
    if (g >= 1000) return [num(g / 1000, locale), 'kg CO₂e'];
    return [num(g, locale), 'g CO₂e'];
  }
  function water(ml, locale) {
    if (ml >= 1e6) return [num(ml / 1e6, locale), 'm³'];
    if (ml >= 1000) return [num(ml / 1000, locale), 'L'];
    return [num(ml, locale), 'mL'];
  }
  function join(pair) { return pair[0] + ' ' + pair[1]; }

  function money(v, currency, locale) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: currency,
        maximumFractionDigits: v >= 100 ? 0 : 2, minimumFractionDigits: v >= 100 ? 0 : 2
      }).format(v);
    } catch (e) {
      return num(v, locale) + ' ' + currency;
    }
  }

  function plural(n, one, many, locale) {
    return num(n, locale) + ' ' + (Math.abs(n - 1) < 0.005 ? one : many);
  }

  // Kilometres and metres, or miles and feet where people drive in miles.
  function distance(km, locale, miles) {
    if (miles) {
      var mi = km / 1.609344;
      return mi >= 0.1 ? num(mi, locale) + ' mi' : num(mi * 5280, locale) + ' ft';
    }
    return km >= 1 ? num(km, locale) + ' km' : num(km * 1000, locale) + ' m';
  }

  // "4.4%" style share, two significant digits, never "0%".
  function percent(share, locale) {
    if (!(share > 0)) return '0%';
    return num(share * 100, locale) + '%';
  }

  // The most relatable everyday comparison for an amount of energy.
  // Phone charge = 15 Wh; boiling a full kettle (1.5 L) = 0.15 kWh.
  function energyComparison(wh, locale) {
    if (wh <= 0) return '';
    if (wh < 15) return 'about ' + num((wh / 15) * 100, locale) + '% of a phone charge';
    if (wh < 3000) return 'about ' + plural(wh / 15, 'phone charge', 'phone charges', locale);
    return 'about ' + plural(wh / 150, 'kettle boiled', 'kettles boiled', locale);
  }

  function shortDate(date, locale) {
    var p = date.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
      .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  return {
    num: num, energy: energy, carbon: carbon, water: water, join: join, money: money,
    plural: plural, distance: distance, percent: percent, energyComparison: energyComparison, shortDate: shortDate
  };
});
