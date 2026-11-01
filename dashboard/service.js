// Collects usage from every configured source and summarises it for the widget.

const fs = require('fs');
const os = require('os');
const path = require('path');
const est = require('./estimate');
const { dateInTz, addDays, daysBetween } = require('./dates');
const { collectLocal } = require('./collectors/local-logs');
const providers = require('./collectors/provider-apis');
const ledger = require('./collectors/ledger');

const LOCAL_SOURCES = [
  { id: 'claudeCode', label: 'Claude Code logs' },
  { id: 'openclaw', label: 'OpenClaw logs' },
  { id: 'codex', label: 'Codex CLI logs' }
];

const REMOTE_SOURCES = [
  { id: 'anthropicAdmin', label: 'Anthropic usage report', account: 'anthropic', fetch: providers.fetchAnthropicUsage },
  { id: 'openaiAdmin', label: 'OpenAI usage report', account: 'openai', fetch: providers.fetchOpenAIUsage },
  { id: 'openrouter', label: 'OpenRouter activity', account: 'openrouter', fetch: providers.fetchOpenRouterActivity }
];

class FootprintService {
  constructor({ dataDir, logger = console, env = process.env, fetchImpl = globalThis.fetch, homeDir } = {}) {
    this.dir = path.join(dataDir, 'ai-footprint');
    fs.mkdirSync(this.dir, { recursive: true });
    this.configFile = path.join(this.dir, 'config.json');
    this.ledgerFile = path.join(this.dir, 'ledger.json');
    this.cacheFile = path.join(this.dir, 'log-cache.json');
    this.logger = logger;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.homeDir = homeDir || env.AI_FOOTPRINT_HOME || os.homedir();
    this.logCache = this.readJson(this.cacheFile, {});
    this.last = null;
    this.inflight = null;
  }

  readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
  }

  config() {
    return est.buildConfig(this.readJson(this.configFile, {}));
  }

  async collect({ force = false } = {}) {
    const cfg = this.config();
    if (!force && this.last && Date.now() - this.last.at < cfg.refreshMinutes * 60e3) return this.last;
    if (this.inflight) return this.inflight;
    this.inflight = this.runCollect(cfg).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async runCollect(cfg) {
    const sources = [];
    const local = [];
    const remote = [];

    for (const src of LOCAL_SOURCES) {
      const sc = cfg.sources[src.id] || {};
      if (sc.enabled === false) { sources.push({ id: src.id, label: src.label, status: 'disabled', records: 0 }); continue; }
      this.logCache[src.id] = this.logCache[src.id] || {};
      try {
        const out = await collectLocal(src.id, sc, { homeDir: this.homeDir, timezone: cfg.timezone, cache: this.logCache[src.id] });
        local.push(...out.records);
        sources.push({ id: src.id, label: src.label, status: out.status, note: out.note, records: out.records.length });
      } catch (error) {
        sources.push({ id: src.id, label: src.label, status: 'error', note: error.message, records: 0 });
      }
    }
    try { fs.writeFileSync(this.cacheFile, JSON.stringify(this.logCache)); } catch (error) {
      this.logger.error('ai-footprint: could not write log cache', { error: error.message });
    }

    const reportedAccounts = new Set();
    for (const src of REMOTE_SOURCES) {
      const sc = cfg.sources[src.id] || {};
      const key = this.env[sc.keyEnv];
      if (sc.enabled === false || !key) {
        sources.push({ id: src.id, label: src.label, status: 'disabled', note: key ? 'Disabled in config' : `Set ${sc.keyEnv} to enable`, records: 0 });
        continue;
      }
      try {
        const records = await src.fetch({ key, days: sc.days, fetchImpl: this.fetchImpl, inferProvider: est.inferProvider });
        remote.push(...records);
        if (records.length) reportedAccounts.add(src.account);
        sources.push({ id: src.id, label: src.label, status: 'ok', note: `${records.length} day×model rows`, records: records.length });
      } catch (error) {
        this.logger.error('ai-footprint: provider report failed', { source: src.id, error: error.message });
        sources.push({ id: src.id, label: src.label, status: 'error', note: error.message, records: 0 });
      }
    }

    let kept = local;
    if (cfg.preferProviderReports && reportedAccounts.size) {
      kept = local.filter(r => !(r.billing === 'api' && reportedAccounts.has(r.account)));
      const dropped = local.length - kept.length;
      if (dropped) {
        for (const s of sources) {
          if (LOCAL_SOURCES.some(l => l.id === s.id) && s.status === 'ok') {
            s.note += ' · API-billed calls counted via provider report';
          }
        }
      }
    }

    this.last = { at: Date.now(), records: [...kept, ...remote], sources };
    return this.last;
  }

  ledgerRecords() {
    return ledger.ledgerRecords(this.ledgerFile);
  }

  addEvents(rawEvents) {
    const cfg = this.config();
    const events = rawEvents.map(e => ledger.normalizeEvent(e, cfg));
    const total = ledger.upsertEvents(this.ledgerFile, events);
    return { added: events.map(e => e.id), total };
  }

  deleteEvent(id) {
    return ledger.deleteEvent(this.ledgerFile, id);
  }

  async summary({ range = '7d', from, to, force = false } = {}) {
    const cfg = this.config();
    const collected = await this.collect({ force });
    const ledgerRows = this.ledgerRecords();
    const records = [...collected.records, ...ledgerRows];
    const sources = [
      ...collected.sources,
      { id: 'ledger', label: 'Manual log & imports', status: ledgerRows.length ? 'ok' : 'empty', note: `${ledgerRows.length} entries`, records: ledgerRows.length }
    ];
    return { ...summarize(records, cfg, { range, from, to }), sources, collectedAt: new Date(collected.at).toISOString() };
  }
}

