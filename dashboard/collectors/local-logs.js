// Reads usage straight from the transcripts AI tools already write to disk:
//   Claude Code  ~/.claude/projects/**/*.jsonl
//   OpenClaw     ~/.openclaw/agents/*/sessions/*.jsonl
//   Codex CLI    ~/.codex/sessions/**/rollout-*.jsonl
// Parsed results are cached per file (mtime + size), so only changed files are re-read.

const fs = require('fs');
const path = require('path');
const { inferProvider } = require('../estimate');
const { dateInTz } = require('../dates');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseTs(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  return Date.parse(v);
}

function eachJsonLine(text, fn) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line[0] !== '{') continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    fn(obj, i);
  }
}

// Entry tuple: { key, ts, model, provider, input, output, cacheRead, cacheWrite, cost }

function parseClaudeCode(text, file) {
  const byKey = new Map();
  eachJsonLine(text, (obj, i) => {
    if (obj.type !== 'assistant') return;
    const m = obj.message;
    if (!m || !m.usage || !m.model || m.model === '<synthetic>') return;
    const u = m.usage;
    // Claude Code writes one line per content block, all carrying the same message id
    // and usage. Key on message + request so each API response counts once.
    const key = m.id ? `${m.id}:${obj.requestId || ''}` : `${file}:${i}`;
    const entry = {
      key,
      ts: parseTs(obj.timestamp),
      model: m.model,
      provider: 'anthropic',
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
      cost: typeof obj.costUSD === 'number' ? obj.costUSD : null
    };
    const prev = byKey.get(key);
    if (!prev || entry.output >= prev.output) byKey.set(key, entry);
  });
  return [...byKey.values()];
}

function parseOpenClaw(text, file) {
  const entries = [];
  eachJsonLine(text, (obj, i) => {
    const m = obj.message || obj;
    if (m.role !== 'assistant') return;
    const u = m.usage || obj.usage;
    if (!u) return;
    const costRaw = typeof u.cost === 'number' ? u.cost : u.cost && u.cost.total;
    const entry = {
      key: obj.id || m.id || `${file}:${i}`,
      ts: parseTs(m.timestamp != null ? m.timestamp : obj.timestamp),
      model: m.model || obj.model || 'unknown',
      provider: m.provider || obj.provider || null,
      input: num(u.input != null ? u.input : u.input_tokens != null ? u.input_tokens : u.prompt_tokens),
      output: num(u.output != null ? u.output : u.output_tokens != null ? u.output_tokens : u.completion_tokens),
      cacheRead: num(u.cacheRead != null ? u.cacheRead : u.cache_read_input_tokens),
      cacheWrite: num(u.cacheWrite != null ? u.cacheWrite : u.cache_creation_input_tokens),
      cost: typeof costRaw === 'number' && costRaw > 0 ? costRaw : null
    };
    if (!entry.provider) entry.provider = inferProvider(entry.model);
    if (entry.input + entry.output + entry.cacheRead + entry.cacheWrite > 0) entries.push(entry);
  });
  return entries;
}

function parseCodex(text, file) {
  const entries = [];
  let model = 'gpt-5-codex';
  let prevTotal = null;
  eachJsonLine(text, (obj, i) => {
    const p = obj.payload || {};
    if ((obj.type === 'turn_context' || obj.type === 'session_meta') && p.model) model = p.model;
    if (obj.type !== 'event_msg' || p.type !== 'token_count' || !p.info) return;
    // Codex repeats token_count events; only count when the running total moves.
    const total = p.info.total_token_usage && p.info.total_token_usage.total_tokens;
    if (total != null && total === prevTotal) return;
    prevTotal = total;
    const u = p.info.last_token_usage;
    if (!u) return;
    const cached = num(u.cached_input_tokens);
    entries.push({
      key: `${file}:${i}`,
      ts: parseTs(obj.timestamp),
      model,
      provider: 'openai',
      input: Math.max(0, num(u.input_tokens) - cached),
      output: num(u.output_tokens),
      cacheRead: cached,
      cacheWrite: 0,
      cost: null
    });
  });
  return entries;
}

const PARSERS = {
  claudeCode: { platform: 'claude-code', parse: parseClaudeCode },
  openclaw: { platform: 'openclaw', parse: parseOpenClaw },
  codex: { platform: 'codex-cli', parse: parseCodex }
};

function expandHome(p, homeDir) {
  return p.startsWith('~') ? path.join(homeDir, p.slice(1)) : p;
}

async function listJsonl(dir, out = []) {
  let items;
  try { items = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await listJsonl(full, out);
    else if (item.isFile() && item.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

// cache: { [file]: { mtimeMs, size, entries } } — mutated in place.
async function collectEntries(sourceId, dirs, cache) {
  const { parse } = PARSERS[sourceId];
  const files = [];
  for (const dir of dirs) await listJsonl(dir, files);
  const seen = new Set(files);
  for (const file of Object.keys(cache)) if (!seen.has(file)) delete cache[file];

  for (const file of files) {
    let stat;
    try { stat = await fs.promises.stat(file); } catch { continue; }
    const hit = cache[file];
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) continue;
    try {
      const text = await fs.promises.readFile(file, 'utf8');
      cache[file] = { mtimeMs: stat.mtimeMs, size: stat.size, entries: parse(text, file) };
    } catch {
      // Unreadable file: skip it this round.
    }
  }

  // Resumed / forked sessions copy earlier messages into new files, so dedupe across files.
  const byKey = new Map();
  for (const file of files) {
    const hit = cache[file];
    if (!hit) continue;
    for (const e of hit.entries) {
      const prev = byKey.get(e.key);
      if (!prev || e.output > prev.output) byKey.set(e.key, e);
    }
  }
  return { files: files.length, entries: [...byKey.values()] };
}

function entriesToRecords(entries, { platform, billing, source, timezone }) {
  const groups = new Map();
  for (const e of entries) {
    if (!Number.isFinite(e.ts)) continue;
    const date = dateInTz(e.ts, timezone);
    const provider = e.provider || inferProvider(e.model);
    const gk = `${date}|${e.model}|${provider}`;
    let r = groups.get(gk);
    if (!r) {
      r = {
        date, platform, provider, account: provider, model: e.model, billing,
        requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
        reportedCostUsd: null, source
      };
      groups.set(gk, r);
    }
    r.requests += 1;
    r.inputTokens += e.input;
    r.outputTokens += e.output;
    r.cacheReadTokens += e.cacheRead;
    r.cacheWriteTokens += e.cacheWrite;
    if (e.cost != null) r.reportedCostUsd = (r.reportedCostUsd || 0) + e.cost;
  }
  return [...groups.values()];
}

async function collectLocal(sourceId, sourceCfg, { homeDir, timezone, cache }) {
  const dirs = (sourceCfg.paths || []).map(p => expandHome(p, homeDir));
  const existing = dirs.filter(d => fs.existsSync(d));
  if (!existing.length) {
    return { status: 'not-found', note: `No logs at ${dirs.join(', ')}`, records: [] };
  }
  const { files, entries } = await collectEntries(sourceId, existing, cache);
  const records = entriesToRecords(entries, {
    platform: PARSERS[sourceId].platform,
    billing: sourceCfg.billing || 'api',
    source: `local:${sourceId}`,
    timezone
  });
  return { status: 'ok', note: `${files} log file${files === 1 ? '' : 's'}, ${entries.length} model call${entries.length === 1 ? '' : 's'}`, records };
}

module.exports = {
  PARSERS,
  parseClaudeCode,
  parseOpenClaw,
  parseCodex,
  entriesToRecords,
  collectLocal,
  expandHome
};
