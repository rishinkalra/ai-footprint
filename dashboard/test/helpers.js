const fs = require('fs');
const os = require('os');
const path = require('path');

function writeLines(file, objs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, objs.map(o => JSON.stringify(o)).join('\n') + '\n');
}

// A fake home directory with one transcript per supported tool.
function makeFakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-home-'));
  const ccUsage = { input_tokens: 100, output_tokens: 1000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 2000 };
  const ccMsg = { id: 'msg_1', model: 'claude-opus-4-5-20251101', usage: ccUsage };
  writeLines(path.join(home, '.claude/projects/-Users-me-proj/s1.jsonl'), [
    { type: 'user', timestamp: '2026-10-30T09:59:00Z', message: { role: 'user', content: 'hi' } },
    // Same response written twice (one line per content block): must count once.
    { type: 'assistant', timestamp: '2026-10-30T10:00:00Z', requestId: 'req_1', message: { ...ccMsg, content: [{ type: 'thinking' }] } },
    { type: 'assistant', timestamp: '2026-10-30T10:00:01Z', requestId: 'req_1', message: { ...ccMsg, content: [{ type: 'text' }] } },
    { type: 'assistant', timestamp: '2026-10-30T10:05:00Z', requestId: 'req_2',
      message: { id: 'msg_2', model: 'claude-haiku-4-5', usage: { input_tokens: 500, output_tokens: 200 } } },
    { type: 'assistant', timestamp: '2026-10-30T10:06:00Z', message: { id: 'x', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } },
    'not json'
  ]);
  // A resumed session that copies msg_1 again must not double count.
  writeLines(path.join(home, '.claude/projects/-Users-me-proj/s2.jsonl'), [
    { type: 'assistant', timestamp: '2026-10-30T10:00:01Z', requestId: 'req_1', message: { ...ccMsg, content: [{ type: 'text' }] } }
  ]);
  writeLines(path.join(home, '.openclaw/agents/main/sessions/abc.jsonl'), [
    { type: 'session', id: 's' },
    { type: 'message', id: 'm1', timestamp: '2026-10-31T04:00:00Z',
      message: { role: 'assistant', provider: 'anthropic', model: 'claude-sonnet-4-5', timestamp: 1793419200000,
        usage: { input: 2000, output: 400, cacheRead: 10000, cacheWrite: 0, cost: { total: 0.0123 } } } },
    { type: 'message', id: 'm2', message: { role: 'user', content: 'x' } }
  ]);
  writeLines(path.join(home, '.codex/sessions/2026/10/30/rollout-1.jsonl'), [
    { timestamp: '2026-10-30T12:00:00Z', type: 'turn_context', payload: { model: 'gpt-5-codex' } },
    { timestamp: '2026-10-30T12:00:05Z', type: 'event_msg', payload: { type: 'token_count', info: {
      total_token_usage: { total_tokens: 1500 }, last_token_usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 } } } },
    // Repeated event with an unchanged running total: ignored.
    { timestamp: '2026-10-30T12:00:06Z', type: 'event_msg', payload: { type: 'token_count', info: {
      total_token_usage: { total_tokens: 1500 }, last_token_usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 } } } },
    { timestamp: '2026-10-30T12:00:07Z', type: 'event_msg', payload: { type: 'token_count', info: null } }
  ]);
  return home;
}

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fp-data-'));
}

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

module.exports = { makeFakeHome, tmpDataDir, jsonResponse, writeLines };
