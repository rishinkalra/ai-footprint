// Pure functions: turn normalized usage records into money, energy, carbon and water.
//
// A usage record is one day × platform × model aggregate:
// {
//   date: 'YYYY-MM-DD', platform: 'claude-code', provider: 'anthropic',
//   model: 'claude-opus-4-5', billing: 'api' | 'subscription',
//   requests, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
//   cacheWrite1hTokens (the part of cacheWriteTokens written to a 1-hour cache),
//   reportedCostUsd: number | null, source: 'local:claude-code'
// }
// inputTokens never include cache reads or cache writes.

const defaults = require('./defaults');

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

function buildConfig(override) {
  return deepMerge(defaults, override || {});
}

function normalizeModelId(model) {
  if (!model) return 'unknown';
  let id = String(model).toLowerCase().trim();
  id = id.replace(/^(models\/|us\.|eu\.|apac\.|global\.)/, '');
  if (id.includes('/')) id = id.split('/').pop();      // openrouter "anthropic/claude-..."
  id = id.replace(/^anthropic\./, '');                  // bedrock
  id = id.replace(/[@:].*$/, '');                       // vertex "@20250929", bedrock ":0"
  id = id.replace(/-v\d+$/, '');
  id = id.replace(/-(20\d{6}|\d{4}-\d{2}-\d{2})$/, '');  // date snapshots
  id = id.replace(/\[.*\]$/, '');                       // "claude-opus-4-6[1m]"
  return id;
}

function inferProvider(model) {
  const id = String(model || '').toLowerCase();
  if (id.includes('/')) {
    const prefix = id.split('/')[0];
    if (['anthropic', 'openai', 'google', 'mistralai', 'deepseek', 'x-ai', 'meta-llama'].includes(prefix)) {
      return prefix === 'mistralai' ? 'mistral' : prefix === 'x-ai' ? 'xai' : prefix === 'meta-llama' ? 'meta' : prefix;
    }
  }
  if (id.includes('claude')) return 'anthropic';
  if (/(^|[^a-z])(gpt|o\d|codex|chatgpt)/.test(id)) return 'openai';
  if (id.includes('gemini') || id.includes('gemma')) return 'google';
  if (id.includes('mistral') || id.includes('codestral')) return 'mistral';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('grok')) return 'xai';
  if (id.includes('llama')) return 'meta';
  return 'other';
}

function resolveModel(model, cfg) {
  const id = normalizeModelId(model);
  let bestKey = null;
  for (const key of Object.keys(cfg.pricing)) {
    if (id.startsWith(key) && (!bestKey || key.length > bestKey.length)) bestKey = key;
  }
  if (bestKey) {
    const p = cfg.pricing[bestKey];
    return { id, priceKey: bestKey, tier: p.tier || cfg.energy.defaultTier, price: completePrice(p), priceEstimated: false };
  }
  let tier = cfg.energy.defaultTier;
  for (const rule of cfg.tierRules) {
    if (new RegExp(rule.pattern).test(id)) { tier = rule.tier; break; }
  }
  const fallback = cfg.tierFallbackPricing[tier] || cfg.tierFallbackPricing.medium;
  return { id, priceKey: null, tier, price: completePrice(fallback), priceEstimated: true };
}

function completePrice(p) {
  return {
    input: p.input,
    output: p.output,
    cacheRead: p.cacheRead != null ? p.cacheRead : p.input * 0.1,
    cacheWrite: p.cacheWrite != null ? p.cacheWrite : p.input * 1.25,
    cacheWrite1h: p.cacheWrite1h != null ? p.cacheWrite1h : p.input * 2
  };
}

function listPriceUsd(record, resolved) {
  const p = resolved.price;
  return (
    (record.inputTokens || 0) * p.input +
    (record.outputTokens || 0) * p.output +
    (record.cacheReadTokens || 0) * p.cacheRead +
    Math.max(0, (record.cacheWriteTokens || 0) - (record.cacheWrite1hTokens || 0)) * p.cacheWrite +
    (record.cacheWrite1hTokens || 0) * p.cacheWrite1h
  ) / 1e6;
}

// Central estimate in kWh.
function energyKwh(record, resolved, cfg) {
  const tier = cfg.energy.tiers[resolved.tier] || cfg.energy.tiers[cfg.energy.defaultTier];
  const effectiveInput =
    (record.inputTokens || 0) +
    (record.cacheReadTokens || 0) * cfg.energy.cacheReadFactor +
    (record.cacheWriteTokens || 0) * cfg.energy.cacheWriteFactor;
  const wh = (effectiveInput / 1000) * tier.inputWhPer1k + ((record.outputTokens || 0) / 1000) * tier.outputWhPer1k;
  return wh / 1000;
}

function band(mid, cfg) {
  return { low: mid * cfg.energy.uncertainty.low, mid, high: mid * cfg.energy.uncertainty.high };
}

function scaleBand(b, factor) {
  return { low: b.low * factor, mid: b.mid * factor, high: b.high * factor };
}

function addBand(a, b) {
  return { low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high };
}

const ZERO_BAND = Object.freeze({ low: 0, mid: 0, high: 0 });

// Annotate a record with money and environmental estimates.
function assess(record, cfg) {
  const resolved = resolveModel(record.model, cfg);
  const listUsd = listPriceUsd(record, resolved);
  const valueUsd = record.reportedCostUsd != null ? record.reportedCostUsd : listUsd;
  const energy = band(energyKwh(record, resolved, cfg), cfg);
  const provider = record.provider || inferProvider(record.model);
  const kgPerKwh = cfg.carbon.byProvider[provider] != null ? cfg.carbon.byProvider[provider] : cfg.carbon.defaultKgPerKwh;
  const lPerKwh = cfg.water.byProvider[provider] != null ? cfg.water.byProvider[provider] : cfg.water.defaultLitresPerKwh;
  return {
    ...record,
    provider,
    tier: resolved.tier,
    priceEstimated: record.reportedCostUsd == null && resolved.priceEstimated,
    apiEquivalentUsd: valueUsd,
    spendUsd: record.billing === 'subscription' ? 0 : valueUsd,
    energyKwh: energy,
    co2Kg: scaleBand(energy, kgPerKwh),
    waterL: scaleBand(energy, lPerKwh)
  };
}

function subscriptionUsdForDay(sub, date) {
  if (sub.since && date < sub.since) return 0;
  if (sub.until && date > sub.until) return 0;
  return (sub.monthlyUsd || 0) * 12 / 365;
}

module.exports = {
  buildConfig,
  deepMerge,
  normalizeModelId,
  inferProvider,
  resolveModel,
  listPriceUsd,
  energyKwh,
  assess,
  addBand,
  scaleBand,
  subscriptionUsdForDay,
  ZERO_BAND
};
