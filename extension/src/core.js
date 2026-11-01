// Footprint estimation shared by the background worker, popup and tests.
// Energy figures mirror dashboard/defaults.js
// (a test checks they stay in sync). Everything is an estimate; see README.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootprintCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Wh per 1,000 tokens at the data-centre meter (PUE included).
  var TIERS = {
    small:  { inputWhPer1k: 0.01, outputWhPer1k: 0.10 },
    medium: { inputWhPer1k: 0.05, outputWhPer1k: 0.50 },
    large:  { inputWhPer1k: 0.12, outputWhPer1k: 1.50 },
    xlarge: { inputWhPer1k: 0.25, outputWhPer1k: 3.00 }
  };

  // List prices (USD per million tokens) used for "value at API prices" when
  // the exact model is unknown. Per-model prices live in the dashboard.
  var TIER_PRICES = {
    small:  { input: 0.50, output: 2 },
    medium: { input: 3, output: 15 },
    large:  { input: 5, output: 25 },
    xlarge: { input: 10, output: 50 }
  };

  var TIER_RULES = [
    { pattern: /fable|mythos|gpt-4\.5|o1-pro|o3-pro|deep-?research/, tier: 'xlarge' },
    { pattern: /opus|ultra|-405b/, tier: 'large' },
    { pattern: /haiku|mini|nano|flash|lite|small|-8b|-7b|-3b|gemma/, tier: 'small' }
  ];

  // Reasoning ("thinking") models write hidden tokens the page never shows.
  // We multiply visible output by this factor for them.
  var REASONING_PATTERN = /thinking|reason|(^|[^a-z])o[134]([^a-z]|$)|-r1|deep-?research|\bpro\b/;
  var REASONING_OUTPUT_MULTIPLIER = 4;

  // Generated image: ~2.9 Wh (Luccioni et al. 2023, "Power Hungry Processing").
  var IMAGE_WH = 2.9;

  // Re-reading text the provider already has in its prompt cache skips most of the
  // compute. Providers keep a conversation cached for about 5 minutes of inactivity.
  var CACHE_READ_FACTOR = 0.1;
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var DEFAULTS = {
    // Ember 2025 lifecycle grid intensity of the US, where most chat AI runs.
    // Pages pass the user's chosen basis (see regions.js); this is the fallback.
    carbonKgPerKwh: 0.384,
    waterLitresPerKwh: 1.1,
    uncertainty: { low: 0.4, high: 3.0 },
    charsPerToken: 4,
    maxContextTokens: 128000,
    longThreadTokens: 20000,
    freshChatTokens: 2000
  };

  var EQUIVALENTS = {
    phoneChargeWh: 15,
    ledBulbW: 10,
    googleSearchWh: 0.3,
    carGCo2PerKm: 170,
    glassOfWaterMl: 250
  };

  function tierFor(model) {
    var id = String(model || '').toLowerCase();
    for (var i = 0; i < TIER_RULES.length; i++) {
      if (TIER_RULES[i].pattern.test(id)) return TIER_RULES[i].tier;
    }
    return 'medium';
  }

  function isReasoning(model) {
    return REASONING_PATTERN.test(String(model || '').toLowerCase());
  }

  function tokensFromChars(chars, opts) {
    var o = opts || DEFAULTS;
    return Math.round((chars || 0) / (o.charsPerToken || 4));
  }

  // turn: { model, tier?, inputTokens, cachedTokens?, outputTokens, images }
  //   inputTokens   everything the model read for this reply (prompt + conversation so far)
  //   cachedTokens  the part of inputTokens served from the provider's prompt cache
  //   outputTokens  the visible reply; thinking models add hidden reasoning on top
  //
  // energy (Wh) = (fresh input + cached × 0.1) / 1000 × input Wh per 1k
  //             + output × reasoning multiplier / 1000 × output Wh per 1k
  //             + images × 2.9
  function assessTurn(turn, settings) {
    var s = settings || {};
    var tier = turn.tier || tierFor(turn.model);
    var t = TIERS[tier] || TIERS.medium;
    var reasoning = turn.reasoning != null ? turn.reasoning : isReasoning(turn.model);
    var input = Math.min(turn.inputTokens || 0, DEFAULTS.maxContextTokens);
    var cached = Math.min(input, Math.max(0, turn.cachedTokens || 0));
    var effectiveInput = (input - cached) + cached * CACHE_READ_FACTOR;
    var output = (turn.outputTokens || 0) * (reasoning ? REASONING_OUTPUT_MULTIPLIER : 1);
    var wh = (effectiveInput / 1000) * t.inputWhPer1k + (output / 1000) * t.outputWhPer1k + (turn.images || 0) * IMAGE_WH;
    var price = TIER_PRICES[tier] || TIER_PRICES.medium;
    var kgPerKwh = s.carbonKgPerKwh != null ? s.carbonKgPerKwh : DEFAULTS.carbonKgPerKwh;
    return {
      tier: tier,
      reasoning: reasoning,
      inputTokens: input,
      cachedTokens: cached,
      outputTokens: output,
      wh: wh,
      co2g: wh * kgPerKwh,                     // kg/kWh == g/Wh
      waterMl: wh * DEFAULTS.waterLitresPerKwh,  // L/kWh == mL/Wh
      apiValueUsd: ((input - cached) * price.input + cached * price.input * CACHE_READ_FACTOR + output * price.output) / 1e6
    };
  }

  // How much less energy the next reply would use in a fresh chat, compared with
  // this reply as it actually ran (cached or not).
  function freshChatSaving(turn) {
    var now = assessTurn(turn).wh;
    var fresh = assessTurn({
      model: turn.model, tier: turn.tier, reasoning: turn.reasoning,
      inputTokens: DEFAULTS.freshChatTokens, cachedTokens: 0, outputTokens: turn.outputTokens, images: 0
    }).wh;
    return { nowWh: now, freshWh: fresh, factor: fresh > 0 ? now / fresh : 1 };
  }

  // In-page nudge for a single reply, or null.
  function tipForTurn(turn, context) {
    var c = context || {};
    if (turn.inputTokens >= DEFAULTS.longThreadTokens && !c.longThreadTipShown) {
      var s = freshChatSaving(turn);
      if (s.factor >= 1.5) {
        return {
          id: 'long-thread',
          text: 'This chat is long: each reply re-reads about ' + Math.round(turn.inputTokens / 1000) +
            'k tokens. Starting a new chat with a short summary would use about ' +
            Math.round(s.factor) + '× less energy per reply.'
        };
      }
    }
    if (isReasoning(turn.model) && (turn.promptTokens || 0) < 60 && !c.reasoningTipShown) {
      return {
        id: 'reasoning-short',
        text: 'Thinking models write hidden reasoning before answering, often several times the visible reply. ' +
          'For quick questions a standard model is enough.'
      };
    }
    if ((turn.images || 0) > 0 && !c.imageTipShown) {
      return {
        id: 'image',
        text: 'Generating one image uses roughly as much energy as ' + Math.round(IMAGE_WH / 0.3) +
          ' text replies. Describe what you want precisely to avoid re-rolls.'
      };
    }
    return null;
  }

  function emptyTotals() {
    return { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, images: 0, wh: 0, co2g: 0, waterMl: 0, apiValueUsd: 0, longThreadWh: 0, reasoningWh: 0 };
  }

  function addTotals(a, b) {
    var out = emptyTotals();
    for (var k in out) out[k] = (a[k] || 0) + (b[k] || 0);
    return out;
  }

  function band(value) {
    return { low: value * DEFAULTS.uncertainty.low, mid: value, high: value * DEFAULTS.uncertainty.high };
  }

  // Habit-level suggestions from a period's totals.
  function insights(totals) {
    var out = [];
    if (!totals || totals.wh <= 0) return out;
    var longShare = totals.longThreadWh / totals.wh;
    var reasonShare = totals.reasoningWh / totals.wh;
    if (longShare >= 0.3) {
      out.push({ id: 'long-threads', share: longShare,
        text: Math.round(longShare * 100) + '% of your AI energy went on replies in very long chats. Start fresh chats more often.' });
    }
    if (reasonShare >= 0.3) {
      out.push({ id: 'reasoning', share: reasonShare,
        text: Math.round(reasonShare * 100) + '% came from thinking models. Save them for hard problems.' });
    }
    var imageShare = (totals.images * IMAGE_WH) / totals.wh;
    if (totals.images > 0 && imageShare >= 0.05) {
      out.push({ id: 'images', share: imageShare,
        text: totals.images + ' generated image' + (totals.images === 1 ? '' : 's') + ' used about ' +
          Math.round(((totals.images * IMAGE_WH) / totals.wh) * 100) + '% of your AI energy.' });
    }
    return out;
  }

  // carGPerKm: the local typical car (see regions.js); defaults to 170 g/km.
  function equivalents(totals, carGPerKm) {
    return {
      phoneCharges: totals.wh / EQUIVALENTS.phoneChargeWh,
      ledBulbHours: totals.wh / EQUIVALENTS.ledBulbW,
      googleSearches: totals.wh / EQUIVALENTS.googleSearchWh,
      carKm: totals.co2g / (carGPerKm || EQUIVALENTS.carGCo2PerKm),
      glassesOfWater: totals.waterMl / EQUIVALENTS.glassOfWaterMl
    };
  }

  function localDate(ms) {
    var d = new Date(ms == null ? Date.now() : ms);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function addDays(date, n) {
    var p = date.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
    return localDate(d.getTime());
  }

  return {
    TIERS: TIERS, TIER_PRICES: TIER_PRICES, DEFAULTS: DEFAULTS, EQUIVALENTS: EQUIVALENTS,
    CACHE_READ_FACTOR: CACHE_READ_FACTOR, CACHE_TTL_MS: CACHE_TTL_MS,
    IMAGE_WH: IMAGE_WH, REASONING_OUTPUT_MULTIPLIER: REASONING_OUTPUT_MULTIPLIER,
    tierFor: tierFor, isReasoning: isReasoning, tokensFromChars: tokensFromChars,
    assessTurn: assessTurn, freshChatSaving: freshChatSaving, tipForTurn: tipForTurn,
    emptyTotals: emptyTotals, addTotals: addTotals, band: band, insights: insights,
    equivalents: equivalents, localDate: localDate, addDays: addDays
  };
});
