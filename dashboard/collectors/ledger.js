// Usage that can't be read automatically: web/mobile chat apps (ChatGPT, Claude.ai,
// Gemini, Perplexity), other agents, anything that POSTs to the ingest endpoint,
// and conversation exports. Stored as { [id]: event } so re-sending an id replaces it.

const fs = require('fs');
const crypto = require('crypto');
const { inferProvider } = require('../estimate');
const { dateInTz } = require('../dates');

const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];

function loadLedger(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function saveLedger(file, ledger) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  fs.renameSync(tmp, file);
}

function cleanString(v, max = 120) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function cleanNumber(v, field) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a non-negative number`);
  return n;
}

// Validate and fill an incoming event. Throws on bad input.
function normalizeEvent(raw, cfg) {
  if (!raw || typeof raw !== 'object') throw new Error('event must be an object');
  let date = cleanString(raw.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  if (!date) {
    const ts = raw.ts != null ? Date.parse(raw.ts) : Date.now();
    if (!Number.isFinite(ts)) throw new Error('ts is not a valid timestamp');
    date = dateInTz(ts, cfg.timezone);
  }
  const model = cleanString(raw.model) || 'unknown';
  const platform = cleanString(raw.platform, 60) || 'manual';
  const requests = cleanNumber(raw.requests != null ? raw.requests : raw.prompts, 'requests');
  const tokens = {};
  for (const f of TOKEN_FIELDS) tokens[f] = cleanNumber(raw[f], f);
  const hasTokens = TOKEN_FIELDS.some(f => tokens[f] != null);
  const n = requests != null ? requests : 1;
  const costUsd = cleanNumber(raw.costUsd, 'costUsd');
  const billing = raw.billing === 'api' || raw.billing === 'subscription'
    ? raw.billing
    : costUsd != null ? 'api' : 'subscription';
  const provider = cleanString(raw.provider, 40) || inferProvider(model);

  const event = {
    date, platform, provider, account: cleanString(raw.account, 40) || provider, model, billing,
    requests: n,
    inputTokens: hasTokens ? tokens.inputTokens || 0 : n * cfg.chatDefaults.inputTokens,
    outputTokens: hasTokens ? tokens.outputTokens || 0 : n * cfg.chatDefaults.outputTokens,
    cacheReadTokens: tokens.cacheReadTokens || 0,
    cacheWriteTokens: tokens.cacheWriteTokens || 0,
    reportedCostUsd: costUsd,
    estimatedTokens: !hasTokens,
    note: cleanString(raw.note, 200),
    source: cleanString(raw.source, 60) || 'ledger'
  };
  event.id = cleanString(raw.id, 200) ||
    crypto.createHash('sha1').update(JSON.stringify({ ...event, at: Date.now(), r: Math.random() })).digest('hex');
  return event;
}

function upsertEvents(file, events) {
  const ledger = loadLedger(file);
  for (const e of events) ledger[e.id] = e;
  saveLedger(file, ledger);
  return Object.keys(ledger).length;
}

function deleteEvent(file, id) {
  const ledger = loadLedger(file);
  if (!ledger[id]) return false;
  delete ledger[id];
  saveLedger(file, ledger);
  return true;
}

function ledgerRecords(file) {
  return Object.values(loadLedger(file));
}

module.exports = { normalizeEvent, upsertEvents, deleteEvent, ledgerRecords, loadLedger };