function resolveRange(records, cfg, { range = '7d', from, to }) {
  const today = dateInTz(Date.now(), cfg.timezone);
  const valid = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (valid(from) && valid(to) && from <= to) return { key: 'custom', from, to };
  const spans = { today: 0, '7d': 6, '30d': 29, '90d': 89 };
  if (range in spans) return { key: range, from: addDays(today, -spans[range]), to: today };
  if (range === 'mtd') return { key: range, from: `${today.slice(0, 8)}01`, to: today };
  if (range === 'all') {
    const earliest = records.reduce((min, r) => (r.date < min ? r.date : min), today);
    return { key: range, from: earliest, to: today };
  }
  return { key: '7d', from: addDays(today, -6), to: today };
}

function emptyBucket() {
  return {
    spendUsd: 0, apiSpendUsd: 0, subscriptionUsd: 0, apiEquivalentUsd: 0,
    energyKwh: { ...est.ZERO_BAND }, co2Kg: { ...est.ZERO_BAND }, waterL: { ...est.ZERO_BAND },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    requests: 0, estimatedPrices: false, estimatedTokens: false
  };
}

function addAssessed(bucket, a) {
  bucket.spendUsd += a.spendUsd;
  bucket.apiSpendUsd += a.spendUsd;
  bucket.apiEquivalentUsd += a.apiEquivalentUsd;
  bucket.energyKwh = est.addBand(bucket.energyKwh, a.energyKwh);
  bucket.co2Kg = est.addBand(bucket.co2Kg, a.co2Kg);
  bucket.waterL = est.addBand(bucket.waterL, a.waterL);
  bucket.tokens.input += a.inputTokens || 0;
  bucket.tokens.output += a.outputTokens || 0;
  bucket.tokens.cacheRead += a.cacheReadTokens || 0;
  bucket.tokens.cacheWrite += a.cacheWriteTokens || 0;
  bucket.tokens.total = bucket.tokens.input + bucket.tokens.output + bucket.tokens.cacheRead + bucket.tokens.cacheWrite;
  bucket.requests += a.requests || 0;
  if (a.priceEstimated) bucket.estimatedPrices = true;
  if (a.estimatedTokens) bucket.estimatedTokens = true;
}

function round(v) {
  if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]));
  return v;
}

function summarize(records, cfg, rangeOpts) {
  const range = resolveRange(records, cfg, rangeOpts);
  const days = daysBetween(range.from, range.to);
  const totals = emptyBucket();
  const byPlatform = new Map();
  const byModel = new Map();
  const daily = new Map(days.map(d => [d, emptyBucket()]));
  const get = (map, key, init) => { if (!map.has(key)) map.set(key, { ...init, ...emptyBucket() }); return map.get(key); };

  for (const r of records) {
    if (r.date < range.from || r.date > range.to) continue;
    const a = est.assess(r, cfg);
    addAssessed(totals, a);
    addAssessed(get(byPlatform, a.platform, { platform: a.platform }), a);
    const mid = est.normalizeModelId(a.model);
    addAssessed(get(byModel, `${a.provider}|${mid}`, { model: mid, provider: a.provider, tier: a.tier }), a);
    if (daily.has(a.date)) addAssessed(daily.get(a.date), a);
  }

  for (const sub of cfg.subscriptions || []) {
    let subTotal = 0;
    for (const d of days) {
      const usd = est.subscriptionUsdForDay(sub, d);
      if (!usd) continue;
      subTotal += usd;
      const day = daily.get(d);
      day.spendUsd += usd;
      day.subscriptionUsd += usd;
    }
    if (!subTotal) continue;
    totals.spendUsd += subTotal;
    totals.subscriptionUsd += subTotal;
    const p = get(byPlatform, sub.platform || 'subscriptions', { platform: sub.platform || 'subscriptions' });
    p.spendUsd += subTotal;
    p.subscriptionUsd += subTotal;
  }

  const eq = cfg.equivalents;
  const sortByEnergy = (a, b) => b.energyKwh.mid - a.energyKwh.mid || b.spendUsd - a.spendUsd;
  return round({
    generatedAt: new Date().toISOString(),
    range: { ...range, days: days.length },
    currency: cfg.currency,
    totals,
    equivalents: {
      phoneCharges: totals.energyKwh.mid / eq.phoneChargeKwh,
      ledBulbHours: totals.energyKwh.mid / eq.ledBulbKw,
      carKm: totals.co2Kg.mid / eq.carKgCo2PerKm,
      glassesOfWater: totals.waterL.mid / eq.glassOfWaterL
    },
    byPlatform: [...byPlatform.values()].sort(sortByEnergy),
    byModel: [...byModel.values()].sort(sortByEnergy),
    daily: days.map(d => ({ date: d, ...daily.get(d) })),
    assumptions: {
      timezone: cfg.timezone,
      energyTiers: cfg.energy.tiers,
      cacheReadFactor: cfg.energy.cacheReadFactor,
      uncertainty: cfg.energy.uncertainty,
      carbonKgPerKwh: cfg.carbon.defaultKgPerKwh,
      waterLitresPerKwh: cfg.water.defaultLitresPerKwh,
      subscriptions: (cfg.subscriptions || []).map(s => ({ name: s.name, platform: s.platform, monthlyUsd: s.monthlyUsd }))
    }
  });
}

module.exports = { FootprintService, summarize, resolveRange };
