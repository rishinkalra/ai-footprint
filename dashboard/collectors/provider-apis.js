// Organisation-level usage reports from the providers themselves. These are the
// billing source of truth for API keys, wherever the calls came from.
//   Anthropic   GET /v1/organizations/usage_report/messages   (Admin key, sk-ant-admin...)
//   OpenAI      GET /v1/organization/usage/completions         (Admin key)
//   OpenRouter  GET /api/v1/activity                           (provisioning key)

function startOfUtcDay(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 864e5);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function getJson(fetchImpl, url, headers, label) {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`${label} HTTP ${res.status} ${detail}`.trim());
  }
  return res.json();
}

async function fetchAnthropicUsage({ key, days = 90, fetchImpl = fetch }) {
  const records = [];
  let page = null;
  let guard = 0;
  do {
    const params = new URLSearchParams({
      starting_at: startOfUtcDay(days).toISOString(),
      bucket_width: '1d',
      limit: '31'
    });
    params.append('group_by[]', 'model');
    if (page) params.set('page', page);
    const body = await getJson(
      fetchImpl,
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      'Anthropic usage report'
    );
    for (const bucket of body.data || []) {
      const date = String(bucket.starting_at).slice(0, 10);
      for (const r of bucket.results || []) {
        const cc = r.cache_creation || {};
        records.push({
          date, platform: 'anthropic-api', provider: 'anthropic', account: 'anthropic',
          model: r.model || 'unknown', billing: 'api', requests: 0,
          inputTokens: r.uncached_input_tokens || 0,
          outputTokens: r.output_tokens || 0,
          cacheReadTokens: r.cache_read_input_tokens || 0,
          cacheWriteTokens: (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0),
          cacheWrite1hTokens: cc.ephemeral_1h_input_tokens || 0,
          reportedCostUsd: null, source: 'api:anthropic'
        });
      }
    }
    page = body.has_more ? body.next_page : null;
  } while (page && ++guard < 50);
  return records;
}

async function fetchOpenAIUsage({ key, days = 90, fetchImpl = fetch }) {
  const records = [];
  let page = null;
  let guard = 0;
  do {
    const params = new URLSearchParams({
      start_time: String(Math.floor(startOfUtcDay(days).getTime() / 1000)),
      bucket_width: '1d',
      group_by: 'model',
      limit: '31'
    });
    if (page) params.set('page', page);
    const body = await getJson(
      fetchImpl,
      `https://api.openai.com/v1/organization/usage/completions?${params}`,
      { Authorization: `Bearer ${key}` },
      'OpenAI usage report'
    );
    for (const bucket of body.data || []) {
      const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
      for (const r of bucket.results || []) {
        const cached = r.input_cached_tokens || 0;
        records.push({
          date, platform: 'openai-api', provider: 'openai', account: 'openai',
          model: r.model || 'unknown', billing: 'api', requests: r.num_model_requests || 0,
          inputTokens: Math.max(0, (r.input_tokens || 0) - cached),
          outputTokens: r.output_tokens || 0,
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
          reportedCostUsd: null, source: 'api:openai'
        });
      }
    }
    page = body.has_more ? body.next_page : null;
  } while (page && ++guard < 50);
  return records;
}

async function fetchOpenRouterActivity({ key, fetchImpl = fetch, inferProvider }) {
  const body = await getJson(
    fetchImpl,
    'https://openrouter.ai/api/v1/activity',
    { Authorization: `Bearer ${key}` },
    'OpenRouter activity'
  );
  return (body.data || []).map(r => ({
    date: String(r.date).slice(0, 10),
    platform: 'openrouter', provider: inferProvider(r.model), account: 'openrouter',
    model: r.model || 'unknown', billing: 'api', requests: r.requests || 0,
    inputTokens: r.prompt_tokens || 0,
    outputTokens: r.completion_tokens || 0,
    cacheReadTokens: 0, cacheWriteTokens: 0,
    reportedCostUsd: typeof r.usage === 'number' ? r.usage : null,
    source: 'api:openrouter'
  }));
}

module.exports = { fetchAnthropicUsage, fetchOpenAIUsage, fetchOpenRouterActivity };
