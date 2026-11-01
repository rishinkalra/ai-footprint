// Turn chat-app data exports into ledger events (one per day × model).
//   ChatGPT:   Settings → Data controls → Export → conversations.json
//   Claude.ai: Settings → Privacy → Export data → conversations.json
// Tokens are estimated at 4 characters per token. Each assistant reply is charged
// the whole conversation so far as input, because chat apps resend it every turn.

const { dateInTz } = require('./dates');

const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_TOKENS = 128000;

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

function addTurn(groups, { platform, provider, model, date, inputChars, outputChars }) {
  const key = `${date}|${model}`;
  let g = groups.get(key);
  if (!g) {
    g = { date, model, platform, provider, requests: 0, inputTokens: 0, outputTokens: 0 };
    groups.set(key, g);
  }
  g.requests += 1;
  g.inputTokens += Math.min(MAX_CONTEXT_TOKENS, Math.round(inputChars / CHARS_PER_TOKEN));
  g.outputTokens += Math.round(outputChars / CHARS_PER_TOKEN);
}

function importChatGPT(conversations, { timezone, defaultModel = 'gpt-4o' }) {
  const groups = new Map();
  for (const conv of conversations) {
    const messages = Object.values(conv.mapping || {})
      .map(n => n && n.message)
      .filter(m => m && m.create_time)
      .sort((a, b) => a.create_time - b.create_time);
    let contextChars = 0;
    for (const m of messages) {
      const chars = partsText(m.content).length;
      const role = m.author && m.author.role;
      if (role === 'assistant' && chars > 0) {
        addTurn(groups, {
          platform: 'chatgpt', provider: 'openai',
          model: (m.metadata && m.metadata.model_slug) || defaultModel,
          date: dateInTz(m.create_time * 1000, timezone),
          inputChars: contextChars, outputChars: chars
        });
      }
      if (role !== 'system') contextChars += chars;
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
    let contextChars = 0;
    for (const m of messages) {
      const text = m.text || (Array.isArray(m.content) ? m.content.map(partsText).join('\n') : '');
      const chars = text.length;
      if (m.sender === 'assistant' && chars > 0) {
        addTurn(groups, {
          platform: 'claude.ai', provider: 'anthropic',
          model: conv.model || defaultModel,
          date: dateInTz(Date.parse(m.created_at), timezone),
          inputChars: contextChars, outputChars: chars
        });
      }
      contextChars += chars;
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
