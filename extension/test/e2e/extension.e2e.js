// End-to-end check in real Chromium: loads the unpacked extension, serves fake
// ChatGPT / Claude pages on their real URLs, streams a reply, and checks what
// the extension recorded. Run: node test/e2e/extension.e2e.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..', '..');

// history: messages already on the page. stream: a reply that is written live.
function page({ userSel, assistantAttr, history, stream, model }) {
  return `<!DOCTYPE html><html><body><main id="chat"></main><script>
  const chat = document.getElementById('chat');
  function add(role, text) {
    const el = document.createElement('div');
    if (role === 'user') { ${userSel} } else { ${assistantAttr} }
    el.textContent = text;
    chat.appendChild(el);
    return el;
  }
  ${JSON.stringify(history)}.forEach(m => add(m[0], m[1]));
  const stream = ${JSON.stringify(stream)};
  if (stream) setTimeout(() => {
    add('user', stream.prompt);
    const el = add('assistant', '');
    ${model ? `el.setAttribute('data-message-model-slug', ${JSON.stringify(model)});` : ''}
    let i = 0;
    const words = stream.reply.split(' ');
    const t = setInterval(() => {
      el.textContent += (i ? ' ' : '') + words[i++];
      if (i >= words.length) { clearInterval(t); el.setAttribute('data-is-streaming', 'false'); }
    }, 60);
  }, 3000);
  </script></body></html>`;
}

const chatgptMarkup = {
  userSel: "el.setAttribute('data-message-author-role','user');",
  assistantAttr: "el.setAttribute('data-message-author-role','assistant');"
};
const claudeMarkup = {
  userSel: "el.setAttribute('data-testid','user-message');",
  assistantAttr: "el.setAttribute('data-is-streaming','true');"
};

const longHistory = [['user', 'x'.repeat(4000)], ['assistant', 'y'.repeat(8000)]];
const reply = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-ext-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const extId = new URL(worker.url()).host;
    // Close the welcome/options tab opened on install.
    await new Promise(r => setTimeout(r, 500));

    const routes = {
      'https://chatgpt.com/c/live': page({ ...chatgptMarkup, history: longHistory, stream: { prompt: 'Summarise this please', reply }, model: 'gpt-5-thinking' }),
      'https://chatgpt.com/c/old': page({ ...chatgptMarkup, history: longHistory.concat([['user', 'q'], ['assistant', 'z'.repeat(3000)]]), stream: null }),
      'https://claude.ai/chat/1': page({ ...claudeMarkup, history: [], stream: { prompt: 'hi', reply } })
    };
    await context.route(/https:\/\/(chatgpt\.com|claude\.ai)\/.*/, route => {
      const body = routes[route.request().url()];
      return body ? route.fulfill({ contentType: 'text/html', body }) : route.fulfill({ status: 404, body: '' });
    });

    const state = () => worker.evaluate(() => chrome.storage.local.get('state').then(d => d.state));

    // 1) Old chat only: history must not be counted.
    const p1 = await context.newPage();
    await p1.goto('https://chatgpt.com/c/old');
    await p1.waitForTimeout(6000);
    const s1 = await state();
    assert.ok(!s1 || !Object.keys(s1.days || {}).length, 'opening an old chat records nothing');

    // 2) Live reply on ChatGPT with a long history and a thinking model.
    const p2 = await context.newPage();
    await p2.goto('https://chatgpt.com/c/live');
    await p2.waitForSelector('ai-footprint-badge', { timeout: 15000 });
    const s2 = await state();
    const day = Object.values(s2.days)[0];
    const rec = day.chatgpt['gpt-5-thinking'];
    assert.equal(rec.turns, 1, 'one reply recorded');
    const visibleTokens = Math.round(reply.length / 4);
    assert.equal(rec.outputTokens, visibleTokens * 4, 'thinking model output counted 4x');
    assert.ok(rec.inputTokens >= 3000, 'reply charged for the conversation so far: ' + rec.inputTokens);
    assert.ok(rec.wh > 0);
    await p2.waitForTimeout(4000);
    assert.equal((await state()).days[Object.keys(s2.days)[0]].chatgpt['gpt-5-thinking'].turns, 1, 'not counted twice');

    // 3) Claude, model from the default.
    const p3 = await context.newPage();
    await p3.goto('https://claude.ai/chat/1');
    await p3.waitForSelector('ai-footprint-badge', { timeout: 15000 });
    const s3 = await state();
    assert.equal(Object.values(s3.days)[0].claude['claude-sonnet'].turns, 1);

    // 4) Popup renders the totals.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/src/popup.html`);
    await popup.waitForSelector('.tile');
    const text = await popup.textContent('main');
    assert.match(text, /ChatGPT/);
    assert.match(text, /Claude/);
    await popup.screenshot({ path: path.join(os.tmpdir(), 'fp-popup.png') });
    await p2.screenshot({ path: path.join(os.tmpdir(), 'fp-badge.png') });

    const opts = await context.newPage();
    await opts.goto(`chrome-extension://${extId}/src/options.html`);
    await opts.waitForSelector('#sites label');
    await opts.screenshot({ path: path.join(os.tmpdir(), 'fp-options.png'), fullPage: true });

    console.log('e2e ok');
  } finally {
    await context.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
