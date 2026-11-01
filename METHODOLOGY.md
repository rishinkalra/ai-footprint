# Methodology

AI providers don't publish energy per request, so every figure here is an **estimate**. We aim to be transparent, in line with published measurements, and easy to improve. Each figure comes with a likely range of **0.4× to 3×** the central estimate.

## 1. Tokens
- **Dashboard:** exact token counts from tool logs (Claude Code, Codex CLI, OpenClaw) and provider usage reports (Anthropic, OpenAI, OpenRouter).
- **Extension and chat exports:** about 4 characters make 1 token. Each reply is charged for the **whole conversation before it**, because chat apps re-read it on every turn (capped at 128k tokens).
- **Cache reads** count at 10% of a fresh input token, and cache writes at 100%. Serving from cache skips most of the compute.

## 2. Energy per token, by model size
Wh per 1,000 tokens at the data-centre meter, cooling and overhead included:

| Size | Examples | Input | Output |
|---|---|---|---|
| small | Haiku, GPT-5 mini/nano, GPT-4o mini, Gemini Flash | 0.01 | 0.10 |
| medium | Sonnet, GPT-5, GPT-4o, GPT-4.1, o3, Gemini Pro | 0.05 | 0.50 |
| large | Opus, o1 | 0.12 | 1.50 |
| xlarge | Fable, Mythos, GPT-4.5, deep research | 0.25 | 3.00 |

**Calibration:** a medium model answering a typical chat turn (about 1k tokens in, 500 out) comes to about 0.3 Wh. That matches:
- **Google (Aug 2025):** median Gemini Apps text prompt = 0.24 Wh, 0.03 g CO₂e, 0.26 mL water.
- **OpenAI (Jun 2025):** average ChatGPT query ≈ 0.34 Wh.
- **Epoch AI (Feb 2025):** typical GPT-4o query ≈ 0.3 Wh.

Larger sizes scale with model size, following benchmark studies such as Jegham et al. (2025), "How Hungry is AI?".

**Extension extras:**
- **Thinking models** write hidden reasoning, so their visible output counts **4×**.
- **Generated images** add **2.9 Wh** each (Luccioni et al. 2023, "Power Hungry Processing").

## 3. Carbon and water
- **Carbon** = energy × **0.40 kg CO₂e/kWh**, a location-based grid average for the regions large AI data centres run in (world average ≈ 0.45). It can be changed per provider.
- **Water** = energy × **1.1 L/kWh**, on-site cooling only, derived from Google's 0.26 mL per 0.24 Wh.

## 4. Money
- **Spend** = API-billed usage plus flat plans (ChatGPT Plus, Claude Max…) spread evenly over each day. API usage uses the provider's reported cost when available, otherwise list price.
- **Value at API prices** = what all the tokens would have cost pay-as-you-go. Prices live in `dashboard/defaults.js`; please send corrections.

## 5. Not included
- Training the models.
- Manufacturing the hardware.
- Networking.
- Your own device.

All of these are real but hard to assign to a single request.

## 6. Improving this
Open an issue or pull request with a source. The most valuable contributions are:
- measured per-model energy;
- per-provider carbon and water figures;
- data showing how thinking and image models compare with text models.
