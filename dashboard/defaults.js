// Default assumptions for the AI footprint widget.
// Everything here can be overridden in <data dir>/ai-footprint/config.json
// (deep-merged over these defaults). See METHODOLOGY.md for sources.

module.exports = {
  // Days are counted in this time zone. Defaults to the server's own zone.
  timezone: process.env.AI_FOOTPRINT_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  refreshMinutes: 15,

  currency: {
    // Optional second display currency, e.g. { code: 'INR', symbol: '₹', perUsd: 88 }.
    // perUsd 0 hides it.
    secondary: { code: 'EUR', symbol: '€', perUsd: 0 }
  },

  // ---------------------------------------------------------------------------
  // Energy model
  // Wh per 1,000 tokens, measured at the data-centre meter (PUE included).
  // Calibrated so a mid-size model answering a typical chat turn
  // (~1k tokens in, ~500 out) lands at ~0.3 Wh, matching published figures:
  //   Google, Aug 2025: median Gemini Apps text prompt = 0.24 Wh, 0.03 gCO2e, 0.26 mL water
  //   OpenAI (Altman), Jun 2025: average ChatGPT query ≈ 0.34 Wh
  //   Epoch AI, Feb 2025: typical GPT-4o query ≈ 0.3 Wh
  // Larger tiers scale with active parameters (Jegham et al. 2025, "How Hungry is AI?").
  // ---------------------------------------------------------------------------
  energy: {
    tiers: {
      small:  { inputWhPer1k: 0.01, outputWhPer1k: 0.10 },
      medium: { inputWhPer1k: 0.05, outputWhPer1k: 0.50 },
      large:  { inputWhPer1k: 0.12, outputWhPer1k: 1.50 },
      xlarge: { inputWhPer1k: 0.25, outputWhPer1k: 3.00 }
    },
    // Cache reads skip most of the prefill compute; cache writes cost a normal prefill.
    cacheReadFactor: 0.1,
    cacheWriteFactor: 1.0,
    // Nobody publishes per-token energy for closed models, so show a range.
    uncertainty: { low: 0.4, high: 3.0 },
    defaultTier: 'medium'
  },

  // Grid carbon intensity (kg CO2e per kWh) and on-site cooling water (L per kWh).
  // 0.384 kg/kWh is Ember's 2025 lifecycle intensity for the US grid, where most
  // large AI inference runs (world average 0.458). Override per provider if you
  // trust their market-based numbers, e.g. byProvider: { google: 0.125 }.
  carbon: {
    defaultKgPerKwh: 0.384,
    byProvider: {}
  },
  water: {
    // Google's 0.26 mL per 0.24 Wh prompt ≈ 1.1 L/kWh (on-site cooling only).
    defaultLitresPerKwh: 1.1,
    byProvider: {}
  },

  equivalents: {
    phoneChargeKwh: 0.015,
    ledBulbKw: 0.010,
    carKgCo2PerKm: 0.17,
    glassOfWaterL: 0.25
  },

  // ---------------------------------------------------------------------------
  // List prices, USD per million tokens. When not given: cacheRead = 0.1 × input,
  // cacheWrite (5-minute cache) = 1.25 × input, cacheWrite1h (1-hour cache) = 2 × input. Longest matching prefix wins.
  // Claude prices: Anthropic API table, Oct 2026. Others: verify before relying on them.
  // ---------------------------------------------------------------------------
  pricing: {
    // Anthropic
    'claude-fable-5-1':   { input: 10, output: 50, cacheRead: 0.25, tier: 'xlarge' },
    'claude-mythos-5-1':  { input: 10, output: 50, cacheRead: 0.25, tier: 'xlarge' },
    'claude-fable-5':     { input: 10, output: 50, tier: 'xlarge' },
    'claude-mythos':      { input: 10, output: 50, tier: 'xlarge' },
    'claude-opus-5-5':    { input: 4, output: 20, cacheRead: 0.20, tier: 'large' },
    'claude-opus-5':      { input: 5, output: 25, tier: 'large' },
    'claude-opus-4-8':    { input: 5, output: 25, tier: 'large' },
    'claude-opus-4-7':    { input: 5, output: 25, tier: 'large' },
    'claude-opus-4-6':    { input: 5, output: 25, tier: 'large' },
    'claude-opus-4-5':    { input: 5, output: 25, tier: 'large' },
    'claude-opus-4-1':    { input: 15, output: 75, tier: 'large' },
    'claude-opus-4':      { input: 15, output: 75, tier: 'large' },
    'claude-3-opus':      { input: 15, output: 75, tier: 'large' },
    'claude-sonnet-5-5':  { input: 2, output: 10, cacheRead: 0.20, tier: 'medium' },
    'claude-sonnet-5':    { input: 2, output: 10, cacheRead: 0.20, tier: 'medium' },
    'claude-sonnet-4':    { input: 3, output: 15, tier: 'medium' },
    'claude-3-7-sonnet':  { input: 3, output: 15, tier: 'medium' },
    'claude-3-5-sonnet':  { input: 3, output: 15, tier: 'medium' },
    'claude-sonnet':      { input: 3, output: 15, tier: 'medium' },
    'claude-haiku-5-5':   { input: 0.10, output: 0.50, cacheRead: 0.01, tier: 'small' },
    'claude-haiku-4-5':   { input: 1, output: 5, tier: 'small' },
    'claude-3-5-haiku':   { input: 0.80, output: 4, tier: 'small' },
    'claude-3-haiku':     { input: 0.25, output: 1.25, tier: 'small' },
    // OpenAI (verify)
    'gpt-5-nano':         { input: 0.05, output: 0.40, cacheRead: 0.005, tier: 'small' },
    'gpt-5-mini':         { input: 0.25, output: 2, cacheRead: 0.025, tier: 'small' },
    'gpt-5':              { input: 1.25, output: 10, cacheRead: 0.125, tier: 'medium' },
    'gpt-4.5':            { input: 75, output: 150, tier: 'xlarge' },
    'gpt-4.1-nano':       { input: 0.10, output: 0.40, cacheRead: 0.025, tier: 'small' },
    'gpt-4.1-mini':       { input: 0.40, output: 1.60, cacheRead: 0.10, tier: 'small' },
    'gpt-4.1':            { input: 2, output: 8, cacheRead: 0.50, tier: 'medium' },
    'gpt-4o-mini':        { input: 0.15, output: 0.60, cacheRead: 0.075, tier: 'small' },
    'gpt-4o':             { input: 2.50, output: 10, cacheRead: 1.25, tier: 'medium' },
    'o4-mini':            { input: 1.10, output: 4.40, cacheRead: 0.275, tier: 'small' },
    'o3-mini':            { input: 1.10, output: 4.40, cacheRead: 0.55, tier: 'small' },
    'o3':                 { input: 2, output: 8, cacheRead: 0.50, tier: 'medium' },
    'o1':                 { input: 15, output: 60, cacheRead: 7.5, tier: 'large' },
    'codex-mini':         { input: 1.50, output: 6, cacheRead: 0.375, tier: 'small' },
    // Google (verify; ≤200k-token prompt prices)
    'gemini-3-pro':       { input: 2, output: 12, cacheRead: 0.20, tier: 'medium' },
    'gemini-2.5-pro':     { input: 1.25, output: 10, cacheRead: 0.31, tier: 'medium' },
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40, cacheRead: 0.025, tier: 'small' },
    'gemini-2.5-flash':   { input: 0.30, output: 2.50, cacheRead: 0.075, tier: 'small' },
    'gemini-2.0-flash':   { input: 0.10, output: 0.40, cacheRead: 0.025, tier: 'small' },
    // Others (verify)
    'deepseek-chat':      { input: 0.27, output: 1.10, cacheRead: 0.07, tier: 'medium' },
    'deepseek-reasoner':  { input: 0.55, output: 2.19, cacheRead: 0.14, tier: 'medium' },
    'mistral-large':      { input: 2, output: 6, tier: 'medium' },
    'mistral-small':      { input: 0.20, output: 0.60, tier: 'small' }
  },

  // Used when a model has no price entry: price and energy come from its tier.
  tierFallbackPricing: {
    small:  { input: 0.50, output: 2 },
    medium: { input: 3, output: 15 },
    large:  { input: 5, output: 25 },
    xlarge: { input: 10, output: 50 }
  },

  // Regexes tried in order when a model has no price entry.
  tierRules: [
    { pattern: 'fable|mythos|gpt-4\\.5|o1-pro|o3-pro', tier: 'xlarge' },
    { pattern: 'opus|ultra|-405b|grok-4(?!.*mini)', tier: 'large' },
    { pattern: 'haiku|mini|nano|flash|lite|small|-8b|-7b|-3b|gemma', tier: 'small' }
  ],

  // Flat-fee plans (ChatGPT Plus, Claude Max, Gemini Advanced, Cursor...).
  // Pro-rated per day into "spend". Example:
  //   { "name": "Claude Max", "platform": "claude-code", "monthlyUsd": 100, "since": "2026-01-01" }
  subscriptions: [],

  // A chat logged as a prompt count (no tokens) is estimated with these.
  chatDefaults: { inputTokens: 1000, outputTokens: 500 },

  sources: {
    claudeCode: { enabled: true, paths: ['~/.claude/projects', '~/.config/claude/projects'], billing: 'subscription' },
    openclaw:   { enabled: true, paths: ['~/.openclaw/agents'], billing: 'api' },
    codex:      { enabled: true, paths: ['~/.codex/sessions'], billing: 'subscription' },
    // Provider reports turn on when their key is in the environment.
    anthropicAdmin: { keyEnv: 'ANTHROPIC_ADMIN_KEY', days: 90 },
    openaiAdmin:    { keyEnv: 'OPENAI_ADMIN_KEY', days: 90 },
    openrouter:     { keyEnv: 'OPENROUTER_PROVISIONING_KEY' }
  },

  // When a provider's own usage report is available, drop API-billed local log
  // records for that provider so the same tokens aren't counted twice.
  preferProviderReports: true
};
