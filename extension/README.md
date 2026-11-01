# AI Footprint: browser extension

See the estimated **energy, carbon, water and cost** behind every AI chat reply, wherever you use AI in a browser, and pick up lighter habits along the way.

It is built for anyone, anywhere. It is private by design: no account, no server, and nothing leaves the browser unless you turn on sync.

| | |
|---|---|
| Works on | ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, DeepSeek, Le Chat, Grok |
| Browsers | Chrome, Edge, Brave, Arc, Opera (Manifest V3). Firefox needs a small manifest tweak (see roadmap). |
| Shows | A small badge on the page (this reply · today · goal), a popup with totals by app, and settings |
| Nudges | Long-chat tip with the real saving, thinking-model tip for quick questions, image tip, daily energy goal |
| Money | Your plans (any currency) pro-rated per day, plus what the tokens would cost at API prices |
| Sync (opt-in) | Daily totals to your own or your team's [dashboard](../dashboard/) |

## How it measures

1. The content script watches replies **while they are being written**. History that loads already complete is never counted, so re-opening old chats adds nothing.
2. When a reply stops changing, it records character counts only: the reply, the prompt, and the whole conversation before it (chat apps re-read it on every turn). About 4 characters make 1 token.
3. The background worker turns tokens into energy by model size. These are the same figures the dashboard uses, and a test keeps them in sync. Thinking models count their output 4× for hidden reasoning, and each generated image adds 2.9 Wh. Carbon and water are calculated from the energy.

The full method and its sources are on the settings page and in [METHODOLOGY.md](../METHODOLOGY.md). A typical reply is about 0.3 Wh. The likely range is 0.4× to 3× that, because providers don't publish per-message figures.

## Making people more responsible, without nagging

- **Feedback right where you use AI:** the badge shows this reply and today's total next to the chat.
- **Tips at the moment they help, once each per chat:**
  - Long chat: *"each reply re-reads about 40k tokens; a new chat with a summary would use about 7× less energy per reply"* (the saving is calculated, not a stock phrase).
  - Short question on a thinking model.
  - Generated images.
- **A daily goal**, with one gentle reminder when you pass it.
- **Personal insights** in the popup, e.g. *"62% of your AI energy went on replies in very long chats."*
- **Everyday comparisons:** phone charges, web searches, metres driven, glasses of water.

## Develop

```bash
cd extension
npm test              # unit tests (core, storage, manifest); run `npm install` in ../dashboard first
npm install && npx playwright install chromium
npm run test:e2e      # real Chromium: loads the extension, streams fake ChatGPT/Claude replies
npm run build         # dist/ai-footprint-extension-<version>.zip for the stores
```

Load unpacked: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick this folder.

Site markup changes over time. Each site's selectors live in `src/sites.js` with fallbacks, and the e2e test runs against fake pages that use the same markup.

## Publishing for global users

1. **Chrome Web Store** (also covers Edge, Brave and Opera): $5 developer account. Upload the `npm run build` zip with `PRIVACY.md` as the privacy policy. The single purpose is "show the estimated environmental footprint of AI chat replies". Permissions: `storage` and `alarms`, plus the AI sites as content-script matches.
2. **Microsoft Edge Add-ons:** free, same zip.
3. **Firefox Add-ons:** add `browser_specific_settings.gecko.id`. Firefox MV3 uses `background.scripts` instead of `service_worker`.
4. **Translations:** store text lives in `_locales/`; numbers and currencies already follow the user's locale. Next: move UI strings into `_locales` and add hi, es, pt, fr, de, ja, zh, ar.

## Roadmap: the rest of "wherever and however"

| Where people use AI | Plan |
|---|---|
| Browser chat apps | ✅ this extension |
| Coding agents (Claude Code, Codex, OpenClaw) and API keys | ✅ the [dashboard](../dashboard/) reads their logs and the provider usage reports. Next: publish it to npm so `npx ai-footprint` works anywhere. |
| Teams and companies | ✅ extension sync → dashboard. Next: per-person views and team goals. |
| Phone apps (ChatGPT, Gemini, Claude) | Phone apps can't be observed from outside, so: import the data exports (already in the dashboard), and a small mobile companion for logging. |
| Apps built on AI APIs | An SDK wrapper / OpenTelemetry exporter that reports each call's tokens. |
| Better estimates | Per-provider grid and water figures, measured energy as providers publish it, and the AI Energy Score data for open models. |
