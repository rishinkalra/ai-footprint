# Design brief: AI Footprint browser extension

Paste this into Claude Design and attach the three screenshots in `design/current/`. They show the working v0.1, which was built without a designer.

## 1. The product in one line
A free, private browser extension that shows the energy, carbon, water and money behind every AI chat reply. It helps people use AI more lightly without making them feel guilty.

## 2. Who it's for
Everyday AI users anywhere in the world: students, office workers, developers, people in India, Brazil, Germany, the US. Most are not technical and have never thought about AI energy use. Some are sustainability-minded and want numbers they can trust and share.

**What they should feel:** "That's interesting, and easy to act on." Not shame, not alarm, not greenwashing.

## 3. Design principles
1. **Calm and honest.** These are estimates. Always show a central figure with a quiet "likely range". Never fake precision, never use scare colours for normal use.
2. **Help in the moment, never nag.** At most one tip per chat, each easy to dismiss. The badge should be small enough to forget about until it's useful.
3. **Make it relatable.** Turn Wh and grams into everyday things: phone charges, web searches, metres driven, glasses of water.
4. **Show progress, not blame.** "Down 18% on last week" should feel like a small win.
5. **Visible privacy.** Make "stays on this device" quietly present, not buried.

## 4. Brand
- **Name:** AI Footprint (working name; the design can suggest alternatives).
- **Current look:** dark navy (#0b1020 / #10172b), blue data colour (#5b8cff), mint accent (#63e6be), and a lightning-bolt-in-circle icon. Treat all of this as a placeholder you can replace.
- **Wanted:** a distinctive identity that reads "energy + nature + clarity". It must work on both light and dark host pages and stay recognisable at 16 px in the browser toolbar.
- **Type:** system font stack only, because it renders inside other websites; a bundled font is fine for the popup and pages.

## 5. Screens and states to design

### A. In-page badge (most important)
It is injected into ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek, Le Chat and Grok. It is fixed near the bottom-right and must not cover their send button or scroll controls. Their themes range from white to near-black.
- **Collapsed:** "⚡ 0.35 Wh this reply · today 12 Wh / 25 Wh".
- **Minimised:** an icon or dot only, for people who want it out of the way.
- **Tip card** shown above the badge, with "Got it" and "Hide on this site". The four tips:
  - Long chat: "This chat is long: each reply re-reads about 40k tokens. Starting a new chat with a short summary would use about 7× less energy per reply."
  - Thinking model used for a quick question.
  - Generated image ("one image ≈ 10 text replies").
  - Daily goal reached: one gentle reminder per day.
- **Light-page and dark-page variants.**
- **Hover/focus detail:** a short breakdown of the reply (CO₂, water, model size used).

### B. Toolbar popup (380 px wide, up to ~600 px tall)
- **Period switch:** Today / 7 days / 30 days.
- **Daily goal progress:** under goal, near goal, and over goal (over should be informative, not red-alarm).
- **Four key figures:** Energy (with likely range), Carbon, Water, Cost. Cost is the user's plan cost in their own currency, or "value at API prices" if they haven't added plans.
- **Trend vs the previous period,** plus one everyday comparison.
- **By app:** a ranked list of the 8 sites with bars.
- **"Lower your footprint":** 1–3 personal insights, e.g. "62% of your AI energy went on very long chats".
- **Empty state:** first day, nothing recorded yet. Explain what will happen and which sites are supported.
- **Footer:** settings link, a "how we estimate" link, and a privacy line.

### C. Welcome page (opens on install; new)
Three short steps: what it measures, privacy promise, set a daily goal (with a suggested default). Optional: "Add your AI plans to see cost".

### D. Settings page
Sections: Goal · Apps to measure (toggle + model picker per site) · Your plans (name, monthly price, currency) · Carbon intensity (advanced) · Sync to a dashboard (advanced, off by default) · Your data (export, delete) · How we estimate (method table and sources). Advanced sections can be collapsed.

### E. Shareable card (new)
"My AI footprint this month": a 1080×1080 and 1200×630 image people can post. It shows energy, comparisons and improvement. No chat content, ever.

### F. Store listing assets
- 128 px icon, plus 16/32/48 px versions.
- Five 1280×800 screenshots with short captions.
- A 440×280 promo tile.

## 6. Content to use (real numbers)
| Thing | Typical value |
|---|---|
| One ordinary reply (medium model) | ~0.3 Wh, ~0.12 g CO₂e, ~0.3 mL water |
| Long-chat reply (40k tokens of context) | ~2.2 Wh |
| Thinking-model reply | 2–4× an ordinary reply |
| One generated image | ~2.9 Wh |
| Default daily goal | 25 Wh (≈ 80 ordinary replies) |
| Heavy user, 30 days | ~0.5–1 kWh, ~200–400 g CO₂e |
| Comparisons | phone charge = 15 Wh; web search ≈ 0.3 Wh; petrol car ≈ 170 g CO₂/km; glass of water = 250 mL |

Likely range shown everywhere: 0.4× to 3× the central figure.

## 7. Constraints
- **Accessibility:** WCAG 2.2 AA contrast, keyboard reachable, never colour alone (pair colour with text or icon), respects `prefers-reduced-motion` and `prefers-color-scheme`.
- **Global:** text may grow 40% when translated; right-to-left layout (Arabic, Hebrew); numbers, currencies and dates follow the user's locale.
- **Badge tech:** lives in a closed shadow DOM, so styles must be self-contained. No external fonts or images. Keep it light.
- **No dark patterns:** no streak guilt, no red badges on the toolbar icon for normal use.

## 8. What to hand back
For each screen, HTML/CSS (or a component spec) plus design tokens (colours for light and dark, type scale, spacing, radii). With those, the developer can drop the design straight into `src/popup.*`, `src/options.*`, `src/ui.css` and the badge styles in `src/content.js`.
