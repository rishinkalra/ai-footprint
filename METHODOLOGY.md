# Methodology

AI providers don't publish energy per request, so every figure here is an **estimate**. We aim to be transparent, in line with published measurements, and easy to check. Each estimate comes with a likely range of **0.4× to 3×** the central figure. Every number below is in the code, in [`dashboard/defaults.js`](dashboard/defaults.js) and [`extension/src/core.js`](extension/src/core.js), and a test keeps the two equal.

## 1. Tokens

**Dashboard.** Exact counts come from tool logs (Claude Code, Codex CLI, OpenClaw) and from provider usage reports (Anthropic, OpenAI, OpenRouter). These split fresh input, cache reads, cache writes and output.

**Extension and chat-app exports.** Tokens are estimated from text length, by writing system. Tokenizers are trained mostly on English, so other scripts need more tokens per character ([Petrov et al., 2023](https://arxiv.org/abs/2305.15425)):

| Script | Characters per token |
|---|---|
| Latin (English, Spanish, Swahili…), digits, punctuation | 4.0 |
| Cyrillic, Greek, Armenian, Georgian | 3.0 |
| Arabic, Hebrew, Devanagari and other Indic, Thai, emoji, others | 2.5 |
| Chinese, Japanese, Korean | 1.3 |

These ratios are approximate (±30%). Without them, a Hindi or Chinese chat would be under-counted by 1.6–3×.

**What a reply reads.** Chat apps send the whole conversation to the model on every turn, so a reply's input is every earlier message plus the new prompt. It is capped at 128k tokens.

## 2. Prompt cache
Providers keep a recent conversation in a prompt cache. Re-reading cached tokens skips most of the compute, so cache reads count at **10%** of a fresh input token, and cache writes at **100%**.

- **Dashboard:** cache reads and writes come straight from the logs and reports.
- **Extension and exports:** if the previous reply in the same chat was less than **5 minutes** ago, the conversation up to the end of that reply counts as cached. 5 minutes is the standard cache lifetime for Anthropic, and a typical one for OpenAI. After a longer pause, everything is read fresh again.

## 3. Energy per token, by model size
Wh per 1,000 tokens at the data-centre meter, with cooling and overhead included:

| Size | Examples | Input | Output |
|---|---|---|---|
| small | Haiku, GPT-5 mini/nano, GPT-4o mini, Gemini Flash | 0.01 | 0.10 |
| medium | Sonnet, GPT-5, GPT-4o, GPT-4.1, o3, Gemini Pro | 0.05 | 0.50 |
| large | Opus, o1 | 0.12 | 1.50 |
| xlarge | Fable, Mythos, GPT-4.5, deep research | 0.25 | 3.00 |

```
energy (Wh) = (fresh input + cache reads × 0.1 + cache writes) / 1000 × input Wh per 1k
            + output × reasoning multiplier / 1000 × output Wh per 1k
            + generated images × 2.9
```

**Calibration.** A medium model answering a typical chat turn (1,000 tokens in, 500 out, nothing cached) uses 0.05 + 0.25 = **0.30 Wh**. That matches:
- **Google (Aug 2025):** a median Gemini Apps text prompt uses 0.24 Wh, 0.03 g CO₂e and 0.26 mL of water.
- **OpenAI (Jun 2025):** an average ChatGPT query uses about 0.34 Wh.
- **Epoch AI (Feb 2025):** a typical GPT-4o query uses about 0.3 Wh.

Larger sizes scale with model size, following benchmark studies such as [Jegham et al. (2025)](https://arxiv.org/abs/2505.09598).

**Thinking models** write hidden reasoning before the visible reply, so the extension counts their visible output **4×**. The dashboard doesn't need this, because provider logs already include reasoning tokens in the output count.

**Generated images** add **2.9 Wh** each, from Luccioni et al. (2023), "Power Hungry Processing".

## 4. Carbon
Carbon (g CO₂e) = energy (Wh) × grid intensity (g/kWh) ÷ 1000.

What matters is the electricity grid where the **data centre** runs, not where you are. All grid figures are **lifecycle** intensities from [Ember's yearly electricity data](https://ember-energy.org/data/yearly-electricity-data/), via [Our World in Data](https://github.com/owid/energy-data). The extension has four options, and the dashboard has the same default plus overrides per provider:

| Basis | Figure | When to use it |
|---|---|---|
| **Where most AI runs** (default) | US grid, **384 g/kWh** (2025) | Most chat AI is served from large US data centres. |
| Your country's grid | e.g. India 670, UK 217, Brazil 110, France 41 (2025) | Your AI apps serve you from local data centres. |
| World average | **458 g/kWh** (2025) | A neutral global figure. |
| Custom | your figure | Your provider publishes one, e.g. a market-based figure. |

Changing the basis or the country recalculates past days too.

Providers' own market-based figures are often lower: Google's 0.03 g per 0.24 Wh works out to about 125 g/kWh. We default to the location-based figure because it describes the grid the electricity actually came from.

## 5. Water
Water (mL) = energy (Wh) × **1.1**. That is litres of on-site cooling water per kWh, derived from Google's 0.26 mL per 0.24 Wh. Water used to generate the electricity is not included.

## 6. Local perspective
The same amount of energy means very different things around the world. The extension detects your country from the browser's language or time zone, and you can change it in settings.
- **Electricity per person.** Each period's AI energy is shown as a share of the electricity one person in your country uses over the same days. That figure is Ember's total electricity demand per person, all uses, latest year: about **0.45 kWh a day in Nigeria, 3.9 in India, 12.7 in the UK, 36 in the US and 44 in Canada**.
- **Distance** is in miles in the US, UK, Liberia and Myanmar, and kilometres elsewhere.
- **The car comparison** uses a typical petrol car: about **249 g CO₂/km** in the US and Canada (the EPA's figure of about 400 g per mile for a typical passenger vehicle), and **170 g/km** elsewhere.
- **Numbers, dates and currencies** follow your browser's locale. Plan costs show in the currency you enter.

Country data lives in `extension/src/regions-data.js`. It is generated by `extension/tools/build-regions.py` from the OWID energy dataset, keeping the latest year since 2015 for each country.

## 7. Everyday comparisons
Watt-hours mean little to most people, so the extension leads with something familiar and shows the number underneath. Each comparison is the same energy divided by a typical figure:

| Everyday thing | Figure used | Basis |
|---|---|---|
| Charging a smartphone | 15 Wh per full charge | A ~4,000 mAh battery at 3.85 V holds about 15 Wh; charger losses add a little |
| LED bulb | 10 W | An LED bulb equal to an old 60 W bulb uses 8–10 W |
| Ceiling fan | 75 W | A standard fan at full speed uses 70–80 W; efficient (BLDC) fans use about 30 W |
| Microwave oven | 1,100 W | Typical 600–1,200 W while heating (US Department of Energy) |
| Cup of tea | 25 Wh | Heating 250 mL of water from 20 °C to 100 °C takes 23 Wh, plus kettle losses |
| TV | 100 W | A mid-size LED TV uses 50–120 W |
| Laptop | 50 W | A laptop in use |

**Choosing the comparison.** The extension uses the everyday thing people know best where you live, then a phone charge, which is understood everywhere:
- **Ceiling fan:** India, Pakistan, Bangladesh, Southeast Asia, Egypt, Brazil.
- **Microwave:** the US, Canada, Mexico.
- **Cups of tea:** the UK, Ireland, Australia, New Zealand, Turkey, China, Japan and much of Europe.
- **LED bulb:** much of Africa.
- **Phone charges:** everywhere else.

A comparison is skipped when its number would read badly, such as "a fan for 2 seconds" or "0.004 phone charges".

**Water** is shown in drops (0.05 mL), teaspoons (5 mL), "less than a glass", glasses (250 mL) or litres. **Carbon** is shown as a drive in a typical local car (see section 6).

**Languages.** Every screen is available in English, Hindi and Spanish, chosen from the browser's language or in settings. Plurals and numbers follow each language's rules. Translations are drafts and need review by native speakers; see CONTRIBUTING.md.

## 8. Money
- **Spend** is API-billed usage plus flat-fee plans (ChatGPT Plus, Claude Max…) spread over each day at monthly price × 12 ÷ 365. API usage uses the provider's reported cost when there is one, otherwise list price.
- **Value at API prices** is what all the tokens would have cost on pay-as-you-go:
  - Cache reads cost 0.1× the input price.
  - 5-minute cache writes cost 1.25×, and 1-hour cache writes cost 2×.
  - Prices live in `dashboard/defaults.js`. The extension uses size-based prices because chat sites rarely say the exact model.

## 9. Worked examples
Each example is also a test.

**A. A long chat in the browser** (medium model, 40,000 tokens of conversation, 400-token reply)
- **Cold** (more than 5 minutes since the last reply): 40,000 / 1000 × 0.05 + 400 / 1000 × 0.5 = 2.0 + 0.2 = **2.2 Wh**.
- **Warm** (38,000 tokens still cached): (2,000 + 38,000 × 0.1) / 1000 × 0.05 + 0.2 = 0.29 + 0.2 = **0.49 Wh**.
  - Carbon: 0.49 × 384 / 1000 = **0.188 g CO₂e**.
  - Water: 0.49 × 1.1 = **0.54 mL**.
  - Value: (2,000 × $3 + 38,000 × $0.30 + 400 × $15) / 10⁶ = **$0.0234**.
- Starting a fresh chat (2,000 tokens) would use 0.1 + 0.2 = 0.3 Wh. That is 7.3× less than the cold case but only 1.6× less than the warm one, so the long-chat tip appears only when the saving is at least 1.5×.

**B. Follow-ups in one chat**
- **Reply 1:** 1,000 tokens of context and a 500-token reply.
- **Reply 2, 2 minutes later:** 1,600 tokens of context, of which the first 1,500 are cached.
  - Energy: (100 + 1,500 × 0.1) / 1000 × 0.05 + 0.25 = **0.2625 Wh**.
- **Reply 3, 10 minutes after that:** the cache has expired.
  - Energy: 2,200 / 1000 × 0.05 + 0.25 = **0.36 Wh**.

**C. A Claude Code turn** (Opus 4.5: 300 fresh input, 120,000 cache reads, 2,000 cache writes of which 500 are 1-hour, 1,500 output)
- **Energy:** (300 + 12,000 + 2,000) / 1000 × 0.12 + 1.5 × 1.5 = 1.716 + 2.25 = **3.966 Wh**.
- **Value:** (300 × $5 + 120,000 × $0.50 + 1,500 × $6.25 + 500 × $10 + 1,500 × $25) / 10⁶ = **$0.113**.

**D. The same week, two countries** (119 Wh of AI use in 7 days)
- **US:** 119 / (36 kWh × 7) = **0.05%** of one person's electricity.
- **India:** 119 / (3.9 kWh × 7) = **0.44%**, nine times as large a share.

## 10. Not included
- Training the models.
- Manufacturing the hardware.
- Networking.
- Your own device.
- Idle capacity kept for peaks.

All of these are real but hard to assign to a single request. The per-token figures are linear, but very long contexts cost somewhat more than linear in attention compute.

## 11. Improving this
Open an issue or pull request with a source. The most valuable contributions are:
- measured per-model energy;
- per-provider carbon and water figures;
- data on reasoning-token ratios;
- better tokens-per-character ratios for specific languages.
