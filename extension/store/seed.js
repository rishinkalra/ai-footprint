// Realistic demo data for screenshots: a month of mixed AI chat use.
const store = require('../src/store');

function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function demoState(nowMs, { days = 30, seed = 7 } = {}) {
  const r = rng(seed);
  const st = store.newState('demo');
  const settings = store.mergeSettings({ dailyGoalWh: 25 });
  const plan = [
    { site: 'chatgpt', model: 'gpt-5', weight: 0.42, ctx: [800, 16000], out: [600, 2600] },
    { site: 'chatgpt', model: 'gpt-5-thinking', weight: 0.08, ctx: [400, 6000], out: [800, 3000] },
    { site: 'claude', model: 'claude-sonnet', weight: 0.25, ctx: [2000, 60000], out: [900, 4000] },
    { site: 'gemini', model: 'gemini-flash', weight: 0.15, ctx: [300, 4000], out: [400, 2000] },
    { site: 'perplexity', model: 'sonar', weight: 0.07, ctx: [300, 3000], out: [800, 2400] },
    { site: 'copilot', model: 'gpt-4o', weight: 0.03, ctx: [300, 3000], out: [400, 1600] }
  ];
  for (let d = days - 1; d >= 0; d--) {
    const dayMs = nowMs - d * 864e5;
    const weekday = new Date(dayMs).getDay();
    const base = weekday === 0 || weekday === 6 ? 14 : 38;
    // a gentle downward trend: habits improving over the month
    const turns = Math.round(base * (1.25 - (days - d) / days * 0.5) * (0.7 + r() * 0.6));
    for (let i = 0; i < turns; i++) {
      let x = r(), p = plan[0];
      for (const c of plan) { if ((x -= c.weight) <= 0) { p = c; break; } }
      const lerp = ([a, b]) => Math.round(a + (b - a) * Math.pow(r(), 1.8));
      store.recordTurn(st, {
        site: p.site, model: p.model,
        promptChars: 120 + Math.round(r() * 600),
        contextChars: lerp(p.ctx) * 4,          // ctx ranges are in tokens; ~4 chars each
        outputChars: lerp(p.out),
        images: p.site === 'chatgpt' && r() < 0.01 ? 1 : 0,
        threadKey: p.site + ':/c/' + Math.floor(r() * 400)
      }, settings, dayMs - Math.round(r() * 8 * 3600e3));
    }
  }
  st.goalNotified = null;
  st.dirty = {};
  return st;
}

module.exports = { demoState };
