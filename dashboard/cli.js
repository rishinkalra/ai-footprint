#!/usr/bin/env node
// Usage:
//   npx ai-footprint summary [today|7d|30d|90d|mtd|all]
//   npx ai-footprint import <conversations.json>         (ChatGPT or Claude.ai export)
//   npx ai-footprint log --platform chatgpt --model gpt-5 --prompts 12 [--date YYYY-MM-DD]
// Data lives in ~/.ai-footprint unless AI_FOOTPRINT_DATA_DIR says otherwise.

const fs = require('fs');
const path = require('path');
const { FootprintService } = require('./service');
const { importExport } = require('./importers');

const dataDir = process.env.AI_FOOTPRINT_DATA_DIR || path.join(require('os').homedir(), '.ai-footprint');
const quiet = { info() {}, error(msg, meta) { console.error(msg, meta || ''); } };

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function fmt(n, d = 2) { return Number(n).toFixed(d); }

async function main() {
  const [cmd = 'summary', ...rest] = process.argv.slice(2);
  const service = new FootprintService({ dataDir, logger: quiet });

  if (cmd === 'summary') {
    const s = await service.summary({ range: rest[0] || '7d', force: true });
    const t = s.totals;
    console.log(`AI footprint ${s.range.from} → ${s.range.to} (${s.range.days} days)`);
    console.log(`  Spend        $${fmt(t.spendUsd)}  (API $${fmt(t.apiSpendUsd)}, plans $${fmt(t.subscriptionUsd)})`);
    console.log(`  List value   $${fmt(t.apiEquivalentUsd)}`);
    console.log(`  Energy       ${fmt(t.energyKwh.mid, 3)} kWh  (${fmt(t.energyKwh.low, 3)}–${fmt(t.energyKwh.high, 3)})`);
    console.log(`  Carbon       ${fmt(t.co2Kg.mid, 3)} kg CO2e`);
    console.log(`  Water        ${fmt(t.waterL.mid, 2)} L`);
    console.log(`  Tokens       ${t.tokens.total.toLocaleString()} (${t.tokens.output.toLocaleString()} out)`);
    console.log('  By platform:');
    for (const p of s.byPlatform) {
      console.log(`    ${p.platform.padEnd(16)} ${fmt(p.energyKwh.mid, 3).padStart(9)} kWh  $${fmt(p.spendUsd).padStart(8)} spend  $${fmt(p.apiEquivalentUsd).padStart(8)} value`);
    }
    console.log('  Sources:');
    for (const src of s.sources) console.log(`    [${src.status}] ${src.label}: ${src.note || ''}`);
    return;
  }

  if (cmd === 'import') {
    if (!rest[0]) throw new Error('import needs a path to conversations.json');
    const data = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
    const cfg = service.config();
    const { format, events } = importExport(data, { timezone: cfg.timezone });
    const res = service.addEvents(events);
    console.log(`Imported ${format} export: ${events.length} day×model rows (ledger now has ${res.total} entries)`);
    return;
  }

  if (cmd === 'log') {
    const f = flags(rest);
    const event = {
      platform: f.platform, model: f.model, date: f.date, note: f.note,
      requests: f.prompts != null ? Number(f.prompts) : f.requests != null ? Number(f.requests) : undefined,
      inputTokens: f.input != null ? Number(f.input) : undefined,
      outputTokens: f.output != null ? Number(f.output) : undefined,
      costUsd: f.cost != null ? Number(f.cost) : undefined
    };
    const res = service.addEvents([event]);
    console.log(`Logged ${res.added[0]}`);
    return;
  }

  throw new Error(`Unknown command ${cmd}`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
