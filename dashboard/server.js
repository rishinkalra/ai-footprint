#!/usr/bin/env node
// Standalone AI footprint dashboard.
//   AI_FOOTPRINT_DATA_DIR   where config, ledger and caches live (default ~/.ai-footprint)
//   AI_FOOTPRINT_HOME       home folder whose AI tool logs are read (default: your home)
//   AI_FOOTPRINT_INGEST_KEY enables POST /ai-footprint/api/events
//   ANTHROPIC_ADMIN_KEY, OPENAI_ADMIN_KEY, OPENROUTER_PROVISIONING_KEY  optional provider reports
//   PORT, HOST              default 3100, 127.0.0.1

const os = require('os');
const path = require('path');
const express = require('express');
const { mountAiFootprint } = require('./index');

const dataDir = process.env.AI_FOOTPRINT_DATA_DIR || path.join(os.homedir(), '.ai-footprint');
const port = Number(process.env.PORT) || 3100;
const host = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '2mb' }));
mountAiFootprint(app, { dataDir });
app.get('/', (req, res) => res.redirect('/ai-footprint/'));

app.listen(port, host, () => {
  console.log(`AI footprint dashboard: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/ai-footprint/`);
});
