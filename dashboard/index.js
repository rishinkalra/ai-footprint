// Express routes for the AI footprint widget.
//   GET    /ai-footprint/                 widget page (?embed=1 for the compact card)
//   GET    /ai-footprint/api/summary      ?range=today|7d|30d|90d|mtd|all  or  ?from=&to=   (&refresh=1)
//   POST   /ai-footprint/api/events       log usage from anywhere (needs AI_FOOTPRINT_INGEST_KEY)
//   DELETE /ai-footprint/api/events/:id

const crypto = require('crypto');
const { FootprintService } = require('./service');
const path = require('path');
const express = require('express');

function keyMatches(req, expected) {
  const header = req.get('x-footprint-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(String(header));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function mountAiFootprint(app, { dataDir, logger = console, env = process.env } = {}) {
  const service = new FootprintService({ dataDir, logger, env });
  const ingestKey = env.AI_FOOTPRINT_INGEST_KEY;

  const requireKey = (req, res, next) => {
    if (!ingestKey) return res.status(503).json({ error: 'Set AI_FOOTPRINT_INGEST_KEY to enable logging over HTTP' });
    if (!keyMatches(req, ingestKey)) return res.status(401).json({ error: 'Unauthorized' });
    return next();
  };


  // index.html reads ?embed=1 itself and switches to the compact card.
  // serve-static also redirects /ai-footprint to /ai-footprint/.
  app.use('/ai-footprint', express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '5m' }));

  app.get('/ai-footprint/api/summary', async (req, res) => {
    try {
      const data = await service.summary({
        range: req.query.range,
        from: req.query.from,
        to: req.query.to,
        force: req.query.refresh === '1'
      });
      res.json(data);
    } catch (error) {
      logger.error('ai-footprint: summary failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/ai-footprint/api/events', requireKey, (req, res) => {
    const body = req.body || {};
    const events = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
    if (!events.length || events.length > 5000) return res.status(400).json({ error: 'Send 1-5000 events' });
    try {
      res.json({ ok: true, ...service.addEvents(events) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/ai-footprint/api/events/:id', requireKey, (req, res) => {
    res.json({ ok: service.deleteEvent(req.params.id) });
  });

  // Warm the cache so the first page load is quick.
  service.collect().catch(error => logger.error('ai-footprint: initial collect failed', { error: error.message }));
  return service;
}

module.exports = { mountAiFootprint, FootprintService };
