// Token estimate for text of any script. Kept identical to extension/src/tokens.js (a test checks). Tokenizers are trained mostly on English,
// so other scripts use more tokens per character. Ratios are approximate (±30%),
// based on studies of modern tokenizers (e.g. Petrov et al. 2023, "Language Model
// Tokenizers Introduce Unfairness Between Languages").
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootprintTokens = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CHARS_PER_TOKEN = {
    latin: 4.0,     // Latin script, digits, punctuation, spaces
    cyrillic: 3.0,  // Cyrillic, Greek, Armenian, Georgian
    other: 2.5,     // Arabic, Hebrew, Devanagari and other Indic, Thai, emoji…
    cjk: 1.3        // Chinese, Japanese, Korean
  };

  function scriptOf(c) {
    if (c < 0x0250 || (c >= 0x1E00 && c < 0x1F00) || (c >= 0x2000 && c < 0x2070)) return 'latin';
    if ((c >= 0x0370 && c < 0x0530) || (c >= 0x10A0 && c < 0x1100)) return 'cyrillic';
    if ((c >= 0x1100 && c < 0x1200) || (c >= 0x2E80 && c < 0xA000) || (c >= 0xAC00 && c < 0xD7B0) ||
        (c >= 0xF900 && c < 0xFB00) || (c >= 0xFF00 && c < 0xFFF0) || (c >= 0x20000 && c < 0x30000)) return 'cjk';
    return 'other';
  }

  function count(text) {
    var n = { latin: 0, cyrillic: 0, other: 0, cjk: 0 };
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.codePointAt(i);
      if (c > 0xFFFF) i++;        // skip the low surrogate
      n[scriptOf(c)]++;
    }
    return n;
  }

  function estimate(text) {
    var n = count(text);
    return Math.round(n.latin / CHARS_PER_TOKEN.latin + n.cyrillic / CHARS_PER_TOKEN.cyrillic +
      n.other / CHARS_PER_TOKEN.other + n.cjk / CHARS_PER_TOKEN.cjk);
  }

  return { estimate: estimate, count: count, CHARS_PER_TOKEN: CHARS_PER_TOKEN };
});
