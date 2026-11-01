# AI Footprint

**See the energy, carbon, water and money behind your AI use, wherever you use it, and get small nudges toward lighter habits.**

AI is becoming part of everyday work, but its footprint is invisible. AI Footprint makes it visible, with honest, open estimates you can check yourself. Everything runs on your own device.

| Part | For | What it does |
|---|---|---|
| [`extension/`](extension/) | Anyone using AI chat in a browser | Measures each reply on ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek, Le Chat and Grok. Shows a small in-page badge, a popup with your totals, and tips at the right moment. Private: nothing leaves your browser. |
| [`dashboard/`](dashboard/) | Developers, power users, teams | Reads Claude Code, Codex CLI and OpenClaw logs, Anthropic / OpenAI / OpenRouter usage reports, and ChatGPT / Claude.ai exports. Shows money, energy, carbon and water for any date range. Browser extensions can sync to it. |

Both use the same [open methodology](METHODOLOGY.md).

## Why open source
- **You can check our claims.** The extension says it never reads or keeps your chats; the code proves it.
- **You can challenge the numbers.** Every coefficient and source is in [METHODOLOGY.md](METHODOLOGY.md) and `dashboard/defaults.js`. Better data is welcome.
- **It keeps working.** AI sites change their pages all the time. If detection breaks on a site you use, you can fix it (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Quick start

**Browser extension (from source)**
1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension/` folder.

Store listings are coming.

**Dashboard**
```bash
cd dashboard
npm install
npm start                          # http://127.0.0.1:3100/ai-footprint/
npx ai-footprint summary 30d       # or use it from the terminal
npx ai-footprint import ~/Downloads/conversations.json   # ChatGPT or Claude.ai export
```

## What a number means
A typical AI chat reply uses about **0.3 Wh**, roughly what a laptop uses in a few seconds. That sounds small, but it adds up. Long chats, thinking models, generated images and agentic coding can each cost 10–1000× more. These estimates have wide error bars, so we always show a likely range (0.4× to 3×).

## Contributing
Bug reports, site fixes, translations and better data are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please also read our [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License
[Apache License 2.0](LICENSE). The name "AI Footprint" and the logo are not covered by the license.
