// Turn chat-app data exports into ledger events (one per day × model).
//   ChatGPT:   Settings → Data controls → Export → conversations.json
//   Claude.ai: Settings → Privacy → Export data → conversations.json
// Tokens are estimated per script (see tokens.js). Each assistant reply is charged
// the whole conversation so far as input, because chat apps resend it every turn;
// a reply within 5 minutes of the previous one reads that earlier part from the
// provider's prompt cache (counted as cacheReadTokens).

const { dateInTz } = require('./dates');
const { estimate } = require('./tokens');

const MAX_CONTEXT_TOKENS = 128000;
const CACHE_TTL_MS = 5 * 60 * 1000;

function partsText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content.parts)) return content.parts.filter(p => typeof p === 'string').join('\n');
  if (typeof content.text === 'string') return content.text;
  return '';
}

function detectFormat(data) {
  if (!Array.isArray(data) || !data.length) return null;
  if (data[0].mapping) return 'chatgpt';
  if (data[0].chat_messages) return 'claude';
  return null;
}

// One reply. ctx tracks the conversation: { tokens, lastAt, lastTotal }.
function addTurn(groups, ctx, { platform, provider, model, date, at, outputTokens }) {
  const key = `${date}|${model}`;
  let g = groups.get(key);
  if (!g) {
    g = { date, model, platform, provider, requests: 0, inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 };
    groups.set(key, g);
  }
  const input = Math.min(MAX_CONTEXT_TOKENS, ctx.tokens);
  const cached = ctx.lastAt != null && at - ctx.lastAt <= CACHE_TTL_MS ? Math.min(input, ctx.lastTotal) : 0;
  g.requests += 1;
  g.inputTokens += input - cached;
  g.cacheReadTokens += cached;
  g.outputTokens += outputTokens;
  ctx.lastAt = at;
  ctx.lastTotal = input + outputTokens;
}

function importChatGPT(conversations, { timezone, defaultModel = 'gpt-4o' }) {
  const groups = new Map();
  for (const conv of conversations) {
    const messages = Object.values(conv.mapping || {})
      .map(n => n && n.message)
      .filter(m => m && m.create_time)
      .sort((a, b) => a.create_time - b.create_time);
    const ctx = { tokens: 0, lastAt: null, lastTotal: 0 };
    for (const m of messages) {
      const tokens = estimate(partsText(m.content));
      const role = m.author && m.author.role;
      if (role === 'assistant' && tokens > 0) {
        addTurn(groups, ctx, {
          platform: 'chatgpt', provider: 'openai',
          model: (m.metadata && m.metadata.model_slug) || defaultModel,
          date: dateInTz(m.create_time * 1000, timezone),
          at: m.create_time * 1000,
          outputTokens: tokens
        });
      }
      if (role !== 'system') ctx.tokens += tokens;
    }
  }
  return toEvents(groups, 'chatgpt');
}

function importClaudeAi(conversations, { timezone, defaultModel = 'claude-sonnet-4-5' }) {
  const groups = new Map();
  for (const conv of conversations) {
    const messages = (conv.chat_messages || [])
      .filter(m => m && m.created_at)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const ctx = { tokens: 0, lastAt: null, lastTotal: 0 };
    for (const m of messages) {
      const text = m.text || (Array.isArray(m.content) ? m.content.map(partsText).join('\n') : '');
      const tokens = estimate(text);
      if (m.sender === 'assistant' && tokens > 0) {
        addTurn(groups, ctx, {
          platform: 'claude.ai', provider: 'anthropic',
          model: conv.model || defaultModel,
          date: dateInTz(Date.parse(m.created_at), timezone),
          at: Date.parse(m.created_at),
          outputTokens: tokens
        });
      }
      ctx.tokens += tokens;
    }
  }
  return toEvents(groups, 'claude.ai');
}

function toEvents(groups, platform) {
  return [...groups.values()].map(g => ({
    id: `import:${platform}:${g.date}:${g.model}`,
    date: g.date,
    platform: g.platform,
    provider: g.provider,
    model: g.model,
    billing: 'subscription',
    requests: g.requests,
    inputTokens: g.inputTokens,
    cacheReadTokens: g.cacheReadTokens,
    outputTokens: g.outputTokens,
    source: `import:${platform}`
  }));
}

function importExport(data, opts) {
  const format = detectFormat(data);
  if (format === 'chatgpt') return { format, events: importChatGPT(data, opts) };
  if (format === 'claude') return { format, events: importClaudeAi(data, opts) };
  throw new Error('Unrecognised export: expected ChatGPT or Claude.ai conversations.json');
}

module.exports = { importExport, importChatGPT, importClaudeAi, detectFormat };
