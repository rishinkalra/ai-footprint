// How to find prompts and replies on each AI chat site. Selectors are
// best-effort: sites change their markup, so each adapter lists several
// candidates and the content script falls back gracefully.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootprintSites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITES = [
    {
      id: 'chatgpt', name: 'ChatGPT', provider: 'openai',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      assistant: ['[data-message-author-role="assistant"]'],
      user: ['[data-message-author-role="user"]'],
      // ChatGPT tags each reply with the model that wrote it.
      modelOf: function (el) {
        var tagged = el.closest('[data-message-model-slug]') || el.querySelector('[data-message-model-slug]');
        return (tagged || el).getAttribute('data-message-model-slug');
      },
      defaultModel: 'gpt-5'
    },
    {
      id: 'claude', name: 'Claude', provider: 'anthropic',
      hosts: ['claude.ai'],
      assistant: ['[data-is-streaming]', '.font-claude-response', '.font-claude-message'],
      user: ['[data-testid="user-message"]'],
      defaultModel: 'claude-sonnet'
    },
    {
      id: 'gemini', name: 'Gemini', provider: 'google',
      hosts: ['gemini.google.com'],
      assistant: ['model-response', '.model-response-text'],
      user: ['user-query', '.query-text'],
      defaultModel: 'gemini-flash'
    },
    {
      id: 'perplexity', name: 'Perplexity', provider: 'perplexity',
      hosts: ['www.perplexity.ai', 'perplexity.ai'],
      assistant: ['[id^="markdown-content"]', '.prose'],
      user: ['[class*="group/query"]', 'h1.group\\/query'],
      defaultModel: 'sonar'
    },
    {
      id: 'copilot', name: 'Microsoft Copilot', provider: 'microsoft',
      hosts: ['copilot.microsoft.com'],
      assistant: ['[data-content="ai-message"]', '[class*="ai-message"]'],
      user: ['[data-content="user-message"]', '[class*="user-message"]'],
      defaultModel: 'gpt-4o'
    },
    {
      id: 'deepseek', name: 'DeepSeek', provider: 'deepseek',
      hosts: ['chat.deepseek.com'],
      assistant: ['.ds-markdown'],
      user: ['.ds-message--user'],
      defaultModel: 'deepseek-chat'
    },
    {
      id: 'mistral', name: 'Le Chat', provider: 'mistral',
      hosts: ['chat.mistral.ai'],
      assistant: ['[data-message-author-role="assistant"]', '[class*="assistant"]'],
      user: ['[data-message-author-role="user"]'],
      defaultModel: 'mistral-medium'
    },
    {
      id: 'grok', name: 'Grok', provider: 'xai',
      hosts: ['grok.com'],
      assistant: ['[class*="message-bubble"]:not([class*="user"])'],
      user: ['[class*="message-bubble"][class*="user"]'],
      defaultModel: 'grok'
    }
  ];

  function siteForHost(host) {
    var h = String(host || '').toLowerCase();
    for (var i = 0; i < SITES.length; i++) {
      if (SITES[i].hosts.indexOf(h) !== -1) return SITES[i];
    }
    return null;
  }

  function allHosts() {
    var out = [];
    SITES.forEach(function (s) { s.hosts.forEach(function (h) { out.push(h); }); });
    return out;
  }

  // Match patterns for site access. Chrome grants these at install; Firefox may
  // ask the user to allow them separately.
  function origins() {
    return allHosts().map(function (h) { return 'https://' + h + '/*'; });
  }

  return { SITES: SITES, siteForHost: siteForHost, allHosts: allHosts, origins: origins };
});
