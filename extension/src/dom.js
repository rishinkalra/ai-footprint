// The one place extension pages and the badge put markup into the DOM.
// Callers build markup from fixed strings and values escaped with esc(); this
// parses it inert (no scripts run) and swaps it in.
(function (root) {
  'use strict';
  function set(el, html) {
    var doc = new DOMParser().parseFromString('<template>' + String(html) + '</template>', 'text/html');
    var tpl = doc.querySelector('template');
    el.replaceChildren(document.importNode(tpl.content, true));
  }
  root.FootprintDOM = { set: set };
})(typeof self !== 'undefined' ? self : this);
